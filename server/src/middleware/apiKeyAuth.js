const ApiKey = require('../models/ApiKey');
const {
  verifyStripeSignature,
  verifyGithubSignature,
  verifyGenericSignature,
} = require('../services/signatureVerification');
const env = require('../config/env');

const HEADER_BY_PROVIDER = {
  stripe: 'stripe-signature',
  github: 'x-hub-signature-256',
  generic: 'x-pulseboard-signature',
};

/**
 * Resolves the tenant (ApiKey + organization) from the `:keyId` route param.
 * Attaches `req.apiKeyDoc` for downstream signature verification.
 */
function resolveApiKey() {
  return async (req, res, next) => {
    try {
      const apiKeyDoc = await ApiKey.findOne({ keyId: req.params.keyId, revoked: false });
      if (!apiKeyDoc) {
        return res.status(404).json({ error: 'unknown_api_key' });
      }
      req.apiKeyDoc = apiKeyDoc;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Verifies the provider-specific webhook signature against the raw body
 * captured by express.json's `verify` hook (see app.js).
 */
function verifyWebhookSignature(provider) {
  return (req, res, next) => {
    const secret = req.apiKeyDoc?.webhookSecrets?.[provider];
    if (!secret) {
      return res.status(400).json({ error: 'provider_not_configured', provider });
    }

    const headerName = HEADER_BY_PROVIDER[provider];
    const signatureHeader = req.headers[headerName];
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';

    let result;
    if (provider === 'stripe') {
      result = verifyStripeSignature({
        rawBody,
        signatureHeader,
        secret,
        toleranceSeconds: env.stripe.toleranceSeconds,
      });
    } else if (provider === 'github') {
      result = verifyGithubSignature({ rawBody, signatureHeader, secret });
    } else {
      result = verifyGenericSignature({ rawBody, signatureHeader, secret });
    }

    if (!result.valid) {
      return res.status(401).json({ error: 'invalid_signature', reason: result.reason });
    }

    return next();
  };
}

module.exports = { resolveApiKey, verifyWebhookSignature, HEADER_BY_PROVIDER };
