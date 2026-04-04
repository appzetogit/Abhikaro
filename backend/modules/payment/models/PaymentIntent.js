import mongoose from 'mongoose';

const paymentIntentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Raw payload needed to construct order after successful payment
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  amount: {
    type: Number, // paise
    required: true,
    min: 1
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['created', 'processing', 'succeeded', 'failed', 'expired'],
    default: 'created',
    index: true
  },
  razorpayOrderId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  razorpayPaymentId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  razorpaySignature: {
    type: String
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    index: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 60 * 60 * 1000) // 1 hour
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

paymentIntentSchema.index({ createdAt: -1 });

export default mongoose.model('PaymentIntent', paymentIntentSchema);

