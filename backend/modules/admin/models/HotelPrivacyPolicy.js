import mongoose from "mongoose";

const hotelPrivacyPolicySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "Hotel Privacy Policy",
    },
    content: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);

const HotelPrivacyPolicy = mongoose.model(
  "HotelPrivacyPolicy",
  hotelPrivacyPolicySchema
);

export default HotelPrivacyPolicy;
