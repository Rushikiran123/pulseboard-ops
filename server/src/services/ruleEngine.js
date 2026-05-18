/**
 * Rule engine: evaluates a single incoming event against an organization's
 * active rules and decides which alerts should fire.
 *
 * Kept pure/side-effect free w.r.t. persistence: callers inject a
 * `countMatchingEvents(orgId, matcher, sinceDate)` function so the engine can
 * be unit tested with fixtures instead of a live database, while production
 * wires it to a Mongo `countDocuments` query.
 */

const CONDITION_TYPES = new Set(['pattern', 'threshold', 'spike']);

function eventTypeMatches(rule, event) {
  if (!rule.eventType || rule.eventType === '*') return true;
  if (rule.eventType.endsWith('.*')) {
    const prefix = rule.eventType.slice(0, -2);
    return typeof event.type === 'string' && event.type.startsWith(prefix);
  }
  return event.type === rule.eventType;
}

function providerMatches(rule, event) {
  if (!rule.provider || rule.provider === 'any') return true;
  return rule.provider === event.provider;
}

function getFieldValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function applyOperator(operator, actual, expected) {
  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'contains':
      return typeof actual === 'string' && actual.includes(expected);
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    case 'regex':
      try {
        return new RegExp(expected).test(String(actual));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function evaluatePatternRule(rule, event) {
  const { field, operator, value } = rule.config || {};
  if (!field || !operator) return false;
  const actual = getFieldValue(event, field);
  return applyOperator(operator, actual, value);
}

async function evaluateThresholdRule(rule, event, countMatchingEvents, now) {
  const { windowMinutes, count } = rule.config || {};
  if (!windowMinutes || !count) return { triggered: false };
  const since = new Date(now.getTime() - windowMinutes * 60_000);
  const matcher = { organizationId: rule.organizationId, provider: rule.provider, eventType: rule.eventType };
  const matches = await countMatchingEvents(rule.organizationId, matcher, since);
  return { triggered: matches >= count, observedCount: matches, threshold: count };
}

async function evaluateSpikeRule(rule, event, countMatchingEvents, now) {
  const { windowMinutes, factor, minBaseline = 1 } = rule.config || {};
  if (!windowMinutes || !factor) return { triggered: false };
  const matcher = { organizationId: rule.organizationId, provider: rule.provider, eventType: rule.eventType };

  const currentSince = new Date(now.getTime() - windowMinutes * 60_000);
  const baselineSince = new Date(now.getTime() - windowMinutes * 60_000 * 2);

  const currentCount = await countMatchingEvents(rule.organizationId, matcher, currentSince);
  const totalCount = await countMatchingEvents(rule.organizationId, matcher, baselineSince);
  const baselineCount = Math.max(totalCount - currentCount, 0);

  if (baselineCount < minBaseline) {
    return { triggered: false, currentCount, baselineCount };
  }

  const ratio = currentCount / Math.max(baselineCount, 1);
  return { triggered: ratio >= factor, currentCount, baselineCount, ratio };
}

function isInCooldown(rule, now) {
  if (!rule.cooldownMinutes || !rule.lastTriggeredAt) return false;
  const elapsedMs = now.getTime() - new Date(rule.lastTriggeredAt).getTime();
  return elapsedMs < rule.cooldownMinutes * 60_000;
}

/**
 * @param {object} event - normalized event document/object
 * @param {object[]} rules - active rules for the event's organization
 * @param {function} countMatchingEvents - async (orgId, matcher, sinceDate) => number
 * @param {Date} [now]
 * @returns {Promise<Array<{rule: object, message: string, meta: object}>>}
 */
async function evaluateEvent(event, rules, countMatchingEvents, now = new Date()) {
  const triggeredAlerts = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!CONDITION_TYPES.has(rule.conditionType)) continue;
    if (!providerMatches(rule, event)) continue;
    if (!eventTypeMatches(rule, event)) continue;
    if (isInCooldown(rule, now)) continue;

    if (rule.conditionType === 'pattern') {
      if (evaluatePatternRule(rule, event)) {
        triggeredAlerts.push({
          rule,
          message: `Pattern rule "${rule.name}" matched event ${event.type}`,
          meta: { conditionType: 'pattern' },
        });
      }
      continue;
    }

    if (rule.conditionType === 'threshold') {
      const result = await evaluateThresholdRule(rule, event, countMatchingEvents, now);
      if (result.triggered) {
        triggeredAlerts.push({
          rule,
          message: `Threshold rule "${rule.name}": ${result.observedCount} events (>= ${result.threshold}) in the last ${rule.config.windowMinutes}m`,
          meta: { conditionType: 'threshold', ...result },
        });
      }
      continue;
    }

    if (rule.conditionType === 'spike') {
      const result = await evaluateSpikeRule(rule, event, countMatchingEvents, now);
      if (result.triggered) {
        triggeredAlerts.push({
          rule,
          message: `Spike rule "${rule.name}": ${result.currentCount} events vs baseline ${result.baselineCount} (ratio ${result.ratio.toFixed(2)}x)`,
          meta: { conditionType: 'spike', ...result },
        });
      }
    }
  }

  return triggeredAlerts;
}

module.exports = {
  evaluateEvent,
  evaluatePatternRule,
  evaluateThresholdRule,
  evaluateSpikeRule,
  eventTypeMatches,
  providerMatches,
  applyOperator,
  getFieldValue,
  isInCooldown,
};
