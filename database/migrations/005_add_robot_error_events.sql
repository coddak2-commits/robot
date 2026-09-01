-- =====================================================================
-- Migration 005: 로봇 에러/알람 이력 테이블 추가
-- 설명: 지금까지는 robot_core가 SDK에서 읽은 main_code/sub_code를
--       메모리 상태로만 들고 있다가 /robot_sdk/robot/error 요청이 올 때
--       그 순간 값만 보여주고, 에러가 해제되면(폴링으로 덮어써짐) 그
--       발생 이력이 사라졌음. 관리자가 "어떤 로봇이 언제 무슨 에러를
--       반복하는지" 추세를 볼 수 있도록 에러 발생~해제 구간을
--       하나의 행으로 기록한다 (deviation_events와 같은 이벤트 이력
--       테이블 패턴을 따름).
-- =====================================================================

CREATE TABLE IF NOT EXISTS robot_error_events (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    main_code       INT NOT NULL,
    sub_code        INT NOT NULL,
    message         VARCHAR(255),
    job_id          INT,
    started_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at        TIMESTAMP NULL,
    duration_sec    DECIMAL(10,2),
    INDEX idx_started (started_at),
    INDEX idx_main_code (main_code),
    INDEX idx_open (ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
