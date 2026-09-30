# DB 접속 경로 (노트북 / 팬던트)

`welding_config`는 id=1 한 행짜리 전역 설정이다. 작업이나 티칭 포인트와 무관하고,
robot-core가 아크 트래킹을 걸 때마다 새로 읽으므로 재시작이나 새로고침이 필요 없다.

## 접속 명령

두 PC의 MariaDB 버전과 계정이 다르다.

| | 경로 | 계정 |
|---|---|---|
| 노트북 (현장 PC) | `C:\Program Files\MariaDB 12.3\bin\mysql.exe` | `-u root` |
| 팬던트 | `C:\Program Files\MariaDB 11.4\bin\mysql.exe` | `-u robotback` |

DB 이름은 양쪽 다 `robot_welding`.

```powershell
# 노트북
& "C:\Program Files\MariaDB 12.3\bin\mysql.exe" -u root -p robot_welding -e "..."

# 팬던트
& "C:\Program Files\MariaDB 11.4\bin\mysql.exe" -u robotback -p robot_welding -e "..."
```

## PowerShell 주의

- 맨 앞은 `&`다. `cd`를 쓰면 `Set-Location : 매개 변수 이름 'p'이(가) 모호하므로` 에러가 난다
  (2026-09-30 실제 발생). `cd`는 폴더 이동 명령이라 exe에 인자를 못 넘긴다.
- 큰따옴표 안에서 백틱은 이스케이프 문자다. `order` 같은 예약어 컬럼은 못 쓴다. `tp.id`로 정렬할 것.
- PowerShell 5.1의 `Invoke-RestMethod`는 charset 없는 JSON을 latin-1로 읽어 한글이 깨져 보인다.
  DB가 깨진 게 아니다.
- 팬던트는 인터넷이 안 된다. 복사·붙여넣기가 안 되므로 명령을 직접 타이핑해야 한다.
  바뀐 컬럼만 넣어서 짧게 만들 것.

## 아크 트래킹 설정을 팬던트에 맞추기 (2026-09-30 기준)

노트북에서 확정한 값 중 기본값과 다른 7개만 넣으면 된다.

```powershell
& "C:\Program Files\MariaDB 11.4\bin\mysql.exe" -u robotback -p robot_welding -e "UPDATE welding_config SET arc_tracking_enabled=1,arc_tracking_left_right=0,arc_tracking_kud=-0.06,arc_tracking_sum_max_ud=5,arc_tracking_t_start_lr=8,arc_tracking_t_start_ud=8,arc_tracking_refer_sample_start_ud=8 WHERE id=1;"
```

나머지 10개는 기본값 그대로다: `klr=0.06`, `step_max_lr=5`, `step_max_ud=5`, `sum_max_lr=300`,
`delay_time=0`, `axis_select=0`, `reference_type=0`, `reference_current=10`,
`refer_sample_count_ud=1`, `up_down=1`.

## 확인

```powershell
& "C:\Program Files\MariaDB 11.4\bin\mysql.exe" -u robotback -p robot_welding -e "SELECT arc_tracking_enabled, arc_tracking_left_right, arc_tracking_up_down, arc_tracking_klr, arc_tracking_kud, arc_tracking_step_max_lr, arc_tracking_step_max_ud, arc_tracking_sum_max_lr, arc_tracking_sum_max_ud, arc_tracking_t_start_lr, arc_tracking_t_start_ud, arc_tracking_delay_time, arc_tracking_axis_select, arc_tracking_reference_type, arc_tracking_reference_current, arc_tracking_refer_sample_start_ud, arc_tracking_refer_sample_count_ud FROM welding_config WHERE id=1\G"
```

두 PC에서 같은 SELECT를 돌려 값을 비교하면 된다.

## 값의 근거

`docs/arc-tracking.md`와 벤더 문서(FR Robot-Welder Arc Tracking User Guide) 참고.

- `left_right=0` — 문서 1.3.4: 좌우 보정은 직선 궤적 + 대칭 평면 삼각파/사인파 위빙에서만
  적용된다. 지금은 수직 삼각파라 쓸 수 없다.
- `t_start_lr`, `t_start_ud`, `refer_sample_start_ud` = 8 — 문서: 위빙 1Hz면 4, 2Hz면 8.
  현재 위빙은 2Hz.
- `sum_max_ud=5` — 상하 보정 누적 한계(mm). 300일 때 한 방향으로 25mm까지 밀려 와이어가
  길어졌다(2026-09-29). 검증 동안 작게 묶어둔 값이다.
- `kud=-0.06` — 부호 검증 중. 방향이 반대면 +0.06으로 되돌린다.
