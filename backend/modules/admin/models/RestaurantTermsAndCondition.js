import mongoose from "mongoose";

const restaurantTermsAndConditionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "Restaurant Terms and Conditions",
      trim: true,
    },
    content: {
      type: String,
      required: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

restaurantTermsAndConditionSchema.index({ isActive: 1 });

export default mongoose.model(
  "RestaurantTermsAndCondition",
  restaurantTermsAndConditionSchema,
);

