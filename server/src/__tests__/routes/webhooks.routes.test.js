const request = require('supertest');
const RedisMock = require('ioredis-mock');

jest.mock('../../models/ApiKey', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/Organization', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/Event', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/Rule', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/Alert', () => require('../helpers/fakeModel').createFakeModel());

const { createApp } = require('../../app');
const { RateLimiter } = require('../../services/rateLimiter');
const { NotificationService } = require('../../services/notificationService');
const { signStripeStyle, signHexStyle } = require('../../services/signatureVerification');
const ApiKey = require('../../models/ApiKey');
const Organization = require('../../models/Organization');
const Event = require('../../models/Event');
const Rule = require('../../models/Rule');
const Alert = require('../../models/Alert');

const STRIPE_SECRET = 'stripe-secret';
const GITHUB_SECRET = 'github-secret';
const GENERIC_SECRET = 'generic-secret';

describe('webhook ingestion routes', () => {
  let app;
  let redis;
  let orgId;
  const keyId = 'pk_test123';

  beforeEach(async () => {
    ApiKey.__reset();
    Organization.__reset();
    Event.__reset();
    Rule.__reset();
    Alert.__reset();

    redis = new RedisMock();
    const rateLimiter = new RateLimiter(redis, { windowMs: 60_000, max: 5 });
    // Fake transports keep this test fully offline while still exercising the
    // real notify()/formatSlackPayload()/formatEmailPayload() code paths.
    const notificationService = new NotificationService({
      httpClient: { post: jest.fn().mockResolvedValue({ status: 200 }) },
      mailTransport: { sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }) },
    });
    app = createApp({ rateLimiter, notificationService });

    const org = await Organization.create({
      name: 'Acme Inc',
      slug: 'acme-inc',
      slackWebhookUrl: 'https://hooks.slack.example/webhook',
      alertEmail: 'ops@acme.test',
    });
    orgId = org._id;

    await ApiKey.create({
      organizationId: orgId,
      keyId,
      secretHash: 'unused-in-tests',
      webhookSecrets: { stripe: STRIPE_SECRET, github: GITHUB_SECRET, generic: GENERIC_SECRET },
      revoked: false,
    });
  });

  afterEach(async () => {
    await redis.flushall();
  });

  describe('stripe', () => {
    it('accepts a validly signed payload and stores a normalized event', async () => {
      const body = { type: 'payment.failed', data: { amount: 4999 } };
      const rawBody = JSON.stringify(body);
      const header = signStripeStyle(STRIPE_SECRET, rawBody);

      const res = await request(app)
        .post(`/webhooks/${keyId}/stripe`)
        .type('json')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', header)
        .send(rawBody);

      expect(res.status).toBe(202);
      expect(res.body.received).toBe(true);
      expect(Event.__store).toHaveLength(1);
      expect(Event.__store[0]).toMatchObject({ provider: 'stripe', type: 'payment.failed' });
    });

    it('rejects a payload with an invalid signature', async () => {
      const body = { type: 'payment.failed' };
      const rawBody = JSON.stringify(body);

      const res = await request(app)
        .post(`/webhooks/${keyId}/stripe`)
        .type('json')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 't=1,v1=deadbeef')
        .send(rawBody);

      expect(res.status).toBe(401);
      expect(Event.__store).toHaveLength(0);
    });

    it('returns 404 for an unknown api key', async () => {
      const rawBody = JSON.stringify({ type: 'payment.failed' });
      const header = signStripeStyle(STRIPE_SECRET, rawBody);

      const res = await request(app)
        .post('/webhooks/pk_does_not_exist/stripe')
        .type('json')
        .set('stripe-signature', header)
        .send(rawBody);

      expect(res.status).toBe(404);
    });

    it('creates and delivers an alert when a matching pattern rule exists', async () => {
      await Rule.create({
        organizationId: orgId,
        name: 'Payment failed',
        provider: 'stripe',
        eventType: 'payment.failed',
        conditionType: 'pattern',
        config: { field: 'type', operator: 'eq', value: 'payment.failed' },
        severity: 'critical',
        channels: ['slack', 'email', 'socket'],
        enabled: true,
      });

      const rawBody = JSON.stringify({ type: 'payment.failed' });
      const header = signStripeStyle(STRIPE_SECRET, rawBody);

      const res = await request(app)
        .post(`/webhooks/${keyId}/stripe`)
        .type('json')
        .set('stripe-signature', header)
        .send(rawBody);

      expect(res.status).toBe(202);
      expect(Alert.__store).toHaveLength(1);
      expect(Alert.__store[0].severity).toBe('critical');
      expect(Alert.__store[0].channelsNotified.sort()).toEqual(['email', 'slack', 'socket']);
    });
  });

  describe('github', () => {
    it('accepts a validly signed push event and derives its type from the header + action', async () => {
      const body = { action: 'completed', workflow: 'ci' };
      const rawBody = JSON.stringify(body);
      const header = signHexStyle(GITHUB_SECRET, rawBody);

      const res = await request(app)
        .post(`/webhooks/${keyId}/github`)
        .type('json')
        .set('x-github-event', 'workflow_run')
        .set('x-hub-signature-256', header)
        .send(rawBody);

      expect(res.status).toBe(202);
      expect(Event.__store[0].type).toBe('workflow_run.completed');
    });

    it('rejects an unsupported signature scheme', async () => {
      const rawBody = JSON.stringify({ action: 'completed' });
      const res = await request(app)
        .post(`/webhooks/${keyId}/github`)
        .type('json')
        .set('x-github-event', 'workflow_run')
        .set('x-hub-signature-256', 'sha1=deadbeef')
        .send(rawBody);

      expect(res.status).toBe(401);
    });
  });

  describe('generic', () => {
    it('accepts a validly signed generic JSON event', async () => {
      const body = { type: 'custom.metric', value: 42 };
      const rawBody = JSON.stringify(body);
      const header = signHexStyle(GENERIC_SECRET, rawBody);

      const res = await request(app)
        .post(`/webhooks/${keyId}/generic`)
        .type('json')
        .set('x-pulseboard-signature', header)
        .send(rawBody);

      expect(res.status).toBe(202);
      expect(Event.__store[0].provider).toBe('generic');
    });
  });

  describe('rate limiting', () => {
    it('returns 429 once the per-key limit is exceeded', async () => {
      const rawBody = JSON.stringify({ type: 'ping' });
      const header = signHexStyle(GENERIC_SECRET, rawBody);

      let lastRes;
      for (let i = 0; i < 6; i += 1) {
        lastRes = await request(app)
          .post(`/webhooks/${keyId}/generic`)
          .type('json')
          .set('x-pulseboard-signature', header)
          .send(rawBody);
      }

      expect(lastRes.status).toBe(429);
      expect(Event.__store.length).toBeLessThanOrEqual(5);
    });
  });
});
