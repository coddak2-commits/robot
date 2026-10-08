-- 014 롤백: 모서리 시작점(P4/P10)의 Z 탐색 복원 (v1.1.235)
--
-- 되돌리면 P4/P10 이 다시 바닥판까지 내려가므로 모서리 구간이 39mm 로 늘어난다.
-- P4/P10 을 모서리 높이로 재교시한 상태에서 되돌리면 구간이 더 짧아지거나
-- 음수가 될 수 있으니, 롤백 시에는 교시도 같이 되돌릴 것.

UPDATE welding_config
SET p4_touch_top     = 1,
    p4_touch_bottom  = 1,
    p10_touch_top    = 1,
    p10_touch_bottom = 1
WHERE id = 1;
