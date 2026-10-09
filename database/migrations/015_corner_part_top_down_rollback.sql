-- 015 되돌리기: 모서리 파트를 아래 -> 위([P4,P3] / [P10,P9])로 복귀

UPDATE welding_part_order SET points = '["p4","p3"]'  WHERE part_index = 4;
UPDATE welding_part_order SET points = '["p10","p9"]' WHERE part_index = 5;

SELECT part_index, execution_order, part_name, points
FROM welding_part_order
ORDER BY execution_order;
