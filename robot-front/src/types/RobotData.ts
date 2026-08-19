export interface RobotJoints {
  j1: number | string;
  j2: number | string;
  j3: number | string;
  j4: number | string;
  j5: number | string;
  j6: number | string;
}
export interface RobotTCF {
  x: number | string;
  y: number | string;
  z: number | string;
  rx: number | string;
  ry: number | string;
  rz: number | string;
}
export interface RobotMoveData {
  joints: RobotJoints;
  tcf: RobotTCF;
  speed: string;
  acc: string;
  ovl: string;
}
export interface RobotStatusResponse {
  status_code: number;
  data: {
    joints: {
      j1: number;
      j2: number;
      j3: number;
      j4: number;
      j5: number;
      j6: number;
    };
    tcp: {
      x: number;
      y: number;
      z: number;
      rx: number;
      ry: number;
      rz: number;
    };
    tl_cur_pos_base: number[];
  };
}
