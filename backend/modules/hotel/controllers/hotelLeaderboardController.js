import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse } from "../../../shared/utils/response.js";
import Order from "../../order/models/Order.js";
import Hotel from "../models/Hotel.js";

/**
 * Hotel leaderboard (QR orders count) for hotel app
 * GET /api/hotel/leaderboard?period=month|6months
 * @access Private (Hotel Admin)
 */
export const getHotelLeaderboard = asyncHandler(async (req, res) => {
  const { period = "month" } = req.query;

  const now = new Date();
  const endDate = now;
  let startDate;
  let periodLabel;

  if (period === "6months") {
    // Fixed 6-month window (resets every 6 months): Jan-Jun or Jul-Dec (current window to date)
    const isFirstHalf = now.getMonth() < 6; // 0-5 => Jan-Jun
    const startMonth = isFirstHalf ? 0 : 6;
    startDate = new Date(now.getFullYear(), startMonth, 1, 0, 0, 0, 0);
    periodLabel = isFirstHalf ? `Jan–Jun ${now.getFullYear()}` : `Jul–Dec ${now.getFullYear()}`;
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    periodLabel = "This month";
  }

  const rows = await Hotel.aggregate([
    {
      $project: {
        _id: 1,
        hotelId: 1,
        hotelName: 1,
        isActive: 1,
      },
    },
    {
      $lookup: {
        from: Order.collection.name,
        let: { hid: "$_id", hcode: "$hotelId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $gte: ["$createdAt", startDate] },
                  { $lte: ["$createdAt", endDate] },
                  { $ne: ["$status", "cancelled"] },
                  {
                    $or: [
                      { $eq: ["$payment.status", "completed"] },
                      {
                        $and: [
                          { $in: ["$payment.method", ["pay_at_hotel", "cash"]] },
                          { $eq: ["$status", "delivered"] },
                        ],
                      },
                    ],
                  },
                  {
                    $or: [
                      { $eq: ["$orderType", "QR"] },
                      { $ne: ["$hotelReference", null] },
                      { $ne: ["$hotelId", null] },
                      { $ne: ["$roomNumber", null] },
                    ],
                  },
                  {
                    $or: [
                      { $eq: ["$hotelId", "$$hid"] },
                      { $eq: ["$hotelReference", "$$hcode"] },
                      { $eq: ["$hotelReference", { $toString: "$$hid" }] },
                    ],
                  },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: "qrOrders",
      },
    },
    { $addFields: { orders: { $size: "$qrOrders" } } },
    { $project: { qrOrders: 0 } },
    { $sort: { orders: -1, hotelName: 1 } },
  ]);

  const leaderboardAll = rows.map((r, idx) => ({
    rank: idx + 1,
    hotelMongoId: r._id,
    hotelId: r.hotelId || null,
    hotelName: r.hotelName || "Unknown Hotel",
    orders: Number(r.orders) || 0,
  }));

  const myHotelMongoId = req.hotel?._id?.toString?.() || null;
  const myIndex = myHotelMongoId
    ? leaderboardAll.findIndex((r) => String(r.hotelMongoId) === String(myHotelMongoId))
    : -1;

  const me =
    myIndex >= 0
      ? {
          rank: leaderboardAll[myIndex].rank,
          hotelMongoId: leaderboardAll[myIndex].hotelMongoId,
          hotelId: leaderboardAll[myIndex].hotelId,
          hotelName: leaderboardAll[myIndex].hotelName,
          orders: leaderboardAll[myIndex].orders,
        }
      : null;

  const topLimit = period === "6months" ? 3 : 10;
  const top = leaderboardAll.slice(0, topLimit);

  return successResponse(res, 200, "Hotel leaderboard fetched successfully", {
    period: period === "6months" ? "6months" : "month",
    periodLabel,
    range: { start: startDate, end: endDate },
    top,
    me,
  });
});

