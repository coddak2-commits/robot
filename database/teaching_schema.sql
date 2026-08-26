-- Robot Core teaching 관련 테이블 (재작성)
DROP TABLE IF EXISTS teaching_points;
DROP TABLE IF EXISTS teaching_jobs;

CREATE TABLE teaching_jobs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  current_point_index INT DEFAULT 0,
  total_points INT DEFAULT 0,
  cell_type VARCHAR(50),
  cell_id INT DEFAULT 0,
  cell_name VARCHAR(100),
  width INT DEFAULT 0,
  height INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL
);

CREATE TABLE teaching_points (
  id INT PRIMARY KEY AUTO_INCREMENT,
  job_id INT NOT NULL,
  point_id VARCHAR(10) NOT NULL,
  name VARCHAR(50),
  `order` INT DEFAULT 0,
  tcp_x DOUBLE DEFAULT 0,
  tcp_y DOUBLE DEFAULT 0,
  tcp_z DOUBLE DEFAULT 0,
  tcp_rx DOUBLE DEFAULT 0,
  tcp_ry DOUBLE DEFAULT 0,
  tcp_rz DOUBLE DEFAULT 0,
  joints TEXT,
  tool_num INT DEFAULT 3,
  user_num INT DEFAULT 0,
  move_speed DOUBLE DEFAULT 40,
  vel_mode INT DEFAULT 1,
  weld_voltage DOUBLE DEFAULT 24,
  weld_current DOUBLE DEFAULT 200,
  weaving_type VARCHAR(20) DEFAULT '',
  weave_params TEXT,
  is_saved TINYINT(1) DEFAULT 0,
  is_completed TINYINT(1) DEFAULT 0,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (job_id)
);

INSERT INTO teaching_jobs (name, description, status, total_points, cell_type, cell_id, cell_name, width, height)
VALUES ('TEST-U1', '하이라이트 검증용 mock', 'ready', 13, 'normal', 1, 'U-cell (1번)', 550, 550);

SET @jid = LAST_INSERT_ID();

INSERT INTO teaching_points (job_id, point_id, name, `order`, tcp_x, tcp_y, tcp_z, joints, is_saved) VALUES
(@jid, 'home','HOME', 0,    0,   0, 300, '[0,0,0,0,0,0]', 1),
(@jid, 'p1',  'P1',   1, -325, 275,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p2',  'P2',   2, -325,   0,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p3',  'P3',   3, -325,-275,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p4',  'P4',   4, -275,-325,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p5',  'P5',   5, -150,-325,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p6',  'P6',   6,  -25,-325,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p7',  'P7',   7,  325, 275,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p8',  'P8',   8,  325,   0,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p9',  'P9',   9,  325,-275,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p10', 'P10', 10,  275,-325,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p11', 'P11', 11,  150,-325,  0, '[0,0,0,0,0,0]', 1),
(@jid, 'p12', 'P12', 12,   25,-325,  0, '[0,0,0,0,0,0]', 1);

SELECT @jid AS created_job_id;
