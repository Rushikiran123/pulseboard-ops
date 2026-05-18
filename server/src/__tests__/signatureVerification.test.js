const {
  verifyStripeSignature,
  verifyGithubSignature,
  verifyGenericSignature,
  signStripeStyle,
  signHexStyle,
} = require('../services/signatureVerification');

describe('signatureVerification', () => {
  const secret = 'whsec_test_secret';
  const rawBody = JSON.stringify({ id: 'evt_1', type: 'payment.failed' });

  describe('verifyStripeSignature', () => {
    it('accepts a correctly signed payload within tolerance', () => {
      const now = Date.now();
      const header = signStripeStyle(secret, rawBody, Math.floor(now / 1000));
      const result = verifyStripeSignature({ rawBody, signatureHeader: header, secret, now });
      expect(result.valid).toBe(true);
    });

    it('rejects a payload signed with the wrong secret', () => {
      const header = signStripeStyle('wrong-secret', rawBody);
      const result = verifyStripeSignature({ rawBody, signatureHeader: header, secret });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('signature_mismatch');
    });

    it('rejects a stale timestamp outside the tolerance window', () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 10_000;
      const header = signStripeStyle(secret, rawBody, staleTimestamp);
      const result = verifyStripeSignature({ rawBody, signatureHeader: header, secret, toleranceSeconds: 300 });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('timestamp_out_of_tolerance');
    });

    it('rejects a missing signature header', () => {
      const result = verifyStripeSignature({ rawBody, signatureHeader: undefined, secret });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing_signature_header');
    });

    it('rejects a malformed signature header', () => {
      const result = verifyStripeSignature({ rawBody, signatureHeader: 'garbage', secret });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('malformed_signature_header');
    });

    it('detects tampered payload bodies', () => {
      const header = signStripeStyle(secret, rawBody);
      const tampered = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded' });
      const result = verifyStripeSignature({ rawBody: tampered, signatureHeader: header, secret });
      expect(result.valid).toBe(false);
    });
  });

  describe('verifyGithubSignature', () => {
    it('accepts a correctly signed payload', () => {
      const header = signHexStyle(secret, rawBody);
      const result = verifyGithubSignature({ rawBody, signatureHeader: header, secret });
      expect(result.valid).toBe(true);
    });

    it('rejects an unsupported scheme', () => {
      const result = verifyGithubSignature({ rawBody, signatureHeader: 'sha1=deadbeef', secret });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('unsupported_signature_scheme');
    });

    it('rejects a bad signature', () => {
      const result = verifyGithubSignature({ rawBody, signatureHeader: 'sha256=deadbeef', secret });
      expect(result.valid).toBe(false);
    });
  });

  describe('verifyGenericSignature', () => {
    it('accepts a correctly signed payload', () => {
      const header = signHexStyle(secret, rawBody);
      const result = verifyGenericSignature({ rawBody, signatureHeader: header, secret });
      expect(result.valid).toBe(true);
    });

    it('rejects when secret is wrong', () => {
      const header = signHexStyle('other-secret', rawBody);
      const result = verifyGenericSignature({ rawBody, signatureHeader: header, secret });
      expect(result.valid).toBe(false);
    });

    it('rejects a missing header', () => {
      const result = verifyGenericSignature({ rawBody, signatureHeader: null, secret });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing_signature_header');
    });
  });
});
