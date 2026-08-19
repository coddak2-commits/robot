export interface RobotConnectionResponse {
  status_code: number;
  message: string;
  data: string;
}
export interface RobotConnectionStatus {
  connected: boolean;
  status: string;
  lastCheck: string;
  error?: string;
}
export interface RealtimeRobotStatus {
  joints?: number[];
  tcp?: number[];
  speed?: number;
  servo_enabled?: boolean;
  mode?: number;
  current_tool_num?: number;
  current_user_num?: number;
  robot_state?: number;
  error_code?: number;
  error_msg?: string;
}
export interface TeachingPointData {
  id: string;
  name: string;
  order: number;
  tcp?: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  joints?: number[];
  is_saved: boolean;
  is_completed?: boolean;
  move_speed?: number;
  weld_voltage?: number;
  weld_current?: number;
  weaving_type?: string;
  tool_num?: number;
  user_num?: number;
}
export interface TeachingJob {
  id: number;
  name: string;
  description?: string;
  status: string;
  current_point_index: number;
  total_points: number;
  saved_points?: number;
  cell_type?: string;
  cell_id?: number;
  cell_name?: string;
  width?: number;
  height?: number;
  created_at?: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  points?: Array<{
    id: number;
    point_id: string;
    name: string;
    order: number;
    tcp?: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
    joints?: number[];
    is_saved: boolean;
    is_completed: boolean;
    move_speed?: number;
    weld_voltage?: number;
    weld_current?: number;
    weaving_type?: string;
    tool_num?: number;
    user_num?: number;
  }>;
}
export interface CreateTeachingJobRequest {
  name: string;
  description?: string;
  cell_type: string;
  cell_id?: number;
  cell_name?: string;
  width?: number;
  height?: number;
  points: TeachingPointData[];
}
export interface WeaveParams {
  weave_num?: number;
  weave_type: number;
  weave_frequency: number;
  weave_range: number;
  weave_left_range?: number;
  weave_right_range?: number;
  weave_left_stay_time?: number;
  weave_right_stay_time?: number;
  weave_circle_radio?: number;
  weave_yaw_angle?: number;
  weave_rot_angle?: number;
}
export interface RobotSettings {
  tool_num: number;
  user_num: number;
  default_vel: number;
  default_acc: number;
  default_ovl: number;
  auto_clear_error: boolean;
  min_weaving_distance: number;
  updated_at?: string;
}
export interface TCPPosition {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}
export interface ApiResponse<T = unknown> {
  status_code: number;
  message?: string;
  result?: number;
  data?: T;
}
