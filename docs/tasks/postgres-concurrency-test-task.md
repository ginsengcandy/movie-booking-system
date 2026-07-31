# 작업 지시서: PostgreSQL 기반 동시 예매 부하 테스트 추가

현재 프로젝트는 Node.js + Express + PostgreSQL 기반 영화 티켓 예매 API 서버다. 기존 `tests/app.test.js`는 인메모리 가짜 DB로 API 흐름과 순차 중복 예매를 검증한다. 이번 작업에서는 실제 PostgreSQL을 사용하는 통합 테스트를 추가해, 같은 좌석에 여러 사용자가 동시에 예매 요청을 보냈을 때 데이터 정합성이 지켜지는지 검증하라.

## 목표

- 실제 PostgreSQL 데이터베이스를 사용하는 통합 테스트를 추가한다.
- 같은 상영 회차의 같은 좌석에 여러 사용자가 동시에 예매 요청을 보냈을 때 정확히 1건만 성공하는지 검증한다.
- 실패한 나머지 요청이 모두 `409 Conflict`로 응답하는지 검증한다.
- 테스트가 기존 인메모리 단위/흐름 테스트와 분리되어 실행될 수 있게 한다.

## 핵심 검증 조건

동시 요청 수가 `N`개일 때 다음 조건을 모두 만족해야 한다.

- `POST /bookings` 동시 요청 중 성공 응답은 정확히 1개다.
- 성공 응답의 HTTP 상태 코드는 `201`이다.
- 나머지 `N - 1`개 응답의 HTTP 상태 코드는 모두 `409`다.
- `409` 응답 body는 기존 에러 형식과 일치해야 한다.

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Seat is already booked"
  }
}
```

- 테스트 종료 후 실제 `bookings` 테이블에도 해당 `showtime_id`, `seat_id` 조합의 row가 정확히 1개만 존재해야 한다.

## 테스트 방식

- 단순 단위 테스트나 Fake DB 테스트로 작성하지 않는다.
- 반드시 실제 PostgreSQL 커넥션을 사용한다.
- Express 앱은 기존 `createApp(db)` 구조를 재사용한다.
- HTTP 요청은 기존 테스트처럼 `supertest`를 사용해도 된다.
- 동시 요청은 `Promise.all` 또는 `Promise.allSettled`로 한 번에 발사한다.
- 테스트 러너는 현재 프로젝트의 Node.js 내장 test runner를 우선 사용한다.

## 권장 파일 구조

다음 중 하나의 방식으로 구현하라.

1. 별도 통합 테스트 파일 추가

```text
tests/postgres-concurrency.test.js
```

2. 또는 통합 테스트 전용 디렉터리 추가

```text
tests/integration/postgres-concurrency.test.js
```

기존 `tests/app.test.js`의 Fake DB 테스트와 섞지 않는 것을 권장한다.

## 환경 변수 및 안전장치

운영/개발 DB를 실수로 오염시키지 않도록 안전장치를 둔다.

- 통합 테스트는 `TEST_DATABASE_URL`이 있을 때만 실행한다.
- `TEST_DATABASE_URL`이 없으면 테스트를 skip 처리하거나, 별도 npm script에서만 실행되게 한다.
- 가능하면 데이터베이스 이름에 `test`가 포함되어 있는지 확인한다.
- 테스트 중 사용하는 데이터는 고유 prefix를 붙여 충돌을 줄인다.
  - 예: 이메일 `concurrency-user-${Date.now()}-${i}@example.com`
  - 영화 제목 `Concurrency Test Movie ${Date.now()}`

## npm scripts

기존 `npm test`는 빠른 인메모리 테스트로 유지하는 것을 권장한다.

통합 테스트 전용 script를 추가하라.

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "test:integration": "node --test tests/integration/*.test.js"
  }
}
```

파일 위치를 `tests/postgres-concurrency.test.js`로 잡는 경우에는 glob이 기존 `npm test`에 포함되지 않도록 script를 적절히 조정하라. 예를 들어 통합 테스트 파일명을 `*.integration.test.js`로 두고 다음처럼 분리할 수 있다.

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "test:integration": "node --test tests/*.integration.test.js"
  }
}
```

## 테스트 데이터 준비

테스트 안에서 필요한 최소 데이터만 직접 생성하라.

권장 순서:

1. PostgreSQL pool 생성
2. `migrations/001_init.sql`을 읽어 테스트 DB에 적용
3. 고유한 영화 1개 생성
4. 고유한 상영 회차 1개 생성
5. 대상 좌석 1개 생성
6. 동시 요청 수만큼 사용자 생성
7. 각 사용자로 로그인하거나 회원가입 응답의 JWT token을 사용
8. 모든 사용자가 같은 `showtimeId`와 같은 `seatCode`로 동시에 `POST /bookings` 요청
9. 응답 상태 코드와 DB row 수 검증
10. 생성한 테스트 데이터를 정리
11. pool 종료

## 정리 전략

테스트가 실패해도 데이터 정리가 되도록 `try/finally`를 사용하라.

삭제 순서는 FK 제약을 고려한다.

1. `bookings`
2. `seats`
3. `showtimes`
4. `movies`
5. `users`

테스트 데이터 식별을 위해 생성된 id 목록을 보관하고 해당 id만 삭제하라.

## 권장 테스트 시나리오

- 동시 요청 수는 5개 또는 10개 정도로 시작한다.
- 모든 사용자에게 서로 다른 JWT token을 발급한다.
- 모든 요청 payload는 동일하게 둔다.

예시 payload:

```json
{
  "showtimeId": 1,
  "seatCode": "A1"
}
```

검증 예시:

- status code 배열을 모은다.
- `201` 개수가 1인지 확인한다.
- `409` 개수가 `concurrentUserCount - 1`인지 확인한다.
- `409` 응답의 `error.code`가 `CONFLICT`인지 확인한다.
- DB에서 다음 쿼리 결과가 1인지 확인한다.

```sql
SELECT COUNT(*)::int AS count
FROM bookings
WHERE showtime_id = $1
  AND seat_id = $2;
```

## README 수정

README에 통합 테스트 실행 방법을 추가하라.

포함할 내용:

- 기존 `npm test`는 인메모리 테스트임을 유지 설명
- PostgreSQL 동시성 통합 테스트는 별도 실행
- `TEST_DATABASE_URL` 설정 예시
- 실행 명령

예시:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/movie_booking_test npm run test:integration
```

Windows PowerShell 예시도 함께 적으면 좋다.

```powershell
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/movie_booking_test"
npm run test:integration
```

## 주의사항

- 이번 작업은 실제 PostgreSQL 기반 동시 예매 통합 테스트 추가에 집중한다.
- 예약 상태 모델, audit log, 실시간 좌석 동기화 기능은 아직 구현하지 않는다.
- 기존 API 응답 구조를 테스트 편의를 위해 변경하지 않는다.
- 기존 인메모리 테스트가 계속 통과해야 한다.
- 통합 테스트가 로컬 PostgreSQL 준비 없이 기본 `npm test`에서 실패하지 않게 하라.
- 테스트 DB가 아닌 DB에 destructive cleanup을 수행하지 않도록 환경 변수와 데이터 식별 조건을 신중하게 둔다.
