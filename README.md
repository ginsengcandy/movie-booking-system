# 영화 티켓 예매 시스템

Node.js와 PostgreSQL로 구현한 영화 티켓 예매 시스템입니다. 회원가입/로그인, 영화 및 상영 시간 조회, 좌석 예매, 내 예매 내역 조회/취소 API를 제공하며, 같은 서버에서 정적 프론트엔드를 함께 서빙해 브라우저에서 전체 흐름을 확인할 수 있습니다.

## 1. 실행 방법

### 사전 요구사항

- Node.js 20 이상
- npm 10 이상
- PostgreSQL 14 이상

개발 및 검증에 사용한 버전:

- Node.js v24.11.1
- npm 11.6.2

### 환경 변수 설정

`.env.example`을 참고해 `.env`를 생성합니다.

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/movie_booking
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=1h
BCRYPT_ROUNDS=10
```

`JWT_SECRET`은 실제 환경에서 충분히 긴 난수 문자열로 설정해야 합니다.

### 데이터베이스 준비

PostgreSQL에서 데이터베이스를 생성합니다.

```sql
CREATE DATABASE movie_booking;
```

의존성을 설치하고 스키마와 샘플 데이터를 적용합니다.

```bash
npm install
npm run migrate
npm run seed
```

### 애플리케이션 실행

```bash
npm start
```

기본 서버 주소는 `http://localhost:3000`입니다.

브라우저에서 `http://localhost:3000`에 접속하면 프론트엔드 화면으로 회원가입, 로그인, 영화 선택, 상영 시간 선택, 좌석 예매, 내 예매 내역 조회를 확인할 수 있습니다.

Swagger/OpenAPI 문서는 서버 실행 후 `http://localhost:3000/api-docs`에서 확인할 수 있습니다. Bearer JWT가 필요한 예매 API는 회원가입 또는 로그인 응답의 `token` 값을 Swagger UI의 `Authorize` 버튼에 입력해 테스트할 수 있습니다.

프론트엔드 확인 순서:

1. 회원가입 또는 로그인
2. 영화 선택
3. 상영 시간 선택
4. 예매 가능한 좌석 선택
5. `선택 좌석 예매` 클릭
6. `내 예매` 영역에서 예매 내역 확인
7. `예매 취소` 클릭 후 좌석 상태와 내 예매 내역 갱신 확인

### 테스트 실행

```bash
npm test
```

기본 테스트는 빠른 재현성을 위해 인메모리 가짜 DB 어댑터로 API 흐름을 검증합니다. 실제 PostgreSQL 동시성 검증은 별도 통합 테스트로 실행합니다.

PostgreSQL 기반 동시 예매 통합 테스트는 `TEST_DATABASE_URL`이 설정된 경우에만 실행됩니다. 안전을 위해 테스트 데이터베이스 이름에는 `test`가 포함되어야 합니다. `TEST_DATABASE_URL`은 `.env`에 추가하거나 셸 환경 변수로 설정할 수 있습니다.

`.env`에 추가하는 경우:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/movie_booking_test
```

그다음 통합 테스트를 실행합니다.

```bash
npm run test:integration
```

셸에서 일회성으로 설정하는 경우:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/movie_booking_test npm run test:integration
```

Windows PowerShell에서는 다음처럼 실행합니다.

```powershell
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/movie_booking_test"
npm run test:integration
```

통합 테스트는 같은 좌석에 여러 사용자가 동시에 예매 요청을 보냈을 때 1건만 성공하고 나머지가 `409 Conflict`로 응답하는지 실제 PostgreSQL 트랜잭션과 유니크 제약 조건 기준으로 검증합니다.

## 2. 프로젝트 구조 설명

```text
.
├── migrations/                  # PostgreSQL 스키마 및 증분 마이그레이션
├── scripts/migrate.js           # 마이그레이션 실행 스크립트
├── scripts/seed.js              # 샘플 영화, 상영 회차, 좌석 생성
├── src/
│   ├── app.js                   # Express 앱 조립
│   ├── server.js                # 서버 시작점
│   ├── config/env.js            # 환경 변수 로딩
│   ├── db/pool.js               # PostgreSQL 커넥션 풀
│   ├── docs/openapi.js          # Swagger/OpenAPI 스펙
│   ├── middleware/              # 인증 및 오류 처리
│   ├── routes/                  # REST API 라우터
│   ├── services/                # 비즈니스 로직
│   └── utils/                   # 공통 유틸리티
├── public/                      # 정적 프론트엔드
│   ├── index.html               # 브라우저 화면 구조
│   ├── styles.css               # 화면 스타일
│   └── app.js                   # API 연동 및 화면 상태 관리
└── tests/
    ├── app.test.js              # 핵심 기능 자동 테스트
    └── integration/             # PostgreSQL 기반 통합 테스트
```

## 3. 설계 의도

- API 중심 백엔드를 먼저 구현하고, 기능 확인을 쉽게 하기 위한 정적 프론트엔드를 Express에서 함께 서빙합니다. 별도 프론트엔드 빌드 단계가 없어 실행 재현성이 단순합니다.
- Express를 선택했습니다. 작은 REST API를 빠르게 구성하기 쉽고 라우트, 미들웨어, 테스트 생태계가 단순합니다.
- ORM 대신 `pg`를 사용했습니다. 좌석 중복 예매 방지처럼 데이터베이스 제약 조건과 트랜잭션이 중요한 부분을 명시적으로 다루기 위해서입니다.
- 인증은 JWT Bearer 토큰 방식입니다. 서버 세션 저장소 없이 보호된 API를 검증하기 쉽습니다.
- 비밀번호는 `bcryptjs`로 해시해 저장합니다. 평문 비밀번호는 저장하지 않습니다.
- 입력 검증은 `zod`로 서비스 계층에서 일관되게 수행합니다.
- 프론트엔드는 HTML/CSS/Vanilla JavaScript로 구현했습니다. 과제 핵심 기능을 직접 조작해 확인하는 목적이므로 별도 SPA 프레임워크는 사용하지 않았습니다.

## 4. 고려한 사항

### 데이터 모델

- `users`: 사용자 계정. `email`은 유니크입니다.
- `movies`: 영화 정보. 샘플 데이터 재실행성을 위해 `title`은 유니크입니다.
- `showtimes`: 영화별 상영 회차.
- `seats`: 상영 회차별 좌석. 같은 상영 회차 안에서 좌석 코드는 유니크입니다.
- `bookings`: 사용자 예매. 사용자, 상영 회차, 좌석 관계와 예약 상태를 저장합니다.

좌석은 `A1`, `A2`, `B1` 같은 짧은 코드 문자열로 표현합니다. 샘플 데이터는 각 상영 회차마다 8개 좌석을 생성합니다.

### 예약 상태 모델

예매는 `bookings.status`로 상태를 관리합니다.

- `CONFIRMED`: 확정 예매입니다. 좌석 점유, 잔여석 계산, 내 예매 목록 조회의 기준이 됩니다.
- `CANCELLED`: 취소된 예매입니다. 이력 추적을 위해 row를 삭제하지 않고 상태만 변경합니다.

예매 취소 시 `DELETE`로 row를 제거하지 않고 `status = 'CANCELLED'`, `cancelled_at = now()`, `updated_at = now()`, `version = version + 1`로 갱신합니다. `GET /bookings/me`는 일반 사용자 화면용 API이므로 `CONFIRMED` 예약만 반환합니다. 취소 이력 조회 API는 별도로 제공하지 않습니다.

### 좌석 중복 예매 방지 방법

중복 예매는 두 겹으로 차단합니다.

1. 서비스 계층에서 예매 생성 시 트랜잭션을 시작합니다.
2. `bookings` 테이블에 `status = 'CONFIRMED'` 예약만 대상으로 하는 PostgreSQL partial unique index를 둡니다.

동시에 같은 좌석 예매 요청이 들어와도 PostgreSQL의 partial unique index 때문에 확정 예약은 하나만 성공하고 나머지는 `23505` 오류가 발생합니다. 애플리케이션은 이를 `409 CONFLICT`와 `Seat is already booked` 응답으로 변환합니다. 취소된 예약은 좌석 점유로 계산하지 않으므로, `CANCELLED` 상태가 된 좌석은 다시 예매할 수 있습니다.

### 오류 응답

오류 응답은 다음 형식을 사용합니다.

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Seat is already booked"
  }
}
```

비밀번호, 토큰, 내부 스택 트레이스는 오류 응답에 포함하지 않습니다.

### 프론트엔드 동작

- `public/index.html`은 인증, 영화 목록, 상영 시간, 좌석 선택, 내 예매 영역을 한 화면에 배치합니다.
- `public/app.js`는 REST API를 호출하고 JWT를 `localStorage`에 저장해 로그인 상태를 유지합니다.
- 상영 시간 선택 화면은 각 회차의 잔여석과 전체 좌석 수를 `잔여석 n/m` 형식으로 표시합니다.
- 좌석 화면은 `GET /movies/showtimes/:showtimeId/seats` 응답을 기준으로 이미 예매된 좌석을 비활성화합니다.
- 예매 성공 또는 실패 후 좌석 상태와 내 예매 내역을 다시 조회해 화면과 데이터베이스 상태가 어긋나지 않도록 했습니다.
- 예매 취소 성공 후에도 좌석 상태와 내 예매 내역을 다시 조회해 취소된 좌석이 즉시 다시 선택 가능하도록 했습니다.

## API 사용 예시

### 회원가입

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\",\"password\":\"password123\",\"name\":\"User\"}"
```

### 로그인

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\",\"password\":\"password123\"}"
```

### 영화 목록 조회

```bash
curl http://localhost:3000/movies
```

### 상영 시간 조회

```bash
curl http://localhost:3000/movies/1/showtimes
```

### 좌석 상태 조회

```bash
curl http://localhost:3000/movies/showtimes/1/seats
```

### 좌석 예매

```bash
curl -X POST http://localhost:3000/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d "{\"showtimeId\":1,\"seatCode\":\"A1\"}"
```

### 내 예매 내역 조회

```bash
curl http://localhost:3000/bookings/me \
  -H "Authorization: Bearer <TOKEN>"
```

### 내 예매 취소

```bash
curl -X DELETE http://localhost:3000/bookings/1 \
  -H "Authorization: Bearer <TOKEN>"
```

## 선택적으로 구현한 추가 내용

- `/health` 헬스 체크 API
- 샘플 데이터 재실행 가능성
- 서비스 계층 단위 교체가 가능한 `createApp(db)` 구조
- 서버에서 함께 제공되는 정적 프론트엔드
- 프론트엔드 좌석 상태 표시를 위한 `GET /movies/showtimes/:showtimeId/seats` API

## 알려진 제한 사항

- 프론트엔드는 과제 기능 확인을 위한 정적 HTML/CSS/JavaScript로 구현했습니다. 별도 빌드 도구나 SPA 라우팅은 사용하지 않습니다.
- 테스트는 API 핵심 흐름을 인메모리 가짜 DB로 검증합니다. 실제 PostgreSQL 환경의 동시 요청 부하 테스트는 별도 도구로 추가할 수 있습니다.
- 좌석 배치도나 결제 기능은 과제 범위를 벗어나므로 구현하지 않았습니다.

## Audit Log

중요한 사용자 행위와 실패 이벤트는 `audit_logs` 테이블에 기록합니다.

기록 대상 이벤트:

- `BOOKING_CREATED`: 예매 생성 성공
- `BOOKING_CANCELLED`: 예매 취소 성공
- `LOGIN_FAILED`: 로그인 실패
- `DUPLICATE_BOOKING_FAILED`: 중복 예매 실패

주요 필드:

- `event_type`: 이벤트 종류
- `actor_user_id`: 작업을 수행한 사용자 ID. 사용자를 특정할 수 없으면 `NULL`
- `target_type`, `target_id`: 변경 또는 시도 대상
- `action`: `CREATE`, `CANCEL`, `LOGIN`, `BOOK`
- `status`: `SUCCESS` 또는 `FAILED`
- `message`: 운영자가 읽을 수 있는 간단한 설명
- `metadata`: 예매 ID, 상영 회차 ID, 좌석 ID, 실패 사유 등 구조화된 부가 정보
- `ip_address`, `user_agent`: 요청 컨텍스트
- `created_at`: 이벤트 발생 시각

예매 생성과 취소 성공 로그는 원본 데이터 변경과 같은 트랜잭션에서 기록합니다. 중복 예매 실패는 서비스 사전 검사와 PostgreSQL unique constraint 충돌 양쪽에서 기록될 수 있도록 처리합니다. 로그인 실패 로그에는 이메일과 실패 사유만 남기며 비밀번호, JWT, password hash 같은 민감 정보는 저장하지 않습니다.

현재 별도 관리자 권한 모델이 없으므로 전체 감사 로그 조회 API는 공개하지 않습니다. 운영 확인은 DB에서 직접 조회합니다.

```sql
SELECT id,
       event_type,
       actor_user_id,
       target_type,
       target_id,
       action,
       status,
       message,
       metadata,
       created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 50;
```
