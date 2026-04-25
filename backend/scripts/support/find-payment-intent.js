/**
 * Find PaymentIntent / webhook DLQ entry by Razorpay paymentId or orderId.
 *
 * Usage:
 *   node scripts/support/find-payment-intent.js --payment pay_xxx
 *   node scripts/support/find-payment-intent.js --order order_xxx
 *
 * Requires MONGODB_URI (or MONGO_URI) in env/.env
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import PaymentIntent from "../../modules/payment/models/PaymentIntent.js";
import WebhookDeadLetter from "../../modules/payment/models/WebhookDeadLetter.js";

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error("Missing MONGODB_URI (or MONGO_URI) in environment.");
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.findIndex((a) => a === name);
  return idx >= 0 ? args[idx + 1] : null;
};

const paymentId = getArg("--payment");
const orderId = getArg("--order");

if (!paymentId && !orderId) {
  console.error("Usage: node scripts/support/find-payment-intent.js --payment pay_xxx OR --order order_xxx");
  process.exit(2);
}

try {
  await mongoose.connect(uri);

  const intentQuery = paymentId
    ? { $or: [{ razorpayPaymentId: paymentId }, { "metadata.razorpayPaymentId": paymentId }] }
    : { razorpayOrderId: orderId };

  const intent = await PaymentIntent.findOne(intentQuery)
    .select("_id userId status razorpayOrderId razorpayPaymentId orderId amount currency createdAt updatedAt")
    .lean();

  const dlq = await WebhookDeadLetter.findOne(
    paymentId ? { razorpayPaymentId: paymentId } : { razorpayOrderId: orderId }
  )
    .select("_id eventType reason razorpayOrderId razorpayPaymentId handled createdAt")
    .sort({ createdAt: -1 })
    .lean();

  console.log(
    JSON.stringify(
      {
        found: {
          paymentIntent: !!intent,
          webhookDeadLetter: !!dlq,
        },
        paymentIntent: intent
          ? {
              id: String(intent._id),
              userId: String(intent.userId),
              status: intent.status,
              razorpayOrderId: intent.razorpayOrderId,
              razorpayPaymentId: intent.razorpayPaymentId,
              orderId: intent.orderId ? String(intent.orderId) : null,
              amountPaise: intent.amount,
              currency: intent.currency,
              createdAt: intent.createdAt,
              updatedAt: intent.updatedAt,
            }
          : null,
        webhookDeadLetter: dlq
          ? {
              id: String(dlq._id),
              eventType: dlq.eventType,
              reason: dlq.reason,
              razorpayOrderId: dlq.razorpayOrderId,
              razorpayPaymentId: dlq.razorpayPaymentId,
              handled: dlq.handled,
              createdAt: dlq.createdAt,
            }
          : null,
      },
      null,
      2
    )
  );
} catch (e) {
  console.error(e);
  process.exit(3);
} finally {
  await mongoose.disconnect().catch(() => {});
}

