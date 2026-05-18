const express = require('express');
const crypto = require('crypto');
const Organization = require('../models/Organization');
const User = require('../models/User');
const ApiKey = require('../models/ApiKey');
const { hashPassword, verifyPassword, signToken } = require('../services/authService');

const router = express.Router();

function slugify(name) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${crypto
    .randomBytes(3)
    .toString('hex')}`;
}

/**
 * Registers a brand-new tenant: creates the Organization, the first user as
 * `owner`, and a default ApiKey (with generated webhook secrets for all
 * three providers) so the tenant can start sending events immediately.
 */
router.post('/register', async (req, res) => {
  const { organizationName, email, password } = req.body;
  if (!organizationName || !email || !password) {
    return res.status(400).json({ error: 'validation_error', message: 'organizationName, email, password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'validation_error', message: 'password must be at least 8 characters' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ error: 'conflict', message: 'An account with that email already exists' });
  }

  const organization = await Organization.create({ name: organizationName, slug: slugify(organizationName) });
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    organizationId: organization._id,
    email: email.toLowerCase(),
    passwordHash,
    role: 'owner',
  });

  const keyId = `pk_${crypto.randomBytes(8).toString('hex')}`;
  const secret = crypto.randomBytes(24).toString('hex');
  const apiKey = await ApiKey.create({
    organizationId: organization._id,
    keyId,
    secretHash: crypto.createHash('sha256').update(secret).digest('hex'),
    label: 'default',
    webhookSecrets: {
      stripe: crypto.randomBytes(16).toString('hex'),
      github: crypto.randomBytes(16).toString('hex'),
      generic: crypto.randomBytes(16).toString('hex'),
    },
  });

  const token = signToken({ userId: user._id, organizationId: organization._id, role: user.role });

  return res.status(201).json({
    token,
    organization: { id: organization._id, name: organization.name, slug: organization.slug },
    user: { id: user._id, email: user.email, role: user.role },
    apiKey: {
      keyId: apiKey.keyId,
      secret, // returned once, at creation time only
      webhookSecrets: apiKey.webhookSecrets,
    },
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'validation_error', message: 'email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const token = signToken({ userId: user._id, organizationId: user.organizationId, role: user.role });
  return res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
});

module.exports = router;
