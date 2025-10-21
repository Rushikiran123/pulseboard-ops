require('dotenv').config();

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pulseboard',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },
  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: num(process.env.RATE_LIMIT_MAX, 100),
  },
  stripe: {
    toleranceSeconds: num(process.env.STRIPE_TOLERANCE_SECONDS, 300),
  },
  smtp: {
    host: process.env.SMTP_HOST || null,
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
};
