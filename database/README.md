# Database Scripts

FR3-WMS 갭 기반 파라미터 시스템 DB 초기화/관리 스크립트.

## 폴더 구조

```
database/
├── init_mariadb.sql       DB + 12개 테이블 + 초기 설정 데이터
├── seed_data.sql          welding_params 초기 56행
├── migrations/
│   └── 001_initial_schema.sql
└── README.md              본 파일
```

## 최초 설치 (신규 DB 구축)

1. MariaDB 11.4 이상 설치
2. DBeaver 또는 명령줄로 접속
3. 실행 순서:
   ```
   1) init_mariadb.sql
   2) seed_data.sql
   ```

### DBeaver로 실행
- DB 접속 후 SQL 편집기 열기
- 파일 → Import → SQL Script
- 각 파일을 순서대로 열어서 전체 실행 (Alt+X)

### 명령줄로 실행
```
mysql -u root -p < init_mariadb.sql
mysql -u root -p robot_welding < seed_data.sql
```

## 스크립트 설명

### init_mariadb.sql
- `robot_welding` 데이터베이스 생성 (utf8mb4)
- 참조 테이블 최소 스키마 (users, welding_jobs)
- 12개 신규 테이블 생성
- 설정 테이블 초기 데이터 삽입:
  - welding_defaults (가스/시간 기본값)
  - promotion_detection_config (자동 감지 임계값)
  - alarm_thresholds (편차 알람 임계값 4종)
  - override_limits (오버라이드 허용 범위 3종)

### seed_data.sql
- welding_params 초기 56행:
  - 자세 2종 (수직/수평) × 갭 7종 (0~6mm) × 두께 4종 (18/20/22/23mm)
  - Lab 테스트 결과(결과보고서 표10, 표11) 기반
  - 두께별 실측 갱신 예정
  - Gap 0/4/6mm은 TBD (신규 실측 필요)

## 검증 쿼리

설치 완료 후 실행:

```sql
USE robot_welding;

-- 테이블 개수 확인 (14개 예상)
SELECT COUNT(*) AS table_count FROM information_schema.tables
WHERE table_schema = 'robot_welding';

-- welding_params 행수 (56개 예상)
SELECT COUNT(*) AS param_count FROM welding_params;

-- 자세×두께별 갭 수 (각 그룹 7개 예상)
SELECT posture, thickness_mm, COUNT(*) AS gap_count
FROM welding_params GROUP BY posture, thickness_mm;

-- 설정 데이터 확인
SELECT * FROM welding_defaults;
SELECT * FROM promotion_detection_config;
SELECT * FROM alarm_thresholds;
SELECT * FROM override_limits;
```

## 향후 스키마 변경

새로운 컬럼/테이블 필요 시:
1. `migrations/002_설명.sql` 파일 생성
2. `ALTER TABLE` 또는 `CREATE TABLE` 문장 작성
3. 실행 후 `schema_migrations` 테이블에 기록

## 백업

정기 백업 명령 예시:
```
mysqldump -u root -p robot_welding > backup_$(date +%Y%m%d).sql
```
