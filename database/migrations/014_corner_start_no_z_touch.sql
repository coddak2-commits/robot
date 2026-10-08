-- 014: 모서리 시작점(P4/P10)의 Z 탐색 끄기 (v1.1.235, 2026-10-09)
--
-- 모서리 파트의 끝점(P3/P9)은 Z 탐색을 돌지 않는다. 그래서 시작점만 바닥판까지
-- 내려가면 20mm 로 교시한 구간이 그만큼 늘어난다.
--
-- 2026-10-08 좌측 실측 (터치 10:07:21 / 배치 10:12:19):
--     P4  교시 Z 17.169   rawDz -17.695   보정 후 Z  -0.526
--     P3  교시 Z 38.525   Z 탐색 없음     보정 후 Z  38.525
--     교시 간격 21.4mm  ->  보정 후 39.1mm
--   touch_offset_depth_z = 10 을 넣은 상태면 29.1mm 가 된다.
--
-- 반대로 P3/P9 의 하단 Z 를 켜는 것으로는 못 고친다. P3 에서 -Z 로 내려가면
-- 20mm 아래의 바닥판을 찾아 P3 도 끌려 내려오고 구간이 0 이 된다.
--
-- 중앙 X 와 측면 Y 는 그대로 둔다. v1.1.235 에서 거기에 touch_offset_depth 가
-- 붙도록 고쳤으므로 X/Y 보정은 계속 받는다.
-- P5/P11 은 건드리지 않는다. 수평 구간은 양 끝이 같은 규칙이라 문제가 없다.
--
-- ※ 이 마이그레이션만으로는 부족하다. P4/P10 을 실제 모서리 높이에 다시 교시해야
--   한다. 지금은 P5/P11 과 같은 자리(바닥판 위 약 17mm)에 있는데, 그건 수평
--   포인트가 Z 탐색으로 내려오려고 일부러 띄워 교시한 자리다. Z 탐색을 끈 P4 는
--   처음부터 모서리에 있어야 한다. 안 그러면 모서리보다 17mm 위에서 용접이
--   시작된다.
--
-- 주의: 기계마다 DB 가 별개다. 사무실 PC / 노트북 / 펜던트에서 각각 실행할 것.

UPDATE welding_config
SET p4_touch_top     = 0,
    p4_touch_bottom  = 0,
    p10_touch_top    = 0,
    p10_touch_bottom = 0
WHERE id = 1;

SELECT p4_touch_center, p4_touch_top, p4_touch_bottom, p4_touch_side,
       p10_touch_center, p10_touch_top, p10_touch_bottom, p10_touch_side
FROM welding_config WHERE id = 1;
