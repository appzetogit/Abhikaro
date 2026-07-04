import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    publicId: { type: String, default: "" },
  },
  { _id: false },
);

const giftSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true, min: 1 },
    name: { type: String, default: "" },
    image: { type: imageSchema, default: () => ({}) },
  },
  { _id: false },
);

const discountSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true, min: 1 },
    rupeesOff: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const hotelLeaderboardRewardsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "hotelLeaderboard" },
    // Multiple banners shown in hotel dashboard
    banners: { type: [imageSchema], default: [] },
    // Backward-compat: previously used single banner
    banner: { type: imageSchema, default: () => ({}) },
    // Winner profile photo shown on hotel leaderboard header
    winnerProfiles: {
      month: { type: imageSchema, default: () => ({}) },
      sixMonths: { type: imageSchema, default: () => ({}) },
    },
    hideWinner: {
      month: { type: Boolean, default: false },
      sixMonths: { type: Boolean, default: false },
    },
    monthly: {
      gifts: { type: [giftSchema], default: [] }, // positions 1-5
      discounts: { type: [discountSchema], default: [] }, // positions 6-10
      minOrders: { type: Number, default: 0, min: 0 },
    },
    sixMonths: {
      gifts: { type: [giftSchema], default: [] }, // positions 1-3
      minOrders: { type: Number, default: 0, min: 0 },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

hotelLeaderboardRewardsSchema.index({ key: 1 }, { unique: true });

hotelLeaderboardRewardsSchema.statics.getSettings = async function () {
  let doc = await this.findOne({ key: "hotelLeaderboard" });
  if (!doc) {
    doc = await this.create({ key: "hotelLeaderboard" });
  }
  // Migrate legacy single banner into banners array once
  try {
    const hasBanners = Array.isArray(doc.banners) && doc.banners.length > 0;
    const legacyUrl = doc.banner?.url;
    if (!hasBanners && typeof legacyUrl === "string" && legacyUrl.trim()) {
      doc.banners = [{ url: doc.banner.url, publicId: doc.banner.publicId || "" }];
      await doc.save();
    }
  } catch {
    // ignore migration failure
  }
  return doc;
};

export default mongoose.model("HotelLeaderboardRewards", hotelLeaderboardRewardsSchema);

