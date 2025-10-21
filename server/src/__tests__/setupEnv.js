process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.PORT = process.env.PORT || '4000';
process.env.RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS || '60000';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || '100';
process.env.STRIPE_TOLERANCE_SECONDS = process.env.STRIPE_TOLERANCE_SECONDS || '300';
