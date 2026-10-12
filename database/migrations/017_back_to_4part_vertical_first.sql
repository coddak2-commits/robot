-- 017: 4파트(227 구성)로 되돌리고 순서를 수직 먼저로 (v1.1.243, 2026-10-12)
--
-- 228 의 모서리 파트 분리(012), 237 의 모서리 하강(015)을 거둔다. 모서리 하강은
-- 흘러내렸고, 모서리를 따로 떼도 아랫부분 충전이 기대만큼 안 됐다.
-- 파트는 한 변당 2개(수직 / 수평), 순서는 한 변씩 수직 -> 수평.
--
--   [P3,P2,P1] 수직 좌 -> [P4,P5,P6] 수평 좌 -> [P9,P8,P7] 수직 우 -> [P10,P11,P12] 수평 우
--
-- part_index 의 뜻은 012 와 같다(0 수평 좌, 1 수직 좌, 2 수평 우, 3 수직 우).
-- 모서리 파트(part_index 4, 5)는 지운다. 되돌릴 때는 017 rollback.
--
-- 앱 1.1.243 이상에서 돌릴 것. 243 은 파트 구성에 모서리 파트가 없으면 228~242 의
-- 6파트 전용 동작(P4/P10 depthOffset, P5/P11 측면 터치, 수직 시작 10mm 내림,
-- 펜던트 세그먼트·갭 매핑)을 끄고 227 동작으로 돈다. 그보다 낮은 버전에서 돌리면
-- 그 동작이 4파트에 그대로 걸린다(P3 를 바닥판 아래로 10mm 내리는 등).
--
-- ※ 교시 작업이 같이 필요하다. DB 만으로는 끝나지 않는다.
--   - P3/P9: 모서리 바닥(수직 시작)으로 재교시. 228 에서 20mm 위로 올렸던 것
--   - P5/P11: 수평 중간점으로 재교시. 228 에서 모서리(P4/P10 자리)로 옮겼던 것
--   - P4/P10: 자리는 그대로(수평 시작). 조건을 수평용으로 다시 입력
--     (지금 저장된 값은 모서리용: 수직 삼각파, 체류 500ms 등)
--   - 작업 저장
--
-- 주의: 기계마다 DB 가 별개다. 노트북에서 실행. 펜던트는 012 를 안 돌렸으므로
--       이미 4파트다(순서만 다를 수 있다).

DELETE FROM welding_part_order WHERE part_index IN (4, 5);

UPDATE welding_part_order SET execution_order = 0, part_name = 'V-LEFT (p3-p1)',   points = '["p3","p2","p1"]'    WHERE part_index = 1;
UPDATE welding_part_order SET execution_order = 1, part_name = 'H-LEFT (p4-p6)',   points = '["p4","p5","p6"]'    WHERE part_index = 0;
UPDATE welding_part_order SET execution_order = 2, part_name = 'V-RIGHT (p9-p7)',  points = '["p9","p8","p7"]'    WHERE part_index = 3;
UPDATE welding_part_order SET execution_order = 3, part_name = 'H-RIGHT (p10-p12)', points = '["p10","p11","p12"]' WHERE part_index = 2;

SELECT part_index, execution_order, part_name, points
FROM welding_part_order
ORDER BY execution_order;
