import Order from "../../order/models/Order.js";
import Hotel from "../models/Hotel.js";
import {
  updateSettlementOnStatusChange,
  calculateOrderSettlement,
} from "../../order/services/orderSettlementService.js";
import { distributeCommissions } from "../../order/services/commissionDistributionService.js";
import mongoose from "mongoose";

/**
 * Get all orders for a specific hotel
 * @route GET /api/hotel/orders
 * @access Private (Hotel Admin)
 */
export const getHotelOrders = async (req, res) => {
  try {
    const hotelId = req.hotel.hotelId;
    const _id = req.hotel._id;
    const { status, page = 1, limit = 20 } = req.query;

    // Build query - use both string ID and ObjectId for robust matching
    const query = {
      $or: [
        { hotelId: _id },
        { hotelReference: hotelId },
        { hotelReference: _id.toString() },
      ],
    };

    // Filter by status if provided
    if (status && status !== "all") {
      query.status = status;
    }

    // Fetch orders with pagination
    const skip = (page - 1) * limit;
    const orders = await Order.find(query)
      .populate("userId", "name phone email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalOrders / limit),
          totalOrders,
          ordersPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching hotel orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
      error: error.message,
    });
  }
};

/**
 * Get order details by ID
 * @route GET /api/hotel/orders/:orderId
 * @access Private (Hotel Admin)
 */
export const getOrderDetails = async (req, res) => {
  try {
    const { hotelId, _id } = req.hotel; // From auth middleware
    const { orderId } = req.params;

    // Find order and verify it belongs to this hotel
    const order = await Order.findOne({
      orderId,
      $or: [
        { hotelId: _id },
        { hotelReference: hotelId },
        { hotelReference: _id.toString() },
      ],
    }).populate("userId", "name phone email profileImage");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or does not belong to this hotel",
      });
    }

    return res.status(200).json({
      success: true,
      data: { order },
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order details",
      error: error.message,
    });
  }
};

/**
 * Accept an order
 * @route POST /api/hotel/orders/:orderId/accept
 * @access Private (Hotel Admin)
 */
export const acceptOrder = async (req, res) => {
  try {
    const { hotelId, _id } = req.hotel; // From auth middleware
    const { orderId } = req.params;

    // Find order and verify it belongs to this hotel
    const order = await Order.findOne({
      orderId,
      $or: [
        { hotelId: _id },
        { hotelReference: hotelId },
        { hotelReference: _id.toString() },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or does not belong to this hotel",
      });
    }

    // Check if order is in pending status
    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot accept order with status: ${order.status}`,
      });
    }

    // Update order status to confirmed
    order.status = "confirmed";
    order.tracking.confirmed = {
      status: true,
      timestamp: new Date(),
    };
    await order.save();

    // Calculate settlement
    try {
      await calculateOrderSettlement(order._id);
    } catch (settlementError) {
      console.error("Error calculating settlement on accept:", settlementError);
    }

    // TODO: Send notification to user about order acceptance
    // You can integrate Socket.io or push notification here

    return res.status(200).json({
      success: true,
      message: "Order accepted successfully",
      data: { order },
    });
  } catch (error) {
    console.error("Error accepting order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to accept order",
      error: error.message,
    });
  }
};

/**
 * Reject an order
 * @route POST /api/hotel/orders/:orderId/reject
 * @access Private (Hotel Admin)
 */
export const rejectOrder = async (req, res) => {
  try {
    const { hotelId, _id } = req.hotel; // From auth middleware
    const { orderId } = req.params;
    const { reason } = req.body;

    // Find order and verify it belongs to this hotel
    const order = await Order.findOne({
      orderId,
      $or: [
        { hotelId: _id },
        { hotelReference: hotelId },
        { hotelReference: _id.toString() },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or does not belong to this hotel",
      });
    }

    // Check if order is in pending status
    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot reject order with status: ${order.status}`,
      });
    }

    // Update order status to cancelled
    order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancelledBy = "restaurant"; // Using 'restaurant' as hotel admin
    order.cancellationReason = reason || "Rejected by hotel";
    await order.save();

    // TODO: Send notification to user about order rejection
    // TODO: Process refund if payment was already made

    return res.status(200).json({
      success: true,
      message: "Order rejected successfully",
      data: { order },
    });
  } catch (error) {
    console.error("Error rejecting order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reject order",
      error: error.message,
    });
  }
};

/**
 * Get order statistics for hotel dashboard
 * @route GET /api/hotel/orders/stats
 * @access Private (Hotel Admin)
 */
export const getOrderStats = async (req, res) => {
  try {
    const hotelIdStr = req.hotel.hotelId;
    const hotelObjectId = req.hotel._id;

    const hotel = await Hotel.findById(hotelObjectId).lean();
    if (!hotel) {
      return res
        .status(404)
        .json({ success: false, message: "Hotel not found" });
    }

    const hotelRefIds = [hotelObjectId, hotelIdStr, hotelObjectId.toString()];

    // Aggregation for stats
    const statsResult = await Order.aggregate([
      {
        $match: {
          $or: [
            { hotelId: hotelObjectId },
            { hotelReference: { $in: [hotelIdStr, hotelObjectId.toString()] } },
          ],
        },
      },
      {
        $facet: {
          counts: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ],
          financials: [
            {
              $match: {
                $or: [
                  { "payment.status": "completed" },
                  {
                    $and: [
                      { "payment.method": { $in: ["pay_at_hotel", "cash"] } },
                      { status: "delivered" },
                    ],
                  },
                ],
                status: { $ne: "cancelled" },
              },
            },
            {
              $project: {
                total: { $ifNull: ["$pricing.total", 0] },
                hotelComm: {
                  $ifNull: [
                    "$commissionBreakdown.hotel",
                    {
                      $divide: [
                        {
                          $multiply: [
                            { $ifNull: ["$pricing.total", 0] },
                            Number(hotel.commission) || 0,
                          ],
                        },
                        100,
                      ],
                    },
                  ],
                },
                isCashCollected: {
                  $cond: [
                    {
                      $and: [
                        { $in: ["$payment.method", ["pay_at_hotel", "cash"]] },
                        { $eq: ["$cashCollected", true] },
                      ],
                    },
                    { $ifNull: ["$pricing.total", 0] },
                    0,
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$total" },
                yourEarnings: { $sum: "$hotelComm" },
                totalCashCollected: { $sum: "$isCashCollected" },
              },
            },
          ],
        },
      },
    ]);

    const facet = statsResult[0];
    const counts = facet.counts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});
    const financial = facet.financials[0] || {
      totalRevenue: 0,
      yourEarnings: 0,
      totalCashCollected: 0,
    };

    const finalResult = {
      totalRequests: (facet.counts || []).reduce(
        (acc, curr) => acc + curr.count,
        0,
      ),
      pending: counts.pending || 0,
      confirmed: counts.confirmed || 0,
      completed:
        (counts.delivered || 0) +
        (counts.ready || 0) +
        (counts.out_for_delivery || 0) +
        (counts.preparing || 0),
      cancelled: counts.cancelled || 0,
      totalRevenue: Math.round(financial.totalRevenue * 100) / 100,
      yourEarnings: Math.round(financial.yourEarnings * 100) / 100,
      totalHotelRevenue: Math.round(financial.yourEarnings * 100) / 100,
      totalCashCollected: Math.round(financial.totalCashCollected * 100) / 100,
    };

    return res.status(200).json({
      success: true,
      data: finalResult,
    });
  } catch (error) {
    console.error("Error fetching order stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order statistics",
      error: error.message,
    });
  }
};

/**
 * Collect payment for an order (Cash/Pay at Hotel)
 * @route POST /api/hotel/orders/:orderId/collect-payment
 * @access Private (Hotel Admin)
 */
export const collectPayment = async (req, res) => {
  try {
    const { hotelId, _id } = req.hotel; // From auth middleware
    const { orderId } = req.params;

    // Find order and verify it belongs to this hotel
    const order = await Order.findOne({
      orderId,
      $or: [
        { hotelId: _id },
        { hotelReference: hotelId },
        { hotelReference: _id.toString() },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or does not belong to this hotel",
      });
    }

    // Check if order is already completed or cancelled
    if (order.status === "delivered" || order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: `Order is already ${order.status}`,
      });
    }

    // Update payment status and cash collected flag
    order.payment.status = "completed";
    order.cashCollected = true;

    // As per requirement, if Pay at Hotel and cash collected, mark status as delivered (Completed)
    // and trigger commission split.
    order.status = "delivered";
    order.deliveredAt = new Date();
    if (!order.tracking.delivered) {
      order.tracking.delivered = {
        status: true,
        timestamp: new Date(),
      };
    }

    await order.save();

    // Trigger QR Commission split for Pay at Hotel
    try {
      await distributeCommissions(order._id);
      console.log(
        `✅ QR commission distributed for cash collected order ${order.orderId}`,
      );
    } catch (distErr) {
      console.error(
        `❌ Failed to distribute QR commission on cash collection: ${distErr.message}`,
      );
    }

    // Trigger settlement update (Legacy/Existing Logic)
    try {
      if (
        order.payment.method === "pay_at_hotel" ||
        order.payment.method === "cash"
      ) {
        const OrderSettlement = (
          await import("../../order/models/OrderSettlement.js")
        ).default;
        await OrderSettlement.findOneAndUpdate(
          { orderId: order._id },
          {
            "adminEarning.adminCommissionStatus": "received", // Mark as received since cash is collected
            settlementStatus: "completed",
          },
        );
      }
    } catch (settlementError) {
      console.error(
        "Error updating settlement after cash collection:",
        settlementError,
      );
    }

    return res.status(200).json({
      success: true,
      message: "Payment collected successfully and order completed.",
      data: { order },
    });
  } catch (error) {
    console.error("Error collecting payment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to collect payment",
      error: error.message,
    });
  }
};
/**
 * Get settlement summary for a hotel
 * @route GET /api/hotel/orders/settlement-summary
 * @access Private (Hotel Admin)
 */
export const getSettlementSummary = async (req, res) => {
  try {
    const hotelIdStr = req.hotel.hotelId;
    const hotelObjectId = req.hotel._id;

    const hotel = await Hotel.findById(hotelObjectId).lean();
    if (!hotel) {
      return res
        .status(404)
        .json({ success: false, message: "Hotel not found" });
    }

    // Aggregation for settlement
    const settlementAggregation = await Order.aggregate([
      {
        $match: {
          $or: [
            { hotelId: hotelObjectId },
            { hotelReference: { $in: [hotelIdStr, hotelObjectId.toString()] } },
          ],
          "payment.method": { $in: ["pay_at_hotel", "cash"] },
          status: { $ne: "cancelled" },
        },
      },
      {
        $project: {
          total: { $ifNull: ["$pricing.total", 0] },
          cashCollected: "$cashCollected",
          status: "$status",
          adminComm: {
            $ifNull: [
              "$commissionBreakdown.admin",
              {
                $divide: [
                  {
                    $multiply: [
                      { $ifNull: ["$pricing.total", 0] },
                      Number(hotel.adminCommission) || 0,
                    ],
                  },
                  100,
                ],
              },
            ],
          },
          hotelComm: {
            $ifNull: [
              "$commissionBreakdown.hotel",
              {
                $divide: [
                  {
                    $multiply: [
                      { $ifNull: ["$pricing.total", 0] },
                      Number(hotel.commission) || 0,
                    ],
                  },
                  100,
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalCashCollected: {
            $sum: {
              $cond: [{ $eq: ["$cashCollected", true] }, "$total", 0],
            },
          },
          adminCommissionDue: {
            $sum: "$adminComm",
          },
          restaurantAmountDue: {
            $sum: {
              $subtract: ["$total", { $add: ["$adminComm", "$hotelComm"] }],
            },
          },
        },
      },
    ]);

    const result = settlementAggregation[0] || {
      totalCashCollected: 0,
      adminCommissionDue: 0,
      restaurantAmountDue: 0,
    };

    const summary = {
      totalCashCollected: Math.round(result.totalCashCollected * 100) / 100,
      adminCommissionDue: Math.round(result.adminCommissionDue * 100) / 100,
      restaurantAmountDue: Math.round(result.restaurantAmountDue * 100) / 100,
      settlementAmount: Math.round(result.restaurantAmountDue * 100) / 100,
      settlementPaid: 0,
      remainingSettlement: Math.round(result.restaurantAmountDue * 100) / 100,
    };

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching settlement summary:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch settlement summary",
      error: error.message,
    });
  }
};

/**
 * Mark an order as delivered
 * @route POST /api/hotel/orders/:orderId/deliver
 * @access Private (Hotel Admin)
 */
export const markOrderAsDelivered = async (req, res) => {
  try {
    const { hotelId, _id } = req.hotel;
    const { orderId } = req.params;

    const order = await Order.findOne({
      orderId,
      $or: [
        { hotelId: _id },
        { hotelReference: hotelId },
        { hotelReference: _id.toString() },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status === "delivered") {
      return res.status(400).json({
        success: false,
        message: "Order is already delivered",
      });
    }

    const previousStatus = order.status;
    order.status = "delivered";
    order.deliveredAt = new Date();

    if (!order.tracking.delivered) {
      order.tracking.delivered = {
        status: true,
        timestamp: new Date(),
      };
    }

    await order.save();

    // Trigger settlement update
    try {
      await updateSettlementOnStatusChange(
        order._id,
        "delivered",
        previousStatus,
      );
    } catch (settlementError) {
      console.error("Error updating settlement on delivery:", settlementError);
    }

    return res.status(200).json({
      success: true,
      message: "Order marked as delivered successfully.",
      data: { order },
    });
  } catch (error) {
    console.error("Error marking order as delivered:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark order as delivered",
      error: error.message,
    });
  }
};
