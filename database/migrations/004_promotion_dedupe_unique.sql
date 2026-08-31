-- =====================================================================
-- Migration 004: Prevent duplicate pending promotion requests
-- 설명: promotion_requests에 unique 제약이 없어, 자동 감지 배치가 동시에
--       두 번 실행되면(수동 트리거 + 스케줄 겹침 등) 동일 조건의 pending
--       요청이 중복 생성될 수 있음. status='pending'일 때만 값이 채워지는
--       가상 컬럼(pending_dedupe_key)을 추가하고 그 컬럼에 UNIQUE 인덱스를
--       걸어, pending 상태끼리만 중복을 막는다 (MariaDB UNIQUE 인덱스는
--       NULL을 서로 다른 값으로 취급하므로 approved/rejected 이력은
--       그대로 여러 건 쌓여도 됨).
-- =====================================================================

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
