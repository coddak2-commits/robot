-- 020: camera_captures 표 (v1.1.281, 2026-11-02)
--
-- robot_camera(Orbbec Gemini 435Le 촬영 프로그램)가 켜질 때 이 표를 자동으로 만든다(CREATE TABLE IF NOT EXISTS).
-- 이 파일은 기록용이다. 자동 생성이 실패한 경우(DB 권한 등)에만 손으로 돌린다.
-- 기존 표·값은 건드리지 않는다. 되돌릴 때는 DROP TABLE camera_captures;

CREATE TABLE IF NOT EXISTS camera_captures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  captured_at DATETIME(3) NOT NULL,
  trigger_type VARCHAR(16) NOT NULL,
  job_id INT NULL, job_name VARCHAR(200) NULL, welding_log_id INT NULL,
  gap_actual_mm DOUBLE NULL, part_gaps TEXT NULL,
  robot_tcp TEXT NULL, robot_joints TEXT NULL, note VARCHAR(500) NULL,
  color_path VARCHAR(500) NULL, depth_path VARCHAR(500) NULL, meta_path VARCHAR(500) NULL,
  depth_width INT NULL, depth_height INT NULL, camera_serial VARCHAR(64) NULL,
  INDEX idx_cc_time (captured_at), INDEX idx_cc_job (job_id)
) DEFAULT CHARSET=utf8mb4;

SHOW TABLES LIKE 'camera_captures';
