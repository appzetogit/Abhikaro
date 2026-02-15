import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";

/**
 * Hotel Requests Controller
 *
 * NOTE: Backend order-request model/service isn't implemented in this repo yet.
 * For now we return empty arrays and zero stats so frontend pages work end-to-end
 * without 404s. Later we can wire this to a real model (e.g. HotelRequest/Order).
 */

import Order from "../../order/models/Order.js";

export const getHotelRequests = async (req, res) => {
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
    const requests = await Order.find(query)
      .populate("userId", "name phone email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

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
    return errorResponse(res, 500, err.message || "Failed to fetch requests");
  }
};

export const getHotelRequestStats = async (req, res) => {
  try {
    const hotelId = req.hotel.hotelId;
    const _id = req.hotel._id;

    console.log(
      `🔍 [DEBUG] getHotelRequestStats called for Hotel: ${hotelId} (${_id})`,
    );

    const query = {
      $or: [
        { hotelId: _id },
        { hotelReference: hotelId },
        { hotelReference: _id.toString() },
      ],
    };

    // Use aggregation for accurate results (matching hotelOrdersController logic)
    const stats = await Order.aggregate([
      {
        $match: query,
      },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          totalRevenue: {
            $sum: {
              $cond: [{ $ne: ["$status", "cancelled"] }, "$pricing.total", 0],
            },
          },
          yourEarnings: {
            $sum: {
              $cond: [
                { $eq: ["$commissionDistributed", true] },
                "$hotelCommission",
                0,
              ],
            },
          },
          pending: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
            },
          },
          confirmed: {
            $sum: {
              $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0],
            },
          },
          completed: {
            $sum: {
              $cond: [{ $eq: ["$status", "delivered"] }, 1, 0],
            },
          },
          cancelled: {
            $sum: {
              $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalRequests: 1,
          totalRevenue: { $round: ["$totalRevenue", 2] },
          yourEarnings: { $round: ["$yourEarnings", 2] },
          pending: 1,
          confirmed: 1,
          completed: 1,
          cancelled: 1,
        },
      },
    ]);

    const result = stats[0] || {
      totalRequests: 0,
      totalRevenue: 0,
      yourEarnings: 0,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };

    return successResponse(res, 200, "Request stats fetched successfully", {
      totalRequests: result.totalRequests,
      pendingRequests: result.pending + result.confirmed,
      completedRequests: result.completed,
      cancelledRequests: result.cancelled,
      totalRevenue: result.totalRevenue,
      totalHotelRevenue: result.yourEarnings,
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
