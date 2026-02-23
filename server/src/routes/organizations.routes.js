const express = require('express');
const Organization = require('../models/Organization');
const ApiKey = require('../models/ApiKey');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/me', async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) return res.status(404).json({ error: 'not_found' });
    return res.json({ organization });
  } catch (err) {
    return next(err);
  }
});

router.patch('/me', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { slackWebhookUrl, alertEmail, name } = req.body;
    const update = {};
    if (slackWebhookUrl !== undefined) update.slackWebhookUrl = slackWebhookUrl;
    if (alertEmail !== undefined) update.alertEmail = alertEmail;
    if (name !== undefined) update.name = name;

    const organization = await Organization.findByIdAndUpdate(req.user.organizationId, update, { new: true });
    return res.json({ organization });
  } catch (err) {
    return next(err);
  }
});

router.get('/me/api-keys', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const keys = await ApiKey.find({ organizationId: req.user.organizationId, revoked: false });
    const sanitized = keys.map((k) => ({
      keyId: k.keyId,
      label: k.label,
      providersConfigured: Object.entries(k.webhookSecrets || {})
        .filter(([, v]) => Boolean(v))
        .map(([provider]) => provider),
      createdAt: k.createdAt,
    }));
    return res.json({ apiKeys: sanitized });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
