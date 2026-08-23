import mongoose from "mongoose";

const hotelTermsAndConditionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      default: "Hotel Terms and Conditions",
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
  { timestamps: true },
);

hotelTermsAndConditionSchema.index({ isActive: 1, updatedAt: -1 });

export default mongoose.model("HotelTermsAndCondition", hotelTermsAndConditionSchema);

