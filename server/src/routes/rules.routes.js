const express = require('express');
const Rule = require('../models/Rule');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VALID_CONDITION_TYPES = new Set(['pattern', 'threshold', 'spike']);

function validateRuleBody(body) {
  if (!body.name) return 'name is required';
  if (!VALID_CONDITION_TYPES.has(body.conditionType)) {
    return `conditionType must be one of ${[...VALID_CONDITION_TYPES].join(', ')}`;
  }
  if (body.conditionType === 'pattern' && (!body.config || !body.config.field || !body.config.operator)) {
    return 'pattern rules require config.field and config.operator';
  }
  if (body.conditionType === 'threshold' && (!body.config || !body.config.windowMinutes || !body.config.count)) {
    return 'threshold rules require config.windowMinutes and config.count';
  }
  if (body.conditionType === 'spike' && (!body.config || !body.config.windowMinutes || !body.config.factor)) {
    return 'spike rules require config.windowMinutes and config.factor';
  }
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const rules = await Rule.find({ organizationId: req.user.organizationId });
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const error = validateRuleBody(req.body);
    if (error) return res.status(400).json({ error: 'validation_error', message: error });

    const rule = await Rule.create({ ...req.body, organizationId: req.user.organizationId });
    return res.status(201).json({ rule });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const rule = await Rule.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      req.body,
      { new: true }
    );
    if (!rule) return res.status(404).json({ error: 'not_found' });
    return res.json({ rule });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const rule = await Rule.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!rule) return res.status(404).json({ error: 'not_found' });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
