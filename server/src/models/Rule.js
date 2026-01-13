const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true },
    provider: { type: String, enum: ['any', 'stripe', 'github', 'generic', 'custom'], default: 'any' },
    eventType: { type: String, default: '*' }, // exact match, or "prefix.*" wildcard
    conditionType: { type: String, enum: ['pattern', 'threshold', 'spike'], required: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    channels: { type: [String], default: ['socket'] }, // subset of socket|slack|email
    cooldownMinutes: { type: Number, default: 10 },
    lastTriggeredAt: { type: Date, default: null },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ruleSchema.index({ organizationId: 1, enabled: 1 });

module.exports = mongoose.models.Rule || mongoose.model('Rule', ruleSchema);
