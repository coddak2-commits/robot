import type { WeldingParam } from '../../lib/gapApi';
import { WEAVING_TYPE_OPTIONS, WeaveParams } from '.';

// 갭 파라미터(welding_params 한 행)를 티칭 포인트 값으로 바꾼다 (v1.1.168).
// U셀 화면과 펜던트 화면이 같은 규칙을 쓰도록 여기 한 곳에 둔다.
//
// - weave_type은 로봇 파형 코드(0~7)라 WEAVING_TYPE_OPTIONS의 code로 앱 값을 찾는다.
// - weave_enabled가 false면 위빙 없음('none').
// - 테이블에는 좌/우 체류가 자세별로 하나뿐이다. 수평 우측(P10~P12)은 진행 방향이
//   반대라 좌우를 뒤집어 적용한다 (좌측 300/0 -> 우측 0/300, 2026-09-21 기본값 기준).
// - 좌/우 진폭(weaveLeftRange/RightRange)은 테이블에 없어 포인트의 현재 값을 유지한다.
const RIGHT_SIDE_HORIZONTAL = ['p10', 'p11', 'p12'];

export interface GapPointFields {
  weldCurrent: number;
  weldVoltage: number;
  moveSpeed: number;
  weavingType: string;
  weaveParams: Partial<WeaveParams> | null;
}

export function gapParamToPointFields(pointId: string, param: WeldingParam): GapPointFields {
  const id = pointId.toLowerCase();
  const weaveOn = !!param.weave_enabled;
  const option = WEAVING_TYPE_OPTIONS.find(o => o.code === Number(param.weave_type));
  const weavingType = weaveOn && option ? option.value : 'none';
  let left = Number(param.weave_left_dwell_ms);
  let right = Number(param.weave_right_dwell_ms);
  if (RIGHT_SIDE_HORIZONTAL.includes(id)) [left, right] = [right, left];
  return {
    weldCurrent: Number(param.current_a),
    weldVoltage: Number(param.voltage_v),
    moveSpeed: Number(param.speed_cpm),
    weavingType,
    weaveParams:
      weavingType === 'none'
        ? null
        : {
            weaveFrequency: Number(param.weave_freq_hz),
            weaveRange: Number(param.weave_range_mm),
            weaveLeftStayTime: left,
            weaveRightStayTime: right,
          },
  };
}
