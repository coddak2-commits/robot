-- 013: 터치 결과에 Z 전용 여유값 (v1.1.232, 2026-10-08)
--
-- 터치센싱은 '와이어 끝이 모재에 닿았을 때 토치가 있던 자리'를 기록한다.
-- 그 결과 dx/dy 에는 touch_offset_depth(기본 5mm)가 붙어 뒤로 물러서지만,
-- dz 에는 아무것도 안 붙는다. 그래서 용접할 때 토치가 접촉 높이에 그대로 서고,
-- CTWD(팁에서 모재까지 거리)가 터치 당시 와이어 길이와 같아진다.
--
--   보이는 스틱아웃 = CTWD - 아크 길이 = (터치 당시 와이어 길이) - 아크 길이
--
-- 와이어를 25mm 로 맞추고 터치센싱을 하면 CTWD 가 25mm 로 고정되고, 아크가
-- 8~10mm 를 차지하므로 용접 중에는 15mm 정도만 보인다. 와이어 길이가 조금만
-- 달라져도 스틱아웃이 그만큼 따라 움직인다.
--
-- 이 값을 더하면 토치만 그만큼 높이 선다. 와이어 길이를 건드리지 않고
-- 스틱아웃을 직접 맞출 수 있다. 가로 위치(X/Y)는 영향 없다.
--
--   touch_offset_depth_z = 10  ->  CTWD 35mm  ->  스틱아웃 약 25mm
--
-- 기본값 0 = 종전과 완전히 동일하게 동작한다. 설치만 해서는 아무것도 안 바뀐다.
-- 프런트에서 0~30mm 로 제한한다. 설정 화면은 없고 여기서 직접 바꾼다.
--
-- 주의: 모든 포인트에 똑같이 붙는다. 수평/수직을 따로 주려면 값을 나눠야 한다.
-- 주의: 기계마다 DB 가 별개다. 사무실 PC / 노트북 / 펜던트에서 각각 실행할 것.

ALTER TABLE welding_config
    ADD COLUMN IF NOT EXISTS touch_offset_depth_z DOUBLE NOT NULL DEFAULT 0
    AFTER touch_offset_depth;

SELECT touch_offset_depth, touch_offset_depth_z FROM welding_config WHERE id = 1;
