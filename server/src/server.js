const http = require('http');
const mongoose = require('mongoose');
const env = require('./config/env');
const logger = require('./utils/logger');
const { createApp } = require('./app');
const { getRedisClient } = require('./services/redisClient');
const { RateLimiter } = require('./services/rateLimiter');
const { initSocketServer } = require('./services/socketService');
const { NotificationService, buildProductionMailTransport } = require('./services/notificationService');

async function main() {
  await mongoose.connect(env.mongoUri);
  logger.info('connected to mongodb');

  const redisClient = getRedisClient();
  const rateLimiter = new RateLimiter(redisClient, env.rateLimit);

  const mailTransport = buildProductionMailTransport(env.smtp);
  if (!mailTransport) {
    logger.info('SMTP not configured - alert emails will be logged, not delivered (set SMTP_HOST/USER/PASS)');
  }
  const notificationService = new NotificationService({ mailTransport });

  const app = createApp({ rateLimiter, notificationService });
  const httpServer = http.createServer(app);

  initSocketServer(httpServer, env.cors.origin);

  httpServer.listen(env.port, () => {
    logger.info(`pulseboard-ops listening on port ${env.port}`);
  });

  const shutdown = async () => {
    logger.info('shutting down');
    httpServer.close();
    await mongoose.disconnect();
    redisClient.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('failed to start server', { error: err.message });
    process.exit(1);
  });
}

module.exports = { main };
