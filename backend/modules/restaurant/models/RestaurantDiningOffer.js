import mongoose from 'mongoose';

const restaurantDiningOfferSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
    },
    type: {
      type: String,
      enum: ['prebook', 'walkin'],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    discountType: {
      type: String,
      enum: ['flat', 'percentage'],
      required: true,
    },
    discountValue: { type: Number, required: true, min: 0 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

restaurantDiningOfferSchema.index({ restaurant: 1, type: 1 });
restaurantDiningOfferSchema.index({ restaurant: 1, isActive: 1 });

const RestaurantDiningOffer = mongoose.model('RestaurantDiningOffer', restaurantDiningOfferSchema);
export default RestaurantDiningOffer;
