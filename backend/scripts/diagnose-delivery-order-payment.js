/**
 * Live / staging spot-check for mis-labelled delivery payments.
 * Usage (from backend/): node scripts/diagnose-delivery-order-payment.js <orderIdOrMongo24hex>
 * Requires MONGODB_URI (or MONGO_URI) in .env
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Order from "../modules/order/models/Order.js";
import Payment from "../modules/payment/models/Payment.js";
import { resolveDeliveryOrderPaymentMethod } from "../modules/delivery/services/deliveryPaymentMethodService.js";

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const arg = process.argv[2];

if (!uri) {
  console.error("Missing MONGODB_URI (or MONGO_URI) in environment.");
  process.exit(1);
}
if (!arg) {
  console.error(
    "Usage: node scripts/diagnose-delivery-order-payment.js <businessOrderId|mongoObjectId>",
  );
  process.exit(1);
}

const q = mongoose.Types.ObjectId.isValid(arg) && String(arg).length === 24
  ? { $or: [{ _id: arg }, { orderId: arg }] }
  : { orderId: arg };

try {
  await mongoose.connect(uri);
  const order = await Order.findOne(q).lean();
  if (!order) {
    console.error("Order not found for:", arg);
    process.exit(2);
  }

  const paymentRow = await Payment.findOne({ orderId: order._id })
    .select("method status paymentId")
    .lean();

  const resolved = await resolveDeliveryOrderPaymentMethod(order);

  console.log(
    JSON.stringify(
      {
        orderId: order.orderId,
        mongoId: String(order._id),
        orderType: order.orderType,
        hotelReference: order.hotelReference,
        hotelId: order.hotelId,
        embeddedPaymentMethod: order.payment?.method ?? null,
        paymentStatus: order.payment?.status ?? null,
        paymentCollectionRow: paymentRow
          ? { method: paymentRow.method, status: paymentRow.status }
          : null,
        resolvedDeliveryPaymentMethod: resolved,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  process.exit(3);
} finally {
  await mongoose.disconnect().catch(() => {});
}
