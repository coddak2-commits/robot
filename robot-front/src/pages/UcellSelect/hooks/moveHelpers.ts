import { TeachingPoint } from '..';
import { moveToJointPositionNonBlocking, moveToCartesianPositionNonBlocking, checkMotionDone, getWeldingConfig } from '../../../lib';
import { getErrorMessage, extractResultCode } from '../../../lib/api';
import { createLogger } from '../../../lib';

const log = createLogger('moveToPointLogic');
export async function waitForMotionComplete(
  stopMoveRef: React.MutableRefObject<boolean>,
  timeout: number,
  logPrefix: string,
): Promise<boolean> {
  const startTime = Date.now();
  await new Promise(resolve => setTimeout(resolve, 200));
  while (Date.now() - startTime < timeout) {
    if (stopMoveRef.current) {
      log.info(`${logPrefix}.stopped`, '이동 중 중단됨');
      return false;
    }
    try {
      const motionResult = await checkMotionDone();
      if (motionResult?.done) {
        log.info(`${logPrefix}.done`, '이동 완료');
        return true;
      }
    } catch {
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return true;
}
export async function executeRetract(
  currentTcp: number[] | null,
  speed: number,
  toolNum: number,
  userNum: number,
  stopMoveRef: React.MutableRefObject<boolean>,
): Promise<boolean> {
  if (!currentTcp || currentTcp.length < 6) {
    log.info('retract.noTcp', 'TCP 데이터 없음, 후퇴 스킵');
    return true;
  }
  let approachOffset = 100;
  try {
    const config = await getWeldingConfig();
    if (config) approachOffset = config.touch_sensing_approach_offset ?? 100;
  } catch {
    log.warn('retract.configError', '설정 로드 실패, 기본값 사용');
  }
  const [px, py, pz, prx, pry, prz] = currentTcp;
  log.info('retract.start', `직교좌표계 +X 방향 후퇴 (dx=+${approachOffset}mm)`);
  const retractResult = await moveToCartesianPositionNonBlocking(
    { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
    speed,
    100,
    100,
    toolNum,
    userNum,
    1,
    [approachOffset, 0, 0, 0, 0, 0],
  );
  const retractResultCode = extractResultCode(retractResult);
  if (retractResult?.status_code !== 200 || retractResultCode !== 0) {
    log.warn('retract.failed', 'TCP 후퇴 실패, MoveJ로 직접 이동');
    return true;
  }
  return await waitForMotionComplete(stopMoveRef, 30000, 'retract');
}
export async function executeApproachWithOffset(
  point: TeachingPoint,
  speed: number,
  toolNum: number,
  userNum: number,
  stopMoveRef: React.MutableRefObject<boolean>,
): Promise<boolean> {
  const { x: destX, y: destY, z: destZ, rx: destRx, ry: destRy, rz: destRz } = point.tcp!;
  let approachOffset = 100;
  try {
    const config = await getWeldingConfig();
    if (config) approachOffset = config.touch_sensing_approach_offset ?? 100;
  } catch {
    log.warn('approach.configError', '설정 로드 실패, 기본값 사용');
  }
  log.info(
    'approach.offset',
    `${point.name} 목표 +X 오프셋 위치로 이동 (dx=+${approachOffset}mm)`,
  );
  const approachResult = await moveToCartesianPositionNonBlocking(
    { x: destX, y: destY, z: destZ, rx: destRx, ry: destRy, rz: destRz },
    speed,
    100,
    100,
    toolNum,
    userNum,
    1,
    [approachOffset, 0, 0, 0, 0, 0],
  );
  const approachResultCode = extractResultCode(approachResult);
  if (approachResult?.status_code !== 200 || approachResultCode !== 0) {
    const errorMsg = getErrorMessage(approachResultCode);
    log.error('approach.offset.failed', `${point.name} 오프셋 위치 이동 실패`, { errorMsg });
    alert(`${point.name} 오프셋 접근 실패: ${errorMsg}`);
    return false;
  }
  if (!(await waitForMotionComplete(stopMoveRef, 300000, 'approach.offset'))) return false;
  log.info('approach.final', `${point.name} 정확한 목표 위치로 접근`);
  const finalResult = await moveToCartesianPositionNonBlocking(
    { x: destX, y: destY, z: destZ, rx: destRx, ry: destRy, rz: destRz },
    speed,
    100,
    100,
    toolNum,
    userNum,
    0,
    [0, 0, 0, 0, 0, 0],
  );
  const finalResultCode = extractResultCode(finalResult);
  if (finalResult?.status_code !== 200 || finalResultCode !== 0) {
    const errorMsg = getErrorMessage(finalResultCode);
    log.error('approach.final.failed', `${point.name} 최종 위치 이동 실패`, { errorMsg });
    alert(`${point.name} 최종 접근 실패: ${errorMsg}`);
    return false;
  }
  return await waitForMotionComplete(stopMoveRef, 300000, 'approach.final');
}
// [v1.1.260] 홈 버튼으로 홈에 갈 때, 로봇이 어디에 있든 먼저 짧게 빠진다.
// 종전에는 저장된 포인트 위에 정확히(관절 0.5도 이내) 서 있을 때만 +X 후퇴했고, 비상정지 후
// 멈춘 자리·용접 중간·터치 보정 자리에서는 후퇴 없이 바로 MoveJ 해서 곡선이 U셀에 닿았다
// (2026-10-15 현장). 용접 끝 P7 빠져나오기와 같은 방식:
//   높이 그대로 Base +X 60mm, U셀 가운데 쪽(현재 Y<0 이면 +Y, 아니면 -Y) 20mm 직선(MoveL).
//   거부되면 45 -> 30mm. 위로 들지 않는다(현장 U셀 상단 플랫바).
// 결과: 'ok' 빠짐 / 'failed' 전부 거부 / 'stopped' 정지 / 'skipped' TCP 없음.
const HOME_EXIT_BACK_STEPS_MM = [60, 45, 30];
const HOME_EXIT_CENTER_MM = 20;
export async function executeHomeExitRetreat(
  currentTcp: number[] | null,
  speed: number,
  toolNum: number,
  userNum: number,
  stopMoveRef: React.MutableRefObject<boolean>,
): Promise<'ok' | 'failed' | 'stopped' | 'skipped'> {
  if (!currentTcp || currentTcp.length < 6) {
    log.info('homeExit.noTcp', 'TCP 데이터 없음, 빠져나오기 생략');
    return 'skipped';
  }
  const [px, py, pz, prx, pry, prz] = currentTcp;
  const center = py < 0 ? HOME_EXIT_CENTER_MM : -HOME_EXIT_CENTER_MM;
  for (const back of HOME_EXIT_BACK_STEPS_MM) {
    log.info('homeExit.try', `홈 복귀 전 빠져나오기: +X ${back}mm, Y ${center > 0 ? '+' : ''}${center}mm (높이 그대로)`);
    const result = await moveToCartesianPositionNonBlocking(
      { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
      Math.min(speed, 30),
      100,
      100,
      toolNum,
      userNum,
      1,
      [back, center, 0, 0, 0, 0],
    );
    const rc = extractResultCode(result);
    if (result?.status_code === 200 && rc === 0) {
      if (!(await waitForMotionComplete(stopMoveRef, 30000, 'homeExit'))) return 'stopped';
      log.info('homeExit.done', `홈 복귀 전 빠져나오기 완료 (+X ${back}mm)`);
      return 'ok';
    }
    log.warn('homeExit.rejected', `빠져나오기 +X ${back}mm 거부`, { code: rc, errorMsg: getErrorMessage(rc) });
    if (stopMoveRef.current) return 'stopped';
  }
  return 'failed';
}
export async function executeHomeSafeApproach(
  currentTcp: number[] | null,
  homePoint: TeachingPoint,
  speed: number,
  stopMoveRef: React.MutableRefObject<boolean>,
): Promise<boolean> {
  const toolNum = homePoint.toolNum ?? 0;
  const userNum = homePoint.userNum ?? 0;
  if (currentTcp && currentTcp.length >= 6) {
    const [px, py, pz, prx, pry, prz] = currentTcp;
    log.info('home.baseZUp', '현재 위치 base Z+100mm 상승 (모재 위로 이탈)');
    const riseResult = await moveToCartesianPositionNonBlocking(
      { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
      Math.min(speed, 30),
      50,
      50,
      toolNum,
      userNum,
      1,
      [0, 0, 100, 0, 0, 0],
    );
    const rc = extractResultCode(riseResult);
    if (riseResult?.status_code !== 200 || rc !== 0) {
      log.warn('home.baseZUp.failed', '고도 상승 실패 — MoveJ로 진행', { code: rc });
      return true;
    }
    if (!(await waitForMotionComplete(stopMoveRef, 30000, 'home.baseZUp'))) return false;
  }
  return true;
}
// 저장된 관절값을 현재 관절 기준 최단 경로로 정규화 (±360° wrap, 손목 360도 회전 방지)
function normalizeJointsToShortest(target: number[], current: number[] | null | undefined): number[] {
  if (!current || current.length !== target.length) return target;
  return target.map((t, i) => {
    let v = t;
    let diff = v - current[i];
    while (diff > 180) { v -= 360; diff -= 360; }
    while (diff < -180) { v += 360; diff += 360; }
    return v;
  });
}

export async function executeMoveJ(
  point: TeachingPoint,
  speed: number,
  toolNum: number,
  userNum: number,
  stopMoveRef: React.MutableRefObject<boolean>,
  currentJoints?: number[] | null,
): Promise<boolean> {
  log.info('moveJ', `${point.name} TCP 없음, MoveJ로 이동`);
  const normalized = normalizeJointsToShortest(point.joints!, currentJoints);
  const wrapped = normalized.some((v, i) => Math.abs(v - point.joints![i]) > 1e-6);
  if (wrapped) {
    log.info('moveJ.normalize', `${point.name} 관절 최단경로 정규화 적용`, {
      original: point.joints,
      normalized,
    });
  }
  const result = await moveToJointPositionNonBlocking(
    normalized,
    speed,
    100,
    100,
    toolNum,
    userNum,
  );
  const moveResult = extractResultCode(result);
  if (result?.status_code !== 200 || moveResult !== 0) {
    const errorMsg = getErrorMessage(moveResult);
    log.error('moveJ.failed', `${point.name} 이동 명령 실패`, { errorMsg });
    alert(`${point.name} 이동 실패: ${errorMsg}`);
    return false;
  }
  return await waitForMotionComplete(stopMoveRef, 300000, 'moveJ');
}
