-- 018 되돌리기: 순서를 수직 먼저(017 상태)로

UPDATE welding_part_order SET execution_order = 0, part_name = 'V-LEFT (p3-p1)',    points = '["p3","p2","p1"]'    WHERE part_index = 1;
UPDATE welding_part_order SET execution_order = 1, part_name = 'H-LEFT (p4-p6)',    points = '["p4","p5","p6"]'    WHERE part_index = 0;
UPDATE welding_part_order SET execution_order = 2, part_name = 'V-RIGHT (p9-p7)',   points = '["p9","p8","p7"]'    WHERE part_index = 3;
UPDATE welding_part_order SET execution_order = 3, part_name = 'H-RIGHT (p10-p12)', points = '["p10","p11","p12"]' WHERE part_index = 2;

SELECT part_index, execution_order, part_name, points
FROM welding_part_order
ORDER BY execution_order;
