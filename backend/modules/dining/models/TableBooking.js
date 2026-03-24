import mongoose from "mongoose";

const tableBookingSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    guests: {
      type: Number,
      required: true,
      min: 1,
    },
    date: {
      type: Date,
      required: true,
    },
    timeSlot: {
      type: String,
      required: true,
    },
    specialRequest: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "checked-in", "completed", "dining_completed", "cancelled"],
      default: "confirmed",
    },
    checkInTime: {
      type: Date,
    },
    checkOutTime: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: String,
      enum: ["user", "restaurant", "admin"],
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    bookingId: {
      type: String,
      unique: true,
    },
    billAmount: { type: Number, default: null },
    discountAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, default: null },
    billStatus: {
      type: String,
      enum: ["not_sent", "pending", "completed"],
      default: "not_sent",
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
    },
    billSentAt: { type: Date },
    billNote: { type: String, trim: true },
    appliedCoupon: { type: mongoose.Schema.Types.ObjectId, ref: "DiningCoupon" },
    paidAt: { type: Date },
    razorpayOrderId: { type: String },
    commissionAmount: { type: Number, default: 0 },
    restaurantEarning: { type: Number, default: 0 },
    adminEarning: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

tableBookingSchema.pre("save", async function (next) {
  if (!this.bookingId) {
    this.bookingId =
      "BK" + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

const TableBooking = mongoose.model("TableBooking", tableBookingSchema);
export default TableBooking;
