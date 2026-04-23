import mongoose from "mongoose";

const adminNotificationSchema = new mongoose.Schema(
  {
    target: {
      type: String,
      enum: ["user", "restaurant", "delivery", "hotel", "admin", "all"],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    image: { type: String, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);

adminNotificationSchema.index({ createdAt: -1 });
adminNotificationSchema.index({ target: 1, createdAt: -1 });

export default mongoose.model("AdminNotification", adminNotificationSchema);

