import Order from "../models/Order.js";
import {
  creditHotelWallet,
  creditAdminWallet,
  creditRestaurantWallet,
} from "./escrowWalletService.js";
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

/**
 * Distribute commission for an order (10% Hotel, 20% Admin, 70% Restaurant)
 * @param {string} orderId - MongoDB ID of the order
 */
export const distributeCommissions = async (orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Safety check: prevent double calculation
    if (order.commissionDistributed) {
      logger.warn(
        `⚠️ Commission already distributed for order ${order.orderId}`,
      );
      return { success: false, message: "Commission already distributed" };
    }

    // Only process for QR orders as per requirement
    if (order.orderType !== "QR") {
      // For DIRECT orders, use standard settlement if needed, but this service
      // is specifically for the new QR commission requirement.
      return { success: false, message: "Not a QR order" };
    }

    const {
      pricing,
      hotelReference,
      hotelId,
      restaurantId,
      orderId: orderNumber,
    } = order;
    const totalAmount = pricing.subtotal; // Using subtotal for commission split

    // Split logic: 10/20/70
    const hotelShare = Math.round(totalAmount * 0.1 * 100) / 100;
    const adminShare = Math.round(totalAmount * 0.2 * 100) / 100;
    const restaurantShare = Math.round(totalAmount * 0.7 * 100) / 100;

    logger.info(`💰 Distributing commission for order ${orderNumber}:`, {
      total: totalAmount,
      hotel: hotelShare,
      admin: adminShare,
      restaurant: restaurantShare,
    });

    // 1. Credit Hotel Wallet
    if (hotelId) {
      await creditHotelWallet(
        hotelId,
        order._id,
        hotelShare,
        orderNumber,
        totalAmount,
      );
    } else if (hotelReference) {
      // Fallback if hotelId is not ObjectId
      logger.warn(
        `⚠️ hotelId is missing for QR order ${orderNumber}, using reference ${hotelReference}`,
      );
      // Find hotel by ID string if needed, but hotelId should be populated now.
    }

    // 2. Credit Admin Wallet
    await creditAdminWallet(order._id, adminShare, orderNumber, restaurantId);

    // 3. Credit Restaurant Wallet
    await creditRestaurantWallet(
      restaurantId,
      order._id,
      restaurantShare,
      orderNumber,
      totalAmount,
      adminShare + hotelShare,
    );

    // Update order state
    order.hotelCommission = hotelShare;
    order.adminCommission = adminShare;
    order.restaurantShare = restaurantShare;
    order.commissionDistributed = true;
    await order.save();

    logger.info(
      `✅ Commission distributed successfully for order ${orderNumber}`,
    );
    return {
      success: true,
      shares: { hotelShare, adminShare, restaurantShare },
    };
  } catch (error) {
    logger.error(
      `❌ Error distributing commission for order ${orderId}:`,
      error,
    );
    throw error;
  }
};
