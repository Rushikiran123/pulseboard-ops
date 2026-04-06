const request = require('supertest');

jest.mock('../../models/Organization', () => require('../helpers/fakeModel').createFakeModel());
jest.mock('../../models/ApiKey', () => require('../helpers/fakeModel').createFakeModel());

const { createApp } = require('../../app');
const Organization = require('../../models/Organization');
const ApiKey = require('../../models/ApiKey');
const { signToken } = require('../../services/authService');

const ORG_ID = 'org-settings';

function authHeader(role = 'owner') {
  return `Bearer ${signToken({ userId: 'u1', organizationId: ORG_ID, role })}`;
}

describe('organizations routes', () => {
  let app;

  beforeEach(async () => {
    Organization.__reset();
    ApiKey.__reset();
    app = createApp({});
    await Organization.create({ _id: ORG_ID, name: 'Acme', slug: 'acme' });
  });

  it('returns the caller organization', async () => {
    const res = await request(app).get('/api/organizations/me').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.organization.name).toBe('Acme');
  });

  it('updates Slack webhook and alert email settings', async () => {
    const res = await request(app)
      .patch('/api/organizations/me')
      .set('Authorization', authHeader('owner'))
      .send({ slackWebhookUrl: 'https://hooks.slack.example/new', alertEmail: 'ops@acme.test' });

    expect(res.status).toBe(200);
    expect(res.body.organization.slackWebhookUrl).toBe('https://hooks.slack.example/new');
    expect(res.body.organization.alertEmail).toBe('ops@acme.test');
  });

  it('rejects settings updates from a member role', async () => {
    const res = await request(app)
      .patch('/api/organizations/me')
      .set('Authorization', authHeader('member'))
      .send({ alertEmail: 'ops@acme.test' });

    expect(res.status).toBe(403);
  });

  it('lists sanitized API keys without leaking secrets', async () => {
    await ApiKey.create({
      organizationId: ORG_ID,
      keyId: 'pk_abc',
      secretHash: 'super-secret-hash',
      webhookSecrets: { stripe: 'shh-stripe', github: null, generic: 'shh-generic' },
      revoked: false,
    });

    const res = await request(app).get('/api/organizations/me/api-keys').set('Authorization', authHeader('owner'));

    expect(res.status).toBe(200);
    expect(res.body.apiKeys).toHaveLength(1);
    expect(res.body.apiKeys[0].keyId).toBe('pk_abc');
    expect(res.body.apiKeys[0].providersConfigured.sort()).toEqual(['generic', 'stripe']);
    expect(JSON.stringify(res.body.apiKeys)).not.toMatch(/secretHash|super-secret-hash|shh-/);
  });
});
