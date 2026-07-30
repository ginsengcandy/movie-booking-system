# 트러블슈팅

## `npm run migrate` 실행 시 PostgreSQL 비밀번호 인증 실패

### 증상

`npm run migrate`를 실행하면 `migrations/001_init.sql`이 적용되기 전에 실패한다.

```text
error: password authentication failed for user "postgres"
code: '28P01'
```

터미널 인코딩 문제로 한글 에러 메시지가 깨져 보일 수 있다. 이 경우에도 PostgreSQL 에러 코드 `28P01`을 보면 비밀번호 인증 실패인지 판단할 수 있다.

### 원인

애플리케이션은 `.env` 파일의 `DATABASE_URL` 값을 사용해서 PostgreSQL에 접속한다.

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/movie_booking
```

이 URL에서 두 번째 `postgres`가 비밀번호다.

```text
postgres://사용자명:비밀번호@호스트:포트/DB명
```

즉 위 예시는 다음 접속 정보를 의미한다.

```text
사용자명: postgres
비밀번호: postgres
호스트: localhost
포트: 5432
DB명: movie_booking
```

에러 `28P01`은 로컬 PostgreSQL의 `postgres` 계정 실제 비밀번호와 `.env`에 적힌 비밀번호가 다를 때 발생한다.

### 해결 방법

`.env`의 `DATABASE_URL`에 실제 PostgreSQL 비밀번호를 적는다.

```env
DATABASE_URL=postgres://postgres:<실제-비밀번호>@localhost:5432/movie_booking
```

데이터베이스가 아직 없다면 PostgreSQL에서 먼저 생성한다.

```sql
CREATE DATABASE movie_booking;
```

그 다음 마이그레이션을 다시 실행한다.

```bash
npm run migrate
```

## `npm run seed` 실행 시 `inconsistent types deduced for parameter $3` 에러

### 증상

`npm run seed`를 실행하면 샘플 상영 시간 데이터를 넣는 과정에서 실패한다.

```text
error: inconsistent types deduced for parameter $3
code: '42P08'
detail: 'text 형과 character varying 형'
```

### 원인

`scripts/seed.js`의 상영 시간 insert 쿼리에서 PostgreSQL 파라미터 placeholder를 사용했다.

```sql
SELECT $1, $2, $3
```

실제 값은 JavaScript 배열로 따로 전달된다.

```js
[existingMovie.id, startsAt, auditorium]
```

따라서 각 placeholder의 의미는 다음과 같다.

```text
$1 = existingMovie.id
$2 = startsAt
$3 = auditorium
```

여기서 `$3`는 세 번째 파라미터이며, `"A관"` 같은 상영관 이름이다.

문제가 된 쿼리는 `$3`를 두 군데에서 사용했다.

```sql
SELECT $3
```

그리고:

```sql
auditorium = $3
```

PostgreSQL은 쿼리를 실행하기 전에 각 파라미터의 타입을 하나로 확정해야 한다. 그런데 위 쿼리에서는 `$3`가 한쪽에서는 일반 문자열인 `text`처럼 보이고, 다른 쪽에서는 `auditorium` 컬럼과 비교되면서 `VARCHAR(50)`처럼 보였다.

`auditorium` 컬럼은 마이그레이션에서 다음처럼 정의되어 있다.

```sql
auditorium VARCHAR(50) NOT NULL
```

그래서 PostgreSQL이 `$3`의 타입을 `text`로 봐야 할지, `VARCHAR(50)`로 봐야 할지 결정하지 못했고 `42P08` 에러가 발생했다.

### 해결 방법

쿼리에서 파라미터의 타입을 명시한다.

```sql
SELECT $1::bigint, $2::timestamptz, $3::varchar(50)
```

그리고 `WHERE NOT EXISTS` 안의 비교 조건에도 같은 타입을 명시한다.

```sql
WHERE movie_id = $1::bigint
  AND starts_at = $2::timestamptz
  AND auditorium = $3::varchar(50)
```

수정 후 `npm run seed`를 다시 실행하면 성공한다.

```text
Seed completed
```

### 왜 처음에는 타입을 명시하지 않았나?

PostgreSQL에서는 타입을 명시하지 않아도 정상 동작하는 경우가 많다.

예를 들어 단순 insert는 보통 문제가 없다.

```sql
INSERT INTO showtimes (movie_id, starts_at, auditorium)
VALUES ($1, $2, $3)
```

이 경우 PostgreSQL은 insert 대상 컬럼을 보고 각 파라미터 타입을 쉽게 추론할 수 있다.

```text
movie_id   -> BIGINT
starts_at  -> TIMESTAMPTZ
auditorium -> VARCHAR(50)
```

하지만 seed 스크립트는 단순 `VALUES`가 아니라 `INSERT ... SELECT ... WHERE NOT EXISTS` 형태였다. 같은 파라미터가 여러 SQL 문맥에서 반복 사용되면서 타입 추론이 애매해졌다.

따라서 이번 경우에는 `$1::bigint`, `$2::timestamptz`, `$3::varchar(50)`처럼 명시적으로 타입을 알려주는 것이 더 안전하다.
