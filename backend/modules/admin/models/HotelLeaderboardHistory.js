import mongoose from "mongoose";

const rewardSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["gift", "discount", "none"], default: "none" },
    label: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    rupeesOff: { type: Number, default: 0 },
  },
  { _id: false },
);

const rowSchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true, min: 1 },
    hotelMongoId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel" },
    hotelId: { type: String, default: "" },
    hotelName: { type: String, default: "" },
    orders: { type: Number, default: 0 },
    reward: { type: rewardSchema, default: () => ({}) },
  },
  { _id: false },
);

const snapshotSchema = new mongoose.Schema(
  {
    // snapshot of configured rewards at generation time
    monthly: {
      gifts: { type: Array, default: [] },
      discounts: { type: Array, default: [] },
    },
    sixMonths: {
      gifts: { type: Array, default: [] },
    },
  },
  { _id: false },
);

const hotelLeaderboardHistorySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["month", "6months", "year"], required: true },
    key: { type: String, required: true }, // month: YYYY-MM, 6months: YYYY-H1|YYYY-H2, year: YYYY
    range: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    rewardsSnapshot: { type: snapshotSchema, default: () => ({}) },
    rows: { type: [rowSchema], default: [] }, // top rows only
  },
  { timestamps: true },
);

hotelLeaderboardHistorySchema.index({ type: 1, key: 1 }, { unique: true });

export default mongoose.model("HotelLeaderboardHistory", hotelLeaderboardHistorySchema);

