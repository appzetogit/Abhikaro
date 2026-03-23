import mongoose from "mongoose";

const customerContactMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["new", "read", "resolved"],
      default: "new",
    },
  },
  {
    timestamps: true,
  },
);

customerContactMessageSchema.index({ userId: 1 });
customerContactMessageSchema.index({ status: 1 });
customerContactMessageSchema.index({ createdAt: -1 });

export default mongoose.model(
  "CustomerContactMessage",
  customerContactMessageSchema,
);

