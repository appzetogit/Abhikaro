import mongoose from "mongoose";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import RestaurantWallet from "../../restaurant/models/RestaurantWallet.js";

/**
 * GET /api/admin/restaurants/wallets
 * Query: search, page, limit
 */
export const getRestaurantWalletOverview = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (search && String(search).trim()) {
    const q = String(search).trim();
    query.$or = [
      { name: { $regex: q, $options: "i" } },
      { restaurantId: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
      { ownerPhone: { $regex: q, $options: "i" } },
      { ownerName: { $regex: q, $options: "i" } },
    ];
  }

  const [restaurants, total] = await Promise.all([
    Restaurant.find(query)
      .select(
        "name restaurantId phone ownerPhone ownerName isActive onboarding.step1.restaurantName onboarding.step1.ownerName",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Restaurant.countDocuments(query),
  ]);

  const ids = (restaurants || []).map((r) => r._id).filter(Boolean);

  const wallets = ids.length
    ? await RestaurantWallet.find({ restaurantId: { $in: ids } })
        .select("restaurantId totalBalance totalEarned totalWithdrawn")
        .lean()
    : [];

  const walletMap = new Map();
  wallets.forEach((w) => {
    walletMap.set(String(w.restaurantId), w);
  });

  const rows = (restaurants || []).map((r) => {
    const w = walletMap.get(String(r._id));
    const totalEarned = Number(w?.totalEarned) || 0;
    const totalWithdrawn = Number(w?.totalWithdrawn) || 0;
    const totalBalance = Number(w?.totalBalance) || 0;

    return {
      ...r,
      // Prefer onboarding step name if present (often more accurate than placeholder `name`)
      name: r?.onboarding?.step1?.restaurantName || r?.name,
      totalEarned,
      totalWithdrawn,
      pendingBalance: totalEarned - totalWithdrawn,
      totalBalance,
    };
  });

  return successResponse(res, 200, "Restaurant wallets retrieved successfully", {
    restaurants: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  });
});

/**
 * POST /api/admin/restaurants/:id/wallet/adjustment
 * Body: { amount, type: 'bonus'|'deduction', description? }
 */
export const adjustRestaurantWallet = asyncHandler(async (req, res) => {
  const admin = req.admin;
  if (!admin?._id) {
    return errorResponse(res, 401, "Admin authentication required");
  }

  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return errorResponse(res, 400, "Valid restaurant ID is required");
  }

  const { amount, type, description } = req.body || {};

  if (!["bonus", "deduction"].includes(type)) {
    return errorResponse(res, 400, 'type must be "bonus" or "deduction"');
  }

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return errorResponse(res, 400, "amount must be a positive number");
  }

  const restaurant = await Restaurant.findById(id).select("_id name").lean();
  if (!restaurant?._id) {
    return errorResponse(res, 404, "Restaurant not found");
  }

  const wallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurant._id);

  const descRaw = String(description || "").trim();
  const desc =
    descRaw ||
    (type === "bonus"
      ? "Admin Credit"
      : "Admin Deduction");

  wallet.addTransaction({
    amount: amt,
    type,
    status: "Completed",
    description: desc,
    processedAt: new Date(),
  });

  wallet.markModified("transactions");
  await wallet.save();

  return successResponse(res, 200, "Wallet adjusted successfully", {
    restaurantId: restaurant._id,
    type,
    amount: amt,
    totalBalance: Number(wallet.totalBalance) || 0,
    totalEarned: Number(wallet.totalEarned) || 0,
    totalWithdrawn: Number(wallet.totalWithdrawn) || 0,
    pendingBalance: (Number(wallet.totalEarned) || 0) - (Number(wallet.totalWithdrawn) || 0),
  });
});

