/**
 * Reconcile a captured Razorpay payment to ensure an Order exists.
 *
 * What it does:
 * - Fetches payment from Razorpay API to get `order_id`
 * - Finds `PaymentIntent` by `razorpayOrderId`
 * - If intent exists and order missing, prints the API call you can run:
 *     POST /api/payment/razorpay/reconcile { intentId, razorpay_payment_id }
 *
 * Usage:
 *   node scripts/support/reconcile-payment.js pay_xxx
 *
 * Requires:
 * - MONGODB_URI (or MONGO_URI)
 * - Razorpay credentials configured (via envService or env):
 *   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET or DB env vars used by `getRazorpayCredentials`
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import PaymentIntent from "../../modules/payment/models/PaymentIntent.js";
import { fetchPayment } from "../../modules/payment/services/razorpayService.js";

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const paymentId = process.argv[2];

if (!uri) {
  console.error("Missing MONGODB_URI (or MONGO_URI) in environment.");
  process.exit(1);
}
if (!paymentId) {
  console.error("Usage: node scripts/support/reconcile-payment.js pay_xxx");
  process.exit(2);
}

try {
  await mongoose.connect(uri);

  const payment = await fetchPayment(paymentId);
  const razorpayOrderId = payment?.order_id || null;

  if (!razorpayOrderId) {
    console.error("Razorpay payment does not have order_id; cannot reconcile via intent.");
    console.log(JSON.stringify({ paymentId, razorpay: payment }, null, 2));
    process.exit(3);
  }

  const intent = await PaymentIntent.findOne({ razorpayOrderId })
    .select("_id userId status razorpayOrderId razorpayPaymentId orderId amount currency")
    .lean();

  if (!intent) {
    console.error("No PaymentIntent found for this Razorpay order_id.");
    console.log(JSON.stringify({ paymentId, razorpayOrderId }, null, 2));
    process.exit(4);
  }

  console.log(
    JSON.stringify(
      {
        paymentId,
        razorpayOrderId,
        paymentStatus: payment?.status || null,
        intent: {
          id: String(intent._id),
          userId: String(intent.userId),
          status: intent.status,
          razorpayOrderId: intent.razorpayOrderId,
          razorpayPaymentId: intent.razorpayPaymentId || null,
          orderId: intent.orderId ? String(intent.orderId) : null,
          amountPaise: intent.amount,
          currency: intent.currency,
        },
        nextStep:
          intent.orderId
            ? "Order already exists for this intent."
            : "Call POST /api/payment/razorpay/reconcile with { intentId, razorpay_payment_id } as the same user to create the order.",
        reconcileRequestExample: intent.orderId
          ? null
          : {
              method: "POST",
              path: "/api/payment/razorpay/reconcile",
              body: {
                intentId: String(intent._id),
                razorpay_payment_id: paymentId,
              },
            },
      },
      null,
      2
    )
  );
} catch (e) {
  console.error(e);
  process.exit(10);
} finally {
  await mongoose.disconnect().catch(() => {});
}

