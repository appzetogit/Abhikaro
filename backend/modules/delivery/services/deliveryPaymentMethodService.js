import Payment from "../../payment/models/Payment.js";

/**
 * Single source of truth for how we expose payment method to delivery clients.
 * Fixes live cases where `order.payment` is missing/legacy but Payment row has pay_at_hotel,
 * without overriding a real embedded `razorpay` on the order.
 */
export async function resolveDeliveryOrderPaymentMethod(order) {
  if (!order?._id) {
    return "razorpay";
  }
  const embeddedMethod = order?.payment?.method;
  let paymentMethod = embeddedMethod || order?.paymentMethod || "razorpay";
  if (paymentMethod === "cod" || paymentMethod === "cash") {
    return "cash";
  }
  const lower = String(paymentMethod).toLowerCase().trim();
  if (lower === "pay_at_hotel" || lower === "pay at hotel") {
    return "pay_at_hotel";
  }
  try {
    const paymentRecord = await Payment.findOne({ orderId: order._id })
      .select("method")
      .lean();
    const pm = paymentRecord?.method;
    if (pm === "cash" || pm === "cod") {
      return "cash";
    }
    if (pm === "pay_at_hotel" && !embeddedMethod) {
      return "pay_at_hotel";
    }
  } catch (_) {
    /* ignore */
  }
  return paymentMethod;
}
