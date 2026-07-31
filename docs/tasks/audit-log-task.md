# 작업 지시서: Audit Log 추가

## 1. 배경

현재 프로젝트는 Node.js + Express + PostgreSQL 기반 영화 예매 API 서버이다.
예매 생성, 예매 취소, 로그인 실패, 중복 예매 실패 같은 중요한 사용자 행위와 실패 이벤트를 API 응답만으로는 사후 추적하기 어렵다.

운영 관점에서는 다음 질문에 답할 수 있어야 한다.

- 누가 어떤 작업을 시도했는가?
- 언제 발생했는가?
- 어떤 데이터가 생성, 변경, 실패 처리되었는가?
- 실패했다면 왜 실패했는가?

이를 위해 `booking_events` 또는 `audit_logs` 테이블을 추가하고, 주요 비즈니스 이벤트를 구조적으로 기록한다.

## 2. 목표

감사 로그 테이블을 추가하고, 최소한 다음 이벤트를 기록한다.

- 예매 생성 성공
- 예매 취소 성공
- 로그인 실패
- 중복 예매 실패

로그는 사람이 읽을 수 있어야 하며, 동시에 나중에 API나 운영 쿼리에서 활용할 수 있도록 구조화되어야 한다.
특히 "누가 언제 어떤 데이터를 변경했는지"를 확인할 수 있게 설계한다.

## 3. 현재 주요 파일

작업 전 다음 파일을 우선 확인하라.

- `migrations/001_init.sql`
- `migrations/002_add_booking_status.sql`
- `src/services/auth-service.js`
- `src/services/booking-service.js`
- `src/routes/auth-routes.js`
- `src/routes/booking-routes.js`
- `src/docs/openapi.js`
- `tests/app.test.js`
- `tests/integration/postgres-concurrency.test.js`
- `README.md`

필요하다면 감사 로그 전용 서비스 파일을 새로 추가해도 된다.

예시:

- `src/services/audit-log-service.js`

## 4. 요구사항

### 4.1 DB 스키마 추가

기존 마이그레이션 파일을 직접 수정하는 방식으로 끝내지 말고, 기존 DB에 적용 가능한 신규 증분 마이그레이션 파일을 추가하라.

권장 파일명:

- `migrations/003_add_audit_logs.sql`

테이블명은 `audit_logs`를 권장한다.
단, 구현자가 명확한 이유가 있다면 `booking_events`를 선택해도 된다.
이 문서의 나머지 예시는 `audit_logs` 기준으로 작성한다.

권장 스키마:

```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  actor_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(50) NULL,
  target_id INTEGER NULL,
  action VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  message TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

필드 의미:

- `event_type`: `BOOKING_CREATED`, `BOOKING_CANCELLED`, `LOGIN_FAILED`, `DUPLICATE_BOOKING_FAILED` 같은 이벤트 이름
- `actor_user_id`: 작업을 수행한 사용자 ID. 로그인 실패처럼 사용자를 특정할 수 없으면 `NULL`
- `target_type`: 변경 또는 시도 대상. 예: `booking`, `user`, `seat`
- `target_id`: 대상 ID. 예매 생성 성공은 booking id, 취소 성공은 booking id
- `action`: `CREATE`, `CANCEL`, `LOGIN`, `BOOK`
- `status`: `SUCCESS` 또는 `FAILED`
- `message`: 사람이 읽을 수 있는 간단한 설명
- `metadata`: 변경 대상 상세 정보, 실패 사유, 요청 식별 정보 등을 담는 JSONB
- `ip_address`, `user_agent`: 요청 컨텍스트를 기록할 수 있으면 저장
- `created_at`: 이벤트 발생 시각

권장 인덱스:

```sql
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);
```

주의사항:

- 비밀번호, JWT, password hash 같은 민감 정보는 절대 저장하지 않는다.
- 로그인 실패 시 입력된 비밀번호는 저장하지 않는다.
- 이메일은 정책상 허용한다면 `metadata.email`에 저장할 수 있지만, 과도한 개인정보 저장은 피한다.

### 4.2 Audit Log 작성 유틸리티 또는 서비스 추가

감사 로그 삽입 로직이 여러 서비스에 흩어지지 않도록 공통 함수를 추가하라.

권장 파일:

- `src/services/audit-log-service.js`

권장 함수 형태:

```js
export async function recordAuditLog(clientOrPool, log) {
  // audit_logs INSERT
}
```

설계 기준:

- 예매 생성, 취소처럼 비즈니스 트랜잭션과 함께 기록되어야 하는 이벤트는 같은 DB client와 transaction 안에서 기록한다.
- 로그인 실패처럼 별도 트랜잭션이 없어도 되는 이벤트는 pool을 통해 독립적으로 기록해도 된다.
- 감사 로그 기록 실패가 원래 API 에러를 덮어쓰지 않도록 주의한다.
- 성공 이벤트는 가능하면 원래 작업과 같은 트랜잭션에 포함해 데이터와 로그의 정합성을 맞춘다.

### 4.3 예매 생성 성공 로그

`src/services/booking-service.js`의 예매 생성 로직에 로그를 추가하라.

예매 생성 성공 시 다음 정보를 기록한다.

- `event_type`: `BOOKING_CREATED`
- `actor_user_id`: 인증된 사용자 ID
- `target_type`: `booking`
- `target_id`: 생성된 booking id
- `action`: `CREATE`
- `status`: `SUCCESS`
- `metadata`: 최소한 `booking_id`, `showtime_id`, `seat_id`, `user_id`, `booking_status` 포함

예매 생성과 감사 로그 기록은 같은 트랜잭션 안에서 처리하는 것을 권장한다.

### 4.4 예매 취소 성공 로그

예매 취소 성공 시 다음 정보를 기록한다.

- `event_type`: `BOOKING_CANCELLED`
- `actor_user_id`: 인증된 사용자 ID
- `target_type`: `booking`
- `target_id`: 취소된 booking id
- `action`: `CANCEL`
- `status`: `SUCCESS`
- `metadata`: 최소한 `booking_id`, `showtime_id`, `seat_id`, `previous_status`, `new_status`, `cancelled_at` 포함

현재 프로젝트가 booking status 모델을 사용하고 있으므로 취소는 물리 삭제가 아니라 `status = 'CANCELLED'` 변경으로 처리되어야 한다. 감사 로그에는 상태 변경 전후가 드러나야 한다.

### 4.5 로그인 실패 로그

`src/services/auth-service.js` 또는 로그인 라우트 처리 흐름에 로그인 실패 로그를 추가하라.

로그인 실패 시 다음 정보를 기록한다.

- `event_type`: `LOGIN_FAILED`
- `actor_user_id`: 사용자를 특정할 수 있으면 해당 user id, 아니면 `NULL`
- `target_type`: `user`
- `target_id`: 사용자를 특정할 수 있으면 user id, 아니면 `NULL`
- `action`: `LOGIN`
- `status`: `FAILED`
- `message`: 실패 사유 요약. 예: `Invalid credentials`
- `metadata`: `email`, `reason` 등. 비밀번호는 절대 포함하지 않는다.

권장 실패 사유:

- 존재하지 않는 이메일
- 비밀번호 불일치

단, API 응답 메시지는 기존 보안 정책을 유지해도 된다.
예를 들어 외부 응답은 계속 `Invalid credentials`로 통일하고, 내부 audit log의 `metadata.reason`에만 세부 사유를 남길 수 있다.

### 4.6 중복 예매 실패 로그

같은 상영 시간과 좌석에 대해 이미 확정 예매가 있어 `409 Seat is already booked`가 발생하는 경우 로그를 기록하라.

중복 예매 실패 시 다음 정보를 기록한다.

- `event_type`: `DUPLICATE_BOOKING_FAILED`
- `actor_user_id`: 인증된 사용자 ID
- `target_type`: `seat`
- `target_id`: 요청한 seat id
- `action`: `BOOK`
- `status`: `FAILED`
- `message`: `Seat is already booked`
- `metadata`: `showtime_id`, `seat_id`, `user_id`, `reason` 포함

동시성 상황에서 DB unique constraint 또는 partial unique index에 의해 실패하는 경우도 이 로그가 남아야 한다.
애플리케이션 사전 검사에서 중복을 발견한 경우와 DB 충돌에서 발견한 경우 모두 처리하라.

### 4.7 요청 컨텍스트 기록

가능하면 로그에 다음 요청 컨텍스트를 포함하라.

- `ip_address`: `req.ip`
- `user_agent`: `req.get('user-agent')`

서비스 계층에 `req` 전체를 넘기기보다 필요한 값만 명시적으로 전달하는 방식을 권장한다.

예시:

```js
const requestContext = {
  ipAddress: req.ip,
  userAgent: req.get('user-agent')
};
```

기존 서비스 함수 시그니처를 변경해야 한다면 호출부와 테스트를 함께 수정하라.

### 4.8 Audit Log 조회 API

이번 작업의 핵심은 기록이다.
조회 API는 필수는 아니지만, "누가 언제 어떤 데이터를 변경했는지 보여주는 것"이 중요하므로 다음과 같이 README에 운영 쿼리를 문서화하라.

- API를 추가하지 않는 대신, `audit_logs` 테이블에서 actor, event_type, created_at 기준으로 확인하는 SQL 예시를 README에 추가한다.

권장 SQL 예시:

```sql
SELECT id, event_type, actor_user_id, target_type, target_id, action, status, message, metadata, created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 50;
```

관리자 권한 모델이 없는 상태에서 무리하게 전체 감사 로그 공개 API를 만들지 않는 편을 권장한다.

### 4.9 OpenAPI 문서 수정

조회 API를 추가하지 않았다면 OpenAPI 변경은 생략해도 된다.

### 4.10 README 수정

README에 다음 내용을 반영하라.

- 감사 로그 기능의 목적
- 기록되는 이벤트 목록
- `audit_logs` 테이블 주요 필드 설명
- 민감 정보는 로그에 저장하지 않는다는 정책
- 감사 로그 확인 방법
- 조회 API를 추가하지 않았다면 SQL로 확인하는 방법

## 5. 테스트 요구사항

기존 테스트를 깨뜨리지 말고, 다음 시나리오를 자동화 테스트로 검증하라.

- 예매 생성 성공 시 `BOOKING_CREATED` 로그가 생성된다.
- 예매 취소 성공 시 `BOOKING_CANCELLED` 로그가 생성된다.
- 로그인 실패 시 `LOGIN_FAILED` 로그가 생성된다.
- 중복 예매 실패 시 `DUPLICATE_BOOKING_FAILED` 로그가 생성된다.
- 로그인 실패 로그에 비밀번호가 저장되지 않는다.
- 중복 예매 동시성 테스트에서도 실패한 요청에 대한 audit log가 남는다.

테스트에서 DB를 직접 조회하는 방식으로 검증해도 된다.

권장 확인 쿼리:

```sql
SELECT *
FROM audit_logs
WHERE event_type = 'BOOKING_CREATED'
ORDER BY created_at DESC;
```

## 6. 구현 시 주의사항

- 기존 API 경로와 응답 형식을 불필요하게 변경하지 않는다.
- 감사 로그 때문에 기존 성공/실패 의미가 바뀌면 안 된다.
- 감사 로그에 비밀번호, JWT, password hash를 저장하지 않는다.
- 예매 성공/취소 성공 로그는 원본 데이터 변경과 정합성이 맞아야 한다.
- 중복 예매 실패는 애플리케이션 검사 실패와 DB constraint 실패를 모두 고려한다.
- `metadata`는 JSONB로 저장해 확장 가능하게 만든다.
- 테스트에서 이벤트 개수를 검증할 때 기존 seed나 다른 테스트의 로그와 충돌하지 않도록 조건을 구체적으로 둔다.
- 현재 프로젝트에 관리자 권한 모델이 없다면 전체 audit log 조회 API 공개는 신중하게 결정한다.

## 7. 검증 명령

작업 후 다음 명령을 실행해 확인하라.

```bash
npm test
```

PostgreSQL 통합 테스트 환경을 사용할 수 있다면 다음도 실행하라.

```bash
npm run test:integration
```

마이그레이션 적용도 별도로 검증하라.

```bash
npm run migrate
```

## 8. 완료 조건

- [ ] `audit_logs` 또는 `booking_events` 테이블을 생성하는 신규 마이그레이션이 추가되었다.
- [ ] 예매 생성 성공 로그가 남는다.
- [ ] 예매 취소 성공 로그가 남는다.
- [ ] 로그인 실패 로그가 남는다.
- [ ] 중복 예매 실패 로그가 남는다.
- [ ] 감사 로그에서 누가, 언제, 어떤 데이터에 어떤 작업을 했는지 확인할 수 있다.
- [ ] 민감 정보가 감사 로그에 저장되지 않는다.
- [ ] 관련 자동화 테스트가 추가 또는 수정되었다.
- [ ] README와 필요한 경우 OpenAPI 문서가 실제 동작과 일치한다.
- [ ] `npm test`가 통과한다.
- [ ] 가능한 환경에서는 `npm run test:integration`도 통과한다.
