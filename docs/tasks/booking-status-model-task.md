# 작업 지시서: 예약 상태 모델 고도화

## 1. 배경

현재 프로젝트는 `bookings` 테이블의 row 존재 여부로 좌석 예매 여부를 판단한다.

- 예매 생성: `bookings` row insert
- 예매 취소: `bookings` row delete
- 좌석 점유 여부: `bookings` row 존재 여부로 판단

이 구조는 취소 이력을 남길 수 없고, 예매 상태 변화 추적이 어렵다.
예약 상태를 명시적으로 관리하도록 `bookings.status` 기반 모델로 고도화하라.

## 2. 목표

`bookings` 테이블에 예약 상태 컬럼을 추가하고, 예매/취소/조회/좌석 점유 판단 로직을 `status` 기준으로 변경한다.

상태 값은 최소 다음 두 가지를 지원한다.

- `CONFIRMED`: 확정 예매
- `CANCELLED`: 취소된 예매

또한 이력 추적과 동시성 제어를 위해 다음 컬럼을 고려해 반영하라.

- `cancelled_at`
- `updated_at`
- `version`

## 3. 현재 주요 파일

다음 파일을 우선 확인하고 수정하라.

- `migrations/002_add_booking_status.sql` 또는 이에 준하는 신규 증분 마이그레이션 파일
- `src/services/booking-service.js`
- `src/services/movie-service.js`
- `src/docs/openapi.js`
- `tests/app.test.js`
- `tests/integration/postgres-concurrency.test.js`
- `README.md`

## 4. 요구사항

### 4.1 DB 스키마 변경

기존에 적용된 마이그레이션 파일을 직접 수정하는 방식으로 끝내지 말고, 기존 DB에 적용 가능한 신규 증분 마이그레이션 파일을 추가하라.

권장 파일명:

- `migrations/002_add_booking_status.sql`

신규 마이그레이션은 `bookings` 테이블을 다음 방향으로 변경해야 한다.

- `status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'` 추가
- 허용 상태는 `CONFIRMED`, `CANCELLED`로 제한
- `cancelled_at TIMESTAMPTZ NULL` 추가
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` 추가
- `version INTEGER NOT NULL DEFAULT 1` 추가

기존 `UNIQUE (showtime_id, seat_id)` 제약은 취소 이력을 남기는 구조와 충돌할 수 있다.
동일 좌석에 대해 `CONFIRMED` 상태의 예약만 하나 존재하도록 PostgreSQL partial unique index를 사용하라.

예시 방향:

```sql
CREATE UNIQUE INDEX ...
ON bookings(showtime_id, seat_id)
WHERE status = 'CONFIRMED';
```

주의사항:

- 취소된 예약 row는 삭제하지 않는다.
- 취소된 좌석은 다시 예매 가능해야 한다.
- 같은 `showtime_id`, `seat_id`에 대해 `CANCELLED` 이력은 여러 개 존재할 수 있다.
- 같은 `showtime_id`, `seat_id`에 대해 `CONFIRMED` 예약은 동시에 하나만 존재해야 한다.
- 신규 DB를 처음 구성하는 흐름까지 고려해야 한다면 `001_init.sql`도 최종 스키마와 일치하도록 함께 갱신할 수 있다.
- 단, 이미 적용된 `001_init.sql` 수정만으로 작업을 끝내서는 안 되며, 기존 DB에 적용 가능한 증분 마이그레이션은 반드시 제공해야 한다.

### 4.2 예매 생성 로직 변경

`createBooking`은 새 예약을 `CONFIRMED` 상태로 생성해야 한다.

반환 값에는 다음 필드를 포함하라.

- `id`
- `user_id`
- `showtime_id`
- `seat_id`
- `status`
- `created_at`
- `updated_at`
- `cancelled_at`
- `version`

중복 예매 방지는 기존처럼 애플리케이션 로직에만 의존하지 말고, DB partial unique index로 최종 보장하라.

동시 요청 시 같은 좌석에 대해 성공 응답은 정확히 1개여야 하며, 나머지는 `409 Seat is already booked`로 처리되어야 한다.

### 4.3 예매 취소 로직 변경

현재는 `DELETE FROM bookings`로 row를 삭제한다.
이를 `UPDATE` 방식으로 변경하라.

취소 시 다음을 수행하라.

- `status = 'CANCELLED'`
- `cancelled_at = now()`
- `updated_at = now()`
- `version = version + 1`

취소 대상은 반드시 다음 조건을 만족해야 한다.

- `id = bookingId`
- `user_id = userId`
- `status = 'CONFIRMED'`

이미 취소된 예약을 다시 취소하려는 경우에는 실제 row가 있더라도 취소 가능한 예약이 아니므로 현재 API 의미에 맞춰 `404 Booking not found`로 처리한다.

### 4.4 예매 내역 조회 변경

`GET /bookings/me`의 동작 방식을 결정하고 일관되게 구현하라.

기본 요구사항은 다음과 같다.

- 사용자에게 보여주는 일반 예매 내역은 `CONFIRMED` 예약만 반환한다.
- 반환 객체에는 `status`, `created_at`, `updated_at`, `cancelled_at`을 포함한다.
- 취소 이력까지 보여주는 별도 API는 이번 작업 범위에 포함하지 않아도 된다.

단, README에는 현재 API가 확정 예약만 반환한다는 점을 명확히 문서화하라.

### 4.5 좌석 점유 판단 변경

`src/services/movie-service.js`의 좌석 수 계산과 좌석 점유 여부 판단을 수정하라.

현재는 `bookings` row 존재 여부로 판단한다.
변경 후에는 반드시 `status = 'CONFIRMED'`인 예약만 점유 좌석으로 계산해야 한다.

수정 대상 예시:

- `booked_seat_count`
- `remaining_seat_count`
- 좌석별 `booked` 값

`CANCELLED` 예약은 좌석 점유로 계산되면 안 된다.

### 4.6 테스트 수정 및 추가

기존 테스트를 상태 모델에 맞게 수정하고, 다음 시나리오를 반드시 검증하라.

- 예매 생성 시 `status`가 `CONFIRMED`이다.
- 예매 취소 후 row가 삭제되지 않고 `CANCELLED` 상태가 된다.
- 취소된 예약은 `GET /bookings/me`의 일반 목록에 나타나지 않는다.
- 취소된 좌석은 다시 예매할 수 있다.
- 좌석 목록과 상영 회차 잔여 좌석 수는 `CONFIRMED` 예약만 기준으로 계산한다.
- 같은 좌석에 대한 동시 예매 요청은 여전히 정확히 1개만 성공한다.
- 이미 취소된 예약을 다시 취소하면 `404`가 반환된다.

통합 테스트에서 DB를 직접 조회하는 경우, 단순 row count가 아니라 `status = 'CONFIRMED'` 기준 count를 확인하도록 수정하라.

### 4.7 OpenAPI 문서 수정

`src/docs/openapi.js`를 수정하라.

- Booking schema에 `status`, `updated_at`, `cancelled_at` 추가
- CreatedBooking schema에도 필요한 상태 필드 추가
- `status` enum은 `CONFIRMED`, `CANCELLED`
- 취소 API는 물리 삭제가 아니라 상태 변경이라는 설명을 반영

### 4.8 README 수정

README에 다음 내용을 반영하라.

- 예약 상태 모델 설명
- `CONFIRMED`, `CANCELLED` 의미
- 취소 시 row를 삭제하지 않고 상태를 변경한다는 점
- 좌석 점유 판단은 `CONFIRMED` 예약만 기준이라는 점
- 중복 예매 방지는 PostgreSQL partial unique index로 보장한다는 점

## 5. 구현 시 주의사항

- 기존 API 경로는 변경하지 않는다.
- 기존 응답 형식은 가능한 유지하되, 필요한 상태 필드는 추가한다.
- 취소된 예약 row를 삭제하지 않는다.
- `bookings` 존재 여부를 예매 여부로 해석하는 코드를 모두 찾아 `status = 'CONFIRMED'` 기준으로 수정한다.
- PostgreSQL 제약 조건이 최종 동시성 방어선이 되도록 한다.
- 불필요한 대규모 리팩터링은 하지 않는다.

## 6. 완료 조건

- [ ] 모든 단위 테스트가 통과한다.
- [ ] PostgreSQL 통합 동시성 테스트가 통과한다.
- [ ] 취소 후 같은 좌석을 다시 예매할 수 있다.
- [ ] 취소된 예약 이력이 DB에 남는다.
- [ ] 좌석 점유 수와 좌석별 `booked` 값이 `CONFIRMED` 예약만 기준으로 계산된다.
- [ ] OpenAPI와 README가 실제 동작과 일치한다.
