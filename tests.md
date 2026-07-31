# 테스트 문서

이 문서는 `tests/` 경로에 작성된 자동화 테스트를 한눈에 파악하기 위한 요약입니다.

## 실행 명령

```bash
npm test
```

- 실행 대상: `tests/*.test.js`
- 현재 대상 파일: `tests/app.test.js`
- 특징: 실제 PostgreSQL 대신 인메모리 `FakeDb`를 사용해 빠르게 API 흐름을 검증합니다.

```bash
npm run test:integration
```

- 실행 대상: `tests/integration/*.test.js`
- 현재 대상 파일: `tests/integration/postgres-concurrency.test.js`
- 특징: `TEST_DATABASE_URL`이 설정된 경우 실제 PostgreSQL에서 동시성 시나리오를 검증합니다.
- 안전장치: `TEST_DATABASE_URL`의 DB 이름에 `test`가 포함되어야 합니다.

## 테스트 파일 요약

| 파일 | 구분 | 테스트명 | 주요 검증 |
| --- | --- | --- | --- |
| `tests/app.test.js` | 단위/API 흐름 테스트 | `auth, movie lookup, protected routes, booking, and duplicate booking flow` | 인증, 영화/상영 조회, 보호 라우트, 예매 생성/중복/취소/재예매, audit log |
| `tests/integration/postgres-concurrency.test.js` | PostgreSQL 통합 테스트 | `only one concurrent booking succeeds for the same showtime seat on PostgreSQL` | 동일 좌석 동시 예매 시 1건만 성공, 나머지는 409, 중복 실패 audit log |

## `tests/app.test.js`

### 목적

Express 앱을 `createApp(db)`로 생성하고, 실제 DB 대신 테스트 전용 `FakeDb`를 주입해 주요 API 흐름을 빠르게 검증합니다.

### 테스트 더블

- `FakeDb`
  - 사용자, 영화, 상영 회차, 좌석, 예매, 감사 로그 데이터를 메모리에 저장합니다.
  - 서비스 계층에서 사용하는 주요 SQL 패턴을 흉내 냅니다.
- `FakeClient`
  - `BEGIN`, `COMMIT`, `ROLLBACK`을 처리합니다.
  - 예매 생성 트랜잭션과 중복 예매 검사 흐름을 흉내 냅니다.

### 검증 시나리오

#### 인증

- 회원가입 성공 시 `201`을 반환합니다.
- 회원가입 응답에 사용자 이메일과 JWT token이 포함됩니다.
- 같은 이메일로 중복 회원가입 시 `409`를 반환합니다.
- 로그인 성공 시 `200`과 JWT token을 반환합니다.
- 잘못된 비밀번호로 로그인 시 `401`을 반환합니다.

#### 로그인 실패 Audit Log

- 로그인 실패 시 `LOGIN_FAILED` audit log가 생성됩니다.
- `actor_user_id`, `target_type`, `action`, `status`가 기대값과 일치합니다.
- 실패 사유로 `PASSWORD_MISMATCH`가 기록됩니다.
- 입력한 비밀번호가 audit log metadata에 저장되지 않습니다.

#### 영화 및 상영 조회

- `GET /movies`가 영화 목록을 반환합니다.
- `GET /movies/:movieId/showtimes`가 상영 회차를 반환합니다.
- 상영 회차 응답에 전체 좌석 수, 예매된 좌석 수, 남은 좌석 수, 영화 길이가 포함됩니다.
- 예매 전 좌석 수 계산이 `booked_seat_count = 0`, `remaining_seat_count = 2`로 동작합니다.

#### 보호 라우트

- 인증 없이 `POST /bookings`를 호출하면 `401`을 반환합니다.

#### 예매 생성

- 인증 후 `POST /bookings` 호출 시 `201`을 반환합니다.
- 생성된 예매의 `showtime_id`, `status`, `cancelled_at`, `version`이 기대값과 일치합니다.
- 예매 후 상영 회차의 예매 좌석 수와 남은 좌석 수가 갱신됩니다.
- 예매 후 좌석 상태 조회에서 해당 좌석의 `booked`가 `true`가 됩니다.

#### 예매 생성 Audit Log

- 예매 성공 시 `BOOKING_CREATED` audit log가 생성됩니다.
- `actor_user_id`, `target_type`, `target_id`, `status`가 기대값과 일치합니다.
- metadata에 `booking_status = CONFIRMED`가 기록됩니다.

#### 중복 예매 실패

- 같은 사용자가 같은 상영 회차의 같은 좌석을 다시 예매하면 `409`를 반환합니다.

#### 중복 예매 실패 Audit Log

- 중복 예매 실패 시 `DUPLICATE_BOOKING_FAILED` audit log가 생성됩니다.
- `actor_user_id`, `target_type`, `target_id`, `action`, `status`가 기대값과 일치합니다.
- metadata에 `reason = CONFIRMED_BOOKING_EXISTS`가 기록됩니다.

#### 타 사용자 취소 방지

- 다른 사용자가 기존 예매를 취소하려고 하면 `404`를 반환합니다.

#### 내 예매 목록

- `GET /bookings/me`가 현재 사용자의 확정 예매 목록을 반환합니다.
- 응답에 영화 제목, 좌석 코드, 예매 상태가 포함됩니다.

#### 예매 취소

- 예매 소유자가 `DELETE /bookings/:bookingId`를 호출하면 `204`를 반환합니다.
- 예매 row는 삭제되지 않고 `status = CANCELLED`로 변경됩니다.
- `cancelled_at`이 채워집니다.
- `version`이 증가합니다.

#### 예매 취소 Audit Log

- 예매 취소 성공 시 `BOOKING_CANCELLED` audit log가 생성됩니다.
- `actor_user_id`, `target_type`, `target_id`, `status`가 기대값과 일치합니다.
- metadata에 `previous_status = CONFIRMED`, `new_status = CANCELLED`가 기록됩니다.

#### 취소 후 조회 및 좌석 상태

- 취소된 예매는 `GET /bookings/me` 목록에 나타나지 않습니다.
- 취소 후 상영 회차의 예매 좌석 수와 남은 좌석 수가 다시 갱신됩니다.
- 취소 후 좌석 상태 조회에서 해당 좌석의 `booked`가 `false`가 됩니다.

#### 중복 취소 및 재예매

- 이미 취소된 예매를 다시 취소하면 `404`를 반환합니다.
- 취소된 좌석은 다시 예매할 수 있습니다.
- 재예매 결과는 `status = CONFIRMED`입니다.

## `tests/integration/postgres-concurrency.test.js`

### 목적

실제 PostgreSQL에서 동시 예매 충돌이 DB 제약 조건과 트랜잭션 흐름으로 안전하게 처리되는지 검증합니다.

### 실행 조건

- `TEST_DATABASE_URL` 환경 변수가 있어야 실행됩니다.
- `TEST_DATABASE_URL`의 DB 이름에 `test`가 포함되어야 합니다.
- 환경 변수가 없으면 테스트는 skip됩니다.

예시:

```powershell
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/movie_booking_test"
npm run test:integration
```

### 테스트 준비

- `migrations/` 아래의 모든 `.sql` 파일을 정렬된 순서로 적용합니다.
- 테스트 전용 영화, 상영 회차, 좌석을 생성합니다.
- 서로 다른 사용자 10명을 회원가입하고 JWT token을 확보합니다.

### 검증 시나리오

#### 동일 좌석 동시 예매

- 10명의 사용자가 같은 상영 회차의 같은 좌석 `A1`을 동시에 예매합니다.
- 정확히 1개 요청만 `201`로 성공해야 합니다.
- 나머지 9개 요청은 `409`로 실패해야 합니다.

#### 충돌 응답 형식

- 실패한 모든 응답은 다음 형식을 가져야 합니다.

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Seat is already booked"
  }
}
```

#### DB 최종 상태

- `bookings` 테이블에서 해당 상영 회차와 좌석의 `CONFIRMED` 예매는 정확히 1건이어야 합니다.

#### 중복 예매 실패 Audit Log

- `audit_logs` 테이블에 `DUPLICATE_BOOKING_FAILED` 로그가 실패 요청 수만큼 생성되어야 합니다.
- 현재 동시 사용자 수가 10명이므로 기대 로그 수는 9건입니다.

### 정리 작업

테스트 종료 후 생성한 데이터는 삭제합니다.

- 관련 `audit_logs`
- 관련 `bookings`
- 테스트 좌석
- 테스트 상영 회차
- 테스트 영화
- 테스트 사용자

## 현재 테스트가 직접 다루지 않는 범위

- OpenAPI 문서 내용의 정확성
- 정적 프론트엔드 화면 동작
- `npm run migrate`, `npm run seed` 명령 자체의 별도 자동 검증
- 인증 토큰 만료 시나리오
- 존재하지 않는 영화, 상영 회차, 좌석에 대한 모든 오류 케이스
- audit log 조회 API. 현재 프로젝트는 전체 감사 로그 조회 API를 제공하지 않고 DB 조회 SQL을 README에 문서화합니다.
