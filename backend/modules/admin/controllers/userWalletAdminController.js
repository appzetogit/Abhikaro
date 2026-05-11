import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import UserWallet from "../../user/models/UserWallet.js";
import Order from "../../order/models/Order.js";
import User from "../../auth/models/User.js";
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

/**
 * Adjust User Wallet (Admin)
 * POST /api/admin/users/:id/wallet/adjustment
 *
 * Body:
 * - type: 'addition' | 'deduction'
 * - amount: number (positive)
 * - reason: string
 */
export const adjustUserWallet = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, reason } = req.body || {};

    const safeType = typeof type === "string" ? type.trim() : "";
    const safeReason = typeof reason === "string" ? reason.trim() : "";
    const numericAmount = Number(amount);

    if (!["addition", "deduction"].includes(safeType)) {
      return errorResponse(res, 400, "type must be 'addition' or 'deduction'");
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return errorResponse(res, 400, "amount must be a positive number");
    }
    if (!safeReason) {
      return errorResponse(res, 400, "reason is required");
    }

    const user = await User.findById(id).lean();
    if (!user || user.role !== "user") {
      return errorResponse(res, 404, "User not found");
    }

    const wallet = await UserWallet.findOrCreateByUserId(user._id);

    // Add transaction + update balance via model method
    let transaction;
    try {
      transaction = wallet.addTransaction({
        amount: numericAmount,
        type: safeType,
        status: "Completed",
        description: safeReason,
        paymentMethod: "other",
        metadata: {
          adjustedByAdminId: req.admin?._id?.toString?.() || null,
          adjustment: true,
        },
        processedBy: req.admin?._id,
        processedAt: new Date(),
      });
    } catch (e) {
      // e.g. insufficient balance
      return errorResponse(res, 400, e.message || "Wallet adjustment failed");
    }

    wallet.markModified("transactions");
    await wallet.save();

    logger.info(`Admin adjusted user wallet: ${user._id}`, {
      type: safeType,
      amount: numericAmount,
      balance: wallet.balance,
      adjustedBy: req.admin?._id,
    });

    return successResponse(res, 200, "Wallet adjusted successfully", {
      wallet: {
        userId: user._id.toString(),
        balance: Number(wallet.balance) || 0,
        currency: wallet.currency || "INR",
        totalAdded: Number(wallet.totalAdded) || 0,
        totalSpent: Number(wallet.totalSpent) || 0,
        totalRefunded: Number(wallet.totalRefunded) || 0,
        lastTransactionAt: wallet.lastTransactionAt || null,
      },
      transaction: {
        id: transaction?._id || null,
        amount: numericAmount,
        type: safeType,
        status: "Completed",
        description: safeReason,
      },
    });
  } catch (error) {
    logger.error(`Error adjusting user wallet: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, error.message || "Failed to adjust wallet");
  }
});

/**
 * Get User Wallet History (Admin)
 * GET /api/admin/users/:id/wallet/history
 * Query: page, limit, onlyAdjustments
 */
export const getUserWalletHistory = asyncHandler(async (req, res) => {
  const admin = req.admin;
  if (!admin?._id) {
    return errorResponse(res, 401, "Admin authentication required");
  }

  const { id } = req.params;
  const { page = 1, limit = 15, onlyAdjustments = "true" } = req.query || {};

  const user = await User.findById(id).lean();
  if (!user || user.role !== "user") {
    return errorResponse(res, 404, "User not found");
  }

  const wallet = await UserWallet.findOne({ userId: user._id })
    .populate("transactions.processedBy", "name email")
    .lean();

  if (!wallet) {
    return successResponse(res, 200, "No history found", {
      userId: user._id.toString(),
      transactions: [],
      pagination: {
        page: 1,
        limit: parseInt(limit, 10) || 15,
        total: 0,
        pages: 0,
      },
    });
  }

  let transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];
  transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const onlyAdj = String(onlyAdjustments).toLowerCase() !== "false";
  if (onlyAdj) {
    transactions = transactions.filter((t) => {
      const md = t?.metadata && t.metadata.get ? Object.fromEntries(t.metadata) : (t.metadata || {});
      return md.adjustment === true || t.type === "addition" || t.type === "deduction";
    });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
  const total = transactions.length;
  const skip = (pageNum - 1) * limitNum;
  const paginated = transactions.slice(skip, skip + limitNum);

  return successResponse(res, 200, "User wallet history retrieved successfully", {
    userId: user._id.toString(),
    transactions: paginated.map((t) => {
      const md = t?.metadata && t.metadata.get ? Object.fromEntries(t.metadata) : (t.metadata || {});
      return {
        id: t._id,
        type: t.type,
        status: t.status,
        amount: t.amount,
        description: t.description,
        date: t.createdAt,
        processedAt: t.processedAt,
        processedBy: t.processedBy
          ? { id: t.processedBy._id, name: t.processedBy.name, email: t.processedBy.email }
          : null,
        orderId: t.orderId,
        paymentMethod: t.paymentMethod,
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
