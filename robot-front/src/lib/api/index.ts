import { Axios as api } from '../http';
export type {
  RealtimeRobotStatus,
  RobotConnectionResponse,
  RobotConnectionStatus,
  RobotSettings,
  TeachingJob,
  TeachingPointData,
  CreateTeachingJobRequest,
  WeaveParams,
  TCPPosition,
  ApiResponse,
} from '../types/robotTypes';
// robotApi/mockApi에서 직접 re-export (../ 통한 순환 참조 회피)
export * from '../robotApi/index';
export * from '../mockApi/index';

export const ROBOT_ERROR_CODES: Record<number, { message: string; action: string }> = {
  0: { message: '성공', action: '' },
  '-1': { message: '일반 오류', action: '로봇 연결 상태를 확인하세요' },
  '-2': { message: '로봇 모드 오류', action: '로봇을 수동/자동 모드로 전환하세요' },
  '-3': { message: '로봇 에러 상태', action: '로봇 에러를 리셋하세요' },
  '-4': { message: '파라미터 오류', action: '입력 파라미터를 확인하세요' },
  '-5': { message: '서보 비활성화', action: '서보를 활성화하세요' },
  '-6': { message: '운동 실패', action: '로봇 상태를 확인하세요' },
  '-7': { message: '통신 오류', action: '네트워크 연결을 확인하세요' },
  '-8': { message: '비상 정지 상태', action: '비상 정지를 해제하세요' },
  '-9': { message: '범위 초과', action: '목표 위치가 작업 범위 내인지 확인하세요' },
  '-10': { message: '충돌 감지', action: '충돌 원인을 확인하세요' },
};
export const ROBOT_ALARM_CODES: Record<string, { message: string; recoverable: boolean }> = {
  '1-1': { message: '축1 관절 위치 소프트 제한 초과', recoverable: true },
  '1-2': { message: '축2 관절 위치 소프트 제한 초과', recoverable: true },
  '1-3': { message: '축3 관절 위치 소프트 제한 초과', recoverable: true },
  '1-4': { message: '축4 관절 위치 소프트 제한 초과', recoverable: true },
  '1-5': { message: '축5 관절 위치 소프트 제한 초과', recoverable: true },
  '1-6': { message: '축6 관절 위치 소프트 제한 초과', recoverable: true },
  '1-11': { message: '축1 관절 공간 내 명령 위치 초과', recoverable: true },
  '1-12': { message: '축2 관절 공간 내 명령 위치 초과', recoverable: true },
  '1-13': { message: '축3 관절 공간 내 명령 위치 초과', recoverable: true },
  '1-14': { message: '축4 관절 공간 내 명령 위치 초과', recoverable: true },
  '1-15': { message: '축5 관절 공간 내 명령 위치 초과', recoverable: true },
  '1-16': { message: '축6 관절 공간 내 명령 위치 초과', recoverable: true },
  '1-21': { message: '축1 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-22': { message: '축1 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-23': { message: '축1 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-24': { message: '축2 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-25': { message: '축2 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-26': { message: '축2 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-27': { message: '축3 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-28': { message: '축3 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-29': { message: '축3 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-30': { message: '축4 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-31': { message: '축4 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-32': { message: '축4 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-33': { message: '축5 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-34': { message: '축5 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-35': { message: '축5 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-36': { message: '축6 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-37': { message: '축6 관절 공간 내 명령 속도 초과', recoverable: true },
  '1-38': { message: '축6 관절 공간 내 명령 속도 초과', recoverable: true },
  '2-1': { message: '직교 공간 내 명령 위치 X 초과', recoverable: true },
  '2-2': { message: '직교 공간 내 명령 위치 Y 초과', recoverable: true },
  '2-3': { message: '직교 공간 내 명령 위치 Z 초과', recoverable: true },
  '2-11': { message: '직교 공간 내 명령 속도 초과', recoverable: true },
  '2-21': { message: '직교 공간 내 명령 가속도 초과', recoverable: true },
  '3-1': { message: '특이점 접근', recoverable: true },
  '3-2': { message: '특이점 진입', recoverable: false },
  '4-1': { message: '축1 충돌 감지', recoverable: true },
  '4-2': { message: '축2 충돌 감지', recoverable: true },
  '4-3': { message: '축3 충돌 감지', recoverable: true },
  '4-4': { message: '축4 충돌 감지', recoverable: true },
  '4-5': { message: '축5 충돌 감지', recoverable: true },
  '4-6': { message: '축6 충돌 감지', recoverable: true },
  '5-1': { message: '컨트롤러 통신 오류', recoverable: false },
  '5-2': { message: '드라이버 통신 오류', recoverable: false },
  '6-1': { message: '축1 서보 드라이버 오류', recoverable: false },
  '6-2': { message: '축2 서보 드라이버 오류', recoverable: false },
  '6-3': { message: '축3 서보 드라이버 오류', recoverable: false },
  '6-4': { message: '축4 서보 드라이버 오류', recoverable: false },
  '6-5': { message: '축5 서보 드라이버 오류', recoverable: false },
  '6-6': { message: '축6 서보 드라이버 오류', recoverable: false },
  '7-1': { message: '비상 정지 버튼 눌림', recoverable: true },
  '7-2': { message: '외부 비상 정지 신호', recoverable: true },
  '7-14': { message: '와이어 탐색 시간 초과', recoverable: true },
  '7-15': { message: '와이어 탐색 신호 미감지', recoverable: true },
  '10-1': { message: '역기구학 계산 실패', recoverable: true },
  '10-2': { message: '목표 위치 도달 불가', recoverable: true },
};
export function getRobotAlarmMessage(mainCode: number, subCode: number): string {
  const key = `${mainCode}-${subCode}`;
  const alarm = ROBOT_ALARM_CODES[key];
  if (alarm) {
    const recoverText = alarm.recoverable ? '복구 가능' : '복구 불가';
    return `${alarm.message}, ${recoverText}`;
  }
  return `알 수 없는 오류`;
}
export function getErrorMessage(code: number): string {
  const error = ROBOT_ERROR_CODES[code];
  if (error) {
    return `${error.message}${error.action ? ` - ${error.action}` : ''}`;
  }
  return `알 수 없는 오류 (코드: ${code})`;
}
export function formatApiError(statusCode: number, resultCode: number): string {
  if (statusCode === 200 && resultCode === 0) {
    return '';
  }
  const robotError = getErrorMessage(resultCode);
  if (statusCode === 500) {
    return `서버 오류: ${robotError}`;
  } else if (statusCode === 400) {
    return `잘못된 요청: ${robotError}`;
  } else if (statusCode === 503) {
    return '로봇 연결 안됨';
  }
  return robotError;
}
export function extractResultCode(response: unknown): number {
  if (!response || typeof response !== 'object') return -1;
  const res = response as Record<string, unknown>;
  if (typeof res.result === 'number') {
    return res.result;
  }
  if (res.data && typeof res.data === 'object') {
    const data = res.data as Record<string, unknown>;
    if (typeof data.result === 'number') {
      return data.result;
    }
  }
  return -1;
}
export function isApiSuccess(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false;
  const res = response as Record<string, unknown>;
  const statusCode = res.status_code as number;
  const resultCode = extractResultCode(response);
  return statusCode === 200 && resultCode === 0;
}
interface ApiResponse {
  status_code: number;
  message?: string;
  data?: unknown;
}
export const saveTeachingPoint = async (
  jobId: number,
  pointId: string,
  data: {
    joints?: number[];
    tcp?: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
    tool_num?: number;
    user_num?: number;
    move_speed?: number;
    weld_voltage?: number;
    weld_current?: number;
    weaving_type?: string;
  }
): Promise<ApiResponse> => {
  try {
    const response = await api.put(`/teaching/jobs/${jobId}/points/${pointId}`, data);
    return response.data;
  } catch (error) {
    console.error('포인트 저장 오류:', error);
    throw error;
  }
};
interface ApiResponse_touchSensingApi {
  status_code: number;
  message?: string;
  data?: unknown;
}
export const getTouchSensingConfig = async (): Promise<ApiResponse_touchSensingApi & { data?: unknown }> => {
  try {
    const response = await api.get('/welding/config');
    return response.data;
  } catch (error) {
    console.error('터치 센싱 설정 조회 오류:', error);
    throw error;
  }
};
export const updateTouchSensingConfig = async (config: {
  touch_sensing_enabled?: boolean;
  touch_speed?: number;
  touch_distance?: number;
  touch_bottom?: boolean;
}): Promise<ApiResponse_touchSensingApi> => {
  try {
    const response = await api.put('/welding/config', config);
    return response.data;
  } catch (error) {
    console.error('터치 센싱 설정 저장 오류:', error);
    throw error;
  }
};
