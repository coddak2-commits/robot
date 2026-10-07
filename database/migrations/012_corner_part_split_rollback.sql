-- 012 되돌리기: 모서리 파트 분리 취소 (v1.1.227 구성으로 복귀)
--
-- 파트 구성만 되돌린다. 교시 좌표(P3/P5/P9/P11)는 되돌아가지 않으므로,
-- 227 구성으로 용접하려면 백업에서 받은 작업을 불러오거나 다시 티칭해야 한다.
-- DB 전체 복원은 mysqldump 로 떠둔 .sql 파일을 쓸 것.

DELETE FROM welding_part_order WHERE part_index IN (4, 5);

UPDATE welding_part_order SET execution_order = 0, part_name = '파트1 (하단 좌측)', points = '["p4","p5","p6"]'    WHERE part_index = 0;
UPDATE welding_part_order SET execution_order = 1, part_name = '파트2 (좌측)',      points = '["p3","p2","p1"]'    WHERE part_index = 1;
UPDATE welding_part_order SET execution_order = 2, part_name = '파트3 (하단 우측)', points = '["p10","p11","p12"]' WHERE part_index = 2;
UPDATE welding_part_order SET execution_order = 3, part_name = '파트4 (우측)',      points = '["p9","p8","p7"]'    WHERE part_index = 3;

SELECT part_index, execution_order, part_name, points
FROM welding_part_order
ORDER BY execution_order;
