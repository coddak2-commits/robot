-- 016: 수평 시작점(P5/P11) 측면 Y 터치 추가 (v1.1.239, 2026-10-12)
--
-- v1.1.228 에서 수평 시작점이 P4/P10 자리에서 P5/P11 로 옮겨갔다. 측면 Y 터치는
-- P4/P10 에만 있어서 수평 시작점의 Y 가 보정되지 않았다. P5/P11 에도 같은 측면
-- 터치를 붙인다. 방향은 P4/P10 과 같다(P5 Base -Y, P11 Base +Y).
-- 결과는 P4/P10 이 수평 시작점이던 227 까지와 같이 접촉면 그대로 쓴다
-- (touch_offset_depth 미적용).
--
-- 기본값 1(켜짐). 실행 후 바로 P5/P11 에서 측면 터치가 돈다.
-- 끄려면 설정 화면 '포인트별 터치 센싱 방향'에서 P5/P11 의 좌측/우측을 끈다.
--
-- ※ 반드시 앱 1.1.239 설치 전에 돌릴 것. robot-core 가 이 두 컬럼을 명시적으로
--   SELECT 하므로, 컬럼이 없으면 welding_config 조회가 실패해 터치 설정·안전 한계·
--   아크 트래킹 설정이 전부 안 올라온다(013 과 같은 구조).
--   반대로 컬럼만 먼저 추가해 두고 이전 버전 앱을 써도 문제없다(안 읽을 뿐이다).
--
-- 주의: 기계마다 DB 가 별개다. 사무실 PC / 노트북에서 각각 실행할 것.

ALTER TABLE welding_config
    ADD COLUMN IF NOT EXISTS p5_touch_side TINYINT(1) NOT NULL DEFAULT 1
    AFTER p5_touch_bottom;

ALTER TABLE welding_config
    ADD COLUMN IF NOT EXISTS p11_touch_side TINYINT(1) NOT NULL DEFAULT 1
    AFTER p11_touch_bottom;

SELECT p5_touch_center, p5_touch_top, p5_touch_bottom, p5_touch_side,
       p11_touch_center, p11_touch_top, p11_touch_bottom, p11_touch_side
FROM welding_config WHERE id = 1;
