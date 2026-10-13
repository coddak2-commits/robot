# DB 변경값 현황

기계마다 DB 가 별개라서 "코드는 올렸는데 저 기계만 값이 다르다"가 생긴다.
그걸 한 곳에서 보려고 만든 파일이다. **값이 또 바뀌면 이 파일을 갱신한다.**

- 마이그레이션 파일 자체는 `database/migrations/` 에 있다. 여기는 "지금 어떤 값이
  들어가 있나"를 적는다.
- 기계 경로·계정·MariaDB 버전은 `HANDOFF.md` 9절에 있다. 여기서 반복하지 않는다.
- 세 기계 모두 DB 이름은 `robot_welding` 이다.

최종 갱신: 2026-10-13 (018 추가: 파트 순서 수평 먼저로. 5절 펜던트 절차에서 017 제외. 2.4 아크 트래킹 좌우 보정. 5.6 펜던트 아크 트래킹 맞추기)

---

## 1. 마이그레이션 적용 현황

| 마이그레이션 | 내용 | 사무실 PC | 노트북 | 펜던트 |
| --- | --- | --- | --- | --- |
| 001~011 | 기존 스키마 | 미확인 | 미확인 | 미확인 |
| 012_corner_part_split | 파트 4개 -> 6개 (모서리 분리) | 미확인 | 적용 (2026-10-08, 6행 확인) -> 017 로 거둠 | 불필요 (돌리지 않음) |
| 013_touch_offset_depth_z | `welding_config.touch_offset_depth_z` 컬럼 추가 | 미확인 | 적용 (2026-10-08) | **미적용** |
| 014_corner_start_no_z_touch | P4/P10 의 Z 탐색 끄기 | 미확인 | 미적용 (10-09 15:38 로그에 P10 Z 탐색 있음) | 돌리지 않음 |
| 015_corner_part_top_down | 모서리 파트 방향 뒤집기 ([P3,P4] / [P9,P10]) | 미적용 | 적용 (2026-10-09, 6행 확인) -> 017 로 거둠 | 불필요 (돌리지 않음) |
| 016_p5_p11_touch_side | `welding_config.p5_touch_side` / `p11_touch_side` 컬럼 추가 (기본 1) | 미적용 | 적용 (2026-10-12, 둘 다 1 확인) | **미적용** |
| 017_back_to_4part_vertical_first | 4파트로 복귀, 순서 수직 -> 수평 (012·015 를 거둠) | 미적용 | 적용 (2026-10-12, 4행 확인) | 불필요 (돌리지 않음) |
| 018_horizontal_first | 파트 순서를 수평 먼저로 (227 순서) | 미적용 | 적용 (2026-10-13, 4행 확인) | 불필요 (원래 수평 먼저) |

펜던트는 228 이전(227) 구성으로 의도적으로 남겨둔 것이다. 자기 안에서는 일관되므로
그대로 돌려도 된다. 맞출 때는 5절(013 -> 016 -> 앱 설치).

**펜던트 앱을 1.1.232 이상으로 올리려면 013 을 먼저 돌려야 한다.** 1.1.239 이상은 016 도 먼저 돌려야 한다(같은 이유). robot-core 의
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
| 4 | 1 | 파트5 (모서리 좌) | `["p4","p3"]` (015 적용 후 `["p3","p4"]`) |
| 1 | 2 | 파트2 (수직 좌) | `["p3","p2","p1"]` |
| 2 | 3 | 파트3 (수평 우) | `["p11","p12"]` |
| 5 | 4 | 파트6 (모서리 우) | `["p10","p9"]` (015 적용 후 `["p9","p10"]`) |
| 3 | 5 | 파트4 (수직 우) | `["p9","p8","p7"]` |

이전 값 (펜던트에 남아 있는 상태):

| part_index | execution_order | part_name | points |
| --- | --- | --- | --- |
| 0 | 0 | 파트1 (하단 좌측) | `["p4","p5","p6"]` |
| 1 | 1 | 파트2 (좌측) | `["p3","p2","p1"]` |
| 2 | 2 | 파트3 (하단 우측) | `["p10","p11","p12"]` |
| 3 | 3 | 파트4 (우측) | `["p9","p8","p7"]` |

노트북의 part_name 은 영문(H-LEFT, CORNER-LEFT (p4-p3) 등)이다. 015 는 points 만
바꾸므로 모서리 이름의 (p4-p3)/(p10-p9) 표기는 그대로 남아 있다. 표시용이라 동작과 무관하다.

**[2026-10-12] 노트북은 017 로 4파트가 됐다.** 현재 값:

| part_index | execution_order | part_name | points |
| --- | --- | --- | --- |
| 1 | 0 | V-LEFT (p3-p1) | `["p3","p2","p1"]` |
| 0 | 1 | H-LEFT (p4-p6) | `["p4","p5","p6"]` |
| 3 | 2 | V-RIGHT (p9-p7) | `["p9","p8","p7"]` |
| 2 | 3 | H-RIGHT (p10-p12) | `["p10","p11","p12"]` |

**[2026-10-13] 노트북에 018 적용 — 순서가 수평 먼저(227 순서)가 됐다.** 현재 값:

| part_index | execution_order | part_name | points |
| --- | --- | --- | --- |
| 0 | 0 | H-LEFT (p4-p6) | `["p4","p5","p6"]` |
| 1 | 1 | V-LEFT (p3-p1) | `["p3","p2","p1"]` |
| 2 | 2 | H-RIGHT (p10-p12) | `["p10","p11","p12"]` |
| 3 | 3 | V-RIGHT (p9-p7) | `["p9","p8","p7"]` |

아래 6파트 설명은 012~016 시절 기록이다.

P3/P9 이 두 파트에 함께 들어간다(같은 좌표).

015 는 모서리를 위 -> 아래로 뒤집는다. 아크가 모서리 바닥에서 켜지면 아랫부분이 덜
채워져서다. 015 는 **앱 1.1.237 이상에서만** 돌릴 것. 1.1.237 부터 모서리 파트만
조건(전류·전압·위빙·속도·트래킹)을 P4/P10 에서 읽는다. 그 아래 버전에서 돌리면
모서리와 수직이 둘 다 P3/P9 에서 읽어 모서리가 수직 조건으로 돈다.
robot-core 의 `updateWeldingPartOrder` 는 `execution_order` 만 UPDATE 하고 INSERT 를
하지 않는다. 그래서 파트 추가는 화면이 아니라 SQL 로만 된다.

### 2.2 `welding_config.touch_offset_depth_z` — 터치 Z 여유값

013 으로 추가한 컬럼. `DOUBLE NOT NULL DEFAULT 0`.
터치 결과 `dz` 에만 더한다. 올리면 토치가 그만큼 높이 서서 스틱아웃이 길어진다.
설정 화면은 없고 DB 에서 직접 바꾼다. 프런트에서 0~30 으로 제한한다.

| 기계 | 현재 값 | 비고 |
| --- | --- | --- |
| 사무실 PC | 미확인 | |
| 노트북 | **0** | 2026-10-08 에 10 으로 올렸다가 2026-10-09 되돌림 |
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

### 2.4 `welding_config` — 아크 트래킹 좌우 보정

2026-10-13 노트북에서 좌우 보정을 켰다. 자세한 설명은 `docs/arc-tracking.md`.

| 컬럼 | 이전 | 현재 |
| --- | --- | --- |
| `arc_tracking_left_right` | 0 | 1 |
| `arc_tracking_sum_max_lr` | 300 | 3 |

상하 보정(`arc_tracking_up_down` = 1, `sum_max_ud` = 5), `klr` 0.06 은 그대로다.
펜던트는 미확인.

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

---

## 5. 펜던트 적용 절차 (나중에 한 번에 맞출 때)

**[2026-10-12 다시 씀]** 노트북이 017 로 4파트(227 구성)로 돌아왔다. 펜던트는 원래
227 구성(4파트, 012~016 전부 미적용)이므로 **파트 구조와 교시는 그대로 두고**,
아래 세 가지만 맞추면 된다.

- 새 앱이 읽는 컬럼 두 개 추가 (013, 016)
- 앱 설치 (그때의 최신 안정 버전. 2026-10-13 기준 1.1.247)
- 아크 트래킹 설정을 노트북과 맞추기 (5.6)

[2026-10-13 현재] 펜던트는 앱·DB 모두 227 그대로 동결 중. 노트북 쪽이 안정화되면
이 절차로 한 번에 맞춘다. 그 사이 노트북에서 DB 를 또 바꾸면 이 절에 추가할 것.

[2026-10-13] 노트북은 018 로 순서가 수평 먼저(227 순서)로 돌아갔다. 펜던트는 원래
수평 먼저이므로 순서는 손대지 않는다.

012·014·015·017·018 은 **돌리지 않는다.**
- 017/018: 017 은 순서를 수직 먼저로, 018 은 다시 수평 먼저로 바꾼다. 펜던트는 이미
  수평 먼저라 둘 다 필요 없다.
- 012/015: 6파트(모서리 분리) 구성용이다. 4파트로 돌아왔으므로 필요 없다.
- 014: P4/P10 의 Z 탐색을 끈다. 4파트에서 P4/P10 은 수평 시작점이라 Z 탐색이 켜져
  있어야 바닥판까지 내려간다. 노트북도 안 돌렸다.

### 5.1 순서

| 순서 | 할 일 | 비고 |
| --- | --- | --- |
| 0 | DB 백업 | 5.2 |
| 1 | 013_touch_offset_depth_z.sql | `touch_offset_depth_z` 컬럼. 앱 1.1.232 이상은 없으면 설정 조회 실패 |
| 2 | 016_p5_p11_touch_side.sql | `p5/p11_touch_side` 컬럼. 앱 1.1.239 이상은 없으면 설정 조회 실패. 4파트에서는 값이 있어도 쓰이지 않는다 |
| 3 | 앱 설치 (최신 안정 버전, 1.1.247 이상) | 1~2 를 끝낸 뒤에 설치 |
| 4 | 확인 | 5.4 |
| 5 | 아크 트래킹 설정 맞추기 | 5.6. 실용접 전에 할 것 |
| 6 | 드라이런 | 5.5 |

### 5.2 백업

PowerShell 은 `>` / `<` 리다이렉션 대신 `--result-file` 을 쓴다. 비밀번호는 `-p` 대화형.

```powershell
mkdir C:\temp -Force
& "C:\Program Files\MariaDB 11.4\bin\mysqldump.exe" -u robotback -p --result-file=C:\temp\robot_welding_pendant_backup.sql robot_welding
```

### 5.3 마이그레이션 실행

1. 레포의 `database/migrations/` 에서 013, 016 (+ 각 rollback) 파일을 USB 로
   펜던트 `C:\temp\migrations\` 에 복사한다.
2. mysql 에 접속한다.

```powershell
& "C:\Program Files\MariaDB 11.4\bin\mysql.exe" -u robotback -p robot_welding
```

3. `MariaDB [robot_welding]>` 프롬프트에서 순서대로 실행한다. 경로는 `/` 로 적는다.
   **PowerShell 창에 SQL 을 바로 치면 안 된다.** 반드시 mysql 프롬프트 안에서.

```sql
source C:/temp/migrations/013_touch_offset_depth_z.sql
source C:/temp/migrations/016_p5_p11_touch_side.sql
```

`ALTER` 권한 오류가 나면 robotback 계정에 권한이 없는 것이다. 그때는 root 로 접속해
같은 순서로 돌린다.

### 5.4 확인 쿼리

```sql
SELECT part_index, execution_order, part_name, points FROM welding_part_order ORDER BY execution_order;
SELECT touch_offset_depth_z, p4_touch_top, p4_touch_bottom, p10_touch_top, p10_touch_bottom, p5_touch_side, p11_touch_side FROM welding_config WHERE id = 1;
```

기대값:
- 파트 4행, 순서 `["p4","p5","p6"]` -> `["p3","p2","p1"]` -> `["p10","p11","p12"]` -> `["p9","p8","p7"]` (227 그대로)
- `touch_offset_depth_z` = 0
- `p4_touch_bottom`, `p10_touch_bottom` = 1 (수평 시작점 Z 탐색. 0 이면 1 로 바꿀 것)
- `p5_touch_side`, `p11_touch_side` 는 아무 값이어도 된다(4파트에서는 안 쓰인다)

### 5.5 교시·드라이런

- 펜던트의 교시 좌표는 227 구성 그대로이므로 **재교시는 필요 없다.**
- 앱이 바뀌었으므로 드라이런으로 전환 경로를 먼저 확인한다(227 과 같은 경로).
  - P6 -> P3 : 같은 쪽 전환 (+X 후퇴 -> +X 접근)
  - P1 -> P10: 횡단 (P1 base +X 후퇴 -> 홈 -> P10 -Y 접근)
  - P12 -> P9: 같은 쪽 전환 (+X 후퇴 -> +X 접근)
- 펜던트 화면 세그먼트가 1-2, 2-3, 4-6, 7-8, 8-9, 10-12 로 보이는지
- 1.1.246 부터 수직 시작점(P3/P9)을 교시 좌표보다 3mm 아래에서 시작한다. 펜던트 P3/P9 가
  바닥판에 바짝 붙어 교시돼 있으면 와이어가 판에 닿을 수 있으니 시작점에서 확인한다
- 교시 포인트 6축(J6)이 180° 를 넘는 포인트가 있는지 본다. 실용접 끝점 이동(MoveLWithJoints)이
  code=14 로 거부된다(2026-10-13 노트북 P6 J6 180.46°). 드라이런은 관절값 없이 움직여서
  여기서는 안 드러난다. 확인 쿼리:
  `SELECT job_id, point_id, joints FROM teaching_points WHERE job_id = <작업 번호> ORDER BY id;`

끝나면 1절 표의 펜던트 칸을 갱신한다.

### 5.6 아크 트래킹 설정 맞추기

앱 1.1.247 부터 아크 트래킹을 위빙 종류가 아니라 파트 종류로 건다. 수직 파트(P1~P3, P7~P9)는
위빙이 무엇이든 트래킹이 켜진다(`arc_tracking_enabled` = 1 일 때). 그래서 펜던트의
`welding_config` 트래킹 값이 그대로 실용접에 걸린다. 펜던트 값은 미확인이다.

1) 양쪽 값을 같은 쿼리로 뽑아 비교한다(노트북은 root, 펜던트는 robotback).

```sql
SELECT arc_tracking_enabled, arc_tracking_left_right, arc_tracking_up_down,
       arc_tracking_klr, arc_tracking_kud,
       arc_tracking_step_max_lr, arc_tracking_step_max_ud,
       arc_tracking_sum_max_lr, arc_tracking_sum_max_ud,
       arc_tracking_delay_time, arc_tracking_t_start_lr, arc_tracking_t_start_ud,
       arc_tracking_axis_select, arc_tracking_reference_type, arc_tracking_reference_current,
       arc_tracking_refer_sample_start_ud, arc_tracking_refer_sample_count_ud
FROM welding_config WHERE id = 1;
```

2) 펜던트에 **그때의 노트북 값**을 넣는다. 아래는 2026-10-13 노트북에서 확인한 값이다.
   그 사이 바뀌었을 수 있으니 1) 결과를 우선한다.

| 컬럼 | 노트북 (2026-10-13) |
| --- | --- |
| `arc_tracking_enabled` | 1 |
| `arc_tracking_left_right` | 1 (10-13 에 0 -> 1) |
| `arc_tracking_up_down` | 1 |
| `arc_tracking_klr` | 0.06 (부호 미검증) |
| `arc_tracking_step_max_lr` | 5 |
| `arc_tracking_sum_max_lr` | 3 (10-13 에 300 -> 3) |
| `arc_tracking_t_start_lr` | 8 |
| `arc_tracking_axis_select` | 0 |
| `arc_tracking_sum_max_ud` | 5 |
| 나머지(`kud`, `step_max_ud`, `t_start_ud`, `delay_time`, 기준 전류 관련) | 10-13 에 안 뽑음. 1) 결과로 맞출 것 |

```sql
-- 예: 10-13 노트북 값 기준. 1) 결과와 다르면 그 값으로 바꿔 쓸 것
UPDATE welding_config SET
  arc_tracking_enabled = 1,
  arc_tracking_left_right = 1,
  arc_tracking_up_down = 1,
  arc_tracking_klr = 0.06,
  arc_tracking_step_max_lr = 5,
  arc_tracking_sum_max_lr = 3,
  arc_tracking_t_start_lr = 8,
  arc_tracking_axis_select = 0,
  arc_tracking_sum_max_ud = 5
WHERE id = 1;
```

주의:
- 좌우 보정은 대칭 평면 삼각파(좌우 체류 같음)에서만 적용된다(벤더 문서 1.3.4).
  펜던트 작업의 수직 포인트가 아직 수직 삼각파면 좌우를 켜도 효과가 없다.
  노트북과 같게 쓰려면 수직 포인트 위빙을 평면 삼각파로 바꿔 작업 저장할 것.
- 트래킹 값은 robot-core 가 용접마다 DB 에서 새로 읽으므로 앱 재시작은 필요 없다.
