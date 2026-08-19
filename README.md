# FR3-WMS

FR3 로봇 기반 갭(GAP) 용접 파라미터 시스템.

## 구성

| 폴더 | 설명 | 포트 |
|---|---|---|
| `robot-core` | C++ 기반 로봇 제어 코어 (Fairino SDK + HTTP/ZMQ) | 8080 (HTTP), 5555/5556 (ZMQ) |
| `robot-back` | FastAPI 기반 갭 파라미터/작업/대시보드 백엔드 | 8000 |
| `robot-front` | React 기반 프론트엔드 (UcellSelect, Pendant, Dashboard) | 3000 |
| `database` | MariaDB 초기 스키마 / 시드 |  |

## 요구 사항

- Node.js 18+
- Python 3.12+
- MariaDB 11+
- Visual C++ Redistributable 2015-2022 x64 (robot-core 실행용)

## 초기 세팅

### DB

```bash
mysql -uroot -p < database/init_mariadb.sql
mysql -uroot -p robot_welding < database/migrations/001_initial_schema.sql
mysql -uroot -p robot_welding < database/seed_data.sql
```

### robot-back

```bash
cd robot-back
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env   # DB/JWT 값 채우기
python create_admin.py # 관리자 계정 생성
python main.py
```

### robot-front

```bash
cd robot-front
npm install
npm start
```

### robot-core

`build-unity/robot_core.exe` 직접 실행. 소스 빌드는 `build_unity.bat`.

## 로그인

- admin 계정은 `create_admin.py`로 생성
- 두 백엔드(Robot Core 8080, FastAPI 8000)가 동일한 SHA-256 해시로 인증

## 라이센스

내부 사용용.
