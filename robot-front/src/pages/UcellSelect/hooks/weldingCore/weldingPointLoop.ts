import { TeachingPoint } from '../..';

export function interpolateOffset(
  startOffset: { dx: number; dy: number; dz: number } | null,
  endOffset: { dx: number; dy: number; dz: number } | null,
  ratio: number
): { dx: number; dy: number; dz: number } {
  const start = startOffset ?? { dx: 0, dy: 0, dz: 0 };
  const end = endOffset ?? { dx: 0, dy: 0, dz: 0 };
  return {
    dx: start.dx + ratio * (end.dx - start.dx),
    dy: start.dy + ratio * (end.dy - start.dy),
    dz: start.dz + ratio * (end.dz - start.dz),
  };
}
export function determinePointTouchOffset(
  point: TeachingPoint,
  pointIndex: number,
  weldingPoints: TeachingPoint[],
  hasStoredTouchOffsets: boolean,
): { offset: number[]; useOffset: boolean; source: 'stored' | 'interpolated' | 'none' } {
  if (point.touchOffset) {
    return {
      offset: [point.touchOffset.dx, point.touchOffset.dy, point.touchOffset.dz, 0, 0, 0],
      useOffset: true,
      source: 'stored',
    };
  }
  if (hasStoredTouchOffsets && weldingPoints.length >= 2) {
    let interpolated: { dx: number; dy: number; dz: number } | null = null;
    // [v1.1.285] 수평 2패스는 같은 id 가 두 번 나온다. id 로 찾으면 1패스 자리를 잡으므로
    // 위치(인덱스)로 찾는다. id 가 한 번씩만 나오는 경우 결과는 종전과 같다.
    let prevIdx = -1;
    for (let k = pointIndex - 1; k >= 0; k--) {
      if (weldingPoints[k].touchOffset) { prevIdx = k; break; }
    }
    let nextIdx = -1;
    for (let k = pointIndex + 1; k < weldingPoints.length; k++) {
      if (weldingPoints[k].touchOffset) { nextIdx = k; break; }
    }
    const prevWithOffset = prevIdx >= 0 ? weldingPoints[prevIdx] : undefined;
    const nextWithOffset = nextIdx >= 0 ? weldingPoints[nextIdx] : undefined;
    if (prevWithOffset && nextWithOffset) {
      const ratio = (pointIndex - prevIdx) / (nextIdx - prevIdx);
      interpolated = interpolateOffset(prevWithOffset.touchOffset, nextWithOffset.touchOffset, ratio);
    } else if (prevWithOffset) {
      interpolated = { ...prevWithOffset.touchOffset! };
    } else if (nextWithOffset) {
      interpolated = { ...nextWithOffset.touchOffset! };
    }
    if (interpolated) {
      return {
        offset: [interpolated.dx, interpolated.dy, interpolated.dz, 0, 0, 0],
        useOffset: true,
        source: 'interpolated',
      };
    }
  }
  return { offset: [0, 0, 0, 0, 0, 0], useOffset: false, source: 'none' };
}
