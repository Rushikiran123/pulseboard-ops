/**
 * OPTIONAL end-to-end integration test against a REAL MongoDB + Redis
 * (e.g. the ones started by `docker-compose up`). Not part of `npm test` -
 * it lives under __tests__/integration and is only picked up by
 * `npm run test:integration`, which requires MONGO_URI/REDIS_URL pointing
 * at live services. This keeps the default unit suite offline/deterministic
 * while still giving you a real smoke test for the Dockerized stack.
 *
 * Run with:
 *   docker compose up -d mongo redis
 *   MONGO_URI=mongodb://localhost:27017/pulseboard_it REDIS_URL=redis://localhost:6379 \
 *     npm run test:integration
 */
const mongoose = require('mongoose');

const shouldRun = Boolean(process.env.RUN_INTEGRATION) && Boolean(process.env.MONGO_URI);
const describeOrSkip = shouldRun ? describe : describe.skip;

describeOrSkip('full stack integration (requires live MongoDB + Redis)', () => {
  let createApp;
  let request;
  let RateLimiter;
  let redisClient;

  beforeAll(async () => {
    request = require('supertest');
    ({ createApp } = require('../../app'));
    ({ RateLimiter } = require('../../services/rateLimiter'));
    const Redis = require('ioredis');

    await mongoose.connect(process.env.MONGO_URI);
    redisClient = new Redis(process.env.REDIS_URL);
  }, 30_000);

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await redisClient.quit();
  });

  it('registers a tenant and ingests a signed generic webhook end-to-end against real Mongo/Redis', async () => {
    const rateLimiter = new RateLimiter(redisClient, { windowMs: 60_000, max: 50 });
    const app = createApp({ rateLimiter });

    const registerRes = await request(app).post('/api/auth/register').send({
      organizationName: 'Integration Test Org',
      email: `it-${Date.now()}@example.test`,
      password: 'super-secret-1',
    });
    expect(registerRes.status).toBe(201);

    const { signHexStyle } = require('../../services/signatureVerification');
    const rawBody = JSON.stringify({ type: 'integration.ping' });
    const header = signHexStyle(registerRes.body.apiKey.webhookSecrets.generic, rawBody);

    const webhookRes = await request(app)
      .post(`/webhooks/${registerRes.body.apiKey.keyId}/generic`)
      .type('json')
      .set('x-pulseboard-signature', header)
      .send(rawBody);

    expect(webhookRes.status).toBe(202);
  });
});
