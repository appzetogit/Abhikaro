import Order from "../models/Order.js";
import { notifyRestaurantOrderUpdate } from "./restaurantNotificationService.js";
import { calculateCancellationRefund } from "./cancellationRefundService.js";

/**
 * Automatically cancel orders stuck in "ready" without pickup after a time limit.
 *
 * Rule:
 * - If order.status === 'ready'
 * - AND tracking.ready.timestamp exists
 * - AND deliveryState.reachedPickupAt is not set (pickup not completed)
 * - AND ready time is older than READY_PICKUP_TIME_LIMIT_MINUTES
 * => cancel the order
 */
export async function processAutoCancelReadyOrders() {
  try {
    const READY_PICKUP_TIME_LIMIT_MINUTES = 90; // 1 hour 30 minutes
    const READY_PICKUP_TIME_LIMIT_MS = READY_PICKUP_TIME_LIMIT_MINUTES * 60 * 1000;

    const now = new Date();
    const cutoff = new Date(now.getTime() - READY_PICKUP_TIME_LIMIT_MS);

    // Find candidate orders: ready for too long and not picked up.
    // Exclude pay_at_hotel because refund + settlement flow differs.
    const candidates = await Order.find({
      status: "ready",
      "tracking.ready.timestamp": { $exists: true, $lte: cutoff },
      "deliveryState.reachedPickupAt": { $in: [null, undefined] },
      "payment.method": { $ne: "pay_at_hotel" },
    }).lean();

    if (candidates.length === 0) {
      return { processed: 0, message: "No ready orders to auto-cancel" };
    }

    let processedCount = 0;

    for (const order of candidates) {
      try {
        // Double-check current order is still eligible (avoid race conditions)
        const currentOrder = await Order.findById(order._id);
        if (!currentOrder) continue;

        const readyAt = currentOrder.tracking?.ready?.timestamp
          ? new Date(currentOrder.tracking.ready.timestamp)
          : null;
        const elapsedMs = readyAt ? now - readyAt : 0;

        const pickupDone = Boolean(currentOrder.deliveryState?.reachedPickupAt);
        const stillReady = currentOrder.status === "ready";

        if (!stillReady || pickupDone) continue;
        if (!readyAt || elapsedMs < READY_PICKUP_TIME_LIMIT_MS) continue;

        currentOrder.status = "cancelled";
        currentOrder.cancellationReason =
          "Auto-cancelled: order was ready but not picked up within 1 hour 30 minutes.";
        // Use 'admin' to represent system automation (matches enum)
        currentOrder.cancelledBy = "admin";
        currentOrder.cancelledAt = now;

        await currentOrder.save();
        processedCount++;

        console.log(
          `✅ Auto-cancelled ready order ${currentOrder.orderId} (ready for ${Math.floor(elapsedMs / 60000)} mins >= ${READY_PICKUP_TIME_LIMIT_MINUTES} mins)`
        );

        // Calculate refund (manual approval flow as in auto-reject)
        try {
          await calculateCancellationRefund(
            currentOrder._id,
            currentOrder.cancellationReason
          );
        } catch (refundError) {
          console.error(
            `❌ Error calculating cancellation refund for order ${currentOrder.orderId}:`,
            refundError
          );
        }

        // Notify restaurant UI about status update
        try {
          await notifyRestaurantOrderUpdate(
            currentOrder._id.toString(),
            "cancelled"
          );
        } catch (notifError) {
          console.error(
            `❌ Error sending restaurant notification for auto-cancel order ${currentOrder.orderId}:`,
            notifError
          );
        }
      } catch (e) {
        console.error(
          `❌ Error auto-cancelling ready order ${order?.orderId || order?._id}:`,
          e
        );
      }
    }

    return {
      processed: processedCount,
      message:
        processedCount > 0
          ? `Auto-cancelled ${processedCount} order(s) stuck in ready beyond ${READY_PICKUP_TIME_LIMIT_MINUTES} minutes`
          : "No ready orders to auto-cancel",
    };
  } catch (error) {
    console.error("❌ Error processing auto-cancel ready orders:", error);
    return { processed: 0, message: `Error: ${error.message}` };
  }
}

