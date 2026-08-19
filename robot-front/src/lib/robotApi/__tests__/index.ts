import { api } from '..';
import { getRobotStatus, checkRobotConnection, getRealtimeRobotStatus, connectRobotSDK, enableRobot, disableRobot, setRobotMode } from '..';
import { moveToJointPosition, moveToCartesianPosition, stopRobot, moveToJointPositionNonBlocking, moveToCartesianPositionNonBlocking, checkMotionDone } from '..';
import { setWeaveParams, startWeave, endWeave, startArc, endArc, arcOn, arcOff, setWeldingCurrent, setWeldingVoltage, setWeldingParams, gasStart, gasStop, forwardWireFeed, reverseWireFeed, stopForwardWireFeed, stopReverseWireFeed } from '..';
jest.mock('../client', () => {
  const mockPostFn = jest.fn();
  const mockGetFn = jest.fn();
  return {
    axios: { post: jest.fn(), create: jest.fn() },
    api: {
      post: mockPostFn,
      get: mockGetFn,
      defaults: { baseURL: 'http://localhost:8080' },
    },
  };
});
const mockPost = api.post as jest.Mock;
const mockGet = api.get as jest.Mock;
describe('connectionApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('getRobotStatus', () => {
    it('올바른 엔드포인트로 GET 요청', async () => {
      mockGet.mockResolvedValue({ data: { connected: true, joints: [0, 0, 0, 0, 0, 0] } });
      await getRobotStatus();
      expect(mockGet).toHaveBeenCalledWith('/robot_sdk/realtime');
    });
    it('성공 시 status_code 200 래핑', async () => {
      mockGet.mockResolvedValue({ data: { connected: true } });
      const result = await getRobotStatus();
      expect(result.status_code).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).message).toBe('success');
    });
  });
  describe('checkRobotConnection', () => {
    it('연결됨 상태 정상 반환', async () => {
      mockGet.mockResolvedValue({
        data: { data: { connected: true } },
      });
      const result = await checkRobotConnection();
      expect(result.connected).toBe(true);
      expect(result.status).toBe('connected');
      expect(result.error).toBeUndefined();
    });
    it('연결 안됨 상태', async () => {
      mockGet.mockResolvedValue({
        data: { data: { connected: false } },
      });
      const result = await checkRobotConnection();
      expect(result.connected).toBe(false);
      expect(result.status).toBe('disconnected');
      expect(result.error).toBeDefined();
    });
    it('네트워크 오류 시 error 상태 반환 (throw 안함)', async () => {
      mockGet.mockRejectedValue(new Error('Network Error'));
      const result = await checkRobotConnection();
      expect(result.connected).toBe(false);
      expect(result.status).toBe('error');
      expect(result.error).toContain('Network Error');
    });
    it('lastCheck이 ISO 형식 문자열', async () => {
      mockGet.mockResolvedValue({ data: { data: { connected: true } } });
      const result = await checkRobotConnection();
      expect(result.lastCheck).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
  describe('getRealtimeRobotStatus', () => {
    it('정상 응답 반환', async () => {
      const mockStatus = {
        connected: true,
        joints: [0, -90, 90, 0, 90, 0],
        tcp: [100, 200, 300, 0, 90, 0],
      };
      mockGet.mockResolvedValue({ data: mockStatus });
      const result = await getRealtimeRobotStatus();
      expect(result.connected).toBe(true);
      expect(result.joints).toEqual([0, -90, 90, 0, 90, 0]);
    });
    it('오류 시 disconnected 상태 반환 (throw 안함)', async () => {
      mockGet.mockRejectedValue(new Error('Timeout'));
      const result = await getRealtimeRobotStatus();
      expect(result.connected).toBe(false);
      expect(result.joints).toBeNull();
      expect(result.tcp).toBeNull();
      expect(result.reason).toContain('Timeout');
    });
  });
  describe('connectRobotSDK', () => {
    it('IP 지정하여 연결', async () => {
      mockPost.mockResolvedValue({ data: { status_code: 200 } });
      await connectRobotSDK('192.168.1.10');
      expect(mockPost).toHaveBeenCalledWith('/robot_sdk/connect', { ip: '192.168.1.10' });
    });
    it('IP 미지정 시 null 전송', async () => {
      mockPost.mockResolvedValue({ data: { status_code: 200 } });
      await connectRobotSDK();
      expect(mockPost).toHaveBeenCalledWith('/robot_sdk/connect', { ip: null });
    });
  });
  describe('enableRobot', () => {
    it('올바른 엔드포인트로 POST 요청', async () => {
      mockPost.mockResolvedValue({ data: { status_code: 200 } });
      await enableRobot();
      expect(mockPost).toHaveBeenCalledWith(
        '/robot_sdk/robot/enable',
        {},
        { timeout: 30000 }
      );
    });
  });
  describe('disableRobot', () => {
    it('올바른 엔드포인트로 POST 요청', async () => {
      mockPost.mockResolvedValue({ data: { status_code: 200 } });
      await disableRobot();
      expect(mockPost).toHaveBeenCalledWith('/robot_sdk/robot/disable');
    });
  });
  describe('setRobotMode', () => {
    it('자동 모드(0) 설정', async () => {
      mockPost.mockResolvedValue({ data: { status_code: 200 } });
      await setRobotMode(0);
      expect(mockPost.mock.calls[0][0]).toBe('/robot_sdk/robot/mode?mode=0');
    });
    it('수동 모드(1) 설정', async () => {
      mockPost.mockResolvedValue({ data: { status_code: 200 } });
      await setRobotMode(1);
      expect(mockPost.mock.calls[0][0]).toBe('/robot_sdk/robot/mode?mode=1');
    });
    it('타임아웃 30초', async () => {
      mockPost.mockResolvedValue({ data: { status_code: 200 } });
      await setRobotMode(0);
      const config = mockPost.mock.calls[0][2];
      expect(config.timeout).toBe(30000);
    });
  });
});
jest.mock('../client', () => {
  const mockPostFn = jest.fn();
  const mockGetFn = jest.fn();
  return {
    axios: {
      post: jest.fn(),
      create: jest.fn(),
    },
    api: {
      post: mockPostFn,
      get: mockGetFn,
      defaults: { baseURL: 'http://localhost:8080' },
    },
  };
});
const mockPost_motionApi_test = api.post as jest.Mock;
const mockGet_motionApi_test = api.get as jest.Mock;
describe('motionApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('moveToJointPosition', () => {
    it('올바른 엔드포인트로 POST 요청', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200, result: 0 } });
      const joints = [0, -90, 90, 0, 90, 0];
      await moveToJointPosition(joints);
      expect(mockPost_motionApi_test).toHaveBeenCalledTimes(1);
      expect(mockPost_motionApi_test.mock.calls[0][0]).toBe('/robot_sdk/move/joint');
    });
    it('관절 값을 j1~j6로 변환하여 전송', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200 } });
      const joints = [10, 20, 30, 40, 50, 60];
      await moveToJointPosition(joints, 30, 100, 100, -1, 0, 3, 0);
      const payload = mockPost_motionApi_test.mock.calls[0][1];
      expect(payload.joint_pos).toEqual({
        j1: 10, j2: 20, j3: 30, j4: 40, j5: 50, j6: 60,
      });
      expect(payload.vel).toBe(30);
      expect(payload.tool).toBe(3);
      expect(payload.user).toBe(0);
      expect(payload.blend_t).toBe(-1);
    });
    it('기본 파라미터 확인', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200 } });
      await moveToJointPosition([0, 0, 0, 0, 0, 0]);
      const payload = mockPost_motionApi_test.mock.calls[0][1];
      expect(payload.vel).toBe(20);
      expect(payload.acc).toBe(100);
      expect(payload.ovl).toBe(100);
      expect(payload.blend_t).toBe(-1);
    });
    it('API 오류 시 에러 throw', async () => {
      mockPost_motionApi_test.mockRejectedValue(new Error('Connection refused'));
      await expect(
        moveToJointPosition([0, 0, 0, 0, 0, 0])
      ).rejects.toThrow('Connection refused');
    });
    it('타임아웃이 300초(5분)으로 설정', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200 } });
      await moveToJointPosition([0, 0, 0, 0, 0, 0]);
      const config = mockPost_motionApi_test.mock.calls[0][2];
      expect(config.timeout).toBe(300000);
    });
  });
  describe('moveToCartesianPosition', () => {
    it('올바른 엔드포인트로 POST 요청', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200 } });
      const tcp = { x: 100, y: 200, z: 300, rx: 0, ry: 90, rz: 0 };
      await moveToCartesianPosition(tcp);
      expect(mockPost_motionApi_test.mock.calls[0][0]).toBe('/robot_sdk/move/linear');
    });
    it('TCP 좌표와 오프셋 파라미터 전송', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200 } });
      const tcp = { x: 100, y: 200, z: 300, rx: 10, ry: 20, rz: 30 };
      await moveToCartesianPosition(tcp, 30, 100, 100, -1, 1, [1, 2, 3, 0, 0, 0]);
      const payload = mockPost_motionApi_test.mock.calls[0][1];
      expect(payload.desc_pos).toEqual(tcp);
      expect(payload.offset_flag).toBe(1);
      expect(payload.offset_pos).toEqual([1, 2, 3, 0, 0, 0]);
    });
    it('기본 tool=3, user=0', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200 } });
      const tcp = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
      await moveToCartesianPosition(tcp);
      const payload = mockPost_motionApi_test.mock.calls[0][1];
      expect(payload.tool).toBe(3);
      expect(payload.user).toBe(0);
    });
  });
  describe('stopRobot', () => {
    it('올바른 엔드포인트로 POST 요청', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200, result: 0 } });
      await stopRobot();
      expect(mockPost_motionApi_test).toHaveBeenCalledWith('/robot_sdk/robot/stop');
    });
    it('성공 시 true 반환', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200 } });
      const result = await stopRobot();
      expect(result).toBe(true);
    });
    it('실패 시 false 반환 (에러 발생해도 throw하지 않음)', async () => {
      mockPost_motionApi_test.mockRejectedValue(new Error('fail'));
      const result = await stopRobot();
      expect(result).toBe(false);
    });
  });
  describe('moveToJointPositionNonBlocking', () => {
    it('blend_t=0으로 비블로킹 요청', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200, result: 0 } });
      await moveToJointPositionNonBlocking([0, 0, 0, 0, 0, 0]);
      const payload = mockPost_motionApi_test.mock.calls[0][1];
      expect(payload.blend_t).toBe(0);
    });
    it('타임아웃이 10초로 설정 (비블로킹)', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200 } });
      await moveToJointPositionNonBlocking([0, 0, 0, 0, 0, 0]);
      const config = mockPost_motionApi_test.mock.calls[0][2];
      expect(config.timeout).toBe(10000);
    });
  });
  describe('moveToCartesianPositionNonBlocking', () => {
    it('blend_t=0으로 비블로킹 요청', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200, result: 0 } });
      const tcp = { x: 100, y: 200, z: 300, rx: 0, ry: 0, rz: 0 };
      await moveToCartesianPositionNonBlocking(tcp);
      const payload = mockPost_motionApi_test.mock.calls[0][1];
      expect(payload.blend_t).toBe(0);
    });
    it('오프셋 없으면 offset_flag, offset_pos 미포함', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200 } });
      const tcp = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
      await moveToCartesianPositionNonBlocking(tcp);
      const payload = mockPost_motionApi_test.mock.calls[0][1];
      expect(payload.offset_flag).toBeUndefined();
      expect(payload.offset_pos).toBeUndefined();
    });
    it('오프셋 있으면 offset_flag, offset_pos 포함', async () => {
      mockPost_motionApi_test.mockResolvedValue({ data: { status_code: 200 } });
      const tcp = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
      await moveToCartesianPositionNonBlocking(tcp, 20, 100, 100, 3, 0, 1, [1, 2, 3, 0, 0, 0]);
      const payload = mockPost_motionApi_test.mock.calls[0][1];
      expect(payload.offset_flag).toBe(1);
      expect(payload.offset_pos).toEqual([1, 2, 3, 0, 0, 0]);
    });
  });
  describe('checkMotionDone', () => {
    it('올바른 엔드포인트로 GET 요청', async () => {
      mockGet_motionApi_test.mockResolvedValue({ data: { data: { motion_done: 1 } } });
      await checkMotionDone();
      expect(mockGet_motionApi_test).toHaveBeenCalledWith('/robot_sdk/motion/done', { timeout: 15000 });
    });
    it('motion_done=1이면 done=true', async () => {
      mockGet_motionApi_test.mockResolvedValue({ data: { data: { motion_done: 1 } } });
      const result = await checkMotionDone();
      expect(result.done).toBe(true);
    });
    it('motion_done=0이면 done=false', async () => {
      mockGet_motionApi_test.mockResolvedValue({ data: { data: { motion_done: 0 } } });
      const result = await checkMotionDone();
      expect(result.done).toBe(false);
    });
    it('에러 시 done=false, error 포함', async () => {
      mockGet_motionApi_test.mockRejectedValue(new Error('timeout'));
      const result = await checkMotionDone();
      expect(result.done).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
jest.mock('../client', () => {
  const mockPostFn = jest.fn();
  return {
    axios: { post: jest.fn(), create: jest.fn() },
    api: {
      post: mockPostFn,
      defaults: { baseURL: 'http://localhost:8080' },
    },
  };
});
const mockPost_weldingApi_test = api.post as jest.Mock;
describe('weldingApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost_weldingApi_test.mockResolvedValue({ data: { status_code: 200, result: 0 } });
  });
  describe('setWeaveParams', () => {
    it('올바른 엔드포인트로 요청', async () => {
      await setWeaveParams({
        weave_type: 0,
        weave_frequency: 2.0,
        weave_range: 5.0,
        weave_left_range: 5.0,
        weave_right_range: 5.0,
        weave_left_stay_time: 800,
        weave_right_stay_time: 800,
        weave_circle_radio: 50,
        weave_yaw_angle: 0,
        weave_rot_angle: 0,
      });
      expect(mockPost_weldingApi_test.mock.calls[0][0]).toBe('/welding/weave/set-para');
    });
    it('모든 파라미터가 전달됨', async () => {
      await setWeaveParams({
        weave_num: 1,
        weave_type: 2,
        weave_frequency: 3.0,
        weave_range: 10.0,
        weave_left_range: 8.0,
        weave_right_range: 12.0,
        weave_left_stay_time: 500,
        weave_right_stay_time: 600,
        weave_circle_radio: 70,
        weave_yaw_angle: 15,
        weave_rot_angle: 20,
      });
      const payload = mockPost_weldingApi_test.mock.calls[0][1];
      expect(payload.weave_num).toBe(1);
      expect(payload.weave_type).toBe(2);
      expect(payload.weave_frequency).toBe(3.0);
      expect(payload.weave_range).toBe(10.0);
    });
    it('weave_num 미지정 시 기본값 0', async () => {
      await setWeaveParams({
        weave_type: 0,
        weave_frequency: 2.0,
        weave_range: 5.0,
        weave_left_range: 5.0,
        weave_right_range: 5.0,
        weave_left_stay_time: 800,
        weave_right_stay_time: 800,
        weave_circle_radio: 50,
        weave_yaw_angle: 0,
        weave_rot_angle: 0,
      });
      const payload = mockPost_weldingApi_test.mock.calls[0][1];
      expect(payload.weave_num).toBe(0);
    });
  });
  describe('startWeave / endWeave', () => {
    it('startWeave: 올바른 엔드포인트', async () => {
      await startWeave(0);
      expect(mockPost_weldingApi_test.mock.calls[0][0]).toBe('/welding/weave/start');
      expect(mockPost_weldingApi_test.mock.calls[0][1]).toEqual({ weave_num: 0 });
    });
    it('endWeave: 올바른 엔드포인트', async () => {
      await endWeave(0);
      expect(mockPost_weldingApi_test.mock.calls[0][0]).toBe('/welding/weave/end');
      expect(mockPost_weldingApi_test.mock.calls[0][1]).toEqual({ weave_num: 0 });
    });
  });
  describe('startArc / endArc', () => {
    it('startArc: 올바른 엔드포인트 및 기본 파라미터', async () => {
      await startArc();
      const [url, payload] = mockPost_weldingApi_test.mock.calls[0];
      expect(url).toBe('/welding/arc/start');
      expect(payload.io_type).toBe(0);
      expect(payload.arc_num).toBe(0);
      expect(payload.timeout).toBe(10000);
    });
    it('endArc: 올바른 엔드포인트', async () => {
      await endArc();
      expect(mockPost_weldingApi_test.mock.calls[0][0]).toBe('/welding/arc/end');
    });
  });
  describe('arcOn / arcOff', () => {
    it('arcOn: 전류/전압/가스프리플로우 전달', async () => {
      await arcOn(220, 24, 0, 0, 10000, 500);
      const [url, payload] = mockPost_weldingApi_test.mock.calls[0];
      expect(url).toBe('/welding/arc/on');
      expect(payload.current).toBe(220);
      expect(payload.voltage).toBe(24);
      expect(payload.gas_pre_flow_ms).toBe(500);
    });
    it('arcOff: 가스포스트플로우 전달', async () => {
      await arcOff(0, 0, 1000, 2000);
      const [url, payload] = mockPost_weldingApi_test.mock.calls[0];
      expect(url).toBe('/welding/arc/off');
      expect(payload.gas_post_flow_ms).toBe(2000);
    });
  });
  describe('setWeldingCurrent / setWeldingVoltage / setWeldingParams', () => {
    it('setWeldingCurrent: 올바른 엔드포인트', async () => {
      await setWeldingCurrent(220);
      expect(mockPost_weldingApi_test.mock.calls[0][0]).toBe('/welding/current/set');
      expect(mockPost_weldingApi_test.mock.calls[0][1].current).toBe(220);
    });
    it('setWeldingVoltage: 올바른 엔드포인트', async () => {
      await setWeldingVoltage(24);
      expect(mockPost_weldingApi_test.mock.calls[0][0]).toBe('/welding/voltage/set');
      expect(mockPost_weldingApi_test.mock.calls[0][1].voltage).toBe(24);
    });
    it('setWeldingParams: 전류+전압 통합 설정', async () => {
      await setWeldingParams(220, 24);
      const [url, payload] = mockPost_weldingApi_test.mock.calls[0];
      expect(url).toBe('/welding/params/set');
      expect(payload.current).toBe(220);
      expect(payload.voltage).toBe(24);
    });
  });
  describe('gasStart / gasStop', () => {
    it('gasStart: 올바른 엔드포인트', async () => {
      await gasStart();
      expect(mockPost_weldingApi_test.mock.calls[0][0]).toBe('/welding/gas/start');
    });
    it('gasStop: 올바른 엔드포인트', async () => {
      await gasStop();
      expect(mockPost_weldingApi_test.mock.calls[0][0]).toBe('/welding/gas/stop');
    });
  });
  describe('와이어 제어', () => {
    it('forwardWireFeed: wireFeed=1', async () => {
      await forwardWireFeed();
      const [url, payload] = mockPost_weldingApi_test.mock.calls[0];
      expect(url).toBe('/robot_sdk/wire/forward');
      expect(payload.wireFeed).toBe(1);
    });
    it('reverseWireFeed: wireFeed=1', async () => {
      await reverseWireFeed();
      const [url, payload] = mockPost_weldingApi_test.mock.calls[0];
      expect(url).toBe('/robot_sdk/wire/reverse');
      expect(payload.wireFeed).toBe(1);
    });
    it('stopForwardWireFeed: wireFeed=0', async () => {
      await stopForwardWireFeed();
      const payload = mockPost_weldingApi_test.mock.calls[0][1];
      expect(payload.wireFeed).toBe(0);
    });
    it('stopReverseWireFeed: wireFeed=0', async () => {
      await stopReverseWireFeed();
      const payload = mockPost_weldingApi_test.mock.calls[0][1];
      expect(payload.wireFeed).toBe(0);
    });
  });
  describe('에러 처리', () => {
    it('setWeaveParams API 실패 시 에러 throw', async () => {
      mockPost_weldingApi_test.mockRejectedValue(new Error('API Error'));
      await expect(setWeaveParams({
        weave_type: 0, weave_frequency: 2, weave_range: 5,
        weave_left_range: 5, weave_right_range: 5,
        weave_left_stay_time: 800, weave_right_stay_time: 800,
        weave_circle_radio: 50, weave_yaw_angle: 0, weave_rot_angle: 0,
      })).rejects.toThrow('API Error');
    });
    it('startArc API 실패 시 에러 throw', async () => {
      mockPost_weldingApi_test.mockRejectedValue(new Error('Timeout'));
      await expect(startArc()).rejects.toThrow('Timeout');
    });
  });
});
