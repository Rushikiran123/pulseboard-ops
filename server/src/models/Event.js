const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    provider: { type: String, enum: ['stripe', 'github', 'generic', 'custom'], required: true },
    type: { type: String, required: true }, // e.g. "payment.failed", "push", "signup.created"
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

eventSchema.index({ organizationId: 1, provider: 1, type: 1, receivedAt: -1 });

module.exports = mongoose.models.Event || mongoose.model('Event', eventSchema);
