import mongoose from 'mongoose';

const landingPageSettingsSchema = new mongoose.Schema({
  exploreMoreHeading: {
    type: String,
    default: 'Explore More',
    trim: true
  },
  showRecommendedSection: {
    type: Boolean,
    default: false
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
landingPageSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = new this({
      exploreMoreHeading: 'Explore More',
      showRecommendedSection: false
    });
    await settings.save();
  }
  return settings;
};

export default mongoose.model('LandingPageSettings', landingPageSettingsSchema);

