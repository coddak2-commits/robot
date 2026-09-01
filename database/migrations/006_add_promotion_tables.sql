-- =====================================================================
-- Migration 006: 승격 요청 관련 테이블 누락분 추가
-- 설명: init_mariadb.sql에는 promotion_requests / promotion_detection_config가
--       정의돼 있지만, 이 DB 인스턴스는 그 테이블들이 스키마에 추가되기
--       전에 초기화된 것으로 보임. 그 결과 메뉴 > 승격요청 진입 시
--       GET /api/promotions/ 가 다음 오류로 500을 반환:
--         pymysql.err.ProgrammingError: (1146, "Table
--         'robot_welding.promotion_requests' doesn't exist")
--       promotion_detection_config가 없으면 "지금 감지 실행" 버튼과
--       매일 03:00 자동 감지 배치도 같은 이유로 실패한다.
--       아래는 init_mariadb.sql + 004_promotion_dedupe_unique.sql을 그대로
--       재적용한 것으로, 전부 IF NOT EXISTS/가드 처리라 이미 일부가
--       존재해도(예: promotion_requests만 없고 detection_config는 있는 경우)
--       안전하게 재실행 가능.
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

-- migration 004 (동시 배치 실행 시 pending 중복 방지) 재적용 - IF NOT EXISTS라 안전
ALTER TABLE promotion_requests
  ADD COLUMN IF NOT EXISTS pending_dedupe_key VARCHAR(255)
  GENERATED ALWAYS AS (
    CASE WHEN status = 'pending'
      THEN CONCAT_WS('|', posture, gap_mm, COALESCE(material, ''), COALESCE(thickness_mm, ''), COALESCE(joint_type, ''), field_name)
      ELSE NULL
    END
  ) STORED;

ALTER TABLE promotion_requests
  ADD UNIQUE INDEX IF NOT EXISTS uq_promotion_requests_pending_dedupe (pending_dedupe_key);

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
SELECT 10, 5.0, 30, 1, 2
WHERE NOT EXISTS (SELECT 1 FROM promotion_detection_config);
