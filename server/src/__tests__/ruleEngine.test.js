const { evaluateEvent } = require('../services/ruleEngine');

function baseRule(overrides = {}) {
  return {
    _id: 'rule-1',
    organizationId: 'org-1',
    name: 'test rule',
    provider: 'any',
    eventType: '*',
    conditionType: 'pattern',
    config: {},
    severity: 'warning',
    channels: ['socket'],
    cooldownMinutes: 10,
    lastTriggeredAt: null,
    enabled: true,
    ...overrides,
  };
}

describe('ruleEngine.evaluateEvent', () => {
  it('triggers a pattern rule on an exact field match', async () => {
    const rule = baseRule({
      name: 'payment failed',
      provider: 'stripe',
      eventType: 'payment.failed',
      conditionType: 'pattern',
      config: { field: 'payload.status', operator: 'eq', value: 'failed' },
    });
    const event = { provider: 'stripe', type: 'payment.failed', payload: { status: 'failed' } };

    const alerts = await evaluateEvent(event, [rule], async () => 0);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toMatch(/payment failed/);
  });

  it('does not trigger a pattern rule when the field does not match', async () => {
    const rule = baseRule({
      conditionType: 'pattern',
      config: { field: 'payload.status', operator: 'eq', value: 'failed' },
    });
    const event = { provider: 'stripe', type: 'payment.failed', payload: { status: 'succeeded' } };

    const alerts = await evaluateEvent(event, [rule], async () => 0);
    expect(alerts).toHaveLength(0);
  });

  it('supports contains/regex operators for pattern rules', async () => {
    const rule = baseRule({
      conditionType: 'pattern',
      config: { field: 'payload.message', operator: 'regex', value: '^deploy (failed|error)$' },
    });
    const event = { provider: 'generic', type: 'deploy.status', payload: { message: 'deploy failed' } };

    const alerts = await evaluateEvent(event, [rule], async () => 0);
    expect(alerts).toHaveLength(1);
  });

  it('skips rules whose provider does not match the event', async () => {
    const rule = baseRule({ provider: 'github', conditionType: 'pattern', config: { field: 'type', operator: 'eq', value: 'push' } });
    const event = { provider: 'stripe', type: 'push', payload: {} };
    const alerts = await evaluateEvent(event, [rule], async () => 0);
    expect(alerts).toHaveLength(0);
  });

  it('supports wildcard eventType prefixes', async () => {
    const rule = baseRule({ eventType: 'payment.*', conditionType: 'pattern', config: { field: 'type', operator: 'contains', value: 'failed' } });
    const event = { provider: 'stripe', type: 'payment.failed', payload: {} };
    const alerts = await evaluateEvent(event, [rule], async () => 0);
    expect(alerts).toHaveLength(1);
  });

  it('skips disabled rules entirely', async () => {
    const rule = baseRule({ enabled: false, conditionType: 'pattern', config: { field: 'type', operator: 'eq', value: 'push' } });
    const event = { provider: 'any', type: 'push', payload: {} };
    const alerts = await evaluateEvent(event, [rule], async () => 0);
    expect(alerts).toHaveLength(0);
  });

  it('triggers a threshold rule once the count meets the configured minimum', async () => {
    const rule = baseRule({
      name: 'too many failures',
      provider: 'stripe',
      eventType: 'payment.failed',
      conditionType: 'threshold',
      config: { windowMinutes: 10, count: 5 },
    });
    const event = { provider: 'stripe', type: 'payment.failed', payload: {} };
    const counter = jest.fn().mockResolvedValue(5);

    const alerts = await evaluateEvent(event, [rule], counter);
    expect(alerts).toHaveLength(1);
    expect(counter).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ provider: 'stripe', eventType: 'payment.failed' }),
      expect.any(Date)
    );
  });

  it('does not trigger a threshold rule below the configured minimum', async () => {
    const rule = baseRule({
      conditionType: 'threshold',
      config: { windowMinutes: 10, count: 5 },
    });
    const event = { provider: 'any', type: 'anything', payload: {} };
    const alerts = await evaluateEvent(event, [rule], async () => 4);
    expect(alerts).toHaveLength(0);
  });

  it('triggers a spike rule when the current window heavily outpaces the baseline', async () => {
    const rule = baseRule({
      name: 'signup spike',
      conditionType: 'spike',
      config: { windowMinutes: 15, factor: 3, minBaseline: 2 },
    });
    const event = { provider: 'custom', type: 'signup.created', payload: {} };

    // countMatchingEvents(orgId, matcher, since) is called twice: once for the
    // current window, once for (current + baseline) combined window.
    const counter = jest
      .fn()
      .mockResolvedValueOnce(30) // current window count
      .mockResolvedValueOnce(40); // combined (current + baseline) window count -> baseline = 10

    const alerts = await evaluateEvent(event, [rule], counter);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].meta.ratio).toBeCloseTo(3, 5);
  });

  it('does not trigger a spike rule when baseline traffic is too low to be meaningful', async () => {
    const rule = baseRule({
      conditionType: 'spike',
      config: { windowMinutes: 15, factor: 3, minBaseline: 5 },
    });
    const event = { provider: 'custom', type: 'signup.created', payload: {} };
    const counter = jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(11); // baseline = 1 < minBaseline

    const alerts = await evaluateEvent(event, [rule], counter);
    expect(alerts).toHaveLength(0);
  });

  it('respects an active cooldown window and suppresses re-triggering', async () => {
    const rule = baseRule({
      conditionType: 'pattern',
      config: { field: 'type', operator: 'eq', value: 'push' },
      cooldownMinutes: 10,
      lastTriggeredAt: new Date(Date.now() - 60_000), // 1 minute ago
    });
    const event = { provider: 'any', type: 'push', payload: {} };
    const alerts = await evaluateEvent(event, [rule], async () => 0);
    expect(alerts).toHaveLength(0);
  });

  it('allows re-triggering once the cooldown window has elapsed', async () => {
    const rule = baseRule({
      conditionType: 'pattern',
      config: { field: 'type', operator: 'eq', value: 'push' },
      cooldownMinutes: 10,
      lastTriggeredAt: new Date(Date.now() - 11 * 60_000),
    });
    const event = { provider: 'any', type: 'push', payload: {} };
    const alerts = await evaluateEvent(event, [rule], async () => 0);
    expect(alerts).toHaveLength(1);
  });

  it('evaluates multiple rules independently and returns every triggered alert', async () => {
    const rule1 = baseRule({ _id: 'r1', name: 'rule one', conditionType: 'pattern', config: { field: 'type', operator: 'eq', value: 'push' } });
    const rule2 = baseRule({ _id: 'r2', name: 'rule two', conditionType: 'pattern', config: { field: 'type', operator: 'eq', value: 'push' } });
    const event = { provider: 'any', type: 'push', payload: {} };
    const alerts = await evaluateEvent(event, [rule1, rule2], async () => 0);
    expect(alerts).toHaveLength(2);
  });
});
