# 파트 순서 롤백 기록 (2026-09-22)

파트 순서는 코드가 아니라 노트북 DB `welding_part_order`에 있다. git으로 되돌릴 수 없으므로 여기 기록한다.
앱은 `execution_order` 오름차순으로 파트를 실행한다(`getWeldingPartOrder`). `part_index`·`part_name`·`points`는 그대로 두고 `execution_order`만 바꾸면 된다.

## 현재 테이블 (2026-09-21 15:43 변경 이후)

| part_index | execution_order | part_name | points |
|---|---|---|---|
| 0 | 0 | 파트1 (하단 좌측) | ["p4","p5","p6"] |
| 1 | 1 | 파트2 (좌측) | ["p3","p2","p1"] |
| 2 | 2 | 파트3 (하단 우측) | ["p10","p11","p12"] |
| 3 | 3 | 파트4 (우측) | ["p9","p8","p7"] |

## 두 순서

| | 순서 | 파트 전환 |
|---|---|---|
| 수평 우선 (현재, 9/21~) | 4-5-6 → 3-2-1 → 10-11-12 → 9-8-7 | P6→P3 같은 쪽 / P1→P10 횡단 / P12→P9 같은 쪽 |
| 수직 우선 (이전, ~9/21) | 3-2-1 → 4-5-6 → 9-8-7 → 10-11-12 | P1→P4 같은 쪽 / P6→P9 횡단(전용 분기) / P7→P10 같은 쪽 |

이전 순서 근거: `welding_logs` id 1041 (2026-09-21 15:09:17, 실용접) `segments` — p3→p2→p1 → p1→p4(전환) → p4→p5→p6 → p6→p9(전환) → p9→p8→p7 → p7→p10(전환) → p10→p11→p12.

## 롤백: 수직 우선으로 되돌리기

```powershell
& "C:/Program Files/MariaDB 12.3/bin/mysql.exe" -u root -p robot_welding -e "UPDATE welding_part_order SET execution_order = CASE part_index WHEN 1 THEN 0 WHEN 0 THEN 1 WHEN 3 THEN 2 WHEN 2 THEN 3 END WHERE part_index IN (0,1,2,3); SELECT part_index, execution_order, part_name, points FROM welding_part_order ORDER BY execution_order;"
```

결과가 p3,p2,p1 / p4,p5,p6 / p9,p8,p7 / p10,p11,p12 순이면 정상.

## 원복: 수평 우선으로 다시

```powershell
& "C:/Program Files/MariaDB 12.3/bin/mysql.exe" -u root -p robot_welding -e "UPDATE welding_part_order SET execution_order = part_index WHERE part_index IN (0,1,2,3); SELECT part_index, execution_order, part_name, points FROM welding_part_order ORDER BY execution_order;"
```

## 코드 쪽 (1.1.175 기준)

- 코드 롤백은 필요 없다. 두 순서의 전환 분기가 모두 남아 있다.
  - P6→P9: 전용 분기(후퇴 → 직선 MoveL, P9 touchOffset 적용)
  - P1→P4, P7→P10, P6→P3, P12→P9: 같은 쪽 전환(base +X approachOffset 후퇴/접근)
  - P1→P10: 1.1.175 횡단 코너 분기(+X 후퇴 → 홈 → -Y approachOffset MoveL → 정위치)
- 순서를 바꾼 뒤에는 앱에서 작업을 다시 불러오고, 드라이런으로 전환 동작을 먼저 확인할 것.
- 기본값·체류 등 수평 우선 기준으로 바꾼 값: `PART_START_DWELL_MS`(P4/P10 1000ms)는 순서와 무관하게 파트 시작점 기준이라 그대로 동작한다.
