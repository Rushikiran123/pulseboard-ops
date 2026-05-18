const request = require('supertest');

jest.mock('../../models/Rule', () => require('../helpers/fakeModel').createFakeModel());

const { createApp } = require('../../app');
const Rule = require('../../models/Rule');
const { signToken } = require('../../services/authService');

const ORG_ID = 'org-abc';

function authHeader(role = 'admin') {
  return `Bearer ${signToken({ userId: 'u1', organizationId: ORG_ID, role })}`;
}

describe('rules routes', () => {
  let app;

  beforeEach(() => {
    Rule.__reset();
    app = createApp({});
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(401);
  });

  it('creates a threshold rule for an admin', async () => {
    const res = await request(app)
      .post('/api/rules')
      .set('Authorization', authHeader('admin'))
      .send({
        name: 'Too many failed payments',
        provider: 'stripe',
        eventType: 'payment.failed',
        conditionType: 'threshold',
        config: { windowMinutes: 10, count: 5 },
        severity: 'critical',
        channels: ['slack'],
      });

    expect(res.status).toBe(201);
    expect(res.body.rule.organizationId).toBe(ORG_ID);
    expect(Rule.__store).toHaveLength(1);
  });

  it('rejects rule creation from a member (insufficient role)', async () => {
    const res = await request(app)
      .post('/api/rules')
      .set('Authorization', authHeader('member'))
      .send({ name: 'x', conditionType: 'pattern', config: { field: 'type', operator: 'eq', value: 'x' } });

    expect(res.status).toBe(403);
  });

  it('validates conditionType-specific config requirements', async () => {
    const res = await request(app)
      .post('/api/rules')
      .set('Authorization', authHeader('owner'))
      .send({ name: 'broken threshold', conditionType: 'threshold', config: {} });

    expect(res.status).toBe(400);
  });

  it('lists only rules belonging to the caller organization', async () => {
    await Rule.create({ organizationId: ORG_ID, name: 'mine', conditionType: 'pattern', config: {} });
    await Rule.create({ organizationId: 'other-org', name: 'not-mine', conditionType: 'pattern', config: {} });

    const res = await request(app).get('/api/rules').set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(1);
    expect(res.body.rules[0].name).toBe('mine');
  });

  it('updates an existing rule scoped to the caller organization', async () => {
    const rule = await Rule.create({ organizationId: ORG_ID, name: 'old name', conditionType: 'pattern', config: {}, enabled: true });

    const res = await request(app)
      .patch(`/api/rules/${rule._id}`)
      .set('Authorization', authHeader('owner'))
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.rule.enabled).toBe(false);
  });

  it('returns 404 when updating a rule from a different organization', async () => {
    const rule = await Rule.create({ organizationId: 'other-org', name: 'not-mine', conditionType: 'pattern', config: {} });

    const res = await request(app)
      .patch(`/api/rules/${rule._id}`)
      .set('Authorization', authHeader('owner'))
      .send({ enabled: false });

    expect(res.status).toBe(404);
  });

  it('deletes a rule scoped to the caller organization', async () => {
    const rule = await Rule.create({ organizationId: ORG_ID, name: 'to delete', conditionType: 'pattern', config: {} });

    const res = await request(app).delete(`/api/rules/${rule._id}`).set('Authorization', authHeader('owner'));

    expect(res.status).toBe(204);
    expect(Rule.__store).toHaveLength(0);
  });
});
