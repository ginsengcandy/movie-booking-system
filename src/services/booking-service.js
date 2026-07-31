import { z } from 'zod';
import { badRequest, conflict, notFound } from '../utils/errors.js';

const bookingSchema = z.object({
  showtimeId: z.coerce.number().int().positive(),
  seatCode: z.string().trim().min(2).max(10)
});

const bookingIdSchema = z.coerce.number().int().positive();

export function createBookingService(db) {
  return {
    async createBooking(userId, input) {
      const parsed = bookingSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Invalid booking input');

      const { showtimeId, seatCode } = parsed.data;
      const client = await db.connect();

      try {
        await client.query('BEGIN');

        const seatResult = await client.query(
          `SELECT s.id AS seat_id
           FROM showtimes st
           JOIN seats s ON s.showtime_id = st.id
           WHERE st.id = $1 AND s.code = $2
           FOR UPDATE`,
          [showtimeId, seatCode.toUpperCase()]
        );

        if (seatResult.rowCount === 0) {
          throw notFound('Showtime or seat not found');
        }

        const seatId = seatResult.rows[0].seat_id;

        const bookingResult = await client.query(
          `INSERT INTO bookings (user_id, showtime_id, seat_id, status)
           VALUES ($1, $2, $3, 'CONFIRMED')
           RETURNING id,
                     user_id,
                     showtime_id,
                     seat_id,
                     status,
                     created_at,
                     updated_at,
                     cancelled_at,
                     version`,
          [userId, showtimeId, seatId]
        );

        await client.query('COMMIT');
        return bookingResult.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') throw conflict('Seat is already booked');
        throw error;
      } finally {
        client.release();
      }
    },

    async listBookings(userId) {
      const result = await db.query(
        `SELECT b.id,
                b.created_at,
                b.updated_at,
                b.cancelled_at,
                b.status,
                m.id AS movie_id,
                m.title AS movie_title,
                st.id AS showtime_id,
                st.starts_at,
                st.auditorium,
                se.code AS seat_code
         FROM bookings b
         JOIN showtimes st ON st.id = b.showtime_id
         JOIN movies m ON m.id = st.movie_id
         JOIN seats se ON se.id = b.seat_id
         WHERE b.user_id = $1
           AND b.status = 'CONFIRMED'
         ORDER BY b.created_at DESC`,
        [userId]
      );
      return result.rows;
    },

    async cancelBooking(userId, bookingId) {
      const parsed = bookingIdSchema.safeParse(bookingId);
      if (!parsed.success) throw badRequest('Invalid booking id');

      const result = await db.query(
        `UPDATE bookings
         SET status = 'CANCELLED',
             cancelled_at = now(),
             updated_at = now(),
             version = version + 1
         WHERE id = $1
           AND user_id = $2
           AND status = 'CONFIRMED'
         RETURNING id`,
        [parsed.data, userId]
      );

      if (result.rowCount === 0) throw notFound('Booking not found');
    }
  };
}
