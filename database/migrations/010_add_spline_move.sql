-- 010: 스플라인 이동 설정 (v1.1.156, 시험)
--
-- 용접 구간을 직선(MoveL) 대신 스플라인(NewSpline)으로 지나가게 하는 옵션.
-- 기본값은 꺼짐이며, 꺼져 있으면 기존 동작과 동일하다.
--   spline_type       0-원호 전환, 1-주어진 점을 경로점으로 사용
--   spline_average_time  점 사이 평균 연결 시간(ms), SDK 기본 2000

ALTER TABLE welding_config
    ADD COLUMN IF NOT EXISTS spline_move_enabled TINYINT(1) NOT NULL DEFAULT 0
    AFTER arc_tracking_refer_sample_count_ud;

ALTER TABLE welding_config
    ADD COLUMN IF NOT EXISTS spline_type INT NOT NULL DEFAULT 1
    AFTER spline_move_enabled;

ALTER TABLE welding_config
    ADD COLUMN IF NOT EXISTS spline_average_time INT NOT NULL DEFAULT 2000
    AFTER spline_type;
