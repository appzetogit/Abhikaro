import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";

import mongoose from "mongoose";
import Order from "../../order/models/Order.js";

export const getHotelRequests = async (req, res) => {
  try {
    const hotelId = req.hotel.hotelId;
    const _id = req.hotel._id;
    const { status, page = 1, limit = 20 } = req.query;

    console.log(`🔍 [DEBUG] getHotelRequests for Hotel: ${hotelId} (${_id})`);

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

    // Map orders to the format expected by the frontend (HotelRequests page)
    const requests = orders.map((order) => ({
      ...order.toObject(),
      requestId: order.orderId, // Map orderId to requestId
      totalAmount: order.pricing?.total || 0, // Map pricing.total to totalAmount
      items: order.items.map((item) => ({
        ...item,
        itemName: item.name, // Ensure itemName is available if frontend expects it
      })),
    }));

    // Get total count for pagination
    const totalRequests = await Order.countDocuments(query);

    return successResponse(res, 200, "Requests fetched successfully", {
      requests,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRequests / limit),
        totalRequests,
        requestsPerPage: parseInt(limit),
      },
    });
  } catch (err) {
    console.error("❌ [DEBUG] Error in getHotelRequests:", err);
    return errorResponse(res, 500, err.message || "Failed to fetch requests");
  }
};

export const getHotelRequestStats = async (req, res) => {
  try {
    const hotelIdStr = req.hotel.hotelId;
    const hotelObjectId = req.hotel._id;

    // Fetch the hotel to get current commission settings for fallback
    const Hotel = (await import("../../hotel/models/Hotel.js")).default;
    const hotel = await Hotel.findById(hotelObjectId).lean();
    if (!hotel) {
      return errorResponse(res, 404, "Hotel not found");
    }

    const query = {
      $or: [
        { hotelId: hotelObjectId },
        { hotelReference: hotelIdStr },
        { hotelReference: hotelObjectId.toString() },
      ],
    };

    // Fetch all non-cancelled orders for the hotel for stats
    const allOrders = await Order.find(query).lean();

    const stats = {
      totalRequests: allOrders.length,
      totalRevenue: 0,
      totalHotelRevenue: 0,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };

    allOrders.forEach((order) => {
      // Basic counts
      if (order.status === "pending") stats.pending++;
      else if (order.status === "confirmed") stats.confirmed++;
      else if (order.status === "delivered") stats.completed++;
      else if (order.status === "cancelled") stats.cancelled++;

      // Revenue and Earnings (exclude cancelled)
      if (order.status !== "cancelled") {
        const totalAmount = order.pricing?.total || 0;
        stats.totalRevenue += totalAmount;

        const breakdown = order.commissionBreakdown;
        if (breakdown && breakdown.hotel > 0) {
          stats.totalHotelRevenue += breakdown.hotel;
        } else {
          // Fallback: Use current hotel settings
          const hotelCommPercent = hotel.commission || 0;
          stats.totalHotelRevenue += (totalAmount * hotelCommPercent) / 100;
        }
      }
    });

    return successResponse(res, 200, "Request stats fetched successfully", {
      totalRequests: stats.totalRequests,
      pendingRequests: stats.pending + stats.confirmed,
      completedRequests: stats.completed,
      cancelledRequests: stats.cancelled,
      totalRevenue: Math.round(stats.totalRevenue * 100) / 100,
      totalHotelRevenue: Math.round(stats.totalHotelRevenue * 100) / 100,
    });
  } catch (err) {
    console.error("❌ [DEBUG] Error in getHotelRequestStats:", err);
    return errorResponse(
      res,
      500,
      err.message || "Failed to fetch request stats",
    );
  }
};

export const getHotelRequestById = async (req, res) => {
  try {
    // Future: fetch by id and ensure it belongs to req.hotel._id
    return errorResponse(res, 404, "Request not found");
  } catch (err) {
    return errorResponse(res, 500, err.message || "Failed to fetch request");
  }
};
