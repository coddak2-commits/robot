-- 009: 아크 종료 후 번백 대기 시간
--
-- 용접기(Dex2 500M)는 ArcEnd 이후에도 전류 지령이 살아 있어야
-- 번백과 와이어 역송급(F13/F14)을 수행한다.
-- 이전에는 ArcEnd 후 약 19ms 만에 전류·전압 AO를 0으로 리셋해서
-- 와이어가 타지 않고 남는 경우가 있었다.

ALTER TABLE welding_config
    ADD COLUMN IF NOT EXISTS arc_end_burnback_ms INT NOT NULL DEFAULT 500
    AFTER touch_sensing_home_retract_offset;
