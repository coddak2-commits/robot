-- 015: 모서리 파트 방향 뒤집기 (위 -> 아래) (v1.1.237, 2026-10-09)
--
-- 012 에서 모서리 파트를 [P4,P3] / [P10,P9] (아래 -> 위)로 만들었다.
-- 아크가 모서리 바닥(P4/P10)에서 켜지니 시작부가 얇게 깔려 아랫부분이 덜 채워졌다.
-- 모서리 바닥이 끝점이 되도록 [P3,P4] / [P9,P10] 으로 뒤집는다.
--
-- 실행 순서는 그대로다. 수평 -> 모서리 -> 수직.
--   P5->P6, P3->P4, P3->P2->P1, P11->P12, P9->P10, P9->P8->P7
-- 모서리가 바닥에서 끝나므로 수직을 시작하려면 P3/P9 로 다시 올라간다(전환 이동).
--
-- 모서리 조건은 계속 P4/P10 에 둔다. 파트 조건은 원래 첫 포인트에서 읽는데, 그러면
-- 모서리와 수직이 둘 다 P3/P9 에서 읽어 같은 값으로 돈다. v1.1.237 부터 모서리 파트만
-- P4/P10 에서 읽는다(getPartConditionPointId). 이 마이그레이션은 1.1.237 이상에서만
-- 돌릴 것. 그 아래 버전에서 돌리면 모서리가 수직 조건으로 돈다.
--
-- 크레이터 채움은 넣지 않는다(사용자 결정 2026-10-09). P1/P7 만 한다.
--
-- 주의: 기계마다 DB 가 별개다. 사무실 PC / 노트북에서 각각 실행할 것.
--       펜던트는 012 를 안 돌린 상태이므로 돌리지 않는다.

UPDATE welding_part_order SET points = '["p3","p4"]'  WHERE part_index = 4;
UPDATE welding_part_order SET points = '["p9","p10"]' WHERE part_index = 5;

SELECT part_index, execution_order, part_name, points
FROM welding_part_order
ORDER BY execution_order;
