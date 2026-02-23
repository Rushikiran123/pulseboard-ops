const express = require('express');
const Event = require('../models/Event');
const { requireAuth } = require('../middleware/auth');
const { resolveApiKey, verifyWebhookSignature } = require('../middleware/apiKeyAuth');
const { ingestEvent } = require('../services/eventIngestionService');

function createEventsRouter(rateLimiter, notificationService) {
  const router = express.Router();
  const limiterMiddleware = rateLimiter
    ? rateLimiter.middleware((req) => `sdk:${req.params.keyId}`)
    : (req, res, next) => next();

  // Custom event SDK ingestion - authenticated with the same generic HMAC
  // scheme as the generic-JSON webhook provider, under provider "custom".
  router.post(
    '/:keyId/track',
    limiterMiddleware,
    resolveApiKey(),
    verifyWebhookSignature('generic'),
    async (req, res, next) => {
      try {
        const { type, properties } = req.body || {};
        if (!type) {
          return res.status(400).json({ error: 'validation_error', message: '"type" is required' });
        }
        const { event } = await ingestEvent(
          {
            organizationId: req.apiKeyDoc.organizationId,
            provider: 'custom',
            type,
            payload: properties || {},
          },
          { notificationService }
        );
        return res.status(202).json({ received: true, eventId: event._id });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Dashboard read API - JWT authenticated, scoped to the caller's org.
  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const { provider, type, limit = 50 } = req.query;
      const filter = { organizationId: req.user.organizationId };
      if (provider) filter.provider = provider;
      if (type) filter.type = type;

      const events = await Event.find(filter);
      const sorted = [...events].sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
      const page = sorted.slice(0, Math.min(Number(limit) || 50, 200));
      return res.json({ events: page });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createEventsRouter };
