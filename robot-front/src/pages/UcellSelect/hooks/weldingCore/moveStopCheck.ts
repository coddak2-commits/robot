import { WEAVING_TYPE_OPTIONS } from '../..';
import { moveToJointPositionNonBlocking, checkMotionDone, getRealtimeRobotStatus, getRobotError, resetRobotError } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';

const log_helpers = createLogger('weldingHelpers');
export const moveToJointWithStopCheck = async (
  joints: number[],
  speed: number,
  tool: number,
  user: number,
  stopRef: React.MutableRefObject<boolean>,
  timeout = 300000
): Promise<{ success: boolean; stopped: boolean }> => {
  if (stopRef.current) {
    return { success: false, stopped: true };
  }
  try {
    const result = await moveToJointPositionNonBlocking(joints, speed, 100, 100, tool, user);
    const resultCode = result?.result ?? result?.data?.result;
    if (result?.status_code !== 200 || resultCode !== 0) {
      log_helpers.error('moveToJointWithStopCheck.failed', '이동 명령 실패', { result });
      return { success: false, stopped: false };
    }
    const startTime = Date.now();
    // 상태 조회 실패를 삼키면 '이동이 실패한 것'과 '완료 확인이 실패한 것'을 구분할 수 없다.
    // 기존에는 빈 catch라 checkMotionDone이 계속 실패해도 타임아웃(기본 300초)까지 조용히
    // 돌다가 '이동 실패'로 끝났고, 로그에 원인이 남지 않았다 (v1.1.135 수정).
    let motionCheckFailCount = 0;
    let lastMotionCheckError = '';
    await new Promise(resolve => setTimeout(resolve, 200));
    while (Date.now() - startTime < timeout) {
      if (stopRef.current) {
        log_helpers.info('moveToJointWithStopCheck.stopped', '이동 중 정지 요청 감지');
        return { success: false, stopped: true };
      }
      try {
        const motionResult = await checkMotionDone();
        if (motionResult?.done) {
          return { success: true, stopped: false };
        }
        motionCheckFailCount = 0;
      } catch (motionCheckError) {
        motionCheckFailCount++;
        lastMotionCheckError = String(motionCheckError);
        // 첫 실패는 즉시, 이후에는 10초(100회)마다 남긴다.
        if (motionCheckFailCount === 1 || motionCheckFailCount % 100 === 0) {
          log_helpers.warn('moveToJointWithStopCheck.motionCheckFailed',
            `이동 완료 확인 실패 (연속 ${motionCheckFailCount}회) — 이동 자체의 실패가 아닐 수 있음`,
            { error: lastMotionCheckError });
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    log_helpers.warn('moveToJointWithStopCheck.timeout', '이동 타임아웃', {
      motionCheckFailCount,
      lastMotionCheckError: lastMotionCheckError || null,
    });
    return { success: false, stopped: false };
  } catch (error) {
    log_helpers.error('moveToJointWithStopCheck.error', '이동 오류', { error: String(error) });
    return { success: false, stopped: false };
  }
};
export const moveToCartesianWithStopCheck = async (
  tcp: { x: number; y: number; z: number; rx: number; ry: number; rz: number },
  vel: number,
  acc: number,
  ovl: number,
  blendT: number,
  offsetFlag: number,
  offsetPos: number[],
  jointPos: number[] | undefined,
  toolNum: number,
  userNum: number,
  stopRef: React.MutableRefObject<boolean>,
  timeout = 300000
): Promise<{ success: boolean; stopped: boolean }> => {
  if (stopRef.current) {
    return { success: false, stopped: true };
  }
  try {
    const { moveToCartesianPositionNonBlocking, checkMotionDone } = await import('../../../../lib/robotApi');
    if (offsetFlag !== 0) {
      log_helpers.info('moveToCartesianWithStopCheck.offset', `TCP 오프셋 이동: flag=${offsetFlag}, pos=[${offsetPos.join(', ')}]`);
    }
    const result = await moveToCartesianPositionNonBlocking(tcp, vel, acc, ovl, toolNum, userNum, offsetFlag, offsetPos);
    const resultCode = result?.data?.result ?? result?.result ?? -1;
    if (result?.status_code !== 200 || resultCode !== 0) {
      log_helpers.error('moveToCartesianWithStopCheck.failed', '이동 명령 실패', { result });
      return { success: false, stopped: false };
    }
    const startTime = Date.now();
    // 상태 조회 실패를 삼키면 '이동이 실패한 것'과 '완료 확인이 실패한 것'을 구분할 수 없다.
    // 기존에는 빈 catch라 checkMotionDone이 계속 실패해도 타임아웃(기본 300초)까지 조용히
    // 돌다가 '이동 실패'로 끝났고, 로그에 원인이 남지 않았다 (v1.1.135 수정).
    let motionCheckFailCount = 0;
    let lastMotionCheckError = '';
    await new Promise(resolve => setTimeout(resolve, 200));
    while (Date.now() - startTime < timeout) {
      if (stopRef.current) {
        log_helpers.info('moveToCartesianWithStopCheck.stopped', '이동 중 정지 요청 감지');
        return { success: false, stopped: true };
      }
      try {
        const motionResult = await checkMotionDone();
        if (motionResult?.done) {
          return { success: true, stopped: false };
        }
        motionCheckFailCount = 0;
      } catch (motionCheckError) {
        motionCheckFailCount++;
        lastMotionCheckError = String(motionCheckError);
        // 첫 실패는 즉시, 이후에는 10초(100회)마다 남긴다.
        if (motionCheckFailCount === 1 || motionCheckFailCount % 100 === 0) {
          log_helpers.warn('moveToCartesianWithStopCheck.motionCheckFailed',
            `이동 완료 확인 실패 (연속 ${motionCheckFailCount}회) — 이동 자체의 실패가 아닐 수 있음`,
            { error: lastMotionCheckError });
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    log_helpers.warn('moveToCartesianWithStopCheck.timeout', '이동 타임아웃', {
      motionCheckFailCount,
      lastMotionCheckError: lastMotionCheckError || null,
    });
    return { success: false, stopped: false };
  } catch (error) {
    log_helpers.error('moveToCartesianWithStopCheck.error', '이동 오류', { error: String(error) });
    return { success: false, stopped: false };
  }
};
// [v1.1.261] 수직 끝(P1/P7)에서 빠져나온 뒤 홈으로 가는 이동.
// 홈 MoveJ 한 번이면 J1 이 약 42도 돌면서 팔이 동시에 접혀, 토치 끝이 로봇에서 먼 쪽(뒷판·U셀 쪽)으로
// 부풀어 지나갔다(2026-10-15 영상). 뒤로 빼는 거리는 60mm 가 한계(80mm 부터 code=38).
//   1) 홈 TCP 로 직선(MoveL, 사용자 제안 'LIN'). 받아들여지면 곡선이 없다.
//      거부는 명령 직후 바로 오고 로봇은 움직이지 않는다(2026-10-15 로그의 code=38 들).
//      직선이 끝난 뒤에도 홈 관절로 MoveJ 한 번 더 한다(관절값 정확히 맞추기, 이미 홈이면 거의 안 움직임).
//   2) 직선이 거부되면 J1 은 지금 값 그대로, 나머지 관절만 홈 값으로 MoveJ(팔 접기).
//      J1 이 안 돌아 위에서 보면 토치가 로봇 몸쪽으로 곧게 당겨진다.
//   3) 홈 MoveJ (J1 만 남은 회전, 팔이 접혀 반경이 작다).
// [v1.1.262] 직선이 받아들여진 뒤 도중에 멈추는 경우(2026-10-16 P7 재교시 후, ry 0.3~0.7도)
// 정지(motion done)를 도착으로 보고 홈 MoveJ 를 보내 code=14 로 거부됐고 팔 접기는 시도되지 않았다.
// 직선이 '끝났다'고 나와도 홈 TCP 와의 거리와 컨트롤러 에러를 확인하고, 도착하지 않았거나 에러면
// 에러 리셋 후 2) 팔 접기로 넘어간다.
const HOME_LIN_ARRIVE_TOL_MM = 5;
// [v1.1.274] 수직 끝(P1/P7) 출발 홈 직선은 속도·가속을 낮춘다(30/100 -> 15/50).
// P7 은 작업 범위 위쪽 끝이라 직선 초반에 J1 이 급하게 돌며 J1 지령속도 초과(1-23)·
// J1 충돌(4-1, 토크 과다)이 나기 쉽다(2026-10-19 08:01/08:03). 용접 끝·파트 전환·터치센싱 끝이 쓴다.
// 홈 버튼은 기본값(속도 최대 30, 가속 100) 그대로.
// [v1.1.275] 15/50 은 P7 -> 홈이 너무 느려 30/100 으로 원복(2026-10-26 현장). 아래로 150mm 는 유지.
export const VERTICAL_END_HOME_LIN = { linVel: 30, linAcc: 100 };
const verifyHomeLinArrival = async (
  target: { x: number; y: number; z: number },
): Promise<'arrived' | 'notArrived' | 'unknown'> => {
  let st;
  try {
    st = await getRealtimeRobotStatus();
  } catch (error) {
    log_helpers.warn('homeFromVerticalEnd.verify.status', '도착 확인용 상태 조회 실패', { error: String(error) });
    return 'unknown';
  }
  if (!st?.tcp || st.tcp.length < 3) {
    log_helpers.warn('homeFromVerticalEnd.verify.noTcp', '도착 확인용 현재 TCP 없음', { reason: st?.reason ?? null });
    return 'unknown';
  }
  const dist = Math.sqrt(
    (st.tcp[0] - target.x) ** 2 + (st.tcp[1] - target.y) ** 2 + (st.tcp[2] - target.z) ** 2,
  );
  const errCode = st.error_code ?? 0;
  if (dist <= HOME_LIN_ARRIVE_TOL_MM && errCode === 0) return 'arrived';
  let err = null;
  try {
    err = await getRobotError();
  } catch {
    err = null;
  }
  log_helpers.warn('homeFromVerticalEnd.lin.notArrived', '수직 끝 -> 홈: 직선 이동이 홈 TCP 에 도착하지 않음', {
    distanceMm: Number(dist.toFixed(1)),
    tcp: st.tcp.slice(0, 3).map(v => Number(v.toFixed(2))),
    errorCode: errCode,
    mainCode: err?.main_code ?? null,
    subCode: err?.sub_code ?? null,
    message: err?.message ?? null,
  });
  return 'notArrived';
};
const resetErrorIfAny = async (): Promise<void> => {
  let err = null;
  try {
    err = await getRobotError();
  } catch {
    err = null;
  }
  if (!err?.has_error && !(err?.main_code)) return;
  log_helpers.warn('homeFromVerticalEnd.reset', '팔 접기 전 컨트롤러 에러 리셋', {
    mainCode: err?.main_code ?? null,
    subCode: err?.sub_code ?? null,
  });
  try {
    await resetRobotError();
  } catch (error) {
    log_helpers.warn('homeFromVerticalEnd.reset.failed', '에러 리셋 실패', { error: String(error) });
  }
  await new Promise(resolve => setTimeout(resolve, 500));
};
export const moveHomeFromVerticalEnd = async (
  homePoint: {
    joints?: number[] | null;
    tcp?: { x: number; y: number; z: number; rx: number; ry: number; rz: number } | null;
    moveSpeed?: number;
    toolNum?: number;
    userNum?: number;
  },
  stopRef: React.MutableRefObject<boolean>,
  opts?: { linVel?: number; linAcc?: number },
): Promise<{ success: boolean; stopped: boolean }> => {
  if (!homePoint.joints || homePoint.joints.length !== 6) return { success: false, stopped: false };
  const tool = homePoint.toolNum ?? 3;
  const user = homePoint.userNum ?? 0;
  const speed = homePoint.moveSpeed || 50;
  if (homePoint.tcp) {
    const linVel = opts?.linVel ?? Math.min(speed, 30);
    const linAcc = opts?.linAcc ?? 100;
    log_helpers.info('homeFromVerticalEnd.lin', `수직 끝 -> 홈: 직선(LIN) 이동 시도 (속도 ${linVel}, 가속 ${linAcc})`);
    const lin = await moveToCartesianWithStopCheck(
      homePoint.tcp,
      linVel,
      linAcc,
      100,
      -1,
      0,
      [0, 0, 0, 0, 0, 0],
      undefined,
      tool,
      user,
      stopRef,
    );
    if (lin.stopped) return lin;
    if (lin.success) {
      const arrival = await verifyHomeLinArrival(homePoint.tcp);
      if (arrival !== 'notArrived') {
        log_helpers.info('homeFromVerticalEnd.lin.done', '수직 끝 -> 홈: 직선 이동 완료, 홈 관절 맞추기', { arrival });
        return await moveToJointWithStopCheck(homePoint.joints, speed, tool, user, stopRef);
      }
      log_helpers.warn('homeFromVerticalEnd.lin.aborted', '수직 끝 -> 홈: 직선 이동이 도중에 멈춤 - 팔 접기 후 회전으로 진행');
    } else {
      log_helpers.warn('homeFromVerticalEnd.lin.rejected', '수직 끝 -> 홈: 직선 이동 거부 - 팔 접기 후 회전으로 진행');
    }
    if (stopRef.current) return { success: false, stopped: true };
    await resetErrorIfAny();
  }
  let current: number[] | null = null;
  try {
    const st = await getRealtimeRobotStatus();
    current = st?.joints && st.joints.length === 6 ? st.joints : null;
  } catch (error) {
    log_helpers.warn('homeFromVerticalEnd.status', '현재 관절값 조회 실패', { error: String(error) });
  }
  if (current) {
    const fold = [current[0], ...homePoint.joints.slice(1)];
    log_helpers.info(
      'homeFromVerticalEnd.fold',
      `수직 끝 -> 홈: J1 ${current[0].toFixed(2)} 고정, 나머지 관절만 홈 자세로 접기`,
    );
    const f = await moveToJointWithStopCheck(fold, speed, tool, user, stopRef);
    if (f.stopped) return f;
    if (!f.success) log_helpers.warn('homeFromVerticalEnd.fold.failed', '팔 접기 실패 - 홈 MoveJ 로 진행');
  } else {
    log_helpers.warn('homeFromVerticalEnd.noJoints', '현재 관절값 없음 - 홈 MoveJ 로 진행');
  }
  log_helpers.info('homeFromVerticalEnd.rotate', '수직 끝 -> 홈: 홈 MoveJ');
  return await moveToJointWithStopCheck(homePoint.joints, speed, tool, user, stopRef);
};
// [v1.1.276] 수동 포인트 이동(포인트 버튼·도식 클릭): 저장 TCP 로 직선(MoveL) -> 도착 확인 -> 저장 관절 MoveJ(관절값 맞추기).
// 종전에는 MoveJ 한 번이라 관절이 함께 돌며 팔이 U셀 안쪽으로 부풀어 들어갔다.
// 2026-10-26 08:58 / 09:10 홈 -> P10 MoveJ(J1 -1.95 -> -46.06, J4 -100.78 -> -124.28) 도중 4번 축 충돌(4-4).
// 결과: 'ok' 도착 / 'rejected' 직선 거부·도중 멈춤(에러 리셋 후) / 'stopped' 정지 / 'failed' 마지막 관절 맞추기 실패.
export const moveLinToPoint = async (
  point: {
    name?: string;
    joints?: number[] | null;
    tcp?: { x: number; y: number; z: number; rx: number; ry: number; rz: number } | null;
    toolNum?: number;
    userNum?: number;
  },
  speed: number,
  stopRef: React.MutableRefObject<boolean>,
): Promise<'ok' | 'rejected' | 'stopped' | 'failed'> => {
  if (!point.tcp || !point.joints || point.joints.length !== 6) return 'rejected';
  const tool = point.toolNum ?? 3;
  const user = point.userNum ?? 0;
  const linVel = Math.min(speed, 30);
  log_helpers.info('pointLin', `${point.name ?? ''} 직선(MoveL) 이동 (속도 ${linVel})`);
  const lin = await moveToCartesianWithStopCheck(
    point.tcp, linVel, 100, 100, -1, 0, [0, 0, 0, 0, 0, 0], undefined, tool, user, stopRef,
  );
  if (lin.stopped) return 'stopped';
  if (!lin.success) {
    log_helpers.warn('pointLin.rejected', `${point.name ?? ''} 직선 이동 거부`);
    await resetErrorIfAny();
    return 'rejected';
  }
  if ((await verifyHomeLinArrival(point.tcp)) === 'notArrived') {
    log_helpers.warn('pointLin.notArrived', `${point.name ?? ''} 직선 이동이 도중에 멈춤`);
    await resetErrorIfAny();
    return 'rejected';
  }
  const j = await moveToJointWithStopCheck(point.joints, speed, tool, user, stopRef);
  if (j.stopped) return 'stopped';
  return j.success ? 'ok' : 'failed';
};
export const calculateDistance = (
  p1: { x: number; y: number; z: number } | null,
  p2: { x: number; y: number; z: number } | null
): number => {
  if (!p1 || !p2) return Infinity;
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) +
    Math.pow(p2.y - p1.y, 2) +
    Math.pow(p2.z - p1.z, 2)
  );
};
export const getMinimumWeavingDistance = (weaveRange: number, configuredMinDistance: number): number => {
  return Math.max(weaveRange, configuredMinDistance);
};
export const getWeaveTypeCode = (weavingType: string | null): number => {
  const option = WEAVING_TYPE_OPTIONS.find(opt => opt.value === weavingType);
  return option ? option.code : -1;
};
export const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));
