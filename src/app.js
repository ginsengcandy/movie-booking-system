import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db/pool.js';
import { createAuthService } from './services/auth-service.js';
import { createMovieService } from './services/movie-service.js';
import { createBookingService } from './services/booking-service.js';
import { authRoutes } from './routes/auth-routes.js';
import { movieRoutes } from './routes/movie-routes.js';
import { bookingRoutes } from './routes/booking-routes.js';
import { errorHandler } from './middleware/error-handler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(db = pool) {
  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRoutes(createAuthService(db)));
  app.use('/movies', movieRoutes(createMovieService(db)));
  app.use('/bookings', bookingRoutes(createBookingService(db)));

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);

  return app;
}
