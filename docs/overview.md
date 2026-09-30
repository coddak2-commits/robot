# 시스템 개요 (처음 보는 사람용)

FR3-WMS 용접 자동화 시스템이 어떻게 굴러가는지 정리한 문서다.
프로그래밍을 몰라도 읽을 수 있게 썼다. 세부 값과 근거는 각 전용 문서를 참고한다.

## 1. 무엇으로 이루어져 있나

프로그램 세 개와 데이터베이스 하나가 붙어서 돌아간다.

| | 언어 | 포트 | 하는 일 |
|---|---|---|---|
| robot-core | C++ | 8080 (HTTP), 5555·5556 (ZMQ) | 로봇에 직접 명령을 보내는 유일한 창구 |
| robot-back | Python (FastAPI) | 8000 | 갭으로 용접 조건 조회, 로그인 토큰 발급 |
| robot-front | React | 3000 | 화면. 펜던트 터치 화면도 이것 |
| MariaDB | — | 3306 | 티칭 좌표, 용접 조건, 설정, 로그 저장 (DB 이름 `robot_welding`) |

**robot-core**가 핵심이다. Fairino SDK를 통해 컨트롤러(192.168.58.2)와 이야기한다.
"이 좌표로 직선 이동", "아크 켜", "위빙 시작" 같은 실제 동작 명령이 전부 여기를 거친다.
로그 파일도 이 프로그램이 쓴다.

**robot-front**는 버튼을 누르면 robot-core나 robot-back에 HTTP 요청을 보낸다.
로봇을 직접 건드리지 않는다.

## 2. 용접 한 번이 도는 순서

### 2-1. 터치센싱 — 실제 위치 찾기

작업을 불러오면 DB에서 티칭 좌표를 읽어온다. 하지만 모재는 매번 조금씩 다르게 놓이기
때문에 저장된 좌표를 그대로 쓸 수 없다.

그래서 먼저 터치센싱을 한다. 와이어 끝을 탐침처럼 써서 모재에 닿을 때까지 천천히 밀고
들어가, 저장된 좌표에서 실제 위치가 얼마나 벗어났는지를 잰다.

로그에 이렇게 찍힌다.

```
[TouchSensing] find-dx START: dir=-1 searchDis=50.000000mm vel=6.000000
[TouchSensing] find-dx COMPLETE: delta=-13.277191 contact=-504.540405
```

`delta`가 보정값이다. 포인트마다 dx·dy·dz를 들고 있다가 이동할 때 더해서 쓴다.

### 2-2. 용접 시작 순서

정해진 순서가 있다. 벤더 문서(FR Robot-Welder Arc Tracking User Guide 4.3.1)의
예제 프로그램과 같게 맞춰뒀다.

```
시작점으로 이동
  -> 아크 트래킹 ON
  -> 아크 ON
  -> 위빙 시작
  -> 용접 구간 이동
  -> 위빙 종료
  -> 아크 OFF
  -> 아크 트래킹 OFF
```

파트가 끝나면 다음 파트에서 같은 순서를 반복한다.

### 2-3. 아크 ON은 한 번의 명령이 아니다

시퀀스다. 이 중 하나라도 어긋나면 아크가 안 붙는다.

1. 전류·전압을 용접기에 지령으로 보낸다 (아날로그 출력)
2. 가스를 연다
3. 0.5초 기다린다 (가스 프리플로우)
4. 아크 개시 명령을 보낸다
5. 아크가 붙었다는 신호를 기다린다 — 10초 안에 안 오면 실패

5번에서 실패하면 로그에 `arcStart() -> code=76`이 찍힌다. 76은 SDK 헤더의
`ERR_WAIT_TIMEOUT`, 대기 시간 초과다. 가스는 나왔는데 아크가 안 붙는 상황이 이것이다.

### 2-4. 아크 OFF와 번백

아크를 끌 때 바로 전류를 0으로 내리면 안 된다. 용접기가 와이어 끝을 태워서 스틱아웃을
원래 길이로 되돌리는 시간(번백)이 필요하다. 이걸 건너뛰면 와이어가 안 타고 남아
다음 파트 점화 때 스틱아웃이 길어진다.

`welding_config.arc_end_burnback_ms`(기본 500ms)가 그 대기 시간이다.
로그의 `ArcOff / BURNBACK_WAIT ms=500`이 이 단계다.

## 3. 위빙과 아크 트래킹

### 위빙

토치를 좌우로 흔들며 나가는 것이다. **이동 궤적에 겹쳐서 적용되는 기능이라
로봇이 멈춰 있으면 위빙 모양이 나오지 않는다.**

수평은 평면 삼각파, 수직은 수직 삼각파를 쓴다. 코드에서는 숫자로 구분한다.

| 위빙 | 코드 |
|---|---|
| 평면 삼각파 | 0 |
| 수직 L형 삼각파 | 1 |
| 평면 사인파 | 4 |
| 수직 L형 사인파 | 5 |
| 수직 삼각파 | 6 |
| 수직 사인파 | 7 |

### 아크 트래킹

용접 중 아크 전류를 읽어서 토치 높이를 스스로 조절하는 기능이다.
스틱아웃이 짧으면 전류가 올라가고 길면 내려가는 성질을 이용한다.

계산은 전부 컨트롤러 안에서 돈다. 우리 프로그램이 하는 일은 "켜라/꺼라" 한 번과
계수를 넘기는 것뿐이다. 계수는 robot-core가 `welding_config`에서 직접 읽으므로
DB만 고치면 다음 용접부터 바로 반영된다. 재시작도 새로고침도 필요 없다.

상세 설정과 값의 근거는 `docs/arc-tracking.md`와 `docs/db-access.md` 참고.

## 4. 이동 방식

두 가지가 있다.

**경유점 방식** — 중간 포인트를 전부 지나간다. 모재가 휘어도 경로가 따라간다.
포인트마다 터치 보정이 들어간다. 경유점에서 방향이 꺾이면 비드에 각이 지므로
블렌드(50mm)를 줘서 완만하게 만든다.

**끝점 단일 이동** — 중간을 건너뛰고 끝점까지 한 번에 간다. 끝점의 터치 보정만
적용된다. 비드가 매끄럽지만 모재가 휘면 가운데가 벌어진다.

지금은 아크 트래킹이 켜진 구간만 끝점 단일 이동을 쓴다. 휜 만큼은 트래킹이 잡는다는
전제다. 되돌리는 방법은 `docs/rollback-waypoint-mode.md`에 있다.

로그로 어느 쪽인지 구분한다.

- 단일 이동: `Skipping N waypoint(s), single MoveL to endpoint`
- 경유점: `[per_point] queue preload: N points, blendR=...`

## 5. 속도

작업에는 CPM(cm/min)으로 입력하는데 로봇은 퍼센트로 받는다. 실측으로 확인된 관계는
이렇다.

```
실제 이동속도 = 5.795mm/s x 명령%
```

이 환산이 틀어져 있어서 한동안 수직 용접이 의도보다 느렸던 적이 있다(v1.1.130에서 정정).
지금은 작업에 입력한 CPM이 실제 cm/min과 일치한다.

## 6. PC 두 대와 배포

**개발 PC** (`C:\Users\D113964\Desktop\git\robot`)에서 코드를 고치고 빌드해서
GitHub에 릴리즈를 올린다.

**현장 노트북**이 그 릴리즈를 자동으로 내려받아 설치한다. 로그의
`[Updater] 다운로드 시작` 줄이 그것이다.

릴리즈할 때 버전을 네 곳에 맞춰야 한다. 한 곳이라도 어긋나면 업데이트 알림이 계속 뜨거나
설정 화면에 옛 버전이 표시된다.

| 파일 | 내용 |
|---|---|
| `robot-front/src/lib/index.ts` | `APP_VERSION` (화면) |
| `robot-core/src/robot_core_all.cpp` | `APP_VERSION_STRING` (약 7063행) |
| `installer.iss` | `MyAppVersion` (설치 파일) |
| `release_notes_<ver>.txt` | 릴리즈 노트 (UTF-8 BOM 필수) |

릴리즈 명령은 저장소 루트에서 PowerShell로 실행한다.

```powershell
.\release.ps1 -Version 1.1.xxx -NotesFile release_notes_1.1.xxx.txt
```

빌드·릴리즈 전에 `git status`와 `git rev-parse HEAD` / `origin/main`을 반드시 확인한다.
과거에 디스크 코드와 git 히스토리가 분리된 채 태그만 새로 붙는 사고가 있었다
(CLAUDE.md 참고).

## 7. 로그 보는 법

노트북의 `C:\Program Files (x86)\Robot Welding Control\logs` 폴더에 날짜별로 쌓인다.

```powershell
Get-Content "C:\Program Files (x86)\Robot Welding Control\logs\robot_core_2026-09-30.log" -Tail 80
```

자주 보는 줄들.

| 로그 | 뜻 |
|---|---|
| `[AnalogIn] AI0=... AI1=...` | 아크 중 전류·전압 피드백. 아크가 켜져 있을 때만 1초마다 찍힌다 (v1.1.155부터) |
| `Arc ON sequence completed successfully` | 아크 점화 성공 |
| `arcStart() -> code=76` | 아크 점화 실패 (대기 시간 초과) |
| `[ArcTrace] Arc tracking ON / OFF` | 아크 트래킹 on/off |
| `[WeldBatch] [per_point] move N/M` | 용접 구간 이동 |
| `EMERGENCY SHUTDOWN` | 비상정지 처리 |

`[AnalogIn]` 값이 한 구간 내내 똑같이 찍히는 것은 정상이다. 블로킹 이동 중에는
캐시된 상태를 읽기 때문이고, 컨트롤러가 멈춘 것이 아니다.

## 8. 관련 문서

| 파일 | 내용 |
|---|---|
| `CLAUDE.md` | 세션 시작 시 필수 확인 사항, 2026-09-11 롤백 사고 경위 |
| `HANDOFF.md` | 롤백 이후 히스토리와 미해결 항목 |
| `docs/arc-tracking.md` | 아크 트래킹 상세 |
| `docs/touch-sensing.md` | 터치센싱 상세 |
| `docs/fairino-manual-welding.md` | 벤더 매뉴얼 정리 |
| `docs/db-access.md` | 노트북·팬던트 DB 접속 경로와 설정 동기화 |
| `docs/rollback-part-order.md` | 파트 순서 되돌리기 |
| `docs/rollback-waypoint-mode.md` | 경유점 방식 되돌리기 |
| `docs/HANDOFF-2026-*.md` | 날짜별 작업 기록 |
