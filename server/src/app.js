require('express-async-errors');
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth.routes');
const rulesRoutes = require('./routes/rules.routes');
const alertsRoutes = require('./routes/alerts.routes');
const organizationsRoutes = require('./routes/organizations.routes');
const { createWebhookRouter } = require('./routes/webhooks.routes');
const { createEventsRouter } = require('./routes/events.routes');

/**
 * Builds a fully wired Express app. `rateLimiter` is injectable so the test
 * suite can back it with ioredis-mock while production wires a real Redis
 * connection in server.js.
 */
function createApp({ rateLimiter, notificationService } = {}) {
  const app = express();

  app.use(cors({ origin: env.cors.origin }));
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/rules', rulesRoutes);
  app.use('/api/alerts', alertsRoutes);
  app.use('/api/organizations', organizationsRoutes);
  app.use('/api/events', createEventsRouter(rateLimiter, notificationService));
  app.use('/webhooks', createWebhookRouter(rateLimiter, notificationService));

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logger.error('unhandled_error', { error: err.message, stack: err.stack });
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'validation_error', message: err.message });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'invalid_id' });
    }
    if (err.code === 11000) {
      return res.status(409).json({ error: 'conflict', message: 'duplicate key' });
    }
    return res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

module.exports = { createApp };
