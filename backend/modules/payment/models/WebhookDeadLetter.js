import mongoose from 'mongoose';

const webhookDeadLetterSchema = new mongoose.Schema({
	eventType: { type: String, index: true },
	rawEvent: { type: mongoose.Schema.Types.Mixed, required: true },
	reason: { type: String, required: true },
	razorpayOrderId: { type: String, index: true },
	razorpayPaymentId: { type: String, index: true },
	handled: { type: Boolean, default: false, index: true },
	notes: { type: String }
}, {
	timestamps: true
});

webhookDeadLetterSchema.index({ createdAt: -1 });

export default mongoose.model('WebhookDeadLetter', webhookDeadLetterSchema);

