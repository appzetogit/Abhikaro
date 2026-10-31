import Order from "../models/Order.js";
import { notifyRestaurantOrderUpdate } from "./restaurantNotificationService.js";
import { calculateCancellationRefund } from "./cancellationRefundService.js";

/**
 * Automatically reject orders that haven't been accepted within the accept time limit
 * This runs as a cron job to check all pending/confirmed orders
 * Accept time limit: 240 seconds (4 minutes)
 * @returns {Promise<{processed: number, message: string}>}
 */
export async function processAutoRejectOrders() {
  try {
    const ACCEPT_TIME_LIMIT_SECONDS = 240; // 4 minutes
    const ACCEPT_TIME_LIMIT_MS = ACCEPT_TIME_LIMIT_SECONDS * 1000;

    // Find all orders with status 'pending' or 'confirmed' that haven't been accepted yet
    // Skip orders that have been accepted by Admin
    // NOTE: All payment methods (including pay_at_hotel and cash) must be auto-rejected if unaccepted!
    const validPendingOrders = await Order.find({
      status: { $in: ["pending", "confirmed"] },
      acceptedByAdmin: { $ne: true },
      adminAccepted: { $ne: true },
    }).lean();

    if (validPendingOrders.length === 0) {
      return { processed: 0, message: "No pending orders to check" };
    }

    const now = new Date();
    let processedCount = 0;
    const rejectedOrders = [];

    for (const order of validPendingOrders) {
      // If the order has already been payment-confirmed, measure elapsed time from confirmation timestamp
      // so UPI checkout delays do not trigger premature auto-rejection.
      const referenceTime = order.tracking?.confirmed?.timestamp 
        ? new Date(order.tracking.confirmed.timestamp) 
        : new Date(order.createdAt);
      const elapsedMs = now - referenceTime;

      // Check if accept time has expired
      if (elapsedMs >= ACCEPT_TIME_LIMIT_MS) {
        try {
          // Double-check order hasn't been accepted or cancelled by another process
          const currentOrder = await Order.findById(order._id);
          if (!currentOrder) {
            continue; // Order was deleted
          }

          // Only reject if still in pending/confirmed status and not accepted by Admin
          if (!["pending", "confirmed"].includes(currentOrder.status) || currentOrder.acceptedByAdmin || currentOrder.adminAccepted) {
            continue; // Order was already accepted/rejected
          }

          // Update order status to cancelled
          currentOrder.status = "cancelled";
          currentOrder.cancellationReason =
            "Order not accepted within time limit. Restaurant did not respond in time.";
          currentOrder.cancelledBy = "restaurant";
          currentOrder.cancelledAt = now;

          await currentOrder.save();

          rejectedOrders.push({
            orderId: currentOrder.orderId,
            elapsedSeconds: Math.floor(elapsedMs / 1000),
          });
          processedCount++;

          console.log(
            `✅ Order ${currentOrder.orderId} automatically rejected (elapsed: ${Math.floor(elapsedMs / 1000)}s >= ${ACCEPT_TIME_LIMIT_SECONDS}s)`,
          );

          // Calculate refund amount but don't process automatically
          // Admin will process refund manually via refund button
          try {
            await calculateCancellationRefund(
              currentOrder._id,
              "Order not accepted within time limit. Restaurant did not respond in time.",
            );
            console.log(
              `✅ Cancellation refund calculated for order ${currentOrder.orderId} - awaiting admin approval`,
            );
          } catch (refundError) {
            console.error(
              `❌ Error calculating cancellation refund for order ${currentOrder.orderId}:`,
              refundError,
            );
            // Don't fail order cancellation if refund calculation fails
          }

          // Notify restaurant about status update
          try {
            await notifyRestaurantOrderUpdate(
              currentOrder._id.toString(),
              "cancelled",
            );
          } catch (notifError) {
            console.error(
              `❌ Error sending notification for order ${currentOrder.orderId}:`,
              notifError,
            );
          }

          // Notify customer via Socket.IO
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
            }
          } catch (sockErr) {
            console.warn(`⚠️ Error emitting socket update for auto-rejected order ${currentOrder.orderId}:`, sockErr.message);
          }

          // Push notification to customer
          try {
            const { sendToUser } = await import("../../fcm/services/fcmService.js");
            if (currentOrder.userId) {
              await sendToUser(
                currentOrder.userId.toString(),
                "user",
                {
                  title: "Order Cancelled",
                  body: `Your order #${currentOrder.orderId} was cancelled because the restaurant did not respond in time.`,
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
            console.warn(`⚠️ Push notification error on auto-reject:`, fcmErr.message);
          }
        } catch (updateError) {
          console.error(
            `❌ Error auto-rejecting order ${order.orderId}:`,
            updateError,
          );
        }
      }
    }

    return {
      processed: processedCount,
      message:
        processedCount > 0
          ? `Auto-rejected ${processedCount} order(s) that were not accepted within ${ACCEPT_TIME_LIMIT_SECONDS} seconds`
          : "No orders to auto-reject",
    };
  } catch (error) {
    console.error("❌ Error processing auto-reject orders:", error);
    return { processed: 0, message: `Error: ${error.message}` };
  }
}
