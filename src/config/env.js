import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/movie_booking',
  jwtSecret: process.env.JWT_SECRET || 'r|ZRn#Ec<moOAf1Q5Ayoc?E9zWU6}^eF70QHAO(6FCH',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10)
};
