const request = require('supertest');

jest.mock('../../models/ApiKey', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/Organization', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/Event', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/Rule', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/Alert', () => require('../helpers/fakeModel').createFakeModel());

const { createApp } = require('../../app');
const ApiKey = require('../../models/ApiKey');
const Event = require('../../models/Event');
const { signHexStyle } = require('../../services/signatureVerification');
const { signToken } = require('../../services/authService');

const ORG_ID = 'org-sdk';
const SDK_SECRET = 'sdk-secret';
const keyId = 'pk_sdk_test';

describe('custom event SDK ingestion (/api/events/:keyId/track)', () => {
  let app;

  beforeEach(async () => {
    ApiKey.__reset();
    Event.__reset();
    app = createApp({});
    await ApiKey.create({
      organizationId: ORG_ID,
      keyId,
      secretHash: 'unused',
      webhookSecrets: { generic: SDK_SECRET },
      revoked: false,
    });
  });

  it('accepts a properly signed custom event', async () => {
    const body = { type: 'signup.created', properties: { plan: 'pro' } };
    const rawBody = JSON.stringify(body);
    const header = signHexStyle(SDK_SECRET, rawBody);

    const res = await request(app)
      .post(`/api/events/${keyId}/track`)
      .type('json')
      .set('x-pulseboard-signature', header)
      .send(rawBody);

    expect(res.status).toBe(202);
    expect(Event.__store[0]).toMatchObject({ provider: 'custom', type: 'signup.created' });
  });

  it('rejects a track call missing a "type" field', async () => {
    const body = { properties: {} };
    const rawBody = JSON.stringify(body);
    const header = signHexStyle(SDK_SECRET, rawBody);

    const res = await request(app)
      .post(`/api/events/${keyId}/track`)
      .type('json')
      .set('x-pulseboard-signature', header)
      .send(rawBody);

    expect(res.status).toBe(400);
  });

  it('rejects an incorrectly signed request', async () => {
    const rawBody = JSON.stringify({ type: 'signup.created' });

    const res = await request(app)
      .post(`/api/events/${keyId}/track`)
      .type('json')
      .set('x-pulseboard-signature', 'sha256=deadbeef')
      .send(rawBody);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/events (dashboard read API)', () => {
  let app;

  beforeEach(() => {
    Event.__reset();
    app = createApp({});
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });

  it('returns events scoped to the caller organization, newest first, respecting limit/provider filters', async () => {
    const token = signToken({ userId: 'u1', organizationId: ORG_ID, role: 'member' });

    await Event.create({ organizationId: ORG_ID, provider: 'stripe', type: 'payment.failed', receivedAt: new Date(Date.now() - 5000) });
    await Event.create({ organizationId: ORG_ID, provider: 'github', type: 'push', receivedAt: new Date() });
    await Event.create({ organizationId: 'other-org', provider: 'stripe', type: 'payment.failed', receivedAt: new Date() });

    const res = await request(app).get('/api/events?provider=stripe').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].provider).toBe('stripe');
  });
});
