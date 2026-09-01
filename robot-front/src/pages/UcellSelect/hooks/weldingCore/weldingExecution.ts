import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';
import { WeldingResult, WeldingStartOptions, ClosestCenterlineResult } from './weldingCoreTypes';
import { findClosestCenterlinePoint } from './pathFinding';
import { saveStoppedLog, saveWeldingLog } from './loggingHelpers';
import { moveToJointWithStopCheck, getWeaveTypeCode, calculateDistance, getMinimumWeavingDistance } from './moveStopCheck';
import { loadWeldingSettings } from './sequenceSettings';
import { safeArcOn, setupAndStartWeave, endPartWelding, startPartWelding, safeEndWeave, safeArcOff } from './weaveHelpers';
import { determinePointTouchOffset } from './weldingPointLoop';

const log_weldingExecution = createLogger('weldingCore.weldingExecution');
export interface WeldingExecutionContext {
  stopRef: React.MutableRefObject<boolean>;
  setCurrentPointIndex: (index: number) => void;
  showAlert: (
    message: string,
    options?: { type?: 'error' | 'warning' | 'info' | 'success'; title?: string },
  ) => void;
  setLastWeldingResult: (result: WeldingResult | null) => void;
  currentPointIndex: number;
  setArcActive?: (active: boolean) => void;
}
export async function executeWelding(
  teachingPoints: TeachingPoint[],
  robotState: RealtimeRobotStatus | null,
  simMode: boolean,
  context: WeldingExecutionContext,
  jobId?: number,
  jobName?: string,
  options?: WeldingStartOptions,
): Promise<WeldingResult | null> {
  const { stopRef, setCurrentPointIndex, showAlert, setLastWeldingResult, setArcActive } = context;
  const startFromClosest = options?.startFromClosest ?? false;
  const currentTcp = options?.currentTcp;
  const isDryRun = options?.isDryRun ?? false;
  const isWeldingTest = options?.isWeldingTest ?? false;
  const totalTimer = log_weldingExecution.startTimer();
  const startedAt = new Date();
  log_weldingExecution.info('welding.start', simMode ? '시뮬레이션 시작' : '용접 시작', {
    simMode,
    startFromClosest,
    hasTcp: !!currentTcp,
  });
  try {
    const partOrder = await getWeldingPartOrder();
    if (partOrder.length > 0) {
      setWeldingPartOrder(partOrder.map(p => ({ part_name: p.part_name, points: p.points })));
      log_weldingExecution.info('welding.partOrder', '용접 파트 순서 로드', {
        order: partOrder.map(p => `${p.execution_order}:${p.part_name}`),
      });
    }
  } catch {
  }
  const homePoint = teachingPoints.find(
    pt => pt.id === 'home' && pt.isSaved && pt.joints && pt.joints.length > 0,
  );
  if (!homePoint && !startFromClosest) {
    showAlert('Home 포인트가 저장되어 있지 않습니다.', { type: 'warning', title: '포인트 없음' });
    return null;
  }
  const partWeldEnabled = options?.partWeldEnabled;
  const executableParts = getExecutableParts(teachingPoints, partWeldEnabled);
  const weldingPoints = flattenExecutableParts(executableParts);
  const partBoundaryInfo = getPartBoundaryInfo(executableParts);
  if (weldingPoints.length === 0) {
    showAlert('저장된 용접 포인트가 없습니다. (각 파트에 2개 이상 포인트 필요)', {
      type: 'warning',
      title: '포인트 없음',
    });
    return null;
  }
  const endPoint =
    weldingPoints.find(pt => pt.weldVoltage === null) || weldingPoints[weldingPoints.length - 1];
  let startPointIndex = 0;
  let paramPointIndex = 0;
  let closestCenterlineResult: ClosestCenterlineResult | null = null;
  if (startFromClosest && currentTcp) {
    closestCenterlineResult = findClosestCenterlinePoint(
      teachingPoints,
      currentTcp,
      partWeldEnabled,
    );
    if (closestCenterlineResult) {
      startPointIndex = closestCenterlineResult.segmentStartIndex;
      paramPointIndex = closestCenterlineResult.closestTeachingPointIndex;
    }
  }
  setCurrentPointIndex(startPointIndex);
  let totalPathDistance = 0;
  let representativeCpm = 0;
  let totalExpectedDurationSec = 0;
  let segments: WeldingLogSegment[] = [];
  let firstWeldPoint = weldingPoints[paramPointIndex] || weldingPoints[0];
  const handleStopped = async (completedPtIdx: number) => {
    const result = await saveStoppedLog({
      startedAt,
      segments,
      weldingPoints,
      firstWeldPoint,
      completedPointIndex: completedPtIdx,
      jobId,
      jobName,
      simMode,
      isDryRun,
      startFromClosest,
      representativeCpm,
      totalExpectedDurationSec,
    });
    if (result) setLastWeldingResult(result);
    return result;
  };
  try {
    if (!robotState?.servo_enabled) await enableRobot();
    await endWeave().catch(() => {});
    if (!startFromClosest && !simMode) {
      const homeResult = await moveToJointWithStopCheck(
        homePoint!.joints!,
        homePoint!.moveSpeed,
        homePoint!.toolNum ?? 3,
        homePoint!.userNum ?? 0,
        stopRef,
      );
      if (homeResult.stopped) return await handleStopped(0);
      if (!homeResult.success) throw new Error('Home 이동 실패');
    }
    let configuredMinWeavingDistance = 50;
    try {
      const rs = await getRobotSettings();
      configuredMinWeavingDistance = rs.min_weaving_distance || 50;
    } catch {
    }
    firstWeldPoint = weldingPoints[startPointIndex];
    const hasWelding = isWeldingTest
      ? false
      : !!(firstWeldPoint.weldVoltage && firstWeldPoint.weldCurrent);
    const hasWeaving = !!(firstWeldPoint.weavingType && firstWeldPoint.weavingType !== 'none');
    const weaveTypeCode = getWeaveTypeCode(firstWeldPoint.weavingType);
    const CPM_CORRECTION_FACTOR = 0.68;
    let minSegmentDistance = Infinity;
    segments = [];
    for (let i = 0; i < weldingPoints.length - 1; i++) {
      const dist = calculateDistance(weldingPoints[i].tcp, weldingPoints[i + 1].tcp);
      totalPathDistance += dist;
      const isSamePart =
        partBoundaryInfo.pointPartIndices[i] === partBoundaryInfo.pointPartIndices[i + 1];
      if (isSamePart && dist < minSegmentDistance) minSegmentDistance = dist;
      const segmentCpm = weldingPoints[i + 1].moveSpeed || 50;
      const toPoint = weldingPoints[i + 1];
      segments.push({
        from: weldingPoints[i].id,
        to: toPoint.id,
        distance_mm: dist,
        cpm: segmentCpm,
        expected_sec: ((dist * 6) / segmentCpm) * CPM_CORRECTION_FACTOR,
        gap: toPoint.gap,
        weld_voltage: toPoint.weldVoltage,
        weld_current: toPoint.weldCurrent,
        weaving_type: toPoint.weavingType,
        weave_params: toPoint.weaveParams as unknown as Record<string, unknown>,
        touch_offset: toPoint.touchOffset,
      });
    }
    totalExpectedDurationSec = segments.reduce((sum, seg) => sum + seg.expected_sec, 0);
    representativeCpm = firstWeldPoint.moveSpeed || 50;
    if (hasWeaving) {
      const minWeavingDist = getMinimumWeavingDistance(
        firstWeldPoint.weaveParams.weaveRange,
        configuredMinWeavingDistance,
      );
      if (minSegmentDistance < minWeavingDist) {
        log_weldingExecution.warn(
          'welding.weaving.shortSegment',
          '포인트 간 거리가 위빙 권장 거리보다 짧음 (위빙 계속 진행)',
          {
            minSegmentDistance: minSegmentDistance.toFixed(1),
            minWeavingDist: minWeavingDist.toFixed(1),
          },
        );
      }
    }
    const { sequence: sequenceSettings, safety: safetySettings } = await loadWeldingSettings();
    const hasStoredTouchOffsets = weldingPoints.some(pt => pt.touchOffset !== null);
    const approachOffset = sequenceSettings.touchApproachOffset;
    setCurrentPointIndex(startPointIndex);
    const startPoint = weldingPoints[startPointIndex];
    const paramPoint = weldingPoints[paramPointIndex];
    if (startFromClosest && closestCenterlineResult) {
      const centerlineTcp = closestCenterlineResult.centerlineTcp;
      const closestTeachingPt = weldingPoints[closestCenterlineResult.closestTeachingPointIndex];
      const distToTeachingPoint = closestTeachingPt?.tcp
        ? Math.sqrt(
            Math.pow(currentTcp![0] - closestTeachingPt.tcp.x, 2) +
              Math.pow(currentTcp![1] - closestTeachingPt.tcp.y, 2) +
              Math.pow(currentTcp![2] - closestTeachingPt.tcp.z, 2),
          )
        : Infinity;
      if (distToTeachingPoint < 5) {
        startPointIndex = closestCenterlineResult.closestTeachingPointIndex;
        paramPointIndex = closestCenterlineResult.closestTeachingPointIndex;
        setCurrentPointIndex(startPointIndex);
        firstWeldPoint = weldingPoints[startPointIndex];
      } else {
        const approachSpeed = options?.manualMoveSpeed || 10;
        const { rx, ry, rz } = centerlineTcp;
        const moveLResult = await moveToCartesianPosition(
          { x: centerlineTcp.x, y: centerlineTcp.y, z: centerlineTcp.z, rx, ry, rz },
          approachSpeed,
          100,
          100,
          -1,
          0,
          [0, 0, 0, 0, 0, 0],
          undefined,
          paramPoint.toolNum ?? 3,
          paramPoint.userNum ?? 0,
          0,
        );
        if (moveLResult?.status_code !== 200) throw new Error('센터라인 포인트 접근 실패');
      }
    } else {
      if (startPoint.tcp && !stopRef.current) {
        log_weldingExecution.info('welding.start.approach', `시작점 +X +${approachOffset}mm 접근`);
        const approachResult = await moveToCartesianPosition(
          startPoint.tcp,
          30,
          100,
          100,
          -1,
          1,
          [approachOffset, 0, 0, 0, 0, 0],
          undefined,
          startPoint.toolNum ?? 3,
          startPoint.userNum ?? 0,
          0,
        );
        if (approachResult?.status_code !== 200) throw new Error('시작점 접근 이동 실패');
      }
    }
    if (stopRef.current) return await handleStopped(0);
    if (sequenceSettings.arcTrackingEnabled && hasWelding && !simMode) {
      await arcTraceControl({
        flag: 1,
        is_left_right: sequenceSettings.arcTrackingLeftRight ? 1 : 0,
        is_up_down: sequenceSettings.arcTrackingUpDown ? 1 : 0,
        klr: sequenceSettings.arcTrackingKlr,
        kud: sequenceSettings.arcTrackingKud,
        step_max_lr: sequenceSettings.arcTrackingStepMaxLr,
        step_max_ud: sequenceSettings.arcTrackingStepMaxUd,
        sum_max_lr: sequenceSettings.arcTrackingSumMaxLr,
        sum_max_ud: sequenceSettings.arcTrackingSumMaxUd,
      });
    }
    if (!startFromClosest && startPoint.tcp && !stopRef.current) {
      let startTouchOffset: number[] = [0, 0, 0, 0, 0, 0];
      let useStartOffset = false;
      if (startPoint.touchOffset) {
        startTouchOffset = [
          startPoint.touchOffset.dx,
          startPoint.touchOffset.dy,
          startPoint.touchOffset.dz,
          0,
          0,
          0,
        ];
        useStartOffset = true;
      }
      log_weldingExecution.info('welding.finalDescent', '최종 하강', { useOffset: useStartOffset });
      const descentResult = await moveToCartesianPosition(
        startPoint.tcp,
        30,
        100,
        100,
        -1,
        useStartOffset ? 1 : 0,
        startTouchOffset,
        undefined,
        startPoint.toolNum ?? 3,
        startPoint.userNum ?? 0,
        0,
      );
      if (descentResult?.status_code !== 200) throw new Error('최종 하강 이동 실패');
    }
    if (stopRef.current) return await handleStopped(0);
    const isStartAtPartEnd = partBoundaryInfo.partEndIndices.includes(startPointIndex);
    if (hasWelding && !simMode && !isStartAtPartEnd && !isWeldingTest) {
      const arcOnOk = await safeArcOn(
        firstWeldPoint.weldCurrent!,
        firstWeldPoint.weldVoltage!,
        safetySettings.gasPreFlowTime,
      );
      if (!arcOnOk) throw new Error('아크 ON 실패로 용접을 중단합니다');
    }
    if (hasWeaving && weaveTypeCode >= 0 && !isStartAtPartEnd)
      await setupAndStartWeave(firstWeldPoint, firstWeldPoint);
    if (!isStartAtPartEnd) setArcActive?.(true);
    const loopStartIndex = startPointIndex + 1;
    let segmentStartTime = Date.now();
    let i = loopStartIndex;
    while (i < weldingPoints.length) {
      if (stopRef.current) break;
      const point = weldingPoints[i];
      setCurrentPointIndex(i);
      const isPartStart = partBoundaryInfo.partStartIndices.includes(i);
      const currentPartIndex = partBoundaryInfo.pointPartIndices[i];
      const prevPartIndex = partBoundaryInfo.pointPartIndices[i - 1];
      if (isPartStart && currentPartIndex !== prevPartIndex) {
        setArcActive?.(false);
        await endPartWelding(
          hasWeaving,
          hasWelding,
          simMode && !isWeldingTest,
          safetySettings.gasPostFlowTime,
          weaveTypeCode,
        );
        const prevPoint = weldingPoints[i - 1];
        const transitionSpeed = 30;
        const pointSide = (id: string): 'L' | 'R' => {
          const n = parseInt(id.replace(/\D/g, ''), 10);
          return n >= 1 && n <= 6 ? 'L' : 'R';
        };
        const isSameSide =
          !!prevPoint?.id && !!point?.id && pointSide(prevPoint.id) === pointSide(point.id);
        const CROSS_CLEARANCE_X = 150;
        const CROSS_LIFT_Z = 100;
        if (prevPoint?.tcp && !stopRef.current) {
          const retractOffset = isSameSide
            ? [approachOffset, 0, 0, 0, 0, 0]
            : [CROSS_CLEARANCE_X, 0, CROSS_LIFT_Z, 0, 0, 0];
          log_weldingExecution.info(
            'welding.partTransition.retract',
            isSameSide
              ? `파트 전환 ①: base +X +${approachOffset}mm 후퇴`
              : `파트 전환 ①(횡단): base +X +${CROSS_CLEARANCE_X} / +Z +${CROSS_LIFT_Z}mm 후퇴`,
          );
          const retractResult = await moveToCartesianPosition(
            prevPoint.tcp,
            transitionSpeed,
            100,
            100,
            -1,
            1,
            retractOffset,
            undefined,
            prevPoint.toolNum ?? 3,
            prevPoint.userNum ?? 0,
            0,
          );
          if (retractResult?.status_code !== 200) throw new Error('파트 전환 후퇴 이동 실패');
        }
        if (!stopRef.current) {
          if (isSameSide && point.tcp) {
            log_weldingExecution.info(
              'welding.partTransition.approachSameSide',
              `파트 전환 ②: ${point.name} 같은 쪽 → +X +${approachOffset}mm 정면 이격 (③ 직선 진입)`,
            );
            const sameSideResult = await moveToCartesianPosition(
              point.tcp,
              transitionSpeed,
              100,
              100,
              -1,
              1,
              [approachOffset, 0, 0, 0, 0, 0],
              undefined,
              point.toolNum ?? 3,
              point.userNum ?? 0,
              0,
            );
            if (sameSideResult?.status_code !== 200) throw new Error('파트 전환(같은 쪽) 접근 이동 실패');
          } else if (point.joints && point.joints.length === 6) {
            let liftedJoints: number[] | null = null;
            if (point.tcp) {
              const liftedPose = [
                point.tcp.x + CROSS_CLEARANCE_X,
                point.tcp.y,
                point.tcp.z + CROSS_LIFT_Z,
                point.tcp.rx,
                point.tcp.ry,
                point.tcp.rz,
              ];
              liftedJoints = await getInverseKin(liftedPose, point.joints);
            }
            if (liftedJoints) {
              log_weldingExecution.info(
                'welding.partTransition.approachJ.ik',
                `파트 전환 ②(횡단): ${point.name} IK 정면+상승(+X${CROSS_CLEARANCE_X}/+Z${CROSS_LIFT_Z}) 관절로 MoveJ`,
              );
              const mjResult = await moveToJointWithStopCheck(
                liftedJoints,
                transitionSpeed,
                point.toolNum ?? 3,
                point.userNum ?? 0,
                stopRef,
              );
              if (mjResult.stopped) stopRef.current = true;
              else if (!mjResult.success) throw new Error('파트 전환(횡단) IK 접근 이동 실패');
              if (point.tcp && !stopRef.current) {
                log_weldingExecution.info(
                  'welding.partTransition.descend',
                  `파트 전환 ②.5(횡단): ${point.name} 정면 이격면(+X${CROSS_CLEARANCE_X})으로 하강`,
                );
                const descendResult = await moveToCartesianPosition(
                  point.tcp,
                  transitionSpeed,
                  100,
                  100,
                  -1,
                  1,
                  [CROSS_CLEARANCE_X, 0, 0, 0, 0, 0],
                  undefined,
                  point.toolNum ?? 3,
                  point.userNum ?? 0,
                  0,
                );
                if (descendResult?.status_code !== 200) throw new Error('파트 전환(횡단) 하강 이동 실패');
              }
            } else {
              log_weldingExecution.warn(
                'welding.partTransition.approachJ.fallback',
                `파트 전환 ②: ${point.name} 횡단 IK 실패 → 기존 MoveJ 정위치 폴백`,
              );
              const mjResult = await moveToJointWithStopCheck(
                point.joints,
                transitionSpeed,
                point.toolNum ?? 3,
                point.userNum ?? 0,
                stopRef,
              );
              if (mjResult.stopped) stopRef.current = true;
              else if (!mjResult.success) throw new Error('파트 전환(횡단) MoveJ 폴백 이동 실패');
            }
          } else if (point.tcp) {
            log_weldingExecution.info(
              'welding.partTransition.approach',
              `파트 전환 ②: ${point.name} 목표 +X +${approachOffset}mm 접근 (joints 없음 → MoveL 폴백)`,
            );
            const fallbackResult = await moveToCartesianPosition(
              point.tcp,
              transitionSpeed,
              100,
              100,
              -1,
              1,
              [approachOffset, 0, 0, 0, 0, 0],
              undefined,
              point.toolNum ?? 3,
              point.userNum ?? 0,
              0,
            );
            if (fallbackResult?.status_code !== 200) throw new Error('파트 전환(MoveL 폴백) 접근 이동 실패');
          }
        }
        if (point.tcp && !stopRef.current) {
          let pointTouchOffset: number[] = [0, 0, 0, 0, 0, 0];
          let usePointOffset = false;
          if (point.touchOffset) {
            pointTouchOffset = [
              point.touchOffset.dx,
              point.touchOffset.dy,
              point.touchOffset.dz,
              0,
              0,
              0,
            ];
            usePointOffset = true;
          }
          log_weldingExecution.info(
            'welding.partTransition.final',
            `파트 전환 ③: ${point.name} 정위치${usePointOffset ? ' (touchOffset 적용)' : ''}`,
          );
          const finalResult = await moveToCartesianPosition(
            point.tcp,
            transitionSpeed,
            100,
            100,
            -1,
            usePointOffset ? 1 : 0,
            pointTouchOffset,
            undefined,
            point.toolNum ?? 3,
            point.userNum ?? 0,
            0,
          );
          if (finalResult?.status_code !== 200) throw new Error('파트 전환 정위치 이동 실패');
        }
        await startPartWelding(
          point,
          firstWeldPoint,
          hasWeaving,
          hasWelding,
          simMode && !isWeldingTest,
          safetySettings.gasPreFlowTime,
          weaveTypeCode,
        );
        setArcActive?.(true);
        const ptSegIdx = i - 1;
        if (ptSegIdx >= 0 && ptSegIdx < segments.length)
          segments[ptSegIdx].actual_sec = (Date.now() - segmentStartTime) / 1000;
        segmentStartTime = Date.now();
        i++;
        continue;
      }
      const batchPoints: BatchMovePoint[] = [];
      const batchIndices: number[] = [];
      for (let j = i; j < weldingPoints.length; j++) {
        if (
          j > i &&
          partBoundaryInfo.partStartIndices.includes(j) &&
          partBoundaryInfo.pointPartIndices[j] !== partBoundaryInfo.pointPartIndices[j - 1]
        )
          break;
        const pt = weldingPoints[j];
        if (!pt.tcp) throw new Error(`${pt.name}: TCP 좌표가 없습니다.`);
        const { offset, useOffset } = determinePointTouchOffset(
          pt,
          j,
          weldingPoints,
          hasStoredTouchOffsets,
        );
        batchPoints.push({
          joints: pt.joints && pt.joints.length === 6 ? pt.joints : undefined,
          tcp: [pt.tcp.x, pt.tcp.y, pt.tcp.z, pt.tcp.rx, pt.tcp.ry, pt.tcp.rz],
          speed: pt.moveSpeed,
          tool: pt.toolNum ?? 3,
          user: pt.userNum ?? 0,
          vel_mode: pt.velMode ?? 1,
          offset_flag: useOffset ? 1 : 0,
          offset,
        });
        batchIndices.push(j);
      }
      if (batchPoints.length === 0) {
        i++;
        continue;
      }
      log_weldingExecution.info(
        'welding.batch',
        `Batch MoveL: ${batchPoints.length}포인트 → 단일 MoveL (경유 스킵)`,
        {
          indices: batchIndices.map(idx => weldingPoints[idx].id),
        },
      );
      try {
        const batchResult = await batchMoveL(batchPoints, { perPoint: isDryRun });
        for (const idx of batchIndices) {
          const segIdx = idx - 1;
          if (segIdx >= 0 && segIdx < segments.length) {
            segments[segIdx].actual_sec = (Date.now() - segmentStartTime) / 1000;
            segmentStartTime = Date.now();
          }
          setCurrentPointIndex(idx);
        }
        if (batchResult.data?.stopped || batchResult.status_code !== 200) {
          log_weldingExecution.warn('welding.batch.stopped', 'Batch 중단', batchResult.data);
          stopRef.current = true;
          break;
        }
      } catch (batchError) {
        log_weldingExecution.error('welding.batch.error', 'Batch MoveL 실패', { error: String(batchError) });
        throw batchError;
      }
      i += batchPoints.length;
    }
    if (stopRef.current) {
      const stoppedResult = await handleStopped(context.currentPointIndex);
      const opName = simMode ? (isDryRun ? 'DryRun' : '시뮬레이션') : '용접';
      showAlert(`${opName}이(가) 중단되었습니다.`, { type: 'warning', title: `${opName} 중단` });
      return stoppedResult;
    }
    setArcActive?.(false);
    if (hasWeaving && weaveTypeCode >= 0) {
      await endWeave();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (hasWelding && !simMode && !isWeldingTest)
      await arcOff(0, 0, 1000, safetySettings.gasPostFlowTime);
    if (sequenceSettings.arcTrackingEnabled && hasWelding && !simMode && !isWeldingTest)
      await arcTraceControl({ flag: 0 });
    if (!stopRef.current) {
      const lastWeldPoint = weldingPoints[weldingPoints.length - 1];
      if (lastWeldPoint?.tcp) {
        log_weldingExecution.info('welding.retract', 'TCP Z -100mm 후퇴');
        const retreatResult = await moveToCartesianPosition(
          lastWeldPoint.tcp,
          30,
          100,
          100,
          -1,
          2,
          [0, 0, -100, 0, 0, 0],
          undefined,
          lastWeldPoint.toolNum ?? 3,
          lastWeldPoint.userNum ?? 0,
          0,
        );
        if (retreatResult?.status_code !== 200)
          log_weldingExecution.warn('welding.retract.failed', '최종 후퇴 이동 실패 (용접 자체는 완료됨)', {
            status: retreatResult?.status_code,
          });
      }
    }
    if (!stopRef.current && homePoint?.joints) {
      log_weldingExecution.info('welding.homeReturn', 'Home으로 복귀');
      await moveToJointWithStopCheck(
        homePoint.joints,
        homePoint.moveSpeed || 50,
        homePoint.toolNum ?? 3,
        homePoint.userNum ?? 0,
        stopRef,
      );
    }
    const completedAt = new Date();
    const actualDurationSec = (completedAt.getTime() - startedAt.getTime()) / 1000;
    const timeDifferenceSec = actualDurationSec - totalExpectedDurationSec;
    const timeDifferencePercent =
      totalExpectedDurationSec > 0 ? (timeDifferenceSec / totalExpectedDurationSec) * 100 : 0;
    const operationType: 'welding' | 'dryrun' | 'simulation' = simMode
      ? isDryRun
        ? 'dryrun'
        : 'simulation'
      : 'welding';
    const result: WeldingResult = {
      operationType,
      jobId,
      jobName,
      startedAt,
      completedAt,
      totalDistanceMm: totalPathDistance,
      cpm: representativeCpm,
      expectedDurationSec: totalExpectedDurationSec,
      actualDurationSec,
      timeDifferenceSec,
      timeDifferencePercent,
      segments,
      totalPoints: weldingPoints.length,
      completedPoints: weldingPoints.length,
      resultStatus: 'success',
    };
    const logId = await saveWeldingLog({
      jobId,
      jobName,
      operationType,
      startType: startFromClosest ? 'continue' : 'start',
      startedAt,
      completedAt,
      totalDistanceMm: totalPathDistance,
      cpm: representativeCpm,
      expectedDurationSec: totalExpectedDurationSec,
      actualDurationSec,
      segments,
      totalPoints: weldingPoints.length,
      completedPoints: weldingPoints.length,
      weldingPoints,
      firstWeldPoint,
      resultStatus: 'success',
    });
    if (logId) result.logId = logId;
    setLastWeldingResult(result);
    totalTimer.end('welding.complete', '용접 완료');
    const operationName =
      operationType === 'welding' ? '용접' : operationType === 'dryrun' ? 'DryRun' : '시뮬레이션';
    showAlert(
      [
        `${operationName} 완료`,
        ``,
        `총 이동거리: ${totalPathDistance.toFixed(1)} mm`,
        `속도(CPM): ${representativeCpm} cm/min`,
        `예상: ${totalExpectedDurationSec.toFixed(1)}초 / 실제: ${actualDurationSec.toFixed(1)}초`,
        `차이: ${timeDifferenceSec >= 0 ? '+' : ''}${timeDifferenceSec.toFixed(1)}초 (${timeDifferencePercent >= 0 ? '+' : ''}${timeDifferencePercent.toFixed(1)}%)`,
      ].join('\n'),
      { type: 'success', title: `${operationName} 완료` },
    );
    return result;
  } catch (error) {
    log_weldingExecution.error('welding.error', '용접 오류', { error: String(error) });
    const failedAt = new Date();
    const failedDuration = (failedAt.getTime() - startedAt.getTime()) / 1000;
    const failedOpType: 'welding' | 'dryrun' | 'simulation' = simMode
      ? isDryRun
        ? 'dryrun'
        : 'simulation'
      : 'welding';
    await saveWeldingLog({
      jobId,
      jobName,
      operationType: failedOpType,
      startType: startFromClosest ? 'continue' : 'start',
      startedAt,
      completedAt: failedAt,
      totalDistanceMm: totalPathDistance || 0,
      cpm: representativeCpm || 0,
      expectedDurationSec: totalExpectedDurationSec || 0,
      actualDurationSec: failedDuration,
      segments: segments || [],
      totalPoints: weldingPoints?.length || 0,
      completedPoints: context.currentPointIndex >= 0 ? context.currentPointIndex : 0,
      weldingPoints: weldingPoints || [],
      firstWeldPoint,
      resultStatus: 'failed',
      errorMessage: String(error),
    }).catch(() => {});
    showAlert('용접 중 오류가 발생했습니다: ' + String(error), {
      type: 'error',
      title: '용접 오류',
    });
    try {
      if (
        typeof window !== 'undefined' &&
        localStorage.getItem('vot.diagnosticLogs.autoSendOnError') === '1'
      ) {
        const recipient =
          localStorage.getItem('vot.diagnosticLogs.recipient') || 'the@aeokorea.com';
        const { sendDiagnosticLogsEmail } = await import('../../../../lib/robotApi');
        sendDiagnosticLogsEmail(
          recipient,
          1,
          `자동발송 — 용접 오류: ${String(error).slice(0, 200)} | 단계: ${context.currentPointIndex}`,
          1,
        )
          .then(r => log_weldingExecution.info('welding.autoLogSend', '진단 로그 자동 발송', { ok: r.ok }))
          .catch(() => {});
      }
    } catch {
    }
    try {
      const { emergencyWeldingShutdown } = await import('../../../../utils');
      await emergencyWeldingShutdown();
      log_weldingExecution.info('welding.emergencyShutdown', '서버 비상 종료 API 호출 성공');
    } catch {
      log_weldingExecution.warn('welding.emergencyShutdown.fallback', '서버 비상 종료 실패, 개별 호출로 폴백');
      await safeEndWeave();
      await safeArcOff(500);
      await arcTraceControl({ flag: 0 }).catch(() => {});
    }
    return null;
  }
}
