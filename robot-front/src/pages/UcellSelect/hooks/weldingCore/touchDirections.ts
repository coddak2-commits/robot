import React from 'react';
import { WeldingSequenceSettings } from './weldingCoreTypes';

export interface TouchDirectionResult {
  hasCenter: boolean;
  hasLeft: boolean;
  hasRight: boolean;
  hasTop: boolean;
  hasBottomDir: boolean;
  hasSide: boolean;
  sideDirection: 1 | -1;
  isHorizontal: boolean;
  /**
   * [v1.1.235] 터치 결과에 touch_offset_depth 를 붙일지.
   * isHorizontal 과 분리했다. 아래 CORNER_START_POINTS 주석 참고.
   */
  applyDepthOffset: boolean;
}
/**
 * [v1.1.235] 모서리 파트의 시작점. 가로로 분류돼 있지만 세로 보정을 받아야 한다.
 *
 * isHorizontal 하나가 두 가지를 동시에 정하고 있었다.
 *   (1) 중앙 X 터치에 touch_offset_depth(기본 5mm)를 붙일지
 *   (2) Y 를 좌우 두 번 잴지, 측면 한 쪽만 잴지
 * v1.1.228 에서 P4/P10 이 '가로 시작점'에서 '모서리 파트 시작점'으로 바뀌었는데
 * 분류는 그대로 가로에 남아 있어서, 같은 20mm 구간의 양 끝이 서로 다른 규칙으로
 * 보정됐다. 2026-10-08 로그(좌측, 10:07:21) 실측:
 *
 *            rawDx     적용 dx    접촉 X      최종 X     접촉면에서
 *   P4     -18.662   -18.662   -499.954   -499.954     0.0mm
 *   P3      -8.185    -3.185   -498.816   -493.816     5.0mm
 *            rawDy     적용 dy    접촉 Y      최종 Y
 *   P4     -16.292   -16.292   -509.677   -509.677     0.0mm
 *   P3     -14.310    -9.310   -509.307   -504.307     5.0mm
 *
 * 접촉 좌표가 1.1mm 안에서 같으므로 둘은 같은 벽을 재고 있고, 교시 위치가 10mm
 * 차이 나는 것은 터치가 전부 흡수한다. 그런데 보정이 끝난 자리는 P4 가 접촉면
 * 그대로, P3 은 5mm 뒤다. 그래서 모서리 20mm 를 가는 동안 토치가 X 6.1mm,
 * Y 5.4mm(합성 약 8mm) 비스듬히 쓸려 조인트에서 벗어났다.
 *
 * (2)는 건드리지 않는다. P4/P10 을 세로로 돌리면 좌우를 둘 다 재면서 모서리에서
 * 반대쪽으로 탐침이 들어가는데, 그 방향은 U셀 벽이라 code=185 가 난다.
 * 측면 한 쪽만 재는 지금 방식을 유지하고 (1)만 세로와 같게 맞춘다.
 *
 * 수평 본구간(P5/P6/P11/P12)은 종전대로 접촉면 그대로 쓴다. 그 구간은 양 끝이
 * 같은 규칙이라 쓸림이 없다.
 */
const CORNER_START_POINTS = ['p4', 'p10'];
export function getTouchDirections(
  pointIdLower: string,
  sequenceSettings: WeldingSequenceSettings,
  touchBottom: boolean,
  pointTouchBottom?: boolean
): TouchDirectionResult {
  let hasCenter = true, hasLeft = false, hasRight = false, hasTop = false, hasBottomDir = false, hasSide = false;
  let sideDirection: 1 | -1 = -1;
  const isHorizontal = ['p4', 'p5', 'p6', 'p10', 'p11', 'p12'].includes(pointIdLower);
  const applyDepthOffset = !isHorizontal || CORNER_START_POINTS.includes(pointIdLower);
  switch (pointIdLower) {
    case 'p1':
      hasCenter = sequenceSettings.p1TouchCenter;
      hasLeft = sequenceSettings.p1TouchLeft;
      hasRight = sequenceSettings.p1TouchRight;
      hasBottomDir = sequenceSettings.p1TouchBottom && (pointTouchBottom ?? touchBottom);
      break;
    case 'p2':
      hasCenter = sequenceSettings.p2TouchCenter;
      hasLeft = sequenceSettings.p2TouchLeft;
      hasRight = sequenceSettings.p2TouchRight;
      break;
    case 'p3':
      hasCenter = sequenceSettings.p3TouchCenter;
      hasLeft = sequenceSettings.p3TouchLeft;
      hasRight = sequenceSettings.p3TouchRight;
      hasBottomDir = sequenceSettings.p3TouchBottom;
      break;
    case 'p4':
      hasCenter = sequenceSettings.p4TouchCenter;
      hasTop = sequenceSettings.p4TouchTop;
      hasBottomDir = sequenceSettings.p4TouchBottom;
      hasSide = sequenceSettings.p4TouchSide;
      break;
    case 'p5':
      hasCenter = sequenceSettings.p5TouchCenter;
      hasTop = sequenceSettings.p5TouchTop;
      hasBottomDir = sequenceSettings.p5TouchBottom;
      break;
    case 'p6':
      hasCenter = sequenceSettings.p6TouchCenter;
      hasTop = sequenceSettings.p6TouchTop;
      hasBottomDir = sequenceSettings.p6TouchBottom;
      break;
    case 'p7':
      hasCenter = sequenceSettings.p7TouchCenter;
      hasLeft = sequenceSettings.p7TouchLeft;
      hasRight = sequenceSettings.p7TouchRight;
      break;
    case 'p8':
      hasCenter = sequenceSettings.p8TouchCenter;
      hasLeft = sequenceSettings.p8TouchLeft;
      hasRight = sequenceSettings.p8TouchRight;
      break;
    case 'p9':
      hasCenter = sequenceSettings.p9TouchCenter;
      hasLeft = sequenceSettings.p9TouchLeft;
      hasRight = sequenceSettings.p9TouchRight;
      hasBottomDir = sequenceSettings.p9TouchBottom;
      break;
    case 'p10':
      hasCenter = sequenceSettings.p10TouchCenter;
      hasTop = sequenceSettings.p10TouchTop;
      hasBottomDir = sequenceSettings.p10TouchBottom;
      hasSide = sequenceSettings.p10TouchSide;
      sideDirection = 1;
      break;
    case 'p11':
      hasCenter = sequenceSettings.p11TouchCenter;
      hasTop = sequenceSettings.p11TouchTop;
      hasBottomDir = sequenceSettings.p11TouchBottom;
      break;
    case 'p12':
      hasCenter = sequenceSettings.p12TouchCenter;
      hasTop = sequenceSettings.p12TouchTop;
      hasBottomDir = sequenceSettings.p12TouchBottom;
      break;
    default:
      hasCenter = true;
      hasLeft = !isHorizontal;
      hasRight = !isHorizontal;
      hasTop = isHorizontal;
      hasBottomDir = isHorizontal;
  }
  return {
    hasCenter, hasLeft, hasRight, hasTop, hasBottomDir, hasSide,
    sideDirection, isHorizontal, applyDepthOffset,
  };
}
