const express = require('express');
const { resolveApiKey, verifyWebhookSignature } = require('../middleware/apiKeyAuth');
const { ingestEvent } = require('../services/eventIngestionService');

/**
 * Maps a raw provider payload to pulseboard-ops' normalized event shape.
 * Kept intentionally small/defensive: unknown shapes still land as an event
 * (type falls back to "unknown") rather than being dropped.
 */
function normalizeStripeEvent(body) {
  return { type: body?.type || 'unknown', payload: body };
}

function normalizeGithubEvent(body, headers) {
  const ghEvent = headers['x-github-event'] || 'unknown';
  // Sub-type push events by action when present (e.g. workflow_run.completed)
  const type = body?.action ? `${ghEvent}.${body.action}` : ghEvent;
  return { type, payload: body };
}

function normalizeGenericEvent(body) {
  return { type: body?.type || 'generic.event', payload: body };
}

function createWebhookRouter(rateLimiter, notificationService) {
  const router = express.Router();
  const limiterMiddleware = rateLimiter
    ? rateLimiter.middleware((req) => `webhook:${req.params.keyId}`)
    : (req, res, next) => next();

  router.post(
    '/:keyId/stripe',
    limiterMiddleware,
    resolveApiKey(),
    verifyWebhookSignature('stripe'),
    async (req, res, next) => {
      try {
        const { type, payload } = normalizeStripeEvent(req.body);
        const { event } = await ingestEvent(
          {
            organizationId: req.apiKeyDoc.organizationId,
            provider: 'stripe',
            type,
            payload,
          },
          { notificationService }
        );
        res.status(202).json({ received: true, eventId: event._id });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/:keyId/github',
    limiterMiddleware,
    resolveApiKey(),
    verifyWebhookSignature('github'),
    async (req, res, next) => {
      try {
        const { type, payload } = normalizeGithubEvent(req.body, req.headers);
        const { event } = await ingestEvent(
          {
            organizationId: req.apiKeyDoc.organizationId,
            provider: 'github',
            type,
            payload,
          },
          { notificationService }
        );
        res.status(202).json({ received: true, eventId: event._id });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/:keyId/generic',
    limiterMiddleware,
    resolveApiKey(),
    verifyWebhookSignature('generic'),
    async (req, res, next) => {
      try {
        const { type, payload } = normalizeGenericEvent(req.body);
        const { event } = await ingestEvent(
          {
            organizationId: req.apiKeyDoc.organizationId,
            provider: 'generic',
            type,
            payload,
          },
          { notificationService }
        );
        res.status(202).json({ received: true, eventId: event._id });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createWebhookRouter, normalizeStripeEvent, normalizeGithubEvent, normalizeGenericEvent };
