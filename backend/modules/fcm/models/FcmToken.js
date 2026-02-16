import mongoose from 'mongoose';

const fcmTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'userModel',
    },
    userModel: {
      type: String,
      required: true,
      enum: ['User', 'Restaurant', 'Hotel', 'Delivery'],
    },
    role: {
      type: String,
      required: true,
      enum: ['user', 'restaurant', 'hotel', 'delivery'],
    },
    fcmToken: {
      type: String,
      required: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ['web', 'android', 'ios'],
      default: 'web',
    },
    deviceId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

fcmTokenSchema.index({ fcmToken: 1 }, { unique: true });
fcmTokenSchema.index({ userId: 1, role: 1 });

const FcmToken = mongoose.model('FcmToken', fcmTokenSchema);
export default FcmToken;
