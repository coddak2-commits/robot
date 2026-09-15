-- =====================================================================
-- Migration 007: welding_config 에 아크 트래킹 추가 파라미터 컬럼
-- 생성일: 2026-09-15
-- 설명: SDK ArcWeldTraceControl(robot.h:3082)은 인자가 19개인데, 그동안
--       welding_config 에는 9개(enabled/left_right/up_down/klr/kud/
--       step_max_*/sum_max_*)만 있었다. 나머지 중 실제로 튜닝이 필요한
--       8개를 컬럼으로 추가한다.
--
--       계수는 현장에서 바꿔가며 맞춰야 하므로 코드에 박지 않고 DB에 둔다.
--       값을 바꾸려고 리빌드/릴리즈를 하지 않아도 되게 하는 것이 목적.
--
-- 주의: arc_tracking_reference_type
--         0 = 실측 피드백(용접 시작 직후 전류를 샘플링해 기준으로 삼음)
--         1 = 고정값(arc_tracking_reference_current 사용)
--       이 시스템은 갭에서 전류를 계산해 작업마다 다르게 쓰므로 0이 기본.
--
--       arc_tracking_axis_select (상하 보정 기준 좌표계)
--         0 = 위빙 좌표, 1 = 툴 좌표, 2 = 베이스 좌표
--       2(베이스)는 토치가 기울어진 수평 용접에서 토치 축과 어긋나므로 부적합.
--       위빙을 항상 쓰는 현재 구성에서는 0으로 시작해 보고, 안 맞으면 1로 시험.
-- =====================================================================

ALTER TABLE welding_config
    ADD COLUMN IF NOT EXISTS arc_tracking_delay_time DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS arc_tracking_t_start_lr DOUBLE NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS arc_tracking_t_start_ud DOUBLE NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS arc_tracking_axis_select INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS arc_tracking_reference_type INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS arc_tracking_reference_current DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS arc_tracking_refer_sample_start_ud DOUBLE NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS arc_tracking_refer_sample_count_ud DOUBLE NOT NULL DEFAULT 10;

-- 처음 시험할 때는 보정 한계를 좁게 잡는다. 계수가 크면 토치가 발진한다.
-- 안정되는 걸 확인한 뒤 필요한 만큼 늘릴 것.
UPDATE welding_config
   SET arc_tracking_step_max_ud = 1.0,
       arc_tracking_sum_max_ud  = 10.0
 WHERE id = 1
   AND arc_tracking_step_max_ud > 1.0;
