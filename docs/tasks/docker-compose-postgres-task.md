# 작업 지시서: Docker Compose 기반 PostgreSQL 실행 환경 추가

현재 프로젝트는 Node.js + Express + PostgreSQL 기반 영화 티켓 예매 API 서버다. 로컬 PostgreSQL 설치와 수동 DB 생성 없이도 평가자나 개발자가 동일한 데이터베이스 환경을 재현할 수 있도록 Docker Compose 기반 PostgreSQL 실행 환경을 추가하라.

## 작업 취지

이번 작업의 핵심 목적은 기능 추가가 아니라 실행 재현성과 검증 편의성을 높이는 것이다.

- 평가자가 PostgreSQL을 직접 설치하거나 계정/포트를 맞추지 않아도 프로젝트를 실행할 수 있게 한다.
- 개발 DB와 통합 테스트 DB를 코드로 관리해 "내 환경에서는 된다" 문제를 줄인다.
- 실제 PostgreSQL 기반 동시성 통합 테스트를 더 쉽게 실행할 수 있게 한다.
- DB 포함 실행 환경을 코드로 관리하는 백엔드 실무 감각을 보여준다.

## 목표

- `docker-compose.yml` 또는 Compose v2 기준 `compose.yaml`을 추가한다.
- PostgreSQL 컨테이너 하나로 개발 DB와 테스트 DB를 사용할 수 있게 한다.
- 기존 `npm run migrate`, `npm run seed`, `npm run test:integration` 흐름과 자연스럽게 연결한다.
- README에 Docker Compose 기반 실행 방법을 추가한다.
- 기존 API 코드와 테스트 로직은 불필요하게 변경하지 않는다.

## 권장 구성

Compose 서비스 이름은 명확하게 둔다.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: ticketing-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: movie_booking
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d movie_booking"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres_data:
```

파일명은 `docker-compose.yml` 또는 `compose.yaml` 중 하나를 선택하라. 프로젝트 루트에서 바로 `docker compose up -d`가 동작해야 한다.

## 테스트 DB 생성

통합 테스트는 `TEST_DATABASE_URL`로 `movie_booking_test`에 접속한다. 따라서 Compose 환경에서 테스트 DB도 자동으로 생성되게 하라.

권장 방식:

- `docker/postgres/init/001-create-test-db.sql` 추가
- PostgreSQL 공식 이미지의 `/docker-entrypoint-initdb.d` 초기화 스크립트를 사용

예시:

```sql
CREATE DATABASE movie_booking_test;
```

주의:

- 이 init script는 볼륨이 처음 생성될 때만 실행된다.
- 이미 `postgres_data` 볼륨이 만들어진 뒤 init script를 추가했다면, README에 볼륨 재생성 방법을 짧게 안내한다.
- 단, 일반 사용 흐름에서 destructive command를 기본 안내로 앞세우지 않는다.

## 환경 변수

`.env.example`을 Docker Compose 기본값과 맞춘다.

필수로 포함할 값:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/movie_booking
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/movie_booking_test
```

이미 값이 있다면 형식과 설명만 정리하라. 따옴표가 없어도 dotenv가 읽을 수 있으므로 일관된 형태를 유지한다.

## README 수정

README의 실행 방법에 Docker Compose 기반 DB 실행 흐름을 추가하라.

포함할 내용:

1. Docker Desktop 또는 Docker Engine 필요
2. PostgreSQL 컨테이너 실행

```bash
docker compose up -d
```

3. `.env.example`을 참고해 `.env` 준비
4. 마이그레이션 및 seed 실행

```bash
npm install
npm run migrate
npm run seed
```

5. 서버 실행

```bash
npm start
```

6. 통합 테스트 실행

```bash
npm run test:integration
```

7. 종료 명령

```bash
docker compose down
```

선택적으로 볼륨까지 지우는 명령은 별도 주의 문구와 함께 적는다.

```bash
docker compose down -v
```

이 명령은 컨테이너 DB 데이터를 삭제한다는 점을 분명히 설명하라.

## npm scripts 검토

필요하다면 편의 script를 추가할 수 있다. 단, 과한 자동화는 피한다.

선택 예시:

```json
{
  "scripts": {
    "db:up": "docker compose up -d",
    "db:down": "docker compose down"
  }
}
```

추가 여부는 프로젝트 단순성을 기준으로 판단하라. 추가한다면 README에 반영한다.

## 검증

작업 후 가능한 범위에서 다음을 확인하라.

```bash
docker compose config
```

Docker가 사용 가능한 환경이면 다음도 확인한다.

```bash
docker compose up -d
npm run migrate
npm run seed
npm test
npm run test:integration
docker compose down
```

Docker가 현재 환경에서 실행 불가능하면, 그 사실을 최종 보고에 명확히 적고 최소한 `docker compose config` 또는 파일 문법 확인이 가능한 범위까지 검증한다.

## 주의사항

- 이번 작업은 Docker Compose 기반 PostgreSQL 실행 환경 추가에 집중한다.
- 애플리케이션 서버까지 Docker Compose에 포함할 필요는 없다. 필요 이상으로 범위를 키우지 않는다.
- 예약 상태 모델, audit log, 실시간 좌석 동기화 같은 기능은 구현하지 않는다.
- 기존 PostgreSQL 연결 문자열과 통합 테스트의 `TEST_DATABASE_URL` 규칙을 깨지 않는다.
- 통합 테스트는 실제 PostgreSQL에서 실행되어야 한다는 기존 의도를 유지한다.
- `.env` 파일은 로컬 비밀값이므로 수정하지 않는다. 필요한 기본값은 `.env.example`만 수정한다.
- 이미 존재하는 사용자 변경이나 문서 이동을 되돌리지 않는다.
