import Order from "../models/Order.js";
import {
  creditHotelWallet,
  creditAdminWallet,
  creditRestaurantWallet,
} from "./escrowWalletService.js";
import winston from "winston";
import { getHotelCommissionableSubtotal } from "../utils/hotelCommissionBase.js";

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
    // IMPORTANT:
    // QR split should be based on commissionable food subtotal so Online and
    // Pay-at-Hotel/Cash yield the same hotel earning for the same order.
    const totalAmount = getHotelCommissionableSubtotal(order);

    // Split logic: Use stored breakdown if available, otherwise fallback to 10/20 default
    let hotelShare = 0;
    let adminShare = 0;
    let restaurantShare = 0;

    if (
      order.commissionBreakdown &&
      (order.commissionBreakdown.hotel > 0 ||
        order.commissionBreakdown.admin > 0)
    ) {
      hotelShare = order.commissionBreakdown.hotel || 0;
      adminShare = order.commissionBreakdown.admin || 0;
      restaurantShare = order.commissionBreakdown.restaurant || 0;
      logger.info(
        `💰 Using stored commission breakdown for order ${orderNumber}`,
      );
      } else {
        // Fallback: Fetch hotel-specific commission percentages dynamically
        let hotelPct = 0;
        let adminPct = 0;
        let hotelDoc = null;
        try {
          const mongoose = (await import("mongoose")).default;
          const Hotel = (await import("../../hotel/models/Hotel.js")).default;
          const hotelRef = hotelReference || hotelId;
          if (hotelRef) {
            if (mongoose.Types.ObjectId.isValid(hotelRef)) {
              hotelDoc = await Hotel.findById(hotelRef).lean();
            } else {
              hotelDoc = await Hotel.findOne({ hotelId: hotelRef }).lean();
            }
          }
          if (!hotelDoc && hotelId) {
            hotelDoc = await Hotel.findById(hotelId).lean();
          }
        } catch (hError) {
          logger.warn("⚠️ Failed to fetch hotel for commission distribution, using settings/defaults:", hError.message);
        }

        if (hotelDoc) {
          hotelPct = Number(hotelDoc.commission) || 0;
          adminPct = Number(hotelDoc.adminCommission) || 0;
          logger.info(`🎯 Using hotel-specific commission for distribution: Hotel ${hotelPct}%, Admin ${adminPct}%`);
        } else {
          try {
            const CommissionSettings = (
              await import("../../admin/models/CommissionSettings.js")
            ).default;
            let commissionSettings = await CommissionSettings.findOne().sort({
              createdAt: -1,
            });
            if (commissionSettings && commissionSettings.qrCommission) {
              hotelPct = Number(commissionSettings.qrCommission.hotel) || 10;
              adminPct = Number(commissionSettings.qrCommission.admin) || 20;
            } else {
              hotelPct = 10;
              adminPct = 20;
            }
          } catch (settingsError) {
            hotelPct = 10;
            adminPct = 20;
          }
          logger.info(`ℹ️ Using settings/fallback commission for distribution: Hotel ${hotelPct}%, Admin ${adminPct}%`);
        }

        hotelShare = Math.round(totalAmount * (hotelPct / 100) * 100) / 100;
        adminShare = Math.round(totalAmount * (adminPct / 100) * 100) / 100;
        restaurantShare = Math.round((totalAmount - hotelShare - adminShare) * 100) / 100;
      }

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
