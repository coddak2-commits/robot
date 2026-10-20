# Fairino 정품 펜던트(FR-HMI) 운용 정리

2026-10-20 기준 (v1.1.271). 펜던트 안에서 로봇 코어, robot-back, DB, 화면이 모두 돈다.
Windows 노트북 빌드는 그대로이고, 리눅스용은 같은 소스를 펜던트에서 직접 빌드한다.

## 1. 장비 정보

| 항목 | 값 |
|---|---|
| OS | Debian 11, arm64 (인터넷 없음) |
| 화면 | 1280 x 800 |
| 펜던트 IP | 192.168.58.77 |
| 로봇 제어기 IP | 192.168.58.2 (Fairino WebApp 주소) |
| 계정 | linaro / 1234 (sudo 비밀번호 없음, SSH 가능) |
| Python | 3.9 (pip 없음) |
| MariaDB | 10.5.15 |

## 2. 폴더 위치

```
/home/linaro/
├─ autostart.sh            부팅 시 Chromium 전체화면 실행 (Fairino 기본, 주소만 변경)
├─ autostart.sh.bak        원본 백업 (주소 192.168.58.2)
└─ vot/
   ├─ robot/robot-core/
   │  ├─ src/robot_core_all.cpp
   │  ├─ include/robot_core_all.h
   │  ├─ third_party/linux/include/   리눅스 빌드용 헤더
   │  ├─ build_linux.sh               빌드 스크립트
   │  └─ build-linux/
   │     ├─ robot_core                실행 파일
   │     ├─ libfairino.so.2
   │     ├─ config.ini                펜던트 설정
   │     └─ www/                      화면 파일 (index.html, static/ ...)
   ├─ robot-back/
   │  ├─ run.sh                       실행 스크립트
   │  ├─ .env                         DB 계정, JWT 키
   │  ├─ lib/                         Python 3.9 arm64 라이브러리 (pip 대신 동봉)
   │  ├─ app/, main.py
   ├─ robot_welding.sql             노트북 DB 백업 (가져오기용)
   └─ *.tar.gz, www-update/, pendant-update-*/   업데이트 묶음

/etc/systemd/system/
├─ vot-core.service        robot_core 자동 실행
├─ vot-back.service        robot-back 자동 실행
└─ autostart.service       Fairino 기본 (Chromium 실행, ~/autostart.sh)
```

## 3. 설정

`~/vot/robot/robot-core/build-linux/config.ini`

```
[database]
host=localhost
user=robotback
password=1234
name=robot_welding
port=3306

[auth]
jwt_secret=   (robot-back/.env 의 JWT_SECRET_KEY 와 반드시 같아야 함)

[zmq]
cmd_port=5557
pub_port=5558   (펜던트는 5555 를 adbd 가 써서 5557/5558 사용)
```

`~/vot/robot-back/.env` : DB_USER=robotback, DB_PASSWORD=1234, API_PORT=8000

포트: 8080 화면·API(코어) / 8001 비상정지 서버 / 8000 robot-back / 5557·5558 ZMQ / 3306 DB

## 4. DB

- DB 이름 robot_welding. root 는 비밀번호 로그인 불가, `sudo mysql` 로만 접속
- 프로그램 계정: `robotback@localhost` / 1234, robot_welding.* 전체 권한
- teaching_points.gap 칸은 1.1.265 이상 코어가 켜질 때 자동 생성
- 저장 설정 innodb_flush_log_at_trx_commit=1, doublewrite=1 확인 -> 전원을 갑자기 꺼도 저장 완료된 데이터는 남음

확인 명령:
```
mysql -u robotback -p1234 -e "SELECT COUNT(*) FROM robot_welding.teaching_jobs;"
```

## 5. 자동 실행 / 서비스

부팅하면 vot-core, vot-back 이 자동으로 켜지고, 약 30초 뒤 Chromium 이 `http://localhost:8080` 을 전체화면으로 연다.

```
systemctl status vot-core vot-back --no-pager      상태 (active (running) 이면 정상)
sudo systemctl restart vot-core                     코어 재시작
sudo systemctl restart vot-back                     robot-back 재시작
journalctl -u vot-core -f                           코어 로그 실시간 (robot-back 은 vot-back)
```

- 부팅마다 Chromium 데이터가 지워져 **매번 로그인 필요**. 유지하려면(현장 투입 전 예정):
  ```
  sudo sed -i 's#^rm -rf /root/#\#rm -rf /root/#' ~/autostart.sh
  ```
- Fairino WebApp 이 필요할 때: `chromium --new-window http://192.168.58.2 &`
- 원래대로(WebApp 자동 실행) 되돌리기: `cp ~/autostart.sh.bak ~/autostart.sh`

## 6. 끄기

- 그냥 제어기 전원을 꺼도 됨. 용접·저장 직후만 피해서 몇 초 뒤에 끈다
- `sudo poweroff` 는 펜던트가 바로 다시 켜져서 의미 없음
- 확실히 하려면: `sudo systemctl stop vot-core vot-back mariadb && sync` 후 제어기 끄기

## 7. 업데이트 방법

### 파일 옮기기
사무실 PC `C:\Users\D113964\Desktop\git\robot\dist\pendant\` -> 구글 드라이브 -> 노트북 -> USB -> 펜던트
(사무실 PC 는 보안상 USB·zip 메일 불가)

### USB
```
sudo mount -o uid=1000,gid=1000 /dev/sda1 /mnt/usb     연결 (already mounted 면 이미 연결됨)
cd ~ && sync && sudo umount /mnt/usb                    뽑기 전
```

### 화면만 바뀐 경우 (www-update-버전.tar.gz)
```
cp /mnt/usb/www-update-1.1.XXX.tar.gz ~/vot/ && cd ~/vot && rm -rf www-update && tar xzf www-update-1.1.XXX.tar.gz
cp -r ~/vot/www-update/* ~/vot/robot/robot-core/build-linux/www/
```
화면에서 F5. 왼쪽 위 버전 확인.

### 코어까지 바뀐 경우 (pendant-update-버전.tar.gz)
```
cp /mnt/usb/pendant-update-1.1.XXX.tar.gz ~/vot/ && cd ~/vot && tar xzf pendant-update-1.1.XXX.tar.gz
cp -r ~/vot/pendant-update-1.1.XXX/www/* ~/vot/robot/robot-core/build-linux/www/
cp ~/vot/pendant-update-1.1.XXX/robot-core/src/robot_core_all.cpp ~/vot/robot/robot-core/src/
cp ~/vot/pendant-update-1.1.XXX/robot-core/include/robot_core_all.h ~/vot/robot/robot-core/include/
cd ~/vot/robot/robot-core && ./build_linux.sh          [BUILD-OK] 확인
sudo systemctl restart vot-core
```
설정 > 업데이트 화면의 버전은 **코어 버전**이다. 화면만 바꾸면 예전 숫자로 남는다.

### robot-back
`dist\pendant\robot-back-pendant.tar.gz` 를 `~/vot` 에 풀면 됨 (lib 포함). 이후 `sudo systemctl restart vot-back`.
robot-back 소스는 Python 3.9 호환(`Optional[X]`)으로 유지할 것. `str | None` 문법을 쓰면 펜던트에서 안 켜진다.

## 8. 노트북 DB 를 펜던트로 옮기기

펜던트 DB 가 통째로 노트북 내용으로 바뀐다. 펜던트에서 새로 저장한 것은 사라짐.

노트북 (PowerShell, `>` 로 저장하면 인코딩이 바뀌어 못 읽음):
```
& "C:\Program Files\MariaDB 12.3\bin\mysqldump.exe" -u root -p --databases robot_welding --default-character-set=utf8mb4 --result-file=robot_welding.sql
```

펜던트 (노트북 MariaDB 12.x -> 펜던트 10.5 호환 수정 3가지):
```
cp /mnt/usb/robot_welding.sql ~/vot/ && cd ~/vot
sed -i '1{/999999/d}' robot_welding.sql
sed -i 's/utf8mb4_uca1400_ai_ci/utf8mb4_unicode_ci/g' robot_welding.sql
sed -i 's/CONSTRAINT `[^`]*` FOREIGN KEY/FOREIGN KEY/g' robot_welding.sql
sudo systemctl stop vot-core vot-back && sudo mysql < robot_welding.sql
sudo systemctl start vot-core vot-back
```
robotback 계정은 DB 백업과 별개라 그대로 유지된다.

## 9. 자주 난 문제

| 증상 | 원인 / 조치 |
|---|---|
| `Permission denied` (www 복사) | `chmod -R u+w ~/vot/www-update ~/vot/robot/robot-core/build-linux/www` 후 다시 복사 |
| `already mounted` | USB 이미 연결됨. 다음 명령으로 진행 |
| `cd: too many arguments` | 복사 명령 앞을 `cp` 대신 `cd` 로 입력함 |
| `specified more than once` | 같은 경로를 두 번 넣음. 무시해도 됨 |
| DB 가져오기 중 `FOREIGN KEY` 근처 문법 오류 | sed 오타(FOGEIGN 등). `grep -c FOGEIGN robot_welding.sql` 확인 후 고치고 다시 가져오기 |
| `mysqldump` 를 못 찾음 (노트북) | 위 8번처럼 전체 경로로 실행 |
| 로그인 401 | 아이디·비밀번호 오입력, 한/영 확인 |
| 화면 배치가 큰 화면용으로 나옴 | 작은 화면 배치 기준은 1280x800 이하 (1.1.268) |
