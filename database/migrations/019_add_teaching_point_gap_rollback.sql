-- 019 되돌리기: teaching_points.gap 칼럼 삭제
-- 주의: robot-core 1.1.265 이상이 다시 켜지면 칼럼을 또 만든다. 1.1.264 이하로 되돌린 뒤 실행.

ALTER TABLE teaching_points DROP COLUMN IF EXISTS gap;
