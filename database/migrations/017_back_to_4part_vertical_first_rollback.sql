-- 017 되돌리기: 6파트(012 + 015 상태, 모서리 위 -> 아래)로 복귀
--
-- 교시 좌표(P3/P5/P9/P11)는 되돌아가지 않는다. 228 구성으로 다시 교시해야 한다.

INSERT INTO welding_part_order (part_index, execution_order, part_name, points)
VALUES
    (4, 1, 'CORNER-LEFT (p3-p4)',  '["p3","p4"]'),
    (5, 4, 'CORNER-RIGHT (p9-p10)', '["p9","p10"]')
ON DUPLICATE KEY UPDATE
    execution_order = VALUES(execution_order),
    part_name       = VALUES(part_name),
    points          = VALUES(points);

UPDATE welding_part_order SET execution_order = 0, part_name = 'H-LEFT (p5-p6)',    points = '["p5","p6"]'       WHERE part_index = 0;
UPDATE welding_part_order SET execution_order = 2, part_name = 'V-LEFT (p3-p1)',    points = '["p3","p2","p1"]'  WHERE part_index = 1;
UPDATE welding_part_order SET execution_order = 3, part_name = 'H-RIGHT (p11-p12)', points = '["p11","p12"]'     WHERE part_index = 2;
UPDATE welding_part_order SET execution_order = 5, part_name = 'V-RIGHT (p9-p7)',   points = '["p9","p8","p7"]'  WHERE part_index = 3;

SELECT part_index, execution_order, part_name, points
FROM welding_part_order
ORDER BY execution_order;
