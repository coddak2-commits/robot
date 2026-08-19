# FR3-WMS Backend (Python FastAPI)

갭 기반 용접 파라미터 시스템의 백엔드 API 서버.

## 폴더 구조

```
robot-back/
├── venv/                    Python 가상환경 (git 제외)
├── app/
│   ├── api/                 FastAPI 라우터
│   │   ├── auth.py          로그인/토큰
│   │   ├── params.py        welding_params CRUD + 갭 조회
│   │   └── deps.py          공통 의존성 (인증, 권한)
│   ├── core/
│   │   ├── config.py        환경변수 로드
│   │   ├── database.py      SQLAlchemy 연결
│   │   └── security.py      JWT, 비밀번호 해시
│   ├── models/              SQLAlchemy ORM 모델
│   │   ├── user.py
│   │   └── welding.py
│   ├── schemas/             Pydantic 스키마
│   │   ├── user.py
│   │   └── welding.py
│   └── utils/
│       └── interpolation.py 갭 보간/폴백 로직
├── main.py                  FastAPI 앱 진입점
├── requirements.txt
├── .env.example             환경변수 예시 (실제 .env는 git 제외)
└── README.md
```

## 최초 설치

1. Python 3.12 설치
2. venv 생성 및 활성화:
   ```powershell
   cd C:\Users\d113964\Desktop\git\robot\robot-back
   $env:PYTHONPATH = ""
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. 의존성 설치:
   ```powershell
   pip install -r requirements.txt
   ```
4. `.env.example` 복사 후 값 수정:
   ```powershell
   copy .env.example .env
   notepad .env
   ```
   - `DB_PASSWORD`: MariaDB root 비밀번호
   - `JWT_SECRET_KEY`: 충분히 긴 랜덤 문자열
5. 서버 실행:
   ```powershell
   python main.py
   ```
   또는:
   ```powershell
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
6. 브라우저: http://localhost:8000/docs (Swagger UI)

## 관리자 계정 생성 (최초 1회)

DBeaver 등으로 users 테이블에 직접 삽입:
```sql
USE robot_welding;
-- bcrypt 해시 생성은 파이썬으로:
-- python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('admin1234'))"
INSERT INTO users (username, password_hash, full_name, role, is_active)
VALUES ('admin', '위에서 생성한 해시', '관리자', 'admin', TRUE);
```

## API 엔드포인트 (초기)

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| POST | /api/auth/login | 공개 | 로그인 (JWT 발급) |
| GET | /api/params/lookup | 인증 | 갭 조회 (계층적 폴백) |
| GET | /api/params | 인증 | 파라미터 목록 |
| GET | /api/params/{id} | 인증 | 단일 조회 |
| POST | /api/params | 관리자 | 신규 등록 |
| PATCH | /api/params/{id} | 관리자 | 수정 |
| DELETE | /api/params/{id} | 관리자 | 소프트 삭제 (사유 필수) |
| POST | /api/params/{id}/restore | 관리자 | 복원 |

## 향후 추가 예정

- [ ] 오버라이드 API (/api/overrides)
- [ ] 승격 요청 API (/api/promotions)
- [ ] 작업 API (/api/jobs, /api/jobs/{id}/point-gaps)
- [ ] 편차 이벤트 API (/api/deviations)
- [ ] 사용자 관리 API (/api/users)
- [ ] 자동 감지 배치 (매일 새벽)
- [ ] C++ Robot Core 연동 (HTTP)
- [ ] 하루 요약 이메일 발송
