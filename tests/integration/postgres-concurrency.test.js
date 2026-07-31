import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import request from 'supertest';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const concurrentUserCount = 10;

function isSafeTestDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return false;

  try {
    const parsed = new URL(databaseUrl);
    return parsed.pathname.toLowerCase().includes('test');
  } catch {
    return false;
  }
}

test(
  'only one concurrent booking succeeds for the same showtime seat on PostgreSQL',
  { skip: !testDatabaseUrl },
  async (t) => {
    if (!isSafeTestDatabaseUrl(testDatabaseUrl)) {
      throw new Error('TEST_DATABASE_URL must point to a database whose name contains "test"');
    }

    process.env.DATABASE_URL = testDatabaseUrl;

    const { createApp } = await import('../../src/app.js');
    const { Pool } = pg;
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const app = createApp(pool);
    const migrationPath = join(__dirname, '..', '..', 'migrations', '001_init.sql');
    const migrationSql = await readFile(migrationPath, 'utf8');
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const createdIds = {
      users: [],
      movie: null,
      showtime: null,
      seat: null
    };

    t.after(async () => {
      try {
        await pool.query('DELETE FROM bookings WHERE showtime_id = $1', [createdIds.showtime]);
        await pool.query('DELETE FROM seats WHERE id = $1', [createdIds.seat]);
        await pool.query('DELETE FROM showtimes WHERE id = $1', [createdIds.showtime]);
        await pool.query('DELETE FROM movies WHERE id = $1', [createdIds.movie]);

        if (createdIds.users.length > 0) {
          await pool.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [createdIds.users]);
        }
      } finally {
        await pool.end();
      }
    });

    await pool.query(migrationSql);

    const movieResult = await pool.query(
      `INSERT INTO movies (title, description, duration_minutes)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [
        `Concurrency Test Movie ${unique}`,
        'Verifies that a single seat cannot be booked twice under concurrent requests.',
        100
      ]
    );
    createdIds.movie = movieResult.rows[0].id;

    const showtimeResult = await pool.query(
      `INSERT INTO showtimes (movie_id, starts_at, auditorium)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [createdIds.movie, '2026-08-01T10:00:00+09:00', `T-${unique.slice(-6)}`]
    );
    createdIds.showtime = showtimeResult.rows[0].id;

    const seatResult = await pool.query(
      `INSERT INTO seats (showtime_id, code)
       VALUES ($1, $2)
       RETURNING id`,
      [createdIds.showtime, 'A1']
    );
    createdIds.seat = seatResult.rows[0].id;

    const registrations = await Promise.all(
      Array.from({ length: concurrentUserCount }, (_, index) =>
        request(app)
          .post('/auth/register')
          .send({
            email: `concurrency-user-${unique}-${index}@example.com`,
            password: 'password123',
            name: `Concurrency User ${index}`
          })
      )
    );

    const tokens = registrations.map((response) => {
      assert.equal(response.status, 201);
      assert.ok(response.body.token);
      createdIds.users.push(response.body.user.id);
      return response.body.token;
    });

    const bookingResponses = await Promise.all(
      tokens.map((token) =>
        request(app)
          .post('/bookings')
          .set('Authorization', `Bearer ${token}`)
          .send({ showtimeId: createdIds.showtime, seatCode: 'A1' })
      )
    );

    const statuses = bookingResponses.map((response) => response.status);
    assert.equal(statuses.filter((status) => status === 201).length, 1);
    assert.equal(statuses.filter((status) => status === 409).length, concurrentUserCount - 1);

    const conflictResponses = bookingResponses.filter((response) => response.status === 409);
    for (const response of conflictResponses) {
      assert.deepEqual(response.body, {
        error: {
          code: 'CONFLICT',
          message: 'Seat is already booked'
        }
      });
    }

    const bookingCount = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM bookings
       WHERE showtime_id = $1
         AND seat_id = $2`,
      [createdIds.showtime, createdIds.seat]
    );

    assert.equal(bookingCount.rows[0].count, 1);
  }
);
