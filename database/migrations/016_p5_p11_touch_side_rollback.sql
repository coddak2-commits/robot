-- 016 되돌리기: P5/P11 측면 Y 터치 컬럼 제거
--
-- ※ 앱을 1.1.238 이하로 되돌린 뒤에 돌릴 것. 1.1.239 는 이 컬럼을 SELECT 하므로
--   컬럼이 없으면 welding_config 조회가 실패한다.
-- 측면 터치만 끄려면 이 파일 대신 설정 화면에서 끄면 된다.

ALTER TABLE welding_config DROP COLUMN IF EXISTS p5_touch_side;
ALTER TABLE welding_config DROP COLUMN IF EXISTS p11_touch_side;
