import mongoose from "mongoose";

const commissionSettingsSchema = new mongoose.Schema(
  {
    qrCommission: {
      hotel: { type: Number, required: true, default: 10 },
      admin: { type: Number, required: true, default: 20 },
    },
    directCommission: {
      admin: { type: Number, required: true, default: 30 },
      restaurant: { type: Number, required: true, default: 70 },
    },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Validation to ensure percentages sum to 100
commissionSettingsSchema.pre("save", function (next) {
  const qrTotal = this.qrCommission.hotel + this.qrCommission.admin;
  if (qrTotal > 100) {
    return next(new Error("QR Commission percentages must not exceed 100%"));
  }

  const directTotal =
    this.directCommission.admin + this.directCommission.restaurant;
  if (directTotal !== 100) {
    return next(new Error("Direct Commission percentages must sum to 100%"));
  }
  next();
});

export default mongoose.model("CommissionSettings", commissionSettingsSchema);
