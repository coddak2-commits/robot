# DB 변경값 현황

기계마다 DB 가 별개라서 "코드는 올렸는데 저 기계만 값이 다르다"가 생긴다.
그걸 한 곳에서 보려고 만든 파일이다. **값이 또 바뀌면 이 파일을 갱신한다.**

- 마이그레이션 파일 자체는 `database/migrations/` 에 있다. 여기는 "지금 어떤 값이
  들어가 있나"를 적는다.
- 기계 경로·계정·MariaDB 버전은 `HANDOFF.md` 9절에 있다. 여기서 반복하지 않는다.
- 세 기계 모두 DB 이름은 `robot_welding` 이다.

최종 갱신: 2026-10-09

---

## 1. 마이그레이션 적용 현황

| 마이그레이션 | 내용 | 사무실 PC | 노트북 | 펜던트 |
| --- | --- | --- | --- | --- |
| 001~011 | 기존 스키마 | 미확인 | 미확인 | 미확인 |
| 012_corner_part_split | 파트 4개 -> 6개 (모서리 분리) | 미확인 | 적용 (2026-10-08, 6행 확인) | **미적용** |
| 013_touch_offset_depth_z | `welding_config.touch_offset_depth_z` 컬럼 추가 | 미확인 | 적용 (2026-10-08) | **미적용** |
| 014_corner_start_no_z_touch | P4/P10 의 Z 탐색 끄기 | 미확인 | 미확인 | **미적용** |

펜던트는 228 이전 상태로 의도적으로 남겨둔 것이다. 자기 안에서는 일관되므로
그대로 돌려도 된다. 안정화된 뒤에 한 번에 맞춘다.

**펜던트 앱을 1.1.232 이상으로 올리려면 013 을 먼저 돌려야 한다.** robot-core 의
`welding_config` 조회가 `touch_offset_depth_z` 를 명시적으로 SELECT 하므로,
컬럼이 없으면 조회가 실패하고 터치 설정·안전 한계·아크 트래킹 설정이 안 올라온다.

---

## 2. 바뀐 값

### 2.1 `welding_part_order` — 파트 구성

012 로 4파트에서 6파트가 됐다. 모서리 20mm 를 별도 파트로 떼기 위한 것이다.
`execution_order` 가 실제 용접 순서다.

| part_index | execution_order | part_name | points |
| --- | --- | --- | --- |
| 0 | 0 | 파트1 (수평 좌) | `["p5","p6"]` |
| 4 | 1 | 파트5 (모서리 좌) | `["p4","p3"]` |
| 1 | 2 | 파트2 (수직 좌) | `["p3","p2","p1"]` |
| 2 | 3 | 파트3 (수평 우) | `["p11","p12"]` |
| 5 | 4 | 파트6 (모서리 우) | `["p10","p9"]` |
| 3 | 5 | 파트4 (수직 우) | `["p9","p8","p7"]` |

이전 값 (펜던트에 남아 있는 상태):

| part_index | execution_order | part_name | points |
| --- | --- | --- | --- |
| 0 | 0 | 파트1 (하단 좌측) | `["p4","p5","p6"]` |
| 1 | 1 | 파트2 (좌측) | `["p3","p2","p1"]` |
| 2 | 2 | 파트3 (하단 우측) | `["p10","p11","p12"]` |
| 3 | 3 | 파트4 (우측) | `["p9","p8","p7"]` |

P3/P9 이 두 파트에 함께 들어간다(모서리 끝점 = 수직 시작점, 같은 좌표).
robot-core 의 `updateWeldingPartOrder` 는 `execution_order` 만 UPDATE 하고 INSERT 를
하지 않는다. 그래서 파트 추가는 화면이 아니라 SQL 로만 된다.

### 2.2 `welding_config.touch_offset_depth_z` — 터치 Z 여유값

013 으로 추가한 컬럼. `DOUBLE NOT NULL DEFAULT 0`.
터치 결과 `dz` 에만 더한다. 올리면 토치가 그만큼 높이 서서 스틱아웃이 길어진다.
설정 화면은 없고 DB 에서 직접 바꾼다. 프런트에서 0~30 으로 제한한다.

| 기계 | 현재 값 | 비고 |
| --- | --- | --- |
| 사무실 PC | 미확인 | |
| 노트북 | **10** | 2026-10-08 설정. 기본 0 에서 올림 |
| 펜던트 | 컬럼 없음 | 013 미적용 |

값을 바꾼 뒤에는 **터치센싱을 다시 돌려야** 반영된다.

### 2.3 `welding_config` — P4/P10 의 Z 탐색

014 로 끈다. 모서리 파트의 끝점(P3/P9)이 Z 탐색을 돌지 않으므로, 시작점만
바닥판까지 내려가면 20mm 로 교시한 구간이 늘어난다.

2026-10-08 좌측 실측:

```
P4  교시 Z 17.169   rawDz -17.695   보정 후 Z  -0.526
P3  교시 Z 38.525   Z 탐색 없음     보정 후 Z  38.525
교시 간격 21.4mm  ->  보정 후 39.1mm   (touch_offset_depth_z = 10 이면 29.1mm)
```

| 컬럼 | 이전 | 현재 |
| --- | --- | --- |
| `p4_touch_top` | 1 | 0 |
| `p4_touch_bottom` | 1 | 0 |
| `p10_touch_top` | 1 | 0 |
| `p10_touch_bottom` | 1 | 0 |

중앙 X(`p4_touch_center`)와 측면 Y(`p4_touch_side`)는 1 로 유지한다.
v1.1.235 에서 거기에 `touch_offset_depth` 가 붙도록 고쳤으므로 X/Y 보정은 계속 받는다.
P5/P11 은 건드리지 않는다. 수평 구간은 양 끝이 같은 규칙이라 문제가 없다.

**코드 기본값도 같이 false 로 바꿨다**(`robot_core_all.h`, `sequenceSettings.ts`).
새로 만드는 DB 는 014 를 돌리지 않아도 꺼진 상태로 시작한다.

**P4/P10 재교시가 같이 필요하다.** 지금은 P5/P11 과 같은 자리(바닥판 위 약 17mm)에
있는데, 그건 수평 포인트가 Z 탐색으로 내려오려고 일부러 띄워 교시한 자리다.
Z 탐색을 끈 뒤에는 처음부터 모서리에 있어야 한다. 안 하면 모서리보다 17mm 위에서
용접이 시작된다.

---

## 3. 현재 상태 확인

한 번에 다 보는 쿼리다. PowerShell 은 `<` 리다이렉션이 안 되므로 `-e` 로 넘긴다.
클라이언트 경로는 기계마다 다르다(HANDOFF.md 9절).

노트북:

```powershell
& "C:\Program Files\MariaDB 12.2\bin\mysql.exe" -u root -p -e "SELECT part_index, execution_order, part_name, points FROM welding_part_order ORDER BY execution_order; SELECT touch_offset_depth, touch_offset_depth_z, p4_touch_center, p4_touch_top, p4_touch_bottom, p4_touch_side, p10_touch_center, p10_touch_top, p10_touch_bottom, p10_touch_side FROM welding_config WHERE id = 1;" robot_welding
```

펜던트(계정이 다르다):

```powershell
& "C:\Program Files\MariaDB 11.4\bin\mysql.exe" -u robotback -p -e "SELECT part_index, execution_order, part_name, points FROM welding_part_order ORDER BY execution_order;" robot_welding
```

비밀번호는 항상 `-p` 로 대화형 입력한다. 명령줄에 붙이지 않는다.

---

## 4. 값을 또 바꿀 때

1. 마이그레이션 파일을 `database/migrations/` 에 새로 만든다(롤백 파일도 함께).
2. 기계마다 돌리고, 위 1절·2절 표를 갱신한다.
3. 코드 기본값(`robot_core_all.h`, `sequenceSettings.ts` 등)도 같이 맞춰야 하는
   값이면 그것도 적는다. 기본값과 DB 값이 갈리면 새 기계만 다르게 동작한다.
4. 맨 위 "최종 갱신" 날짜를 바꾼다.
