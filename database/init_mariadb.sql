-- =====================================================================
-- FR3-WMS 갭 기반 파라미터 시스템 - DB 초기화 스크립트
-- 버전: v0.2
-- 작성일: 2026-08-14
-- 대상: MariaDB 11.4+
--
-- 실행 방법:
--   mysql -u root -p < init_mariadb.sql
--   또는 DBeaver에서 SQL 에디터에 붙여넣고 실행
--
-- 실행 순서:
--   1) init_mariadb.sql (본 파일) - DB/테이블/설정 생성
--   2) seed_data.sql            - welding_params 초기 56행 삽입
-- =====================================================================

-- =====================================================================
-- 0. DB 생성 및 선택
-- =====================================================================
CREATE DATABASE IF NOT EXISTS robot_welding
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE robot_welding;

-- =====================================================================
-- 1. 참조 테이블 (기존 시스템 가정, 없으면 최소 스키마 생성)
-- =====================================================================

-- 사용자 계정
CREATE TABLE IF NOT EXISTS users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(100),
    role            ENUM('admin', 'operator', 'viewer') NOT NULL DEFAULT 'operator',
    email           VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role (role)
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
VALUES (15.0, 2.0, 3.0);

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
-- 5. 오버라이드 승격 요청
-- =====================================================================
CREATE TABLE IF NOT EXISTS promotion_requests (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    trigger_type            ENUM('auto_detect') NOT NULL DEFAULT 'auto_detect',
    posture                 ENUM('vertical', 'horizontal') NOT NULL,
    gap_mm                  DECIMAL(3,1) NOT NULL,
    material                VARCHAR(50),
    thickness_mm            DECIMAL(4,1),
    joint_type              VARCHAR(30),
    field_name              VARCHAR(50) NOT NULL,
    current_value           DECIMAL(8,2) NOT NULL,
    requested_value         DECIMAL(8,2) NOT NULL,
    override_count          INT NOT NULL,
    override_stddev_pct     DECIMAL(5,2),
    operator_count          INT,
    related_jobs            JSON,
    reason                  TEXT,
    status                  ENUM('pending', 'approved', 'rejected', 'superseded') DEFAULT 'pending',
    reviewed_by             INT NULL,
    reviewer_note           TEXT,
    reviewed_at             TIMESTAMP NULL,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_condition (posture, gap_mm, material, thickness_mm, joint_type),
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 6. 승격 자동 감지 설정
-- =====================================================================
CREATE TABLE IF NOT EXISTS promotion_detection_config (
    id                          INT AUTO_INCREMENT PRIMARY KEY,
    min_override_count          INT DEFAULT 10,
    max_stddev_pct              DECIMAL(4,1) DEFAULT 5.0,
    observation_days            INT DEFAULT 30,
    min_operator_count          INT DEFAULT 1,
    preferred_operator_count    INT DEFAULT 2,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO promotion_detection_config (min_override_count, max_stddev_pct, observation_days, min_operator_count, preferred_operator_count)
VALUES (10, 5.0, 30, 1, 2);

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
INSERT INTO alarm_thresholds (field_name, warn_pct, warn_duration_sec, alert_pct, alert_duration_sec, stop_pct, stop_duration_sec) VALUES
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
INSERT INTO override_limits (field_name, max_up_pct, max_down_pct) VALUES
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
-- 완료
-- =====================================================================
-- 다음 단계: seed_data.sql 실행하여 welding_params 초기 56행 삽입
-- =====================================================================
