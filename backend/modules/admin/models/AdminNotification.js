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

// TTL Index: Auto-delete notifications after 3 days (3 * 24 * 60 * 60 = 259,200 seconds)
adminNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 });
adminNotificationSchema.index({ target: 1, createdAt: -1 });

export default mongoose.model("AdminNotification", adminNotificationSchema);

