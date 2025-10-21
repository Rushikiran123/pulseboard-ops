const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    slackWebhookUrl: { type: String, default: null },
    alertEmail: { type: String, default: null },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Organization || mongoose.model('Organization', organizationSchema);
