const { PulseboardClient } = require('../../../sdk/pulseboardClient');
const { verifyGenericSignature } = require('../services/signatureVerification');

describe('PulseboardClient (custom event SDK)', () => {
  const secret = 'sdk-integration-secret';

  it('signs requests in a way the server\'s generic verifier accepts', () => {
    const client = new PulseboardClient({ baseUrl: 'https://ingest.example.test', keyId: 'pk_123', secret });
    const { rawBody, headers } = client.buildRequest('signup.created', { plan: 'pro' });

    const result = verifyGenericSignature({
      rawBody,
      signatureHeader: headers['X-Pulseboard-Signature'],
      secret,
    });

    expect(result.valid).toBe(true);
  });

  it('produces a signature the server rejects when the secret differs', () => {
    const client = new PulseboardClient({ baseUrl: 'https://ingest.example.test', keyId: 'pk_123', secret: 'wrong' });
    const { rawBody, headers } = client.buildRequest('signup.created', {});

    const result = verifyGenericSignature({
      rawBody,
      signatureHeader: headers['X-Pulseboard-Signature'],
      secret,
    });

    expect(result.valid).toBe(false);
  });

  it('builds the correct ingestion URL from baseUrl + keyId', () => {
    const client = new PulseboardClient({ baseUrl: 'https://ingest.example.test/', keyId: 'pk_abc', secret });
    const { url } = client.buildRequest('ping', {});
    expect(url).toBe('https://ingest.example.test/api/events/pk_abc/track');
  });

  it('track() invokes the injected transport with a signed request', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ statusCode: 202, body: '{"received":true}' });
    const client = new PulseboardClient({ baseUrl: 'https://ingest.example.test', keyId: 'pk_123', secret, fetchImpl });

    const res = await client.track('signup.created', { plan: 'pro' });

    expect(res.statusCode).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://ingest.example.test/api/events/pk_123/track');
    expect(options.headers['X-Pulseboard-Signature']).toMatch(/^sha256=/);
    expect(JSON.parse(options.body)).toEqual({ type: 'signup.created', properties: { plan: 'pro' } });
  });

  it('rejects track() calls without an event type', async () => {
    const client = new PulseboardClient({ baseUrl: 'https://ingest.example.test', keyId: 'pk_123', secret, fetchImpl: jest.fn() });
    await expect(client.track()).rejects.toThrow(/event type/);
  });

  it('throws when constructed without required options', () => {
    expect(() => new PulseboardClient({})).toThrow();
  });
});
