import { pool } from '../src/db/pool.js';

const movies = [
  {
    title: 'The Deterministic Seat',
    description: 'A compact thriller about one seat that must never be sold twice.',
    duration: 112,
    showtimes: [
      ['2026-08-01T10:00:00+09:00', 'A관'],
      ['2026-08-01T14:00:00+09:00', 'A관']
    ]
  },
  {
    title: 'Postgres at Midnight',
    description: 'A drama about transactions, constraints, and calm error handling.',
    duration: 126,
    showtimes: [
      ['2026-08-02T19:30:00+09:00', 'B관']
    ]
  }
];

const seatCodes = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];

const client = await pool.connect();

try {
  await client.query('BEGIN');

  for (const movie of movies) {
    const movieResult = await client.query(
      `INSERT INTO movies (title, description, duration_minutes)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [movie.title, movie.description, movie.duration]
    );

    const existingMovie = movieResult.rows[0] || (
      await client.query('SELECT id FROM movies WHERE title = $1', [movie.title])
    ).rows[0];

    for (const [startsAt, auditorium] of movie.showtimes) {
      const showtimeResult = await client.query(
        `INSERT INTO showtimes (movie_id, starts_at, auditorium)
         SELECT $1::bigint, $2::timestamptz, $3::varchar(50)
         WHERE NOT EXISTS (
           SELECT 1 FROM showtimes
           WHERE movie_id = $1::bigint
             AND starts_at = $2::timestamptz
             AND auditorium = $3::varchar(50)
         )
         RETURNING id`,
        [existingMovie.id, startsAt, auditorium]
      );

      const showtime = showtimeResult.rows[0] || (
        await client.query(
          'SELECT id FROM showtimes WHERE movie_id = $1 AND starts_at = $2 AND auditorium = $3',
          [existingMovie.id, startsAt, auditorium]
        )
      ).rows[0];

      for (const code of seatCodes) {
        await client.query(
          `INSERT INTO seats (showtime_id, code)
           VALUES ($1, $2)
           ON CONFLICT (showtime_id, code) DO NOTHING`,
          [showtime.id, code]
        );
      }
    }
  }

  await client.query('COMMIT');
  console.log('Seed completed');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
