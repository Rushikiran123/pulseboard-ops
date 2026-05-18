const crypto = require('crypto');

/**
 * Signature verification for the three ingestion providers supported by
 * pulseboard-ops. Every function is pure (no I/O) so it can be unit tested
 * directly with known fixtures and is safe to call on the hot ingestion path.
 */

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hmacSha256Hex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Stripe-style verification: header looks like `t=<timestamp>,v1=<hex>`.
 * The signed payload is `${timestamp}.${rawBody}`. A tolerance window
 * protects against replay of old requests.
 */
function verifyStripeSignature({ rawBody, signatureHeader, secret, toleranceSeconds = 300, now = Date.now() }) {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { valid: false, reason: 'missing_signature_header' };
  }

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((chunk) => {
      const [key, value] = chunk.split('=');
      return [key, value];
    })
  );

  const timestamp = parts.t;
  const signature = parts.v1;

  if (!timestamp || !signature) {
    return { valid: false, reason: 'malformed_signature_header' };
  }

  const ageSeconds = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (!Number.isFinite(Number(timestamp)) || ageSeconds > toleranceSeconds) {
    return { valid: false, reason: 'timestamp_out_of_tolerance' };
  }

  const expected = hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  const valid = timingSafeEqualHex(expected, signature);
  return { valid, reason: valid ? null : 'signature_mismatch' };
}

/**
 * GitHub-style verification: header `X-Hub-Signature-256: sha256=<hex>`
 * computed over the raw request body.
 */
function verifyGithubSignature({ rawBody, signatureHeader, secret }) {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { valid: false, reason: 'missing_signature_header' };
  }
  if (!signatureHeader.startsWith('sha256=')) {
    return { valid: false, reason: 'unsupported_signature_scheme' };
  }
  const provided = signatureHeader.slice('sha256='.length);
  const expected = hmacSha256Hex(secret, rawBody);
  const valid = timingSafeEqualHex(expected, provided);
  return { valid, reason: valid ? null : 'signature_mismatch' };
}

/**
 * Generic JSON provider + custom event SDK verification: header
 * `X-Pulseboard-Signature: sha256=<hex>` computed the same way as GitHub,
 * kept as a distinct named scheme so tenants who only integrate the generic
 * provider have a stable, documented header of their own.
 */
function verifyGenericSignature({ rawBody, signatureHeader, secret }) {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { valid: false, reason: 'missing_signature_header' };
  }
  if (!signatureHeader.startsWith('sha256=')) {
    return { valid: false, reason: 'unsupported_signature_scheme' };
  }
  const provided = signatureHeader.slice('sha256='.length);
  const expected = hmacSha256Hex(secret, rawBody);
  const valid = timingSafeEqualHex(expected, provided);
  return { valid, reason: valid ? null : 'signature_mismatch' };
}

function signStripeStyle(secret, rawBody, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return `t=${timestamp},v1=${signature}`;
}

function signHexStyle(secret, rawBody) {
  return `sha256=${hmacSha256Hex(secret, rawBody)}`;
}

module.exports = {
  verifyStripeSignature,
  verifyGithubSignature,
  verifyGenericSignature,
  signStripeStyle,
  signHexStyle,
  hmacSha256Hex,
};
