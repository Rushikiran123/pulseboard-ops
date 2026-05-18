const axios = require('axios');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Fans out a triggered alert to Slack and/or email. Both transports are
 * injectable so tests can assert on calls without ever touching the network.
 */
class NotificationService {
  constructor({ httpClient = axios, mailTransport = null } = {}) {
    this.httpClient = httpClient;
    // Falls back to nodemailer's jsonTransport (no real network I/O) when no
    // transport is supplied - safe default for local/dev/test. Production
    // wires a real SMTP transport in server.js via buildProductionMailTransport().
    this.mailTransport = mailTransport || nodemailer.createTransport({ jsonTransport: true });
  }

  formatSlackPayload(alert) {
    const emoji = { critical: ':rotating_light:', warning: ':warning:', info: ':information_source:' }[
      alert.severity
    ] || ':bell:';
    return {
      text: `${emoji} *${alert.severity.toUpperCase()}* — ${alert.message}`,
    };
  }

  formatEmailPayload(alert, toAddress) {
    return {
      from: 'alerts@pulseboard-ops.dev',
      to: toAddress,
      subject: `[pulseboard-ops] ${alert.severity.toUpperCase()} alert triggered`,
      text: alert.message,
    };
  }

  async sendSlack(webhookUrl, alert) {
    if (!webhookUrl) return { delivered: false, reason: 'no_webhook_configured' };
    try {
      await this.httpClient.post(webhookUrl, this.formatSlackPayload(alert));
      return { delivered: true };
    } catch (err) {
      logger.error('Slack notification failed', { error: err.message });
      return { delivered: false, reason: 'send_failed', error: err.message };
    }
  }

  async sendEmail(toAddress, alert) {
    if (!toAddress) return { delivered: false, reason: 'no_recipient_configured' };
    try {
      await this.mailTransport.sendMail(this.formatEmailPayload(alert, toAddress));
      return { delivered: true };
    } catch (err) {
      logger.error('Email notification failed', { error: err.message });
      return { delivered: false, reason: 'send_failed', error: err.message };
    }
  }

  /**
   * Dispatches an alert over every channel the rule requested.
   * @returns {Promise<string[]>} channels that were actually delivered
   */
  async notify(alert, { channels = [], slackWebhookUrl, alertEmail }) {
    const delivered = [];

    if (channels.includes('slack')) {
      const result = await this.sendSlack(slackWebhookUrl, alert);
      if (result.delivered) delivered.push('slack');
    }

    if (channels.includes('email')) {
      const result = await this.sendEmail(alertEmail, alert);
      if (result.delivered) delivered.push('email');
    }

    return delivered;
  }
}

/**
 * Builds a real SMTP transport for production use, when SMTP credentials
 * are configured; returns null otherwise (caller should fall back to the
 * jsonTransport default, e.g. for a demo deployment with no mail provider).
 */
function buildProductionMailTransport(smtpConfig) {
  if (!smtpConfig?.host || !smtpConfig?.user || !smtpConfig?.pass) return null;
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    auth: { user: smtpConfig.user, pass: smtpConfig.pass },
  });
}

module.exports = { NotificationService, buildProductionMailTransport };
