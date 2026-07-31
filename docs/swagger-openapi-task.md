# 작업 지시서: Swagger/OpenAPI 골격 추가

현재 프로젝트는 Node.js + Express + PostgreSQL 기반 영화 티켓 예매 API 서버다. 동시성 테스트, 예약 상태 모델, audit log 같은 기능 개선을 하기 전에, 현재 구현된 API 기준으로 Swagger/OpenAPI 문서화 골격을 먼저 추가하라.

## 목표

- 현재 Express API를 OpenAPI 문서로 정리한다.
- 브라우저에서 API 문서를 확인할 수 있도록 Swagger UI를 제공한다.
- 이후 기능 개선 시 API 계약 문서로 계속 확장할 수 있는 구조로 만든다.

## 반영해야 할 사항

1. `swagger-ui-express` 또는 OpenAPI JSON/YAML 기반 문서화를 추가한다.
   - 가능하면 의존성이 적고 관리하기 쉬운 방식으로 구현한다.
   - 추천 경로는 `/api-docs` 또는 `/docs` 중 하나로 정한다.
   - README에도 동일한 경로를 명시한다.

2. 현재 엔드포인트를 문서화한다.

현재 라우트 기준 문서화 대상:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /movies`
- `GET /movies/{movieId}/showtimes`
- `GET /movies/showtimes/{showtimeId}/seats`
- `POST /bookings`
- `GET /bookings/me`
- `DELETE /bookings/{bookingId}`

3. 인증 방식을 명시한다.
   - `POST /bookings`
   - `GET /bookings/me`
   - `DELETE /bookings/{bookingId}`
   - 위 3개 API는 Bearer JWT 인증이 필요하다.
   - OpenAPI `components.securitySchemes`에 `bearerAuth`를 정의한다.
   - 인증 방식은 `type: http`, `scheme: bearer`, `bearerFormat: JWT`를 사용한다.

4. 주요 응답 코드를 정리한다.
   - 공통적으로 아래 상태 코드를 문서화한다.
   - `200`: 조회/로그인 성공
   - `201`: 회원가입/예매 생성 성공
   - `204`: 예매 취소 성공
   - `400`: 잘못된 입력
   - `401`: 인증 실패 또는 토큰 누락
   - `404`: 리소스 없음
   - `409`: 이메일 중복 또는 좌석 중복 예매 충돌

5. 에러 응답 형식을 문서화한다.

현재 에러 응답 형식은 다음 구조를 사용한다.

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Seat is already booked"
  }
}
```

OpenAPI `components.schemas.ErrorResponse`로 정의하고, 주요 에러 응답에서 재사용하라.

## 구현 가이드

- OpenAPI 스펙 파일은 유지보수하기 쉬운 위치에 둔다.
  - 예: `src/docs/openapi.js`
  - 또는 `docs/openapi.yaml`
- Express 앱 생성부인 `src/app.js`에 Swagger UI 라우트를 등록한다.
- 정적 프론트엔드 라우트와 충돌하지 않도록 `/api-docs` 또는 `/docs`를 사용한다.
- 기존 API 동작은 변경하지 않는다.
- 기존 테스트가 깨지지 않아야 한다.
- 필요한 경우 `package.json`에 dependency를 추가한다.

## 문서에 포함할 주요 스키마

최소한 다음 스키마를 OpenAPI components에 정의하라.

- `RegisterRequest`
- `LoginRequest`
- `AuthResponse`
- `Movie`
- `Showtime`
- `Seat`
- `CreateBookingRequest`
- `Booking`
- `ErrorResponse`

응답 필드는 현재 서비스 코드와 테스트에서 확인되는 실제 응답 형태를 기준으로 작성한다.

## README 수정

README에 다음 내용을 추가하라.

- Swagger/OpenAPI 문서 접속 방법
- 예: 서버 실행 후 `http://localhost:3000/api-docs` 접속
- Bearer JWT가 필요한 API는 로그인/회원가입 응답의 token을 Swagger UI의 Authorize 버튼에 입력해서 테스트할 수 있다는 설명

## 검증

작업 후 다음을 실행해 확인한다.

```bash
npm test
```

가능하면 서버도 실행해 Swagger UI 접근 가능 여부를 확인한다.

```bash
npm start
```

브라우저에서 다음 URL 중 구현한 경로로 접속한다.

```text
http://localhost:3000/api-docs
```

또는

```text
http://localhost:3000/docs
```

## 주의사항

- 아직 동시성 테스트, 예약 상태 모델, audit log 기능은 구현하지 않는다.
- 이번 작업은 Swagger/OpenAPI 문서화 골격 추가에만 집중한다.
- API 응답 구조를 문서에 맞추기 위해 기존 코드를 바꾸지 않는다. 문서가 현재 코드를 따라가야 한다.
- README 한글 인코딩은 UTF-8로 정상이며, PowerShell 기본 인코딩에서만 깨져 보일 수 있으므로 불필요하게 재저장하지 않는다.
