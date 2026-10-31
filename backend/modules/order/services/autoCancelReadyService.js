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
 * - AND ready time is older than READY_PICKUP_TIME_LIMIT_MINUTES (90 minutes)
 * => cancel the order (applies to ALL payment methods including pay_at_hotel and cash)
 */
export async function processAutoCancelReadyOrders() {
  try {
    const READY_PICKUP_TIME_LIMIT_MINUTES = 90; // 1 hour 30 minutes
    const READY_PICKUP_TIME_LIMIT_MS = READY_PICKUP_TIME_LIMIT_MINUTES * 60 * 1000;

    const now = new Date();
    const cutoff = new Date(now.getTime() - READY_PICKUP_TIME_LIMIT_MS);

    // Find candidate orders: ready for too long and not picked up.
    // NOTE: Includes pay_at_hotel and cash orders so they do not stay active forever.
    const candidates = await Order.find({
      status: "ready",
      "tracking.ready.timestamp": { $exists: true, $lte: cutoff },
      "deliveryState.reachedPickupAt": { $in: [null, undefined] },
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

        // Notify customer and delivery partner via Socket.io
        try {
          const serverModule = await import("../../../server.js");
          const io = serverModule.getIO ? serverModule.getIO() : null;
          if (io) {
            const payload = {
              orderId: currentOrder.orderId,
              orderMongoId: currentOrder._id.toString(),
              status: "cancelled",
              cancellationReason: currentOrder.cancellationReason,
              updatedAt: now,
            };

            io.to(`order:${currentOrder._id.toString()}`).emit("order_status_update", payload);
            io.to(`order:${currentOrder.orderId}`).emit("order_status_update", payload);
            if (currentOrder.userId) {
              io.to(`user:${currentOrder.userId.toString()}`).emit("order_status_update", payload);
            }

            if (currentOrder.deliveryPartnerId) {
              const deliveryRoom = `delivery:${currentOrder.deliveryPartnerId.toString()}`;
              io.of("/delivery").to(deliveryRoom).emit("order_status_update", payload);
            }
          }
        } catch (sockErr) {
          console.warn(`⚠️ Error emitting socket update for auto-cancelled ready order ${currentOrder.orderId}:`, sockErr.message);
        }

        // Send push notification to user
        try {
          const { sendToUser } = await import("../../fcm/services/fcmService.js");
          if (currentOrder.userId) {
            await sendToUser(
              currentOrder.userId.toString(),
              "user",
              {
                title: "Order Cancelled",
                body: `Your order #${currentOrder.orderId} was cancelled because it could not be picked up within 1.5 hours.`,
              },
              {
                type: "order_status_update",
                orderId: currentOrder.orderId,
                orderMongoId: currentOrder._id.toString(),
                status: "cancelled",
              }
            );
          }
        } catch (fcmErr) {
          console.warn("⚠️ FCM notification error on auto-cancel ready:", fcmErr.message);
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
