-- 018: 파트 순서를 수평 먼저로 (v1.1.245, 2026-10-13)
--
-- 017 은 4파트로 복귀하면서 순서를 수직 먼저로 바꿨다. 순서만 227 과 같은
-- 수평 먼저로 되돌린다. 파트 구성(4파트)과 교시는 그대로다.
--
--   [P4,P5,P6] 수평 좌 -> [P3,P2,P1] 수직 좌 -> [P10,P11,P12] 수평 우 -> [P9,P8,P7] 수직 우
--
-- 파트 전환 경로 (227 과 같다)
--   P6 -> P3 : 같은 쪽 전환 (+X 후퇴 -> +X 접근)
--   P1 -> P10: 횡단 (P1 base +X 후퇴 -> 홈 -> P10 -Y 접근)
--   P12 -> P9: 같은 쪽 전환 (240)
--
-- part_index 의 뜻은 012 와 같다(0 수평 좌, 1 수직 좌, 2 수평 우, 3 수직 우).
-- 되돌릴 때는 018 rollback.
--
-- 주의: 기계마다 DB 가 별개다. 노트북에서 실행. 펜던트는 원래 수평 먼저(227)라
--       017·018 모두 돌리지 않는다.

UPDATE welding_part_order SET execution_order = 0, part_name = 'H-LEFT (p4-p6)',    points = '["p4","p5","p6"]'    WHERE part_index = 0;
UPDATE welding_part_order SET execution_order = 1, part_name = 'V-LEFT (p3-p1)',    points = '["p3","p2","p1"]'    WHERE part_index = 1;
UPDATE welding_part_order SET execution_order = 2, part_name = 'H-RIGHT (p10-p12)', points = '["p10","p11","p12"]' WHERE part_index = 2;
UPDATE welding_part_order SET execution_order = 3, part_name = 'V-RIGHT (p9-p7)',   points = '["p9","p8","p7"]'    WHERE part_index = 3;

SELECT part_index, execution_order, part_name, points
FROM welding_part_order
ORDER BY execution_order;
