import express from 'express';
import { asyncHandler } from '../utils/async-handler.js';

export function movieRoutes(movieService) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json({ movies: await movieService.listMovies() });
  }));

  router.get('/:movieId/showtimes', asyncHandler(async (req, res) => {
    res.json({ showtimes: await movieService.listShowtimes(Number(req.params.movieId)) });
  }));

  router.get('/showtimes/:showtimeId/seats', asyncHandler(async (req, res) => {
    res.json({ seats: await movieService.listSeats(Number(req.params.showtimeId)) });
  }));

  return router;
}
