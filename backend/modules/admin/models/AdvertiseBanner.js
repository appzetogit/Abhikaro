import mongoose from "mongoose";

const advertiseBannerSchema = new mongoose.Schema(
  {
    placement: {
      type: String,
      required: true,
      trim: true,
      enum: ["order_placed"],
      default: "order_placed",
      index: true,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    cloudinaryPublicId: {
      type: String,
      trim: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    startAt: {
      type: Date,
      default: null,
    },
    endAt: {
      type: Date,
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

advertiseBannerSchema.index({ placement: 1, order: 1, isActive: 1 });

export default mongoose.model("AdvertiseBanner", advertiseBannerSchema);

