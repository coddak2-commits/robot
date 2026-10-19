-- 019: teaching_points 에 gap 칼럼 추가 (v1.1.265, 2026-10-19)
--
-- 갭 기반인데 포인트 gap 이 DB 에 없어서 프로그램을 다시 켜면 0 으로 돌아갔다.
-- robot-core 1.1.265 부터 시작할 때 이 칼럼을 자동으로 만든다(ADD COLUMN IF NOT EXISTS).
-- 이 파일은 기록용이다. 자동 생성이 실패한 경우(DB 권한 등)에만 손으로 돌린다.
-- 노트북·펜던트 모두 같은 내용. 되돌릴 때는 019 rollback.

ALTER TABLE teaching_points ADD COLUMN IF NOT EXISTS gap DOUBLE DEFAULT 0;

SHOW COLUMNS FROM teaching_points LIKE 'gap';
