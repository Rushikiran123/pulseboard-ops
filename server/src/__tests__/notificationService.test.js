const { NotificationService } = require('../services/notificationService');

function fakeAlert(overrides = {}) {
  return { severity: 'critical', message: 'Payment failures spiked', ...overrides };
}

describe('NotificationService', () => {
  it('posts a formatted message to the Slack webhook when configured', async () => {
    const httpClient = { post: jest.fn().mockResolvedValue({ status: 200 }) };
    const service = new NotificationService({ httpClient });

    const result = await service.sendSlack('https://hooks.slack.example/webhook', fakeAlert());

    expect(result.delivered).toBe(true);
    expect(httpClient.post).toHaveBeenCalledWith(
      'https://hooks.slack.example/webhook',
      expect.objectContaining({ text: expect.stringContaining('Payment failures spiked') })
    );
  });

  it('skips Slack delivery when no webhook is configured', async () => {
    const httpClient = { post: jest.fn() };
    const service = new NotificationService({ httpClient });

    const result = await service.sendSlack(null, fakeAlert());

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('no_webhook_configured');
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it('reports a failed delivery instead of throwing when Slack errors', async () => {
    const httpClient = { post: jest.fn().mockRejectedValue(new Error('network down')) };
    const service = new NotificationService({ httpClient });

    const result = await service.sendSlack('https://hooks.slack.example/webhook', fakeAlert());

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('send_failed');
  });

  it('sends a formatted email through the injected transport', async () => {
    const mailTransport = { sendMail: jest.fn().mockResolvedValue({ messageId: '1' }) };
    const service = new NotificationService({ mailTransport });

    const result = await service.sendEmail('ops@example.com', fakeAlert());

    expect(result.delivered).toBe(true);
    expect(mailTransport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ops@example.com', subject: expect.stringContaining('CRITICAL') })
    );
  });

  it('skips email delivery when no recipient is configured', async () => {
    const mailTransport = { sendMail: jest.fn() };
    const service = new NotificationService({ mailTransport });

    const result = await service.sendEmail(undefined, fakeAlert());

    expect(result.delivered).toBe(false);
    expect(mailTransport.sendMail).not.toHaveBeenCalled();
  });

  it('notify() only dispatches the channels requested by the rule', async () => {
    const httpClient = { post: jest.fn().mockResolvedValue({}) };
    const mailTransport = { sendMail: jest.fn().mockResolvedValue({}) };
    const service = new NotificationService({ httpClient, mailTransport });

    const delivered = await service.notify(fakeAlert(), {
      channels: ['slack'],
      slackWebhookUrl: 'https://hooks.slack.example/webhook',
      alertEmail: 'ops@example.com',
    });

    expect(delivered).toEqual(['slack']);
    expect(httpClient.post).toHaveBeenCalledTimes(1);
    expect(mailTransport.sendMail).not.toHaveBeenCalled();
  });

  it('notify() dispatches to every requested channel and reports what succeeded', async () => {
    const httpClient = { post: jest.fn().mockResolvedValue({}) };
    const mailTransport = { sendMail: jest.fn().mockResolvedValue({}) };
    const service = new NotificationService({ httpClient, mailTransport });

    const delivered = await service.notify(fakeAlert(), {
      channels: ['slack', 'email'],
      slackWebhookUrl: 'https://hooks.slack.example/webhook',
      alertEmail: 'ops@example.com',
    });

    expect(delivered.sort()).toEqual(['email', 'slack']);
  });
});
