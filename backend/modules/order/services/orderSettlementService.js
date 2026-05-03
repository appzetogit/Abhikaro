import Order from "../models/Order.js";
import OrderSettlement from "../models/OrderSettlement.js";
import RestaurantCommission from "../../admin/models/RestaurantCommission.js";
import DeliveryBoyCommission from "../../admin/models/DeliveryBoyCommission.js";
import FeeSettings from "../../admin/models/FeeSettings.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import Hotel from "../../hotel/models/Hotel.js";
import mongoose from "mongoose";
import { calculateDistance } from "./orderCalculationService.js";
import HotelWallet from "../../hotel/models/HotelWallet.js";
import { getCache, setCache, generateCacheKey, CACHE_TTL } from "../../../shared/utils/cache.js";

/**
 * Calculate comprehensive order settlement breakdown
 * This calculates earnings for User, Restaurant, Delivery Partner, and Admin
 */
export const calculateOrderSettlement = async (orderId) => {
  try {
    const order = await Order.findById(orderId).lean();
    if (!order) {
      throw new Error("Order not found");
    }

    // Get fee settings (with caching)
    const feeSettingsCacheKey = generateCacheKey('feeSettings', 'active');
    let feeSettings = await getCache(feeSettingsCacheKey);
    
    if (!feeSettings) {
      feeSettings = await FeeSettings.findOne({ isActive: true })
        .sort({ createdAt: -1 })
        .lean();
      
      if (feeSettings) {
        await setCache(feeSettingsCacheKey, feeSettings, CACHE_TTL.FEE_SETTINGS);
      }
    }

    const platformFee = feeSettings?.platformFee || 5;
    const gstRate = (feeSettings?.gstRate || 5) / 100;

    // Get restaurant details
    let restaurant = null;
    if (
      mongoose.Types.ObjectId.isValid(order.restaurantId) &&
      order.restaurantId.length === 24
    ) {
      restaurant = await Restaurant.findById(order.restaurantId).lean();
    }
    if (!restaurant) {
      restaurant = await Restaurant.findOne({
        $or: [
          { restaurantId: order.restaurantId },
          { slug: order.restaurantId },
        ],
      }).lean();
    }

    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    // Calculate user payment breakdown
    const userPayment = {
      subtotal: order.pricing.subtotal || 0,
      discount: order.pricing.discount || 0,
      deliveryFee: order.pricing.deliveryFee || 0,
      platformFee: order.pricing.platformFee || platformFee,
      gst: order.pricing.tax || 0,
      packagingFee: 0, // Can be added later if needed
      total: order.pricing.total || 0,
    };

    const foodPrice = userPayment.subtotal - userPayment.discount;
    let restaurantEarning = {
      foodPrice: foodPrice,
      commission: 0,
      commissionPercentage: 0,
      netEarning: 0,
      status: "pending",
    };

    let hotelEarning = {
      hotelId: null,
      hotelName: null,
      commission: 0,
      commissionPercentage: 0,
      status: "pending",
    };

    let adminCommission = 0;
    let adminCommissionFromHotel = 0;

    let restaurantCommissionData = null;

    /**
     * IMPORTANT:
     * - For direct restaurant orders, restaurant earnings MUST follow the
     *   per‑restaurant commission setup (RestaurantCommission).
     * - We should not reduce restaurant share because of admin‑funded offers;
     *   that's already handled via foodPrice (subtotal - discount).
     *
     * To keep behaviour predictable, we always recalculate restaurant/admin
     * commission here for direct orders using RestaurantCommission, ignoring
     * any pre‑calculated breakdown stored on the Order.
     */
    if (!order.hotelReference) {
      // DIRECT ORDER → use per‑restaurant commission rules
      restaurantCommissionData =
        await RestaurantCommission.calculateCommissionForOrder(
          restaurant._id,
          foodPrice,
        );

      const commissionAmount =
        Math.round(restaurantCommissionData.commission * 100) / 100;
      const restaurantNetEarning =
        Math.round((foodPrice - commissionAmount) * 100) / 100;

      restaurantEarning = {
        foodPrice: foodPrice,
        commission: commissionAmount,
        commissionPercentage:
          restaurantCommissionData.type === "percentage"
            ? restaurantCommissionData.value
            : (commissionAmount / foodPrice) * 100,
        netEarning: restaurantNetEarning,
        status: "pending",
      };

      adminCommission = commissionAmount;
    } else {
      // QR / HOTEL ORDER → keep existing breakdown behaviour (if present)
      if (order.commissionBreakdown) {
        const { restaurant: restNet, admin, hotel } = order.commissionBreakdown;

        // Restaurant Earning
        restaurantEarning.netEarning = restNet;
        restaurantEarning.commission =
          Math.round((foodPrice - restNet) * 100) / 100;
        restaurantEarning.commissionPercentage =
          order.commissionPercentages?.restaurant || 0;

        // Hotel Earning (if QR)
        if (hotel > 0) {
          let hotelDoc = null;
          if (
            mongoose.Types.ObjectId.isValid(order.hotelReference) &&
            order.hotelReference.length === 24
          ) {
            hotelDoc = await Hotel.findById(order.hotelReference).lean();
          }
          if (!hotelDoc) {
            hotelDoc = await Hotel.findOne({
              hotelId: order.hotelReference,
            }).lean();
          }

          hotelEarning = {
            hotelId: hotelDoc?._id || null,
            hotelName: hotelDoc?.hotelName || order.hotelName || "Unknown Hotel",
            commission: hotel,
            commissionPercentage: order.commissionPercentages?.hotel || 0,
            status: "pending",
          };
        }

        adminCommission = admin;
        adminCommissionFromHotel = 0;
      } else {
        // FALLBACK legacy calculation for QR orders (rare)
        restaurantCommissionData =
          await RestaurantCommission.calculateCommissionForOrder(
            restaurant._id,
            foodPrice,
          );

        const commissionAmount =
          Math.round(restaurantCommissionData.commission * 100) / 100;
        const restaurantNetEarning =
          Math.round((foodPrice - commissionAmount) * 100) / 100;

        restaurantEarning = {
          foodPrice: foodPrice,
          commission: commissionAmount,
          commissionPercentage:
            restaurantCommissionData.type === "percentage"
              ? restaurantCommissionData.value
              : (commissionAmount / foodPrice) * 100,
          netEarning: restaurantNetEarning,
          status: "pending",
        };

        adminCommission = commissionAmount;
      }
    }

    // Calculate delivery partner earnings
    let deliveryPartnerEarning = {
      basePayout: 0,
      distance: 0,
      commissionPerKm: 0,
      distanceCommission: 0,
      surgeMultiplier: 1,
      surgeAmount: 0,
      totalEarning: 0,
      status: "pending",
    };

    if (order.deliveryPartnerId) {
      // Get distance using priorities similar to completeDelivery controller
      let distance = 0;
      if (order.deliveryState?.routeToDelivery?.distance) {
        distance = order.deliveryState.routeToDelivery.distance;
      } else if (order.assignmentInfo?.distance) {
        distance = order.assignmentInfo.distance;
      } else if (order.restaurantId?.location?.coordinates && order.address?.location?.coordinates) {
        // Fallback to Haversine if coordinates available
        const [rlng, rlat] = order.restaurantId.location.coordinates;
        const [clng, clat] = order.address.location.coordinates;
        const R = 6371;
        const dLat = ((clat - rlat) * Math.PI) / 180;
        const dLng = ((clng - rlng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((rlat * Math.PI) / 180) * Math.cos((clat * Math.PI) / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distance = R * c;
      }

      const deliveryCommission =
        await DeliveryBoyCommission.calculateCommission(distance);

      const surgeMultiplier = order.assignmentInfo?.surgeMultiplier || 1;
      const baseEarning = deliveryCommission.commission;
      const surgeAmount = baseEarning * (surgeMultiplier - 1);

      deliveryPartnerEarning = {
        basePayout: deliveryCommission.breakdown.basePayout,
        distance: distance,
        commissionPerKm: deliveryCommission.breakdown.commissionPerKm,
        distanceCommission: deliveryCommission.breakdown.distanceCommission,
        surgeMultiplier: surgeMultiplier,
        surgeAmount: surgeAmount,
        totalEarning: baseEarning + surgeAmount,
        status: "pending",
      };
    }

    // Calculate admin/platform final earnings
    const deliveryMargin =
      userPayment.deliveryFee - deliveryPartnerEarning.totalEarning;

    // adminCommission is already determined above (Net for Admin)
    const adminPlatformFee = Math.round(userPayment.platformFee * 100) / 100;
    const adminDeliveryFee = Math.round(userPayment.deliveryFee * 100) / 100;
    const adminGST = Math.round(userPayment.gst * 100) / 100;

    // adminCommissionFromHotel is used if we want to track it separately,
    // but we already set adminCommission to the Net Share.
    // So distinct 'hotelCommission' field in AdminEarning might be redundant or valid for legacy.
    // We'll set it to 0 per new logic to avoid double count, or keep it if it means "Extra from Hotel".
    // For now, let's treat adminCommission as the main source.

    const adminTotal =
      Math.round(
        (adminCommission + adminPlatformFee + adminDeliveryFee + adminGST) *
          100,
      ) / 100;

    // Determine if this is a QR order
    const isQR = !!(hotelEarning && hotelEarning.hotelId);

    const adminEarning = {
      commission: adminCommission,
      platformFee: adminPlatformFee,
      deliveryFee: adminDeliveryFee,
      gst: adminGST,
      deliveryMargin: Math.max(0, Math.round(deliveryMargin * 100) / 100),
      hotelCommission: isQR ? adminCommission : 0, // Admin's commission from QR order
      orderType: isQR ? "QR" : "DIRECT",
      totalEarning: adminTotal,
      status: "pending",
    };

    // Create or update settlement
    let settlement = await OrderSettlement.findOne({ orderId });

    const settlementData = {
      orderNumber: order.orderId,
      userId: order.userId,
      restaurantId: restaurant._id,
      restaurantName: restaurant.name || order.restaurantName,
      deliveryPartnerId: order.deliveryPartnerId || null,
      userPayment,
      restaurantEarning,
      deliveryPartnerEarning,
      adminEarning,
      hotelEarning: hotelEarning.hotelId ? hotelEarning : undefined, // Only include if hotel exists
      escrowStatus: "pending",
      escrowAmount: userPayment.total,
      settlementStatus: "pending",
      calculationSnapshot: {
        feeSettings: {
          platformFee: feeSettings?.platformFee,
          gstRate: feeSettings?.gstRate,
          deliveryFee: feeSettings?.deliveryFee,
        },
        restaurantCommission: restaurantCommissionData
          ? {
              type: restaurantCommissionData.type,
              value: restaurantCommissionData.value,
              rule: restaurantCommissionData.rule,
            }
          : null,
        deliveryCommission:
          deliveryPartnerEarning.distance > 0
            ? {
                distance: deliveryPartnerEarning.distance,
                basePayout: deliveryPartnerEarning.basePayout,
                commissionPerKm: deliveryPartnerEarning.commissionPerKm,
              }
            : null,
        hotelCommission: hotelEarning.hotelId
          ? {
              hotelId: hotelEarning.hotelId,
              hotelName: hotelEarning.hotelName,
              commissionPercentage: hotelEarning.commissionPercentage,
              commissionAmount: hotelEarning.commission,
              adminCommissionPercentage:
                adminCommissionFromHotel > 0
                  ? (
                      (adminCommissionFromHotel / userPayment.total) *
                      100
                    ).toFixed(2)
                  : 0,
              adminCommissionAmount: adminCommissionFromHotel,
            }
          : null,
        calculatedAt: new Date(),
      },
    };

    if (settlement) {
      Object.assign(settlement, settlementData);
      await settlement.save();
    } else {
      settlement = await OrderSettlement.create({
        orderId,
        ...settlementData,
      });
    }

    return settlement;
  } catch (error) {
    console.error("Error calculating order settlement:", error);
    throw new Error(`Failed to calculate order settlement: ${error.message}`);
  }
};

/**
 * Get settlement details for an order
 */
export const getOrderSettlement = async (orderId) => {
  try {
    let settlement = await OrderSettlement.findOne({ orderId })
      .populate("orderId", "orderId status")
      .populate("restaurantId", "name restaurantId")
      .populate("deliveryPartnerId", "name phone")
      .lean();

    if (!settlement) {
      // Calculate if doesn't exist
      settlement = await calculateOrderSettlement(orderId);
    }

    return settlement;
  } catch (error) {
    console.error("Error getting order settlement:", error);
    throw error;
  }
};

/**
 * Update settlement when order status changes
 */
export const updateSettlementOnStatusChange = async (
  orderId,
  newStatus,
  previousStatus,
) => {
  try {
    const settlement = await OrderSettlement.findOne({ orderId });
    if (!settlement) {
      return;
    }

    // Update escrow status based on order status
    if (newStatus === "delivered") {
      settlement.escrowStatus = "released";
      settlement.escrowReleasedAt = new Date();
      settlement.settlementStatus = "completed";

      // Credit Hotel Wallet if applicable
      if (
        settlement.hotelEarning &&
        settlement.hotelEarning.hotelId &&
        settlement.hotelEarning.commission > 0 &&
        settlement.hotelEarning.status !== "completed"
      ) {
        try {
          // Fetch order to check payment method
          const order = await Order.findById(settlement.orderId).lean();
          const isPayAtHotel = order?.payment?.method === "pay_at_hotel";

          const hotelWallet = await HotelWallet.findOrCreateByHotelId(
            settlement.hotelEarning.hotelId,
          );
          await hotelWallet.addTransaction({
            amount: settlement.hotelEarning.commission,
            type: isPayAtHotel ? "cash_collection" : "commission",
            status: "Completed",
            description: `${isPayAtHotel ? "Cash Collection" : "Commission"} for Order #${settlement.orderNumber}`,
            orderId: settlement.orderId,
          });
          await hotelWallet.save();

          settlement.hotelEarning.status = "completed";
          console.log(
            `Credited ${settlement.hotelEarning.commission} to hotel ${settlement.hotelEarning.hotelId}`,
          );
        } catch (walletError) {
          console.error("Error crediting hotel wallet:", walletError);
        }
      }
    } else if (newStatus === "cancelled") {
      settlement.escrowStatus = "refunded";
      settlement.settlementStatus = "cancelled";
    }

    await settlement.save();
  } catch (error) {
    console.error("Error updating settlement on status change:", error);
    throw error;
  }
};
