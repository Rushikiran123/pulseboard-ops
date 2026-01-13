const mongoose = require('mongoose');

/**
 * Per-organization credentials used to authenticate webhook/SDK ingestion
 * traffic. `keyId` is public (sent in headers), `secretHash` is the
 * SHA-256 hash of the actual secret so the plaintext is never stored.
 * `webhookSecrets` holds the per-provider signing secrets used to verify
 * inbound Stripe/GitHub/generic payload signatures.
 */
const apiKeySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    keyId: { type: String, required: true, unique: true },
    secretHash: { type: String, required: true },
    label: { type: String, default: 'default' },
    webhookSecrets: {
      stripe: { type: String, default: null },
      github: { type: String, default: null },
      generic: { type: String, default: null },
    },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.models.ApiKey || mongoose.model('ApiKey', apiKeySchema);
