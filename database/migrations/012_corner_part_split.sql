-- 012: 모서리 파트 분리 (v1.1.228, 2026-10-07)
--
-- 한 변당 '수평 3포인트 + 수직 3포인트' 구성에서 모서리 비드 아래쪽이 채워지지
-- 않는 문제가 계속 남았다. 시작 체류(1.1.202~204)와 기어가기(1.1.205~213)로는
-- 해결되지 않았다. 원인은 위빙 폭이 파트 단위로만 설정된다는 것이다.
-- weldingExecution.ts 는 파트 시작 시 setupAndStartWeave 를 한 번만 호출하고
-- 파트 중간에 WeaveSetPara 를 다시 보내지 않는다. 또 WeldBatch 가 파트를 끝점까지
-- MoveL 하나로 접기 때문에 같은 파트에 포인트를 더 넣어도 통과점이 될 뿐이다.
-- 모서리 20mm 만 위빙 폭과 속도를 따로 주려면 그 구간이 별도 파트여야 한다.
--
-- 포인트 수는 12개 그대로 두고 역할만 바꾼다. 수평의 중간점을 없애고 그 번호를
-- 모서리 쪽으로 옮긴다.
--
--   P1  수직 위                (변경 없음)
--   P2  수직 중간              (변경 없음)
--   P3  모서리에서 위로 20mm   <- 재티칭
--   P4  모서리 (수직선 바닥)   (변경 없음)
--   P5  모서리 (수평선 시작)   <- 재티칭, 기존 P4 자리
--   P6  수평 끝                (변경 없음)
--   우측 P7~P12 가 같은 방식으로 대응한다 (재티칭 대상은 P9, P11).
--   P4/P5 와 P10/P11 은 같은 자리에 티칭된다. P9/P10 이 이미 그런 구성이었다.
--
-- 실행 순서: 수평 -> 모서리(올라가기) -> 수직(올라가기). 한 변을 끝내고 다음 변으로.
-- 이 순서라야 모든 아크 시작이 이미 쌓인 금속 위에 떨어지고, 로봇이 되돌아오는
-- 이동도 늘지 않는다.
--   모서리 파트가 P4 에서 켜질 때 그 자리는 수평 파트가 1000ms 체류하며 깔아둔 비드 위
--   수직 파트가 P3 에서 켜질 때 그 자리는 모서리 파트가 방금 끝낸 자리
--
-- 주의 1: robot-core 의 updateWeldingPartOrder 는 execution_order 만 UPDATE 하고
-- INSERT 를 하지 않는다. 화면의 순서 변경 기능으로는 파트를 추가할 수 없어서 여기서
-- 직접 넣는다. 읽는 쪽(getWeldingPartOrder)은 row 수를 세지 않으므로 6개를 넣으면
-- 그대로 6파트로 돈다.
--
-- 주의 2: 프런트의 DEFAULT_WELDING_PARTS(4개)는 건드리지 않는다. getExecutableParts
-- 가 그것을 '패스 체크박스 키'를 역산하는 물리 변 지도로만 쓰기 때문이다. 그래서
-- 모서리 파트는 같은 변의 수평 체크박스를 함께 쓴다(둘을 따로 끌 수는 없다).
--
-- 주의 3: 펜던트와 노트북 DB 는 별개다. 양쪽에서 각각 실행해야 한다.

INSERT INTO welding_part_order (part_index, execution_order, part_name, points)
VALUES
    (4, 1, '파트5 (모서리 좌)', '["p4","p3"]'),
    (5, 4, '파트6 (모서리 우)', '["p10","p9"]')
ON DUPLICATE KEY UPDATE
    execution_order = VALUES(execution_order),
    part_name       = VALUES(part_name),
    points          = VALUES(points);

UPDATE welding_part_order SET execution_order = 0, part_name = '파트1 (수평 좌)', points = '["p5","p6"]'      WHERE part_index = 0;
UPDATE welding_part_order SET execution_order = 2, part_name = '파트2 (수직 좌)', points = '["p3","p2","p1"]' WHERE part_index = 1;
UPDATE welding_part_order SET execution_order = 3, part_name = '파트3 (수평 우)', points = '["p11","p12"]'    WHERE part_index = 2;
UPDATE welding_part_order SET execution_order = 5, part_name = '파트4 (수직 우)', points = '["p9","p8","p7"]' WHERE part_index = 3;

SELECT part_index, execution_order, part_name, points
FROM welding_part_order
ORDER BY execution_order;
