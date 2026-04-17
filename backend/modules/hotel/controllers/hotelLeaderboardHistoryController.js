import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import HotelLeaderboardHistory from "../../admin/models/HotelLeaderboardHistory.js";

function isValidMonthKey(key) {
  return /^\d{4}-\d{2}$/.test(String(key || "").trim());
}

/**
 * GET /api/hotel/leaderboard-history?key=YYYY-MM
 * Read-only snapshot of past winners for a month.
 */
export const getHotelLeaderboardHistory = asyncHandler(async (req, res) => {
  const key = String(req.query.key || "").trim();
  if (!isValidMonthKey(key)) {
    return errorResponse(res, 400, "Invalid key. Use YYYY-MM (example: 2026-03).");
  }

  const doc = await HotelLeaderboardHistory.findOne({ type: "month", key }).lean();
  if (!doc) {
    return errorResponse(res, 404, "No history found for this month yet.");
  }

  // hotel app only needs rows + range + key
  return successResponse(res, 200, "Leaderboard history fetched successfully", {
    type: doc.type,
    key: doc.key,
    range: doc.range,
    generatedAt: doc.generatedAt,
    rows: Array.isArray(doc.rows) ? doc.rows : [],
  });
});

