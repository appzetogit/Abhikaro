import mongoose from "mongoose";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import RestaurantWallet from "../../restaurant/models/RestaurantWallet.js";
import Order from "../../order/models/Order.js";
import Admin from "../models/Admin.js";


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
      // Many restaurants keep the "real" name in onboarding step1
      { "onboarding.step1.restaurantName": { $regex: q, $options: "i" } },
      { restaurantId: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
      { ownerPhone: { $regex: q, $options: "i" } },
      { ownerName: { $regex: q, $options: "i" } },
      { "onboarding.step1.ownerName": { $regex: q, $options: "i" } },
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
    processedBy: admin._id,
    metadata: { adjustment: true, description: descRaw || undefined },
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

/**
 * GET /api/admin/restaurants/:id/wallet/history
 * Query: page, limit, onlyAdjustments
 */
export const getRestaurantWalletHistory = asyncHandler(async (req, res) => {
  const admin = req.admin;
  if (!admin?._id) {
    return errorResponse(res, 401, "Admin authentication required");
  }

  const { id } = req.params;
  const { page = 1, limit = 15, onlyAdjustments = "true", type = "all" } = req.query || {};

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return errorResponse(res, 400, "Valid restaurant ID is required");
  }

  // Fetch restaurant details to get all variations of restaurantId
  const restaurantDoc = await Restaurant.findById(id).select("restaurantId slug").lean();
  const restaurantPublicId = restaurantDoc?.restaurantId;
  const restaurantSlug = restaurantDoc?.slug;
  const restaurantIdVariations = [
    id.toString(),
    restaurantPublicId?.toString(),
    restaurantSlug?.toString()
  ].filter(Boolean);

  // Fetch counts of delivered orders and total ordered counts in parallel
  const [deliveredCount, orderedCount] = await Promise.all([
    Order.countDocuments({ restaurantId: { $in: restaurantIdVariations }, status: "delivered" }),
    Order.countDocuments({ restaurantId: { $in: restaurantIdVariations } })
  ]);

  const walletDoc = await RestaurantWallet.findOrCreateByRestaurantId(id);
  if (walletDoc) {
    await walletDoc.populate("transactions.processedBy", "name email");
  }
  const wallet = walletDoc ? walletDoc.toObject() : null;

  if (!wallet) {
    return successResponse(res, 200, "No history found", {
      restaurantId: id,
      deliveredCount,
      orderedCount,
      transactions: [],
      pagination: { page: 1, limit: parseInt(limit, 10) || 20, total: 0, pages: 0 },
    });
  }

  let transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];

  // newest first (stable sort using database array index as fallback)
  const indexed = transactions.map((t, idx) => ({ t, idx }));
  indexed.sort((a, b) => {
    const dateA = new Date(a.t.createdAt || a.t.processedAt || 0);
    const dateB = new Date(b.t.createdAt || b.t.processedAt || 0);
    if (dateA.getTime() !== dateB.getTime()) {
      return dateB - dateA;
    }
    return b.idx - a.idx; // Stable fallback: reverse of chronological ledger order
  });
  transactions = indexed.map(({ t }) => t);

  if (type && type !== "all") {
    if (type === "payment") {
      const allOrders = await Order.find({ restaurantId: { $in: restaurantIdVariations } }).select("_id").lean();
      const orderIdsSet = new Set(allOrders.map((o) => o._id.toString()));
      transactions = transactions.filter((t) => t.type === "payment" && t.orderId && orderIdsSet.has(t.orderId.toString()));
    } else if (type === "credit") {
      const allOrders = await Order.find({ restaurantId: { $in: restaurantIdVariations } }).select("_id").lean();
      const orderIdsSet = new Set(allOrders.map((o) => o._id.toString()));
      transactions = transactions.filter((t) => 
        t.type === "bonus" || 
        t.type === "refund" ||
        (t.type === "payment" && t.orderId && !orderIdsSet.has(t.orderId.toString()))
      );
    } else if (type === "deduction") {
      transactions = transactions.filter((t) => t.type === "deduction");
    } else if (type === "withdrawal") {
      transactions = transactions.filter((t) => t.type === "withdrawal");
    }
  } else {
    const onlyAdj = String(onlyAdjustments).toLowerCase() !== "false";
    if (onlyAdj) {
      transactions = transactions.filter((t) => {
        const md = t?.metadata && t.metadata.get ? Object.fromEntries(t.metadata) : (t.metadata || {});
        return md.adjustment === true || t.type === "bonus" || t.type === "deduction";
      });
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
  const total = transactions.length;
  const skip = (pageNum - 1) * limitNum;
  const paginated = transactions.slice(skip, skip + limitNum);

  return successResponse(res, 200, "Restaurant wallet history retrieved successfully", {
    restaurantId: id,
    deliveredCount,
    orderedCount,
    transactions: paginated.map((t) => {
      const md = t?.metadata && t.metadata.get ? Object.fromEntries(t.metadata) : (t.metadata || {});
      return {
        id: t._id,
        type: t.type,
        status: t.status,
        amount: t.amount,
        description: t.description,
        orderId: t.orderId || null,
        balanceAfter: t.balanceAfter || 0,
        date: t.createdAt,
        processedAt: t.processedAt,
        processedBy: t.processedBy
          ? { id: t.processedBy._id, name: t.processedBy.name, email: t.processedBy.email }
          : null,
        metadata: md,
      };
    }),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  });
});
