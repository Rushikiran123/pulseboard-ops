const request = require('supertest');

jest.mock('../../models/Alert', () => require('../helpers/fakeModel').createFakeModel());

const { createApp } = require('../../app');
const Alert = require('../../models/Alert');
const { signToken } = require('../../services/authService');

const ORG_ID = 'org-abc';

function authHeader(role = 'member') {
  return `Bearer ${signToken({ userId: 'u1', organizationId: ORG_ID, role })}`;
}

describe('alerts routes', () => {
  let app;

  beforeEach(() => {
    Alert.__reset();
    app = createApp({});
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(401);
  });

  it('lists alerts for the caller organization, newest first', async () => {
    await Alert.create({
      organizationId: ORG_ID,
      ruleId: 'r1',
      message: 'older',
      severity: 'info',
      triggeredAt: new Date(Date.now() - 60_000),
    });
    await Alert.create({
      organizationId: ORG_ID,
      ruleId: 'r2',
      message: 'newer',
      severity: 'critical',
      triggeredAt: new Date(),
    });
    await Alert.create({ organizationId: 'other-org', ruleId: 'r3', message: 'not mine', severity: 'info' });

    const res = await request(app).get('/api/alerts').set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(2);
    expect(res.body.alerts[0].message).toBe('newer');
  });

  it('filters alerts by status', async () => {
    await Alert.create({ organizationId: ORG_ID, ruleId: 'r1', message: 'open one', status: 'open' });
    await Alert.create({ organizationId: ORG_ID, ruleId: 'r2', message: 'resolved one', status: 'resolved' });

    const res = await request(app).get('/api/alerts?status=resolved').set('Authorization', authHeader());

    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].message).toBe('resolved one');
  });

  it('acknowledges an alert scoped to the caller organization', async () => {
    const alert = await Alert.create({ organizationId: ORG_ID, ruleId: 'r1', message: 'x', status: 'open' });

    const res = await request(app)
      .patch(`/api/alerts/${alert._id}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'acknowledged' });

    expect(res.status).toBe(200);
    expect(res.body.alert.status).toBe('acknowledged');
  });

  it('rejects an invalid status value', async () => {
    const alert = await Alert.create({ organizationId: ORG_ID, ruleId: 'r1', message: 'x', status: 'open' });

    const res = await request(app)
      .patch(`/api/alerts/${alert._id}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'not-a-real-status' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when acknowledging an alert from a different organization', async () => {
    const alert = await Alert.create({ organizationId: 'other-org', ruleId: 'r1', message: 'x', status: 'open' });

    const res = await request(app)
      .patch(`/api/alerts/${alert._id}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'resolved' });

    expect(res.status).toBe(404);
  });
});
