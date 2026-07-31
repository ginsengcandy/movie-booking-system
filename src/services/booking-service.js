import { z } from 'zod';
import { recordAuditLog, safeRecordAuditLog } from './audit-log-service.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';

const bookingSchema = z.object({
  showtimeId: z.coerce.number().int().positive(),
  seatCode: z.string().trim().min(2).max(10)
});

const bookingIdSchema = z.coerce.number().int().positive();

export function createBookingService(db) {
  return {
    async createBooking(userId, input, requestContext = {}) {
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

        const existingBooking = await client.query(
          `SELECT id
           FROM bookings
           WHERE showtime_id = $1
             AND seat_id = $2
             AND status = 'CONFIRMED'`,
          [showtimeId, seatId]
        );

        if (existingBooking.rowCount > 0) {
          await recordAuditLog(client, {
            eventType: 'DUPLICATE_BOOKING_FAILED',
            actorUserId: userId,
            targetType: 'seat',
            targetId: seatId,
            action: 'BOOK',
            status: 'FAILED',
            message: 'Seat is already booked',
            metadata: {
              showtime_id: showtimeId,
              seat_id: seatId,
              seat_code: seatCode.toUpperCase(),
              user_id: userId,
              reason: 'CONFIRMED_BOOKING_EXISTS'
            },
            ipAddress: requestContext.ipAddress,
            userAgent: requestContext.userAgent
          });
          await client.query('COMMIT');
          throw conflict('Seat is already booked');
        }

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
        const booking = bookingResult.rows[0];

        await recordAuditLog(client, {
          eventType: 'BOOKING_CREATED',
          actorUserId: userId,
          targetType: 'booking',
          targetId: booking.id,
          action: 'CREATE',
          status: 'SUCCESS',
          metadata: {
            booking_id: booking.id,
            showtime_id: booking.showtime_id,
            seat_id: booking.seat_id,
            user_id: booking.user_id,
            booking_status: booking.status
          },
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent
        });

        await client.query('COMMIT');
        return booking;
      } catch (error) {
        if (error.code === 'CONFLICT') throw error;
        await client.query('ROLLBACK');
        if (error.code === '23505') {
          await safeRecordAuditLog(db, {
            eventType: 'DUPLICATE_BOOKING_FAILED',
            actorUserId: userId,
            targetType: 'seat',
            action: 'BOOK',
            status: 'FAILED',
            message: 'Seat is already booked',
            metadata: {
              showtime_id: showtimeId,
              seat_code: seatCode.toUpperCase(),
              user_id: userId,
              reason: 'UNIQUE_CONSTRAINT_VIOLATION'
            },
            ipAddress: requestContext.ipAddress,
            userAgent: requestContext.userAgent
          });
          throw conflict('Seat is already booked');
        }
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

    async cancelBooking(userId, bookingId, requestContext = {}) {
      const parsed = bookingIdSchema.safeParse(bookingId);
      if (!parsed.success) throw badRequest('Invalid booking id');

      const client = await db.connect();

      try {
        await client.query('BEGIN');
        const result = await client.query(
          `UPDATE bookings
           SET status = 'CANCELLED',
               cancelled_at = now(),
               updated_at = now(),
               version = version + 1
           WHERE id = $1
             AND user_id = $2
             AND status = 'CONFIRMED'
           RETURNING id,
                     user_id,
                     showtime_id,
                     seat_id,
                     status,
                     cancelled_at`,
          [parsed.data, userId]
        );

        if (result.rowCount === 0) {
          await client.query('ROLLBACK');
          throw notFound('Booking not found');
        }

        const booking = result.rows[0];
        await recordAuditLog(client, {
          eventType: 'BOOKING_CANCELLED',
          actorUserId: userId,
          targetType: 'booking',
          targetId: booking.id,
          action: 'CANCEL',
          status: 'SUCCESS',
          metadata: {
            booking_id: booking.id,
            showtime_id: booking.showtime_id,
            seat_id: booking.seat_id,
            previous_status: 'CONFIRMED',
            new_status: booking.status,
            cancelled_at: booking.cancelled_at
          },
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent
        });

        await client.query('COMMIT');
      } catch (error) {
        if (error.code !== 'NOT_FOUND') await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
