import mongoose from 'mongoose';

const quantitySlabSchema = new mongoose.Schema({
  min: {
    type: Number,
    required: true,
    min: 1,
  },
  max: {
    type: Number,
    required: true,
    min: 1,
  },
  increasePercent: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });

const etaSettingsSchema = new mongoose.Schema(
  {
    quantitySlabs: {
      type: [quantitySlabSchema],
      default: [
        { min: 1, max: 1, increasePercent: 0 },
        { min: 2, max: 2, increasePercent: 20 },
        { min: 3, max: 3, increasePercent: 30 },
        { min: 4, max: 5, increasePercent: 50 },
        { min: 6, max: 10, increasePercent: 80 },
        { min: 11, max: 20, increasePercent: 120 },
        { min: 21, max: 30, increasePercent: 170 },
        { min: 31, max: 50, increasePercent: 250 },
        { min: 51, max: 75, increasePercent: 350 },
        { min: 76, max: 100, increasePercent: 500 },
      ],
    },
    // Percentage increase for quantities above 100
    above100IncreasePercent: {
      type: Number,
      default: 600,
      min: 0,
    },
    // Additional category overhead: % of item base time added for each non-main category
    categoryOverheadPercent: {
      type: Number,
      default: 10,
      min: 0,
      max: 100,
    },
    // Additional quantity overhead: % of item base time added for each extra unit beyond 1 in non-main categories
    additionalQuantityOverheadPercent: {
      type: Number,
      default: 5,
      min: 0,
      max: 100,
    },
    // Delivery time per kilometer (in minutes/km)
    deliveryTimePerKm: {
      type: Number,
      default: 8,
      min: 1,
      max: 60,
    },
    // Safety caps for ETA limits
    minETALimit: {
      type: Number,
      default: 15,
      min: 5,
    },
    maxETALimit: {
      type: Number,
      default: 120,
      min: 30,
    },
    // Rounding method: 'ceil', 'round', or 'none'
    roundingMethod: {
      type: String,
      enum: ['ceil', 'round', 'none'],
      default: 'ceil',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Singleton helper to get or create settings
etaSettingsSchema.statics.getSettings = async function () {
  const defaultValues = {
    quantitySlabs: [
      { min: 1, max: 1, increasePercent: 0 },
      { min: 2, max: 2, increasePercent: 20 },
      { min: 3, max: 3, increasePercent: 30 },
      { min: 4, max: 5, increasePercent: 50 },
      { min: 6, max: 10, increasePercent: 80 },
      { min: 11, max: 20, increasePercent: 120 },
      { min: 21, max: 30, increasePercent: 170 },
      { min: 31, max: 50, increasePercent: 250 },
      { min: 51, max: 75, increasePercent: 350 },
      { min: 76, max: 100, increasePercent: 500 },
    ],
    above100IncreasePercent: 600,
    categoryOverheadPercent: 10,
    additionalQuantityOverheadPercent: 5,
    deliveryTimePerKm: 8,
    minETALimit: 15,
    maxETALimit: 120,
    roundingMethod: 'ceil',
  };

  try {
    if (mongoose.connection.readyState !== 1) {
      return defaultValues;
    }
    let settings = await this.findOne();
    if (!settings) {
      settings = await this.create(defaultValues);
    }
    return settings;
  } catch (error) {
    console.error('Error fetching/creating ETASettings:', error);
    // Return sensible fallback defaults in case of transient DB error
    return {
      quantitySlabs: [
        { min: 1, max: 1, increasePercent: 0 },
        { min: 2, max: 2, increasePercent: 20 },
        { min: 3, max: 3, increasePercent: 30 },
        { min: 4, max: 5, increasePercent: 50 },
        { min: 6, max: 10, increasePercent: 80 },
        { min: 11, max: 20, increasePercent: 120 },
        { min: 21, max: 30, increasePercent: 170 },
        { min: 31, max: 50, increasePercent: 250 },
        { min: 51, max: 75, increasePercent: 350 },
        { min: 76, max: 100, increasePercent: 500 },
      ],
      above100IncreasePercent: 600,
      categoryOverheadPercent: 10,
      additionalQuantityOverheadPercent: 5,
      deliveryTimePerKm: 8,
      minETALimit: 15,
      maxETALimit: 120,
      roundingMethod: 'ceil',
    };
  }
};

const ETASettings = mongoose.model('ETASettings', etaSettingsSchema);

export default ETASettings;
