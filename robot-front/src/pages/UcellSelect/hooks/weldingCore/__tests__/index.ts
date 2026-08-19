import { defaultSequenceSettings, defaultSafetySettings, mapConfigToSequenceSettings, mapConfigToSafetySettings, loadWeldingSettings } from '..';
import type { WeldingConfigData } from '../../../../../lib';
import { calculateDistance, getMinimumWeavingDistance, getWeaveTypeCode, delay } from '..';
import { findClosestCenterlinePoint } from '..';
import { createInitialTeachingPoints } from '../../..';
import type { TeachingPoint } from '../../..';
jest.mock('../../../../../lib/robotApi', () => ({
  getWeldingConfig: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getWeldingConfig } = jest.requireMock('../../../../../lib/robotApi') as {
  getWeldingConfig: jest.Mock;
};
describe('defaultSequenceSettings', () => {
  it('터치 센싱 기본값 확인', () => {
    expect(defaultSequenceSettings.touchSensingEnabled).toBe(true);
    expect(defaultSequenceSettings.touchSpeed).toBe(10);
    expect(defaultSequenceSettings.touchDistance).toBe(100);
    expect(defaultSequenceSettings.touchOffsetDepth).toBe(5);
    expect(defaultSequenceSettings.touchApproachOffset).toBe(100);
    expect(defaultSequenceSettings.touchSensingPointSpeed).toBe(50);
  });
  it('아크 트래킹 기본값 확인', () => {
    expect(defaultSequenceSettings.arcTrackingEnabled).toBe(false);
    expect(defaultSequenceSettings.arcTrackingLeftRight).toBe(true);
    expect(defaultSequenceSettings.arcTrackingUpDown).toBe(true);
    expect(defaultSequenceSettings.arcTrackingKlr).toBe(0.06);
    expect(defaultSequenceSettings.arcTrackingKud).toBe(0.06);
  });
  it('P3 시작점에 touchBottom=true', () => {
    expect(defaultSequenceSettings.p3TouchBottom).toBe(true);
  });
  it('P1 끝점에 touchBottom=false', () => {
    expect(defaultSequenceSettings.p1TouchBottom).toBe(false);
  });
});
describe('defaultSafetySettings', () => {
  it('가스 사전/후속 송출 시간 기본값', () => {
    expect(defaultSafetySettings.gasPreFlowTime).toBe(500);
    expect(defaultSafetySettings.gasPostFlowTime).toBe(2000);
  });
});
describe('mapConfigToSequenceSettings', () => {
  const fullConfig: WeldingConfigData = {
    touch_sensing_enabled: false,
    touch_speed: 15,
    touch_distance: 80,
    touch_offset_depth: 3,
    touch_sensing_approach_offset: 120,
    touch_sensing_point_speed: 30,
    p1_touch_center: false,
    p1_touch_left: false,
    p1_touch_right: true,
    p1_touch_bottom: true,
    p2_touch_center: true,
    p2_touch_left: false,
    p2_touch_right: true,
    p3_touch_center: true,
    p3_touch_left: true,
    p3_touch_right: false,
    p3_touch_bottom: false,
    p4_touch_center: false,
    p4_touch_top: true,
    p4_touch_bottom: false,
    p4_touch_side: true,
    p5_touch_center: true,
    p5_touch_top: false,
    p5_touch_bottom: true,
    p6_touch_center: true,
    p6_touch_top: true,
    p6_touch_bottom: false,
    p7_touch_center: true,
    p7_touch_left: false,
    p7_touch_right: true,
    p8_touch_center: true,
    p8_touch_left: true,
    p8_touch_right: false,
    p9_touch_center: false,
    p9_touch_left: true,
    p9_touch_right: true,
    p9_touch_bottom: false,
    p10_touch_center: true,
    p10_touch_top: false,
    p10_touch_bottom: true,
    p10_touch_side: false,
    p11_touch_center: true,
    p11_touch_top: true,
    p11_touch_bottom: false,
    p12_touch_center: false,
    p12_touch_top: true,
    p12_touch_bottom: true,
    arc_tracking_enabled: true,
    arc_tracking_left_right: false,
    arc_tracking_up_down: true,
    arc_tracking_klr: 0.1,
    arc_tracking_kud: 0.2,
    arc_tracking_step_max_lr: 3.0,
    arc_tracking_step_max_ud: 4.0,
    arc_tracking_sum_max_lr: 20.0,
    arc_tracking_sum_max_ud: 25.0,
    gas_pre_flow_time: 600,
    gas_post_flow_time: 3000,
  } as WeldingConfigData;
  it('기본 터치 설정 변환', () => {
    const result = mapConfigToSequenceSettings(fullConfig);
    expect(result.touchSensingEnabled).toBe(false);
    expect(result.touchSpeed).toBe(15);
    expect(result.touchDistance).toBe(80);
    expect(result.touchOffsetDepth).toBe(3);
    expect(result.touchApproachOffset).toBe(120);
    expect(result.touchSensingPointSpeed).toBe(30);
  });
  it('아크 트래킹 설정 변환', () => {
    const result = mapConfigToSequenceSettings(fullConfig);
    expect(result.arcTrackingEnabled).toBe(true);
    expect(result.arcTrackingLeftRight).toBe(false);
    expect(result.arcTrackingUpDown).toBe(true);
    expect(result.arcTrackingKlr).toBe(0.1);
    expect(result.arcTrackingKud).toBe(0.2);
    expect(result.arcTrackingStepMaxLr).toBe(3.0);
    expect(result.arcTrackingStepMaxUd).toBe(4.0);
    expect(result.arcTrackingSumMaxLr).toBe(20.0);
    expect(result.arcTrackingSumMaxUd).toBe(25.0);
  });
  it('포인트별 터치 방향 설정 변환', () => {
    const result = mapConfigToSequenceSettings(fullConfig);
    expect(result.p1TouchCenter).toBe(false);
    expect(result.p1TouchLeft).toBe(false);
    expect(result.p1TouchRight).toBe(true);
    expect(result.p3TouchBottom).toBe(false);
  });
  it('touch_sensing_approach_offset이 없으면 기본값 100', () => {
    const config = { ...fullConfig, touch_sensing_approach_offset: undefined } as any;
    const result = mapConfigToSequenceSettings(config);
    expect(result.touchApproachOffset).toBe(100);
  });
  it('touch_sensing_point_speed가 없으면 기본값 50', () => {
    const config = { ...fullConfig, touch_sensing_point_speed: undefined } as any;
    const result = mapConfigToSequenceSettings(config);
    expect(result.touchSensingPointSpeed).toBe(50);
  });
});
describe('mapConfigToSafetySettings', () => {
  it('가스 시간 설정 변환', () => {
    const config = {
      gas_pre_flow_time: 1000,
      gas_post_flow_time: 5000,
    } as WeldingConfigData;
    const result = mapConfigToSafetySettings(config);
    expect(result.gasPreFlowTime).toBe(1000);
    expect(result.gasPostFlowTime).toBe(5000);
  });
});
describe('loadWeldingSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('API 성공 시 설정 반환', async () => {
    const mockConfig = {
      touch_sensing_enabled: true,
      touch_speed: 10,
      touch_distance: 100,
      touch_offset_depth: 5,
      touch_sensing_approach_offset: 100,
      touch_sensing_point_speed: 50,
      p1_touch_center: true,
      p1_touch_left: true,
      p1_touch_right: true,
      p1_touch_bottom: false,
      p2_touch_center: true,
      p2_touch_left: true,
      p2_touch_right: true,
      p3_touch_center: true,
      p3_touch_left: true,
      p3_touch_right: true,
      p3_touch_bottom: true,
      p4_touch_center: true,
      p4_touch_top: true,
      p4_touch_bottom: true,
      p4_touch_side: true,
      p5_touch_center: true,
      p5_touch_top: true,
      p5_touch_bottom: true,
      p6_touch_center: true,
      p6_touch_top: true,
      p6_touch_bottom: true,
      p7_touch_center: true,
      p7_touch_left: true,
      p7_touch_right: true,
      p8_touch_center: true,
      p8_touch_left: true,
      p8_touch_right: true,
      p9_touch_center: true,
      p9_touch_left: true,
      p9_touch_right: true,
      p9_touch_bottom: true,
      p10_touch_center: true,
      p10_touch_top: true,
      p10_touch_bottom: true,
      p10_touch_side: true,
      p11_touch_center: true,
      p11_touch_top: true,
      p11_touch_bottom: true,
      p12_touch_center: true,
      p12_touch_top: true,
      p12_touch_bottom: true,
      arc_tracking_enabled: false,
      arc_tracking_left_right: true,
      arc_tracking_up_down: true,
      arc_tracking_klr: 0.06,
      arc_tracking_kud: 0.06,
      arc_tracking_step_max_lr: 5.0,
      arc_tracking_step_max_ud: 5.0,
      arc_tracking_sum_max_lr: 30.0,
      arc_tracking_sum_max_ud: 30.0,
      gas_pre_flow_time: 500,
      gas_post_flow_time: 2000,
    };
    getWeldingConfig.mockResolvedValue(mockConfig);
    const settings = await loadWeldingSettings();
    expect(settings.sequence.touchSensingEnabled).toBe(true);
    expect(settings.safety.gasPreFlowTime).toBe(500);
    expect(getWeldingConfig).toHaveBeenCalledTimes(1);
  });
  it('API 실패 시 기본값 반환', async () => {
    getWeldingConfig.mockRejectedValue(new Error('Network Error'));
    const settings = await loadWeldingSettings();
    expect(settings.sequence).toEqual(defaultSequenceSettings);
    expect(settings.safety).toEqual(defaultSafetySettings);
  });
});
jest.mock('../../../../../lib/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));
jest.mock('../../../../../lib/robotApi', () => ({
  moveToJointPositionNonBlocking: jest.fn(),
  checkMotionDone: jest.fn(),
}));
describe('calculateDistance', () => {
  it('같은 점 사이의 거리는 0', () => {
    const p = { x: 100, y: 200, z: 300 };
    expect(calculateDistance(p, p)).toBe(0);
  });
  it('X축 방향 거리 계산', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 100, y: 0, z: 0 };
    expect(calculateDistance(p1, p2)).toBe(100);
  });
  it('Y축 방향 거리 계산', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 0, y: 50, z: 0 };
    expect(calculateDistance(p1, p2)).toBe(50);
  });
  it('Z축 방향 거리 계산', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 0, y: 0, z: 75 };
    expect(calculateDistance(p1, p2)).toBe(75);
  });
  it('3D 거리 계산 (3-4-5 피타고라스 확장)', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 3, y: 4, z: 0 };
    expect(calculateDistance(p1, p2)).toBe(5);
  });
  it('3D 대각선 거리 (1, 2, 2 = 3)', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 1, y: 2, z: 2 };
    expect(calculateDistance(p1, p2)).toBe(3);
  });
  it('음수 좌표 거리 계산', () => {
    const p1 = { x: -10, y: -20, z: -30 };
    const p2 = { x: -10, y: -20, z: -30 };
    expect(calculateDistance(p1, p2)).toBe(0);
  });
  it('p1이 null이면 Infinity 반환', () => {
    const p = { x: 0, y: 0, z: 0 };
    expect(calculateDistance(null, p)).toBe(Infinity);
  });
  it('p2가 null이면 Infinity 반환', () => {
    const p = { x: 0, y: 0, z: 0 };
    expect(calculateDistance(p, null)).toBe(Infinity);
  });
  it('둘 다 null이면 Infinity 반환', () => {
    expect(calculateDistance(null, null)).toBe(Infinity);
  });
  it('소수점 좌표 거리 계산', () => {
    const p1 = { x: 1.5, y: 2.5, z: 3.5 };
    const p2 = { x: 4.5, y: 6.5, z: 3.5 };
    expect(calculateDistance(p1, p2)).toBe(5);
  });
});
describe('getMinimumWeavingDistance', () => {
  it('weaveRange가 configuredMinDistance보다 클 때 weaveRange 반환', () => {
    expect(getMinimumWeavingDistance(100, 50)).toBe(100);
  });
  it('configuredMinDistance가 weaveRange보다 클 때 configuredMinDistance 반환', () => {
    expect(getMinimumWeavingDistance(10, 50)).toBe(50);
  });
  it('두 값이 같으면 해당 값 반환', () => {
    expect(getMinimumWeavingDistance(30, 30)).toBe(30);
  });
  it('0 값 처리', () => {
    expect(getMinimumWeavingDistance(0, 50)).toBe(50);
    expect(getMinimumWeavingDistance(10, 0)).toBe(10);
  });
  it('기본 설정 값 (weaveRange=5, minDist=50)으로 테스트', () => {
    expect(getMinimumWeavingDistance(5.0, 50)).toBe(50);
  });
});
describe('getWeaveTypeCode', () => {
  it('none → -1', () => {
    expect(getWeaveTypeCode('none')).toBe(-1);
  });
  it('plane_triangle → 0', () => {
    expect(getWeaveTypeCode('plane_triangle')).toBe(0);
  });
  it('vertical_l_triangle → 1', () => {
    expect(getWeaveTypeCode('vertical_l_triangle')).toBe(1);
  });
  it('circle_cw → 2', () => {
    expect(getWeaveTypeCode('circle_cw')).toBe(2);
  });
  it('circle_ccw → 3', () => {
    expect(getWeaveTypeCode('circle_ccw')).toBe(3);
  });
  it('plane_sine → 4', () => {
    expect(getWeaveTypeCode('plane_sine')).toBe(4);
  });
  it('vertical_l_sine → 5', () => {
    expect(getWeaveTypeCode('vertical_l_sine')).toBe(5);
  });
  it('vertical_triangle → 6', () => {
    expect(getWeaveTypeCode('vertical_triangle')).toBe(6);
  });
  it('vertical_sine → 7', () => {
    expect(getWeaveTypeCode('vertical_sine')).toBe(7);
  });
  it('null → -1', () => {
    expect(getWeaveTypeCode(null)).toBe(-1);
  });
  it('알 수 없는 타입 → -1', () => {
    expect(getWeaveTypeCode('unknown_type')).toBe(-1);
    expect(getWeaveTypeCode('')).toBe(-1);
  });
});
describe('delay', () => {
  it('Promise를 반환', () => {
    const result = delay(0);
    expect(result).toBeInstanceOf(Promise);
  });
  it('지정 시간 후 resolve (짧은 시간)', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(30);
    expect(elapsed).toBeLessThan(200);
  });
});
jest.mock('../../../../../lib/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));
const setupPoints = (
  configs: Array<{ id: string; tcp: { x: number; y: number; z: number; rx: number; ry: number; rz: number } }>
): TeachingPoint[] => {
  const points = createInitialTeachingPoints();
  configs.forEach(cfg => {
    const pt = points.find(p => p.id === cfg.id);
    if (pt) {
      pt.isSaved = true;
      pt.tcp = cfg.tcp;
      pt.joints = [0, -90, 90, 0, 90, 0];
    }
  });
  return points;
};
describe('findClosestCenterlinePoint', () => {
  it('저장된 포인트가 2개 미만이면 null 반환', () => {
    const points = createInitialTeachingPoints();
    const result = findClosestCenterlinePoint(points, [100, 200, 300]);
    expect(result).toBeNull();
  });
  it('1개만 저장된 경우에도 null 반환', () => {
    const points = setupPoints([
      { id: 'p4', tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ]);
    const result = findClosestCenterlinePoint(points, [0, 0, 0]);
    expect(result).toBeNull();
  });
  it('직선 세그먼트에서 중간 위치의 가장 가까운 포인트 찾기', () => {
    const points = setupPoints([
      { id: 'p4', tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p5', tcp: { x: 100, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p6', tcp: { x: 200, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ]);
    const result = findClosestCenterlinePoint(points, [50, 10, 0]);
    expect(result).not.toBeNull();
    expect(result!.centerlineTcp.x).toBeCloseTo(50, 0);
    expect(result!.centerlineTcp.y).toBeCloseTo(0, 0);
    expect(result!.distance).toBeCloseTo(10, 0);
  });
  it('세그먼트 시작점에 가까울 때 closestTeachingPointIndex가 시작점', () => {
    const points = setupPoints([
      { id: 'p4', tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p5', tcp: { x: 100, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ]);
    const result = findClosestCenterlinePoint(points, [10, 0, 0]);
    expect(result).not.toBeNull();
    expect(result!.closestTeachingPointIndex).toBe(0);
  });
  it('세그먼트 끝점에 가까울 때 closestTeachingPointIndex가 끝점', () => {
    const points = setupPoints([
      { id: 'p4', tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p5', tcp: { x: 100, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ]);
    const result = findClosestCenterlinePoint(points, [90, 0, 0]);
    expect(result).not.toBeNull();
    expect(result!.closestTeachingPointIndex).toBe(1);
  });
  it('Z축 방향 오프셋에서도 정상 동작', () => {
    const points = setupPoints([
      { id: 'p4', tcp: { x: 0, y: 0, z: 100, rx: 0, ry: 0, rz: 0 } },
      { id: 'p5', tcp: { x: 100, y: 0, z: 100, rx: 0, ry: 0, rz: 0 } },
    ]);
    const result = findClosestCenterlinePoint(points, [50, 0, 120]);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeCloseTo(20, 0);
  });
  it('segmentRatio가 0~1 범위 내', () => {
    const points = setupPoints([
      { id: 'p4', tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p5', tcp: { x: 100, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ]);
    const result = findClosestCenterlinePoint(points, [50, 5, 0]);
    expect(result).not.toBeNull();
    expect(result!.segmentRatio).toBeGreaterThanOrEqual(0);
    expect(result!.segmentRatio).toBeLessThanOrEqual(1);
  });
  it('segmentLength가 양수', () => {
    const points = setupPoints([
      { id: 'p4', tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p5', tcp: { x: 100, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ]);
    const result = findClosestCenterlinePoint(points, [50, 0, 0]);
    expect(result).not.toBeNull();
    expect(result!.segmentLength).toBeCloseTo(100, 0);
  });
  it('다수 세그먼트에서 가장 가까운 세그먼트 선택', () => {
    const points = setupPoints([
      { id: 'p4', tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p5', tcp: { x: 100, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p6', tcp: { x: 100, y: 100, z: 0, rx: 0, ry: 0, rz: 0 } },
    ]);
    const result = findClosestCenterlinePoint(points, [105, 50, 0]);
    expect(result).not.toBeNull();
    expect(result!.segmentStartIndex).toBe(1);
  });
  it('partWeldEnabled로 파트 필터링', () => {
    const points = setupPoints([
      { id: 'p4', tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p5', tcp: { x: 100, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p6', tcp: { x: 200, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ]);
    const disablePart1 = { 0: false, 1: true, 2: true, 3: true };
    const result = findClosestCenterlinePoint(points, [50, 0, 0], disablePart1);
    expect(result).toBeNull();
  });
  it('자세(rx, ry, rz) 선형 보간 확인', () => {
    const points = setupPoints([
      { id: 'p4', tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: 'p5', tcp: { x: 100, y: 0, z: 0, rx: 90, ry: 0, rz: 180 } },
    ]);
    const result = findClosestCenterlinePoint(points, [50, 0, 0]);
    expect(result).not.toBeNull();
    expect(result!.centerlineTcp.rx).toBeCloseTo(45, 0);
    expect(result!.centerlineTcp.rz).toBeCloseTo(90, 0);
  });
});
