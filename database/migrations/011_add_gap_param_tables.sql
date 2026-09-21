-- 011: 갭 파라미터 시스템 테이블 (v1.1.168)
--
-- init_mariadb.sql의 갭 시스템 테이블이 개발PC에만 만들어지고 현장 노트북에는
-- 적용된 적이 없었다(2026-09-21 확인, welding_params 없음). 노트북에 이미 있는
-- users / promotion_requests / promotion_detection_config 는 건드리지 않고,
-- 없는 10개 테이블만 만든다.
--
-- 다시 실행해도 안전하다: 테이블은 IF NOT EXISTS, 초기값은 비어 있을 때만 넣는다.
--
-- welding_params 는 gap 0(2026-09-21 현장 기본값)만 넣는다. 판두께 선택지(18/20/22/23) 4종 x 자세 2 = 8행.
-- seed_data.sql 의 Lab 잠정값(gap 1~6)은 수직에도 위빙 코드 0(평면 삼각파)이 들어 있어
-- 넣지 않는다. gap 1~6 은 값이 정해지면 추가한다. 없는 gap을 입력하면 조회 결과가 없어
-- 포인트 값은 바뀌지 않는다.

-- =====================================================================
-- 2. 핵심 테이블: welding_params (갭별 용접 파라미터 매트릭스)
-- =====================================================================
CREATE TABLE IF NOT EXISTS welding_params (
    id                       INT AUTO_INCREMENT PRIMARY KEY,
    posture                  ENUM('vertical', 'horizontal') NOT NULL,
    gap_mm                   DECIMAL(3,1) NOT NULL,
    current_a                INT NOT NULL,
    voltage_v                DECIMAL(4,1) NOT NULL,
    speed_cpm                INT NOT NULL,
    stickout_mm              INT NOT NULL,
    weave_enabled            BOOLEAN DEFAULT TRUE,
    weave_type               INT DEFAULT 0,
    weave_freq_hz            DECIMAL(3,1) DEFAULT 1.5,
    weave_range_mm           DECIMAL(3,1) DEFAULT 3.0,
    weave_left_dwell_ms      INT DEFAULT 0,
    weave_right_dwell_ms     INT DEFAULT 0,
    material                 VARCHAR(50) DEFAULT 'SS400',
    thickness_mm             DECIMAL(4,1) NOT NULL,
    joint_type               VARCHAR(30) DEFAULT 'fillet',
    source                   ENUM('lab', 'field', 'wps') DEFAULT 'lab',
    active                   BOOLEAN DEFAULT TRUE,
    deactivated_at           TIMESTAMP NULL,
    deactivated_by           INT NULL,
    deactivation_reason      TEXT,
    notes                    TEXT,
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_posture_gap (posture, gap_mm),
    INDEX idx_lookup (posture, gap_mm, material, thickness_mm, joint_type, active),
    FOREIGN KEY (deactivated_by) REFERENCES users(id) ON DELETE SET NULL,
    -- active=TRUE 상태의 조합은 유일해야 함 (부분 UNIQUE는 MariaDB 미지원, 앱단 검증)
    CHECK (gap_mm >= 0 AND gap_mm <= 6),
    CHECK (current_a > 0),
    CHECK (voltage_v > 0),
    CHECK (speed_cpm > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 용접 작업
CREATE TABLE IF NOT EXISTS welding_jobs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    job_name        VARCHAR(100),
    cell_type       VARCHAR(50),          -- 'U-cell', 'colorplate', etc.
    status          ENUM('created', 'ready', 'running', 'paused', 'completed', 'failed', 'aborted') DEFAULT 'created',
    mode            ENUM('real', 'dry_run') DEFAULT 'real',
    dry_run_level   TINYINT DEFAULT NULL,
    speed_override_pct INT DEFAULT 100,
    started_by      INT,
    started_at      TIMESTAMP NULL,
    completed_at    TIMESTAMP NULL,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_started_at (started_at),
    FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 3. 전역 기본값 (가스, 예열/후열 시간)
-- =====================================================================
CREATE TABLE IF NOT EXISTS welding_defaults (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    gas_flow_lpm        DECIMAL(4,1) DEFAULT 15.0,
    preheat_sec         DECIMAL(3,1) DEFAULT 2.0,
    postheat_sec        DECIMAL(3,1) DEFAULT 3.0,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 단일 행 초기 데이터
INSERT INTO welding_defaults (gas_flow_lpm, preheat_sec, postheat_sec)
SELECT 15.0, 2.0, 3.0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM welding_defaults);

-- =====================================================================
-- 4. 오버라이드 이력
-- =====================================================================
CREATE TABLE IF NOT EXISTS param_overrides (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    job_id          INT NOT NULL,
    point_code      VARCHAR(10),
    user_id         INT NOT NULL,
    posture         ENUM('vertical', 'horizontal') NOT NULL,
    gap_mm          DECIMAL(3,1) NOT NULL,
    material        VARCHAR(50),
    thickness_mm    DECIMAL(4,1),
    joint_type      VARCHAR(30),
    field_name      VARCHAR(50) NOT NULL,
    original_value  DECIMAL(8,2) NOT NULL,
    override_value  DECIMAL(8,2) NOT NULL,
    reason          TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_condition (posture, gap_mm, material, thickness_mm, joint_type),
    INDEX idx_user (user_id),
    INDEX idx_created (created_at),
    FOREIGN KEY (job_id) REFERENCES welding_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 7. 편차 이벤트 로그
-- =====================================================================
CREATE TABLE IF NOT EXISTS deviation_events (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    job_id          INT NOT NULL,
    point_code      VARCHAR(10),
    level           TINYINT NOT NULL,
    field_name      VARCHAR(50) NOT NULL,
    command_value   DECIMAL(6,2) NOT NULL,
    actual_value    DECIMAL(6,2) NOT NULL,
    deviation_pct   DECIMAL(5,2) NOT NULL,
    duration_sec    DECIMAL(5,2) NOT NULL,
    action_taken    VARCHAR(50),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job (job_id),
    INDEX idx_level (level),
    INDEX idx_created (created_at),
    FOREIGN KEY (job_id) REFERENCES welding_jobs(id) ON DELETE CASCADE,
    CHECK (level BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 8. 편차 알람 임계값
-- =====================================================================
CREATE TABLE IF NOT EXISTS alarm_thresholds (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    field_name          VARCHAR(50) NOT NULL UNIQUE,
    warn_pct            DECIMAL(4,1),
    warn_duration_sec   DECIMAL(4,1),
    alert_pct           DECIMAL(4,1),
    alert_duration_sec  DECIMAL(4,1),
    stop_pct            DECIMAL(4,1),
    stop_duration_sec   DECIMAL(4,1),
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 초기값: 보통 수준 (전류/전압/속도/가스)
INSERT IGNORE INTO alarm_thresholds (field_name, warn_pct, warn_duration_sec, alert_pct, alert_duration_sec, stop_pct, stop_duration_sec) VALUES
    ('current_a', 5.0, 3.0, 10.0, 5.0, 20.0, 10.0),
    ('voltage_v', 3.0, 3.0,  7.0, 5.0, 15.0, 10.0),
    ('speed_cpm', 5.0, 5.0, 10.0, 10.0, 20.0, 15.0),
    ('gas_flow_lpm', 20.0, 3.0, 40.0, 5.0, 60.0, 5.0);

-- =====================================================================
-- 9. 오버라이드 허용 범위
-- =====================================================================
CREATE TABLE IF NOT EXISTS override_limits (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    field_name      VARCHAR(50) NOT NULL UNIQUE,
    max_up_pct      DECIMAL(4,1),
    max_down_pct    DECIMAL(4,1),
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 초기값: 전류 ±15%, 전압 ±5%, 속도 ±10%
INSERT IGNORE INTO override_limits (field_name, max_up_pct, max_down_pct) VALUES
    ('current_a', 15.0, 15.0),
    ('voltage_v',  5.0,  5.0),
    ('speed_cpm', 10.0, 10.0);

-- =====================================================================
-- 10. 정지/재개 이벤트
-- =====================================================================
CREATE TABLE IF NOT EXISTS stop_events (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    job_id              INT NOT NULL,
    reason              VARCHAR(50) NOT NULL,
    stopped_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stopped_point       VARCHAR(10),
    resumed_at          TIMESTAMP NULL,
    resumed_by          INT NULL,
    resume_type         ENUM('continue', 'backup', 'restart_section') NULL,
    approved_by         INT NULL,
    stop_duration_sec   INT NULL,
    notes               TEXT,
    INDEX idx_job (job_id),
    INDEX idx_reason (reason),
    FOREIGN KEY (job_id) REFERENCES welding_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (resumed_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 11. 폴백 사용 이력
-- =====================================================================
CREATE TABLE IF NOT EXISTS fallback_usage (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    job_id          INT NOT NULL,
    requested       JSON NOT NULL,
    fallback_used   JSON NOT NULL,
    fallback_level  TINYINT NOT NULL,
    warning_shown   VARCHAR(20),
    user_confirmed  BOOLEAN,
    user_id         INT NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job (job_id),
    INDEX idx_user (user_id),
    FOREIGN KEY (job_id) REFERENCES welding_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 12. 작업별 포인트-갭 매핑
-- =====================================================================
CREATE TABLE IF NOT EXISTS weld_point_gaps (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    job_id          INT NOT NULL,
    point_code      VARCHAR(10) NOT NULL,
    gap_mm          DECIMAL(3,1) NOT NULL,
    posture         ENUM('vertical', 'horizontal') NOT NULL,
    thickness_mm    DECIMAL(4,1) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_job_point (job_id, point_code),
    INDEX idx_job (job_id),
    FOREIGN KEY (job_id) REFERENCES welding_jobs(id) ON DELETE CASCADE,
    CHECK (gap_mm >= 0 AND gap_mm <= 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- gap 0 = 2026-09-21 현장 기본값
--   수직: 16cpm / 250A / 28V, 수직 삼각파(6), 2.0Hz, 진폭 3.0, 체류 300/300
--   수평: 26cpm / 290A / 32V, 평면 삼각파(0), 2.0Hz, 진폭 1.5, 체류 300/0
--         (우측 P10~P12는 앱이 좌우 체류를 뒤집어 적용)
--   스틱아웃 25mm (목표값)
-- =====================================================================
INSERT INTO welding_params (posture, gap_mm, current_a, voltage_v, speed_cpm, stickout_mm,
    weave_enabled, weave_type, weave_freq_hz, weave_range_mm, weave_left_dwell_ms, weave_right_dwell_ms,
    material, thickness_mm, joint_type, source, notes)
SELECT * FROM (
    SELECT 'vertical' AS posture, 0.0 AS gap_mm, 250 AS current_a, 28.0 AS voltage_v, 16 AS speed_cpm, 25 AS stickout_mm, TRUE AS weave_enabled, 6 AS weave_type, 2.0 AS weave_freq_hz, 3.0 AS weave_range_mm, 300 AS weave_left_dwell_ms, 300 AS weave_right_dwell_ms, 'SS400' AS material, 18.0 AS thickness_mm, 'fillet' AS joint_type, 'field' AS source, '2026-09-21 field default' AS notes
    UNION ALL SELECT 'vertical', 0.0, 250, 28.0, 16, 25, TRUE, 6, 2.0, 3.0, 300, 300, 'SS400', 20.0, 'fillet', 'field', '2026-09-21 field default'
    UNION ALL SELECT 'vertical', 0.0, 250, 28.0, 16, 25, TRUE, 6, 2.0, 3.0, 300, 300, 'SS400', 22.0, 'fillet', 'field', '2026-09-21 field default'
    UNION ALL SELECT 'vertical', 0.0, 250, 28.0, 16, 25, TRUE, 6, 2.0, 3.0, 300, 300, 'SS400', 23.0, 'fillet', 'field', '2026-09-21 field default'
    UNION ALL SELECT 'horizontal', 0.0, 290, 32.0, 26, 25, TRUE, 0, 2.0, 1.5, 300, 0, 'SS400', 18.0, 'fillet', 'field', '2026-09-21 field default'
    UNION ALL SELECT 'horizontal', 0.0, 290, 32.0, 26, 25, TRUE, 0, 2.0, 1.5, 300, 0, 'SS400', 20.0, 'fillet', 'field', '2026-09-21 field default'
    UNION ALL SELECT 'horizontal', 0.0, 290, 32.0, 26, 25, TRUE, 0, 2.0, 1.5, 300, 0, 'SS400', 22.0, 'fillet', 'field', '2026-09-21 field default'
    UNION ALL SELECT 'horizontal', 0.0, 290, 32.0, 26, 25, TRUE, 0, 2.0, 1.5, 300, 0, 'SS400', 23.0, 'fillet', 'field', '2026-09-21 field default'
) AS v
WHERE NOT EXISTS (SELECT 1 FROM welding_params WHERE gap_mm = 0);

SELECT posture, thickness_mm, gap_mm, current_a, voltage_v, speed_cpm, weave_type,
       weave_freq_hz, weave_range_mm, weave_left_dwell_ms, weave_right_dwell_ms
FROM welding_params ORDER BY posture, thickness_mm, gap_mm;
