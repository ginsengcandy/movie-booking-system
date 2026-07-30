import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { badRequest, conflict, unauthorized } from '../utils/errors.js';

const credentialsSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  name: z.string().trim().min(1).max(100).optional()
});

export function createAuthService(db) {
  const createToken = (user) =>
    jwt.sign({ email: user.email }, env.jwtSecret, {
      subject: String(user.id),
      expiresIn: env.jwtExpiresIn
    });

  return {
    async register(input) {
      const parsed = credentialsSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Invalid registration input');

      const { email, password, name } = parsed.data;
      const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

      try {
        const result = await db.query(
          `INSERT INTO users (email, password_hash, name)
           VALUES ($1, $2, $3)
           RETURNING id, email, name, created_at`,
          [email.toLowerCase(), passwordHash, name || null]
        );
        const user = result.rows[0];
        return { user, token: createToken(user) };
      } catch (error) {
        if (error.code === '23505') throw conflict('Email is already registered');
        throw error;
      }
    },

    async login(input) {
      const parsed = credentialsSchema.omit({ name: true }).safeParse(input);
      if (!parsed.success) throw badRequest('Invalid login input');

      const { email, password } = parsed.data;
      const result = await db.query(
        'SELECT id, email, name, password_hash FROM users WHERE email = $1',
        [email.toLowerCase()]
      );
      const user = result.rows[0];
      const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
      if (!valid) throw unauthorized('Invalid email or password');

      return {
        user: { id: user.id, email: user.email, name: user.name },
        token: createToken(user)
      };
    }
  };
}
