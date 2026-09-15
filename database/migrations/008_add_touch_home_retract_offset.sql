-- 008: 터치센싱 홈 복귀 후퇴 거리 분리
--
-- touch_sensing_approach_offset 은 접근용이라 탐색 거리(touch_distance) 안에
-- 들어와야 하므로 짧게(현장값 25mm) 유지해야 한다.
-- 홈 복귀 직전 후퇴는 U셀 간섭을 피해야 하므로 별도 값을 쓴다.

ALTER TABLE welding_config
    ADD COLUMN IF NOT EXISTS touch_sensing_home_retract_offset DOUBLE NOT NULL DEFAULT 100
    AFTER touch_sensing_approach_offset;
