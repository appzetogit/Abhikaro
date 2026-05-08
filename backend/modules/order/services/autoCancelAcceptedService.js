import Order from "../models/Order.js";
import { notifyRestaurantOrderUpdate } from "./restaurantNotificationService.js";
import { calculateCancellationRefund } from "./cancellationRefundService.js";

/**
 * Automatically cancel orders that were accepted by a delivery partner 
 * but not delivered within a 2-hour time limit.
 * 
 * Rule:
 * - deliveryState.acceptedAt exists
 * - status is NOT 'delivered' or 'cancelled'
 * - Current time is more than 2 hours after acceptedAt
 * => cancel the order
 */
export async function processAutoCancelAcceptedOrders() {
  try {
    const ACCEPTED_DELIVERY_TIME_LIMIT_MINUTES = 120; // 2 hours
    const ACCEPTED_DELIVERY_TIME_LIMIT_MS = ACCEPTED_DELIVERY_TIME_LIMIT_MINUTES * 60 * 1000;

    const now = new Date();
    const cutoff = new Date(now.getTime() - ACCEPTED_DELIVERY_TIME_LIMIT_MS);

    // Find candidate orders: accepted more than 2 hours ago but not delivered/cancelled
    const candidates = await Order.find({
      status: { $nin: ["delivered", "cancelled"] },
      "deliveryState.acceptedAt": { $exists: true, $lte: cutoff },
      "deliveryState.status": { $ne: "delivered" },
      "payment.method": { $ne: "pay_at_hotel" },
    }).lean();

    if (candidates.length === 0) {
      return { processed: 0, message: "No stale accepted orders to auto-cancel" };
    }

    let processedCount = 0;

    // We need IO for customer notifications
    const serverModule = await import('../../../server.js');
    const io = serverModule.getIO();

    for (const order of candidates) {
      try {
        // Double-check current order state in DB
        const currentOrder = await Order.findById(order._id);
        if (!currentOrder) continue;

        // Skip if already handled or delivered
        if (["delivered", "cancelled"].includes(currentOrder.status) || 
            currentOrder.deliveryState?.status === "delivered") {
          continue;
        }

        const acceptedAt = currentOrder.deliveryState?.acceptedAt 
          ? new Date(currentOrder.deliveryState.acceptedAt) 
          : null;
          
        if (!acceptedAt || (now - acceptedAt) < ACCEPTED_DELIVERY_TIME_LIMIT_MS) {
          continue;
        }

        // Apply cancellation
        currentOrder.status = "cancelled";
        currentOrder.cancellationReason = "order Cancelled delivery boy accept but not delivered";
        currentOrder.cancelledBy = "admin"; // System automation
        currentOrder.cancelledAt = now;

        await currentOrder.save();
        processedCount++;

        console.log(
          `✅ Auto-cancelled stale accepted order ${currentOrder.orderId} (accepted at ${acceptedAt.toISOString()}, ${Math.floor((now - acceptedAt) / 60000)} mins ago)`
        );

        // 1. Calculate refund (manual approval flow)
        try {
          await calculateCancellationRefund(
            currentOrder._id,
            currentOrder.cancellationReason
          );
        } catch (refundError) {
          console.error(`❌ Error calculating refund for ${currentOrder.orderId}:`, refundError);
        }

        // 2. Notify Restaurant
        try {
          await notifyRestaurantOrderUpdate(currentOrder._id.toString(), "cancelled");
        } catch (notifError) {
          console.error(`❌ Error notifying restaurant for ${currentOrder.orderId}:`, notifError);
        }

        // 3. Notify Customer and Delivery Boy via Socket.io
        if (io) {
          const payload = {
            orderId: currentOrder.orderId,
            orderMongoId: currentOrder._id.toString(),
            status: "cancelled",
            cancellationReason: currentOrder.cancellationReason,
            updatedAt: now,
          };

          // Notify customer tracking room
          const orderRoom = `order:${currentOrder._id.toString()}`;
          const orderIdRoom = `order:${currentOrder.orderId}`;
          
          io.to(orderRoom).emit("order_status_update", payload);
          io.to(orderIdRoom).emit("order_status_update", payload);
          
          // Notify delivery partner room
          if (currentOrder.deliveryPartnerId) {
            const deliveryRoom = `delivery:${currentOrder.deliveryPartnerId.toString()}`;
            io.of('/delivery').to(deliveryRoom).emit("order_status_update", payload);
            console.log(`📢 Notified delivery partner ${currentOrder.deliveryPartnerId} about auto-cancellation`);
          }
        }

      } catch (err) {
        console.error(`❌ Error processing auto-cancel for order ${order.orderId}:`, err);
      }
    }

    return {
      processed: processedCount,
      message: processedCount > 0 
        ? `Auto-cancelled ${processedCount} order(s) accepted but not delivered within 2 hours` 
        : "No stale accepted orders to auto-cancel",
    };
  } catch (error) {
    console.error("❌ Error in processAutoCancelAcceptedOrders:", error);
    return { processed: 0, message: `Error: ${error.message}` };
  }
}
