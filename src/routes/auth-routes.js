import express from 'express';
import { asyncHandler } from '../utils/async-handler.js';

export function authRoutes(authService) {
  const router = express.Router();

  router.post('/register', asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json(result);
  }));

  return router;
}
