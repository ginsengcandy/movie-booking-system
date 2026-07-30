import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';

class FakeDb {
  constructor() {
    this.users = [];
    this.movies = [
      { id: 1, title: 'Test Movie', description: 'For automated tests', duration_minutes: 100 }
    ];
    this.showtimes = [
      { id: 1, movie_id: 1, starts_at: '2026-08-01T10:00:00.000Z', auditorium: 'A관' }
    ];
    this.seats = [
      { id: 1, showtime_id: 1, code: 'A1' },
      { id: 2, showtime_id: 1, code: 'A2' }
    ];
    this.bookings = [];
  }

  async query(sql, params = []) {
    if (sql.includes('INSERT INTO users')) {
      if (this.users.some((user) => user.email === params[0])) {
        const error = new Error('duplicate user');
        error.code = '23505';
        throw error;
      }
      const user = {
        id: this.users.length + 1,
        email: params[0],
        password_hash: params[1],
        name: params[2],
        created_at: new Date().toISOString()
      };
      this.users.push(user);
      return { rows: [user], rowCount: 1 };
    }

    if (sql.includes('SELECT id, email, name, password_hash FROM users')) {
      const user = this.users.find((item) => item.email === params[0]);
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }

    if (sql.includes('SELECT id, title, description, duration_minutes')) {
      return { rows: this.movies, rowCount: this.movies.length };
    }

    if (sql.includes('SELECT id FROM movies WHERE id')) {
      const movie = this.movies.find((item) => item.id === params[0]);
      return { rows: movie ? [movie] : [], rowCount: movie ? 1 : 0 };
    }

    if (sql.includes('COUNT(se.id)::int AS seat_count')) {
      const rows = this.showtimes
        .filter((showtime) => showtime.movie_id === params[0])
        .map((showtime) => {
          const movie = this.movies.find((item) => item.id === showtime.movie_id);
          return {
            id: showtime.id,
            starts_at: showtime.starts_at,
            auditorium: showtime.auditorium,
            duration_minutes: movie.duration_minutes,
            seat_count: this.seats.filter((seat) => seat.showtime_id === showtime.id).length
          };
        });
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('FROM bookings b')) {
      const rows = this.bookings
        .filter((booking) => booking.user_id === params[0])
        .map((booking) => {
          const showtime = this.showtimes.find((item) => item.id === booking.showtime_id);
          const movie = this.movies.find((item) => item.id === showtime.movie_id);
          const seat = this.seats.find((item) => item.id === booking.seat_id);
          return {
            id: booking.id,
            created_at: booking.created_at,
            movie_id: movie.id,
            movie_title: movie.title,
            showtime_id: showtime.id,
            starts_at: showtime.starts_at,
            auditorium: showtime.auditorium,
            seat_code: seat.code
          };
        });
      return { rows, rowCount: rows.length };
    }

    throw new Error(`Unhandled query: ${sql}`);
  }

  async connect() {
    return new FakeClient(this);
  }
}

class FakeClient {
  constructor(db) {
    this.db = db;
  }

  async query(sql, params = []) {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('JOIN seats s')) {
      const seat = this.db.seats.find(
        (item) => item.showtime_id === params[0] && item.code === params[1]
      );
      return { rows: seat ? [{ seat_id: seat.id }] : [], rowCount: seat ? 1 : 0 };
    }

    if (sql.includes('INSERT INTO bookings')) {
      if (
        this.db.bookings.some(
          (booking) => booking.showtime_id === params[1] && booking.seat_id === params[2]
        )
      ) {
        const error = new Error('duplicate booking');
        error.code = '23505';
        throw error;
      }
      const booking = {
        id: this.db.bookings.length + 1,
        user_id: params[0],
        showtime_id: params[1],
        seat_id: params[2],
        created_at: new Date().toISOString()
      };
      this.db.bookings.push(booking);
      return { rows: [booking], rowCount: 1 };
    }

    return this.db.query(sql, params);
  }

  release() {}
}

test('auth, movie lookup, protected routes, booking, and duplicate booking flow', async () => {
  const app = createApp(new FakeDb());

  const register = await request(app)
    .post('/auth/register')
    .send({ email: 'user@example.com', password: 'password123', name: 'User' })
    .expect(201);

  assert.equal(register.body.user.email, 'user@example.com');
  assert.ok(register.body.token);

  await request(app)
    .post('/auth/register')
    .send({ email: 'user@example.com', password: 'password123' })
    .expect(409);

  const login = await request(app)
    .post('/auth/login')
    .send({ email: 'user@example.com', password: 'password123' })
    .expect(200);

  await request(app)
    .post('/auth/login')
    .send({ email: 'user@example.com', password: 'wrong-password' })
    .expect(401);

  const token = login.body.token;

  const movies = await request(app).get('/movies').expect(200);
  assert.equal(movies.body.movies.length, 1);

  const showtimes = await request(app).get('/movies/1/showtimes').expect(200);
  assert.equal(showtimes.body.showtimes[0].seat_count, 2);
  assert.equal(showtimes.body.showtimes[0].duration_minutes, 100);

  await request(app).post('/bookings').send({ showtimeId: 1, seatCode: 'A1' }).expect(401);

  const booking = await request(app)
    .post('/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ showtimeId: 1, seatCode: 'A1' })
    .expect(201);
  assert.equal(booking.body.booking.showtime_id, 1);

  await request(app)
    .post('/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ showtimeId: 1, seatCode: 'A1' })
    .expect(409);

  const myBookings = await request(app)
    .get('/bookings/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(myBookings.body.bookings[0].movie_title, 'Test Movie');
  assert.equal(myBookings.body.bookings[0].seat_code, 'A1');
});
