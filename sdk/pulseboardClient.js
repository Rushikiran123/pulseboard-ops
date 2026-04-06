const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * pulseboard-ops custom event SDK.
 *
 * Ships business events straight into a tenant's pulseboard-ops dashboard,
 * signed the same way the "generic" webhook provider is: an HMAC-SHA256 of
 * the raw JSON body under the `X-Pulseboard-Signature: sha256=<hex>` header.
 *
 * Usage:
 *   const { PulseboardClient } = require('pulseboard-ops-sdk');
 *   const client = new PulseboardClient({
 *     baseUrl: 'https://ingest.pulseboard-ops.example',
 *     keyId: 'pk_live_...',
 *     secret: process.env.PULSEBOARD_SECRET,
 *   });
 *   await client.track('signup.created', { plan: 'pro', userId: 'u_123' });
 */
class PulseboardClient {
  constructor({ baseUrl, keyId, secret, fetchImpl }) {
    if (!baseUrl || !keyId || !secret) {
      throw new Error('PulseboardClient requires baseUrl, keyId, and secret');
    }
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.keyId = keyId;
    this.secret = secret;
    this.fetchImpl = fetchImpl || defaultRequest;
  }

  /**
   * Computes the signature header for a given raw JSON body. Exposed
   * separately so it can be unit tested against the server's verifier
   * without needing to perform an HTTP call.
   */
  sign(rawBody) {
    const hex = crypto.createHmac('sha256', this.secret).update(rawBody, 'utf8').digest('hex');
    return `sha256=${hex}`;
  }

  buildRequest(type, properties = {}) {
    const rawBody = JSON.stringify({ type, properties });
    return {
      url: `${this.baseUrl}/api/events/${this.keyId}/track`,
      rawBody,
      headers: {
        'Content-Type': 'application/json',
        'X-Pulseboard-Signature': this.sign(rawBody),
      },
    };
  }

  async track(type, properties = {}) {
    if (!type || typeof type !== 'string') {
      throw new Error('track(type, properties) requires a non-empty string event type');
    }
    const { url, rawBody, headers } = this.buildRequest(type, properties);
    return this.fetchImpl(url, { method: 'POST', headers, body: rawBody });
  }
}

function defaultRequest(urlString, { method, headers, body }) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      url,
      { method, headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { PulseboardClient };
