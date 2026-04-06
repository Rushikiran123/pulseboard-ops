const request = require('supertest');

jest.mock('../../models/Organization', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/User', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/ApiKey', () => require('../helpers/fakeModel').createFakeModel());

const { createApp } = require('../../app');
const Organization = require('../../models/Organization');
const User = require('../../models/User');
const ApiKey = require('../../models/ApiKey');

describe('POST /api/auth/register', () => {
  let app;

  beforeEach(() => {
    Organization.__reset();
    User.__reset();
    ApiKey.__reset();
    app = createApp({});
  });

  it('creates an organization, owner user, and default API key', async () => {
    const res = await request(app).post('/api/auth/register').send({
      organizationName: 'Acme Inc',
      email: 'founder@acme.test',
      password: 'super-secret-1',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.organization.name).toBe('Acme Inc');
    expect(res.body.user.role).toBe('owner');
    expect(res.body.apiKey.keyId).toMatch(/^pk_/);
    expect(res.body.apiKey.webhookSecrets.stripe).toEqual(expect.any(String));
    expect(res.body.apiKey.webhookSecrets.github).toEqual(expect.any(String));
    expect(res.body.apiKey.webhookSecrets.generic).toEqual(expect.any(String));

    expect(Organization.__store).toHaveLength(1);
    expect(User.__store).toHaveLength(1);
    expect(ApiKey.__store).toHaveLength(1);
  });

  it('rejects registration with a short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      organizationName: 'Acme Inc',
      email: 'founder@acme.test',
      password: 'short',
    });
    expect(res.status).toBe(400);
  });

  it('rejects registration missing required fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@y.test' });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send({
      organizationName: 'Acme Inc',
      email: 'dupe@acme.test',
      password: 'super-secret-1',
    });

    const res = await request(app).post('/api/auth/register').send({
      organizationName: 'Beta LLC',
      email: 'dupe@acme.test',
      password: 'super-secret-2',
    });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  let app;

  beforeEach(async () => {
    Organization.__reset();
    User.__reset();
    ApiKey.__reset();
    app = createApp({});
    await request(app).post('/api/auth/register').send({
      organizationName: 'Acme Inc',
      email: 'login@acme.test',
      password: 'super-secret-1',
    });
  });

  it('logs in with correct credentials and returns a token', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@acme.test',
      password: 'super-secret-1',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rejects an unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@acme.test',
      password: 'super-secret-1',
    });
    expect(res.status).toBe(401);
  });

  it('rejects the wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@acme.test',
      password: 'totally-wrong',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a login request missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'login@acme.test' });
    expect(res.status).toBe(400);
  });
});
