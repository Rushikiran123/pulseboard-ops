const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rule', required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
    message: { type: String, required: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    channelsNotified: { type: [String], default: [] },
    triggeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

alertSchema.index({ organizationId: 1, status: 1, triggeredAt: -1 });

module.exports = mongoose.models.Alert || mongoose.model('Alert', alertSchema);
