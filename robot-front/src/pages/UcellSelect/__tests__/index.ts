import { WELDING_PARTS, DEFAULT_PART_WELD_ENABLED, getExecutableParts, flattenExecutableParts, getPartBoundaryInfo } from '..';
import type { ExecutablePart, PartWeldEnabled } from '..';
import { DEFAULT_WEAVE_PARAMS, createInitialTeachingPoints, UCELL_POINT_DEFINITIONS, WEAVING_TYPE_OPTIONS, NORMAL_CELLS, COLLAR_PLATE_CELLS, HEIGHT_OPTIONS } from '..';
import type { TeachingPoint, WeaveParams } from '..';
const makeSavedPoints = (pointIds: string[]): TeachingPoint[] => {
  const points = createInitialTeachingPoints();
  points.forEach(pt => {
    if (pointIds.includes(pt.id)) {
      pt.isSaved = true;
      pt.tcp = { x: 100, y: 200, z: 300, rx: 0, ry: 0, rz: 0 };
      pt.joints = [0, -90, 90, 0, 90, 0];
    }
  });
  return points;
};
describe('WELDING_PARTS', () => {
  it('4개 파트로 구성', () => {
    expect(WELDING_PARTS).toHaveLength(4);
  });
  it('파트1: P4→P5→P6 (하단 좌측)', () => {
    expect(WELDING_PARTS[0].points).toEqual(['p4', 'p5', 'p6']);
  });
  it('파트2: P3→P2→P1 (좌측)', () => {
    expect(WELDING_PARTS[1].points).toEqual(['p3', 'p2', 'p1']);
  });
  it('파트3: P10→P11→P12 (하단 우측)', () => {
    expect(WELDING_PARTS[2].points).toEqual(['p10', 'p11', 'p12']);
  });
  it('파트4: P9→P8→P7 (우측)', () => {
    expect(WELDING_PARTS[3].points).toEqual(['p9', 'p8', 'p7']);
  });
});
describe('DEFAULT_PART_WELD_ENABLED', () => {
  it('모든 파트가 기본 활성화', () => {
    expect(DEFAULT_PART_WELD_ENABLED[0]).toBe(true);
    expect(DEFAULT_PART_WELD_ENABLED[1]).toBe(true);
    expect(DEFAULT_PART_WELD_ENABLED[2]).toBe(true);
    expect(DEFAULT_PART_WELD_ENABLED[3]).toBe(true);
  });
});
describe('getExecutableParts', () => {
  it('저장된 포인트가 없으면 모든 파트가 shouldExecute=false', () => {
    const points = createInitialTeachingPoints();
    const parts = getExecutableParts(points);
    parts.forEach(part => {
      expect(part.shouldExecute).toBe(false);
      expect(part.savedPoints).toHaveLength(0);
    });
  });
  it('파트1(P4,P5,P6) 3개 모두 저장 시 shouldExecute=true', () => {
    const points = makeSavedPoints(['p4', 'p5', 'p6']);
    const parts = getExecutableParts(points);
    expect(parts[0].shouldExecute).toBe(true);
    expect(parts[0].savedPoints).toHaveLength(3);
  });
  it('파트에 1개만 저장 시 shouldExecute=false (최소 2개 필요)', () => {
    const points = makeSavedPoints(['p4']);
    const parts = getExecutableParts(points);
    expect(parts[0].shouldExecute).toBe(false);
    expect(parts[0].savedPoints).toHaveLength(1);
  });
  it('파트에 2개 저장 시 shouldExecute=true', () => {
    const points = makeSavedPoints(['p4', 'p5']);
    const parts = getExecutableParts(points);
    expect(parts[0].shouldExecute).toBe(true);
    expect(parts[0].savedPoints).toHaveLength(2);
  });
  it('partWeldEnabled로 특정 파트를 비활성화', () => {
    const points = makeSavedPoints(['p4', 'p5', 'p6', 'p3', 'p2', 'p1']);
    const partWeldEnabled: PartWeldEnabled = { 0: false, 1: true, 2: true, 3: true };
    const parts = getExecutableParts(points, partWeldEnabled);
    expect(parts[0].shouldExecute).toBe(false);
    expect(parts[0].savedPoints).toHaveLength(3);
    expect(parts[1].shouldExecute).toBe(true);
  });
  it('partWeldEnabled 미제공 시 기본 활성화', () => {
    const points = makeSavedPoints(['p4', 'p5', 'p6']);
    const parts = getExecutableParts(points, undefined);
    expect(parts[0].shouldExecute).toBe(true);
  });
  it('joints가 빈 배열이면 저장된 것으로 간주하지 않음', () => {
    const points = createInitialTeachingPoints();
    const pt = points.find(p => p.id === 'p4')!;
    pt.isSaved = true;
    pt.tcp = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    pt.joints = [];
    const parts = getExecutableParts(points);
    expect(parts[0].savedPoints).toHaveLength(0);
  });
  it('4개 파트 모두에 대해 항상 4개의 결과 반환', () => {
    const points = createInitialTeachingPoints();
    const parts = getExecutableParts(points);
    expect(parts).toHaveLength(4);
  });
});
describe('flattenExecutableParts', () => {
  it('실행 가능한 파트의 포인트만 평탄화', () => {
    const points = makeSavedPoints(['p4', 'p5', 'p6', 'p3', 'p2', 'p1']);
    const parts = getExecutableParts(points);
    const flattened = flattenExecutableParts(parts);
    expect(flattened).toHaveLength(6);
  });
  it('shouldExecute=false인 파트의 포인트는 제외', () => {
    const points = makeSavedPoints(['p4', 'p5', 'p6']);
    const parts = getExecutableParts(points);
    const flattened = flattenExecutableParts(parts);
    expect(flattened).toHaveLength(3);
    expect(flattened.map(pt => pt.id)).toEqual(['p4', 'p5', 'p6']);
  });
  it('실행 가능한 파트가 없으면 빈 배열 반환', () => {
    const points = createInitialTeachingPoints();
    const parts = getExecutableParts(points);
    const flattened = flattenExecutableParts(parts);
    expect(flattened).toHaveLength(0);
  });
  it('파트 순서대로 포인트가 나열됨', () => {
    const points = makeSavedPoints(['p4', 'p5', 'p6', 'p9', 'p8', 'p7']);
    const parts = getExecutableParts(points);
    const flattened = flattenExecutableParts(parts);
    const ids = flattened.map(pt => pt.id);
    expect(ids).toEqual(['p4', 'p5', 'p6', 'p9', 'p8', 'p7']);
  });
});
describe('getPartBoundaryInfo', () => {
  it('실행 가능한 파트 없으면 빈 배열들 반환', () => {
    const points = createInitialTeachingPoints();
    const parts = getExecutableParts(points);
    const boundary = getPartBoundaryInfo(parts);
    expect(boundary.pointPartIndices).toHaveLength(0);
    expect(boundary.partStartIndices).toHaveLength(0);
    expect(boundary.partEndIndices).toHaveLength(0);
  });
  it('단일 파트: 올바른 경계 정보', () => {
    const points = makeSavedPoints(['p4', 'p5', 'p6']);
    const parts = getExecutableParts(points);
    const boundary = getPartBoundaryInfo(parts);
    expect(boundary.pointPartIndices).toEqual([0, 0, 0]);
    expect(boundary.partStartIndices).toEqual([0]);
    expect(boundary.partEndIndices).toEqual([2]);
  });
  it('2개 파트: 파트 인덱스가 올바르게 매핑', () => {
    const points = makeSavedPoints(['p4', 'p5', 'p6', 'p3', 'p2', 'p1']);
    const parts = getExecutableParts(points);
    const boundary = getPartBoundaryInfo(parts);
    expect(boundary.pointPartIndices).toEqual([0, 0, 0, 1, 1, 1]);
    expect(boundary.partStartIndices).toEqual([0, 3]);
    expect(boundary.partEndIndices).toEqual([2, 5]);
  });
  it('비연속 파트: 파트 인덱스 점프 확인', () => {
    const points = makeSavedPoints(['p4', 'p5', 'p6', 'p9', 'p8', 'p7']);
    const parts = getExecutableParts(points);
    const boundary = getPartBoundaryInfo(parts);
    expect(boundary.pointPartIndices).toEqual([0, 0, 0, 3, 3, 3]);
    expect(boundary.partStartIndices).toEqual([0, 3]);
    expect(boundary.partEndIndices).toEqual([2, 5]);
  });
});
describe('DEFAULT_WEAVE_PARAMS', () => {
  it('기본 위빙 파라미터 값이 올바른지 확인', () => {
    expect(DEFAULT_WEAVE_PARAMS.weaveFrequency).toBe(2.0);
    expect(DEFAULT_WEAVE_PARAMS.weaveRange).toBe(5.0);
    expect(DEFAULT_WEAVE_PARAMS.weaveLeftRange).toBe(5.0);
    expect(DEFAULT_WEAVE_PARAMS.weaveRightRange).toBe(5.0);
    expect(DEFAULT_WEAVE_PARAMS.weaveLeftStayTime).toBe(800);
    expect(DEFAULT_WEAVE_PARAMS.weaveRightStayTime).toBe(800);
    expect(DEFAULT_WEAVE_PARAMS.weaveCircleRadio).toBe(50);
    expect(DEFAULT_WEAVE_PARAMS.weaveYawAngle).toBe(0);
    expect(DEFAULT_WEAVE_PARAMS.weaveRotAngle).toBe(0);
  });
  it('모든 필수 필드가 존재하는지 확인', () => {
    const requiredKeys: (keyof WeaveParams)[] = [
      'weaveFrequency', 'weaveRange', 'weaveLeftRange', 'weaveRightRange',
      'weaveLeftStayTime', 'weaveRightStayTime', 'weaveCircleRadio',
      'weaveYawAngle', 'weaveRotAngle',
    ];
    requiredKeys.forEach(key => {
      expect(DEFAULT_WEAVE_PARAMS).toHaveProperty(key);
      expect(typeof DEFAULT_WEAVE_PARAMS[key]).toBe('number');
    });
  });
});
describe('UCELL_POINT_DEFINITIONS', () => {
  it('Home + 12개 포인트 = 총 13개 포인트 정의', () => {
    expect(UCELL_POINT_DEFINITIONS).toHaveLength(13);
  });
  it('Home 포인트가 order=0으로 정의됨', () => {
    const home = UCELL_POINT_DEFINITIONS.find(p => p.id === 'home');
    expect(home).toBeDefined();
    expect(home!.order).toBe(0);
    expect(home!.weldVoltage).toBeNull();
    expect(home!.weldCurrent).toBeNull();
  });
  it('P1~P11은 용접 파라미터(전압/전류)가 설정됨', () => {
    const weldingPoints = UCELL_POINT_DEFINITIONS.filter(
      p => p.id !== 'home' && p.id !== 'p12'
    );
    weldingPoints.forEach(p => {
      expect(p.weldVoltage).toBe(24);
      expect(p.weldCurrent).toBe(220);
    });
  });
  it('P12(종료점)은 용접 파라미터가 null', () => {
    const p12 = UCELL_POINT_DEFINITIONS.find(p => p.id === 'p12');
    expect(p12).toBeDefined();
    expect(p12!.weldVoltage).toBeNull();
    expect(p12!.weldCurrent).toBeNull();
  });
  it('모든 포인트의 order가 고유함', () => {
    const orders = UCELL_POINT_DEFINITIONS.map(p => p.order);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(orders.length);
  });
  it('모든 포인트의 id가 고유함', () => {
    const ids = UCELL_POINT_DEFINITIONS.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
  it('모든 포인트의 toolNum이 3 (용접 토치)', () => {
    UCELL_POINT_DEFINITIONS.forEach(p => {
      expect(p.toolNum).toBe(3);
    });
  });
  it('좌측 포인트(P1~P3)의 touchDirection이 1(RIGHT)', () => {
    ['p1', 'p2', 'p3'].forEach(id => {
      const pt = UCELL_POINT_DEFINITIONS.find(p => p.id === id);
      expect(pt!.touchDirection).toBe(1);
    });
  });
  it('우측 포인트(P7~P9)의 touchDirection이 -1(LEFT)', () => {
    ['p7', 'p8', 'p9'].forEach(id => {
      const pt = UCELL_POINT_DEFINITIONS.find(p => p.id === id);
      expect(pt!.touchDirection).toBe(-1);
    });
  });
});
describe('WEAVING_TYPE_OPTIONS', () => {
  it('9개 위빙 타입 옵션 (none 포함)', () => {
    expect(WEAVING_TYPE_OPTIONS).toHaveLength(9);
  });
  it('none 타입의 code가 -1', () => {
    const none = WEAVING_TYPE_OPTIONS.find(opt => opt.value === 'none');
    expect(none).toBeDefined();
    expect(none!.code).toBe(-1);
  });
  it('SDK 위빙 타입 코드가 0~7 범위', () => {
    const sdkOptions = WEAVING_TYPE_OPTIONS.filter(opt => opt.value !== 'none');
    sdkOptions.forEach(opt => {
      expect(opt.code).toBeGreaterThanOrEqual(0);
      expect(opt.code).toBeLessThanOrEqual(7);
    });
  });
  it('모든 value가 고유함', () => {
    const values = WEAVING_TYPE_OPTIONS.map(opt => opt.value);
    expect(new Set(values).size).toBe(values.length);
  });
  it('모든 code가 고유함', () => {
    const codes = WEAVING_TYPE_OPTIONS.map(opt => opt.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
describe('셀 목록', () => {
  it('NORMAL_CELLS: 5개 U-Cell (ID 1~5)', () => {
    expect(NORMAL_CELLS).toHaveLength(5);
    expect(NORMAL_CELLS.map(c => c.id)).toEqual([1, 2, 3, 4, 5]);
  });
  it('COLLAR_PLATE_CELLS: 4개 Collar (ID 6~9)', () => {
    expect(COLLAR_PLATE_CELLS).toHaveLength(4);
    expect(COLLAR_PLATE_CELLS.map(c => c.id)).toEqual([6, 7, 8, 9]);
  });
  it('모든 셀 ID가 고유 (NORMAL + COLLAR)', () => {
    const allIds = [...NORMAL_CELLS, ...COLLAR_PLATE_CELLS].map(c => c.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
describe('createInitialTeachingPoints', () => {
  let points: TeachingPoint[];
  beforeEach(() => {
    points = createInitialTeachingPoints();
  });
  it('UCELL_POINT_DEFINITIONS와 같은 수의 포인트 생성', () => {
    expect(points).toHaveLength(UCELL_POINT_DEFINITIONS.length);
  });
  it('모든 포인트가 미티칭 상태 (tcp, joints = null)', () => {
    points.forEach(pt => {
      expect(pt.tcp).toBeNull();
      expect(pt.joints).toBeNull();
    });
  });
  it('모든 포인트가 미저장 상태 (isSaved = false)', () => {
    points.forEach(pt => {
      expect(pt.isSaved).toBe(false);
    });
  });
  it('모든 포인트가 터치 센싱 미수행 상태 (touchOffset = null)', () => {
    points.forEach(pt => {
      expect(pt.touchOffset).toBeNull();
    });
  });
  it('각 포인트의 ID와 order가 DEFINITIONS와 일치', () => {
    points.forEach((pt, idx) => {
      expect(pt.id).toBe(UCELL_POINT_DEFINITIONS[idx].id);
      expect(pt.order).toBe(UCELL_POINT_DEFINITIONS[idx].order);
    });
  });
  it('호출마다 새로운 배열을 반환', () => {
    const points1 = createInitialTeachingPoints();
    const points2 = createInitialTeachingPoints();
    expect(points1).not.toBe(points2);
    expect(points1[0]).not.toBe(points2[0]);
  });
});
describe('HEIGHT_OPTIONS', () => {
  it('3개 높이 옵션 존재', () => {
    expect(HEIGHT_OPTIONS).toHaveLength(3);
  });
  it('높이 값이 오름차순', () => {
    for (let i = 1; i < HEIGHT_OPTIONS.length; i++) {
      expect(HEIGHT_OPTIONS[i].value).toBeGreaterThan(HEIGHT_OPTIONS[i - 1].value);
    }
  });
});
