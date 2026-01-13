const express = require('express');
const Alert = require('../models/Alert');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { status, limit = 50 } = req.query;
    const filter = { organizationId: req.user.organizationId };
    if (status) filter.status = status;

    const alerts = await Alert.find(filter);
    const sorted = [...alerts].sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt));
    res.json({ alerts: sorted.slice(0, Math.min(Number(limit) || 50, 200)) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['open', 'acknowledged', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'validation_error', message: 'invalid status' });
    }
    const alert = await Alert.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      { status },
      { new: true }
    );
    if (!alert) return res.status(404).json({ error: 'not_found' });
    return res.json({ alert });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
