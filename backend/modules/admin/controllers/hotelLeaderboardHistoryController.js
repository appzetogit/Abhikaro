import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import Hotel from "../../hotel/models/Hotel.js";
import HotelLeaderboardRewards from "../models/HotelLeaderboardRewards.js";
import HotelLeaderboardHistory from "../models/HotelLeaderboardHistory.js";

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parsePeriodRange(type, key) {
  const t = String(type || "").trim();
  const k = String(key || "").trim();

  if (t === "month") {
    const m = k.match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    if (month < 0 || month > 11) return null;
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = endOfDay(new Date(year, month + 1, 0));
    return { start, end, label: `${m[1]}-${m[2]}` };
  }

  if (t === "6months") {
    const m = k.match(/^(\d{4})-(H1|H2)$/i);
    if (!m) return null;
    const year = Number(m[1]);
    const half = m[2].toUpperCase();
    const startMonth = half === "H1" ? 0 : 6;
    const endMonth = half === "H1" ? 5 : 11;
    const start = new Date(year, startMonth, 1, 0, 0, 0, 0);
    const end = endOfDay(new Date(year, endMonth + 1, 0));
    return { start, end, label: `${year}-${half}` };
  }

  if (t === "year") {
    const m = k.match(/^(\d{4})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = endOfDay(new Date(year, 11, 31));
    return { start, end, label: `${year}` };
  }

  return null;
}

function normalizeRewardsSnapshot(doc) {
  const payload = doc?.toObject ? doc.toObject() : doc;
  const monthly = payload?.monthly || {};
  const sixMonths = payload?.sixMonths || {};
  return {
    monthly: {
      gifts: Array.isArray(monthly.gifts) ? monthly.gifts : [],
      discounts: Array.isArray(monthly.discounts) ? monthly.discounts : [],
    },
    sixMonths: {
      gifts: Array.isArray(sixMonths.gifts) ? sixMonths.gifts : [],
    },
  };
}

function rewardForRank({ type, rank, snapshot }) {
  const r = Number(rank);
  if (!Number.isFinite(r)) return { type: "none", label: "", imageUrl: "", rupeesOff: 0 };

  if (type === "6months") {
    const gift = snapshot?.sixMonths?.gifts?.find((g) => Number(g?.position) === r);
    if (gift && (gift.name || gift.image?.url)) {
      return { type: "gift", label: gift.name || "Gift", imageUrl: gift.image?.url || "", rupeesOff: 0 };
    }
    return { type: "none", label: "", imageUrl: "", rupeesOff: 0 };
  }

  // month + year: use monthly rules
  const gift = snapshot?.monthly?.gifts?.find((g) => Number(g?.position) === r);
  if (gift && (gift.name || gift.image?.url)) {
    return { type: "gift", label: gift.name || "Gift", imageUrl: gift.image?.url || "", rupeesOff: 0 };
  }
  const disc = snapshot?.monthly?.discounts?.find((d) => Number(d?.position) === r);
  const amt = Number(disc?.rupeesOff || 0);
  if (Number.isFinite(amt) && amt > 0) {
    return { type: "discount", label: `₹${amt} off`, imageUrl: "", rupeesOff: amt };
  }
  return { type: "none", label: "", imageUrl: "", rupeesOff: 0 };
}

async function computeTopRows({ start, end, topN }) {
  const Order = (await import("../../order/models/Order.js")).default;

  // Match QR-origin orders and only count successful/fulfilled ones
  const match = {
    createdAt: { $gte: start, $lte: end },
    status: { $ne: "cancelled" },
    $and: [
      {
        $or: [
          { "payment.status": "completed" },
          {
            $and: [
              { "payment.method": { $in: ["pay_at_hotel", "cash"] } },
              { status: "delivered" },
            ],
          },
        ],
      },
      {
        $or: [
          { orderType: "QR" },
          { hotelReference: { $ne: null } },
          { hotelId: { $ne: null } },
          { roomNumber: { $ne: null } },
        ],
      },
    ],
  };

  const rows = await Hotel.aggregate([
    { $project: { _id: 1, hotelId: 1, hotelName: 1, isActive: 1 } },
    {
      $lookup: {
        from: Order.collection.name,
        let: { hid: "$_id", hcode: "$hotelId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $gte: ["$createdAt", start] },
                  { $lte: ["$createdAt", end] },
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

  return rows
    .slice(0, topN)
    .map((r, idx) => ({
      rank: idx + 1,
      hotelMongoId: r._id,
      hotelId: r.hotelId || "",
      hotelName: r.hotelName || "Unknown Hotel",
      orders: Number(r.orders) || 0,
    }));
}

/**
 * GET /api/admin/hotels/leaderboard-history?type=month|6months|year&key=...&refresh=true|false
 * Returns (and persists) the computed snapshot for that period.
 */
export const getHotelLeaderboardHistory = asyncHandler(async (req, res) => {
  const { type, key, refresh } = req.query;
  const t = String(type || "").trim();
  const k = String(key || "").trim();
  const doRefresh = String(refresh || "").toLowerCase() === "true";

  const range = parsePeriodRange(t, k);
  if (!range) {
    return errorResponse(res, 400, "Invalid type/key. Use month=YYYY-MM, 6months=YYYY-H1|YYYY-H2, year=YYYY.");
  }

  if (!doRefresh) {
    const existing = await HotelLeaderboardHistory.findOne({ type: t, key: k }).lean();
    if (existing) {
      return successResponse(res, 200, "Leaderboard history fetched successfully", existing);
    }
  }

  const rewardsDoc = await HotelLeaderboardRewards.getSettings();
  const snapshot = normalizeRewardsSnapshot(rewardsDoc);

  const topN = t === "6months" ? 3 : 10;
  const baseRows = await computeTopRows({ start: range.start, end: range.end, topN });
  const rows = baseRows.map((r) => ({
    ...r,
    reward: rewardForRank({ type: t, rank: r.rank, snapshot }),
  }));

  const doc = await HotelLeaderboardHistory.findOneAndUpdate(
    { type: t, key: k },
    {
      type: t,
      key: k,
      range: { start: range.start, end: range.end },
      generatedAt: new Date(),
      generatedBy: req.admin?._id || null,
      rewardsSnapshot: snapshot,
      rows,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return successResponse(res, 200, "Leaderboard history generated successfully", doc);
});

