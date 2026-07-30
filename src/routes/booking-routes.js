import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export function bookingRoutes(bookingService) {
  const router = express.Router();

  router.use(requireAuth);

  router.post('/', asyncHandler(async (req, res) => {
    const booking = await bookingService.createBooking(req.user.id, req.body);
    res.status(201).json({ booking });
  }));

  router.get('/me', asyncHandler(async (req, res) => {
    res.json({ bookings: await bookingService.listBookings(req.user.id) });
  }));

  router.delete('/:bookingId', asyncHandler(async (req, res) => {
    await bookingService.cancelBooking(req.user.id, req.params.bookingId);
    res.status(204).send();
  }));

  return router;
}
