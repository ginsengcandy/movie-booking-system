import { notFound } from '../utils/errors.js';

export function createMovieService(db) {
  return {
    async listMovies() {
      const result = await db.query(
        `SELECT id, title, description, duration_minutes
         FROM movies
         ORDER BY id`,
        []
      );
      return result.rows;
    },

    async listShowtimes(movieId) {
      const movie = await db.query('SELECT id FROM movies WHERE id = $1', [movieId]);
      if (movie.rowCount === 0) throw notFound('Movie not found');

      const result = await db.query(
        `SELECT s.id,
                s.starts_at,
                s.auditorium,
                m.duration_minutes,
                COUNT(se.id)::int AS seat_count,
                COUNT(b.id)::int AS booked_seat_count,
                (COUNT(se.id) - COUNT(b.id))::int AS remaining_seat_count
         FROM showtimes s
         JOIN movies m ON m.id = s.movie_id
         JOIN seats se ON se.showtime_id = s.id
         LEFT JOIN bookings b ON b.seat_id = se.id AND b.showtime_id = s.id
         WHERE s.movie_id = $1
         GROUP BY s.id, m.duration_minutes
         ORDER BY s.starts_at`,
        [movieId]
      );
      return result.rows;
    },

    async listSeats(showtimeId) {
      const showtime = await db.query('SELECT id FROM showtimes WHERE id = $1', [showtimeId]);
      if (showtime.rowCount === 0) throw notFound('Showtime not found');

      const result = await db.query(
        `SELECT se.code,
                CASE WHEN b.id IS NULL THEN false ELSE true END AS booked
         FROM seats se
         LEFT JOIN bookings b ON b.seat_id = se.id AND b.showtime_id = se.showtime_id
         WHERE se.showtime_id = $1
         ORDER BY se.code`,
        [showtimeId]
      );
      return result.rows;
    }
  };
}
