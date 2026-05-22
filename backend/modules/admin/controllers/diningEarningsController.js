import TableBooking from "../../dining/models/TableBooking.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";

/**
 * Get dining earnings summary and list (admin)
 * GET /api/admin/dining-earnings
 * Query: restaurantId, startDate, endDate, page, limit
 */
export const getDiningEarnings = asyncHandler(async (req, res) => {
  const { restaurantId, startDate, endDate, page = 1, limit = 20 } = req.query;
  const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, Math.min(100, parseInt(limit, 10)));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));

  const match = {};
  if (restaurantId) {
    match.restaurant = restaurantId;
  }
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match.date.$lte = end;
    }
  }
  const summaryMatch = { ...match, paymentStatus: "paid", billStatus: "completed" };

  const [summary, list, total] = await Promise.all([
    TableBooking.aggregate([
      { $match: summaryMatch },
      {
        $group: {
          _id: null,
          totalDiningRevenue: { $sum: "$finalAmount" },
          totalDiscountGiven: { $sum: "$discountAmount" },
          totalCommissionEarned: { $sum: "$adminEarning" },
          totalRestaurantEarnings: { $sum: "$restaurantEarning" },
          count: { $sum: 1 },
        },
      },
    ]),
    TableBooking.find(match)
      .populate("restaurant", "name slug onboarding")
      .populate("user", "name phone email")
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    TableBooking.countDocuments(match),
  ]);

  const stats = summary[0] || {
    totalDiningRevenue: 0,
    totalDiscountGiven: 0,
    totalCommissionEarned: 0,
    totalRestaurantEarnings: 0,
    count: 0,
  };

  // Fix restaurant names: Prefer onboarding.step1.restaurantName if available
  const transformedList = list.map(item => {
    if (item.restaurant && item.restaurant.onboarding?.step1?.restaurantName) {
      item.restaurant.name = item.restaurant.onboarding.step1.restaurantName;
    }
    return item;
  });

  return successResponse(res, 200, "Dining bookings fetched", {
    summary: {
      totalDiningRevenue: stats.totalDiningRevenue,
      totalDiscountGiven: stats.totalDiscountGiven,
      totalCommissionEarned: stats.totalCommissionEarned,
      totalRestaurantEarnings: stats.totalRestaurantEarnings,
      totalTransactions: stats.count,
    },
    data: transformedList,
    pagination: {
      page: Math.max(1, parseInt(page, 10)),
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});
