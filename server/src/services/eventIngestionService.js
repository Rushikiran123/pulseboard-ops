const Event = require('../models/Event');
const Rule = require('../models/Rule');
const Alert = require('../models/Alert');
const Organization = require('../models/Organization');
const { evaluateEvent } = require('./ruleEngine');
const { NotificationService } = require('./notificationService');
const socketService = require('./socketService');

const defaultNotificationService = new NotificationService();

async function countMatchingEvents(organizationId, matcher, since) {
  const filter = { organizationId, receivedAt: { $gte: since } };
  if (matcher.provider && matcher.provider !== 'any') filter.provider = matcher.provider;
  if (matcher.eventType && matcher.eventType !== '*') {
    if (matcher.eventType.endsWith('.*')) {
      filter.type = new RegExp(`^${matcher.eventType.slice(0, -2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    } else {
      filter.type = matcher.eventType;
    }
  }
  return Event.countDocuments(filter);
}

/**
 * Persists a normalized event, evaluates it against the organization's rule
 * set, persists+notifies any resulting alerts, and pushes both the event and
 * any alerts to the live Socket.IO dashboard.
 *
 * @param {{organizationId: string, provider: string, type: string, payload: object}} input
 * @param {{notificationService?: NotificationService, countMatchingEvents?: function}} [deps]
 */
async function ingestEvent(input, deps = {}) {
  const notificationService = deps.notificationService || defaultNotificationService;
  const counter = deps.countMatchingEvents || countMatchingEvents;

  const event = await Event.create({
    organizationId: input.organizationId,
    provider: input.provider,
    type: input.type,
    payload: input.payload || {},
    receivedAt: new Date(),
  });

  socketService.emitEvent(String(input.organizationId), serializeEvent(event));

  const rules = await Rule.find({ organizationId: input.organizationId, enabled: true });
  const triggered = await evaluateEvent(event.toObject ? event.toObject() : event, rules, counter);

  const organization = triggered.length
    ? await Organization.findById(input.organizationId)
    : null;

  const alerts = [];
  for (const { rule, message, meta } of triggered) {
    const alert = await Alert.create({
      organizationId: input.organizationId,
      ruleId: rule._id,
      eventId: event._id,
      message,
      severity: rule.severity,
      meta,
      triggeredAt: new Date(),
    });

    const delivered = await notificationService.notify(alert, {
      channels: rule.channels || [],
      slackWebhookUrl: organization?.slackWebhookUrl,
      alertEmail: organization?.alertEmail,
    });

    if (rule.channels?.includes('socket')) delivered.push('socket');
    alert.channelsNotified = delivered;
    await alert.save();

    await Rule.findByIdAndUpdate(rule._id, { lastTriggeredAt: new Date() });

    socketService.emitAlert(String(input.organizationId), serializeAlert(alert));
    alerts.push(alert);
  }

  return { event, alerts };
}

function serializeEvent(event) {
  const obj = event.toObject ? event.toObject() : event;
  return {
    id: String(obj._id),
    provider: obj.provider,
    type: obj.type,
    payload: obj.payload,
    receivedAt: obj.receivedAt,
  };
}

function serializeAlert(alert) {
  const obj = alert.toObject ? alert.toObject() : alert;
  return {
    id: String(obj._id),
    ruleId: String(obj.ruleId),
    message: obj.message,
    severity: obj.severity,
    status: obj.status,
    triggeredAt: obj.triggeredAt,
    channelsNotified: obj.channelsNotified,
  };
}

module.exports = { ingestEvent, countMatchingEvents, serializeEvent, serializeAlert };
