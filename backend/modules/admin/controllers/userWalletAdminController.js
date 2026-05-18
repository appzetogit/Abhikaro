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
  const { page = 1, limit = 15, onlyAdjustments = "false" } = req.query || {};

  const user = await User.findById(id).lean();
  if (!user || user.role !== "user") {
    return errorResponse(res, 404, "User not found");
  }

  const wallet = await UserWallet.findOne({ userId: user._id })
    .populate("transactions.processedBy", "name email")
    .lean();

  // Load all user orders from Order collection
  const orders = await Order.find({ userId: user._id }).lean();
  const ordersMap = new Map(orders.map((o) => [o._id.toString(), o]));

  let unifiedHistory = [];

  // 1. Process wallet transactions if wallet exists
  if (wallet && Array.isArray(wallet.transactions)) {
    for (const t of wallet.transactions) {
      const md = t?.metadata && t.metadata.get ? Object.fromEntries(t.metadata) : (t.metadata || {});

      // Skip rule:
      // - If transaction is linked to a deleted order, we skip it.
      // - If transaction is deduction and linked to an existing order, we skip it because we will represent it as an order entry.
      // - We ALWAYS keep t.type === "refund" so refund additions show as separate records.
      if (t.orderId) {
        const orderExists = ordersMap.has(t.orderId.toString());
        if (!orderExists) {
          continue;
        }
        if (t.type === "deduction") {
          continue;
        }
      }

      unifiedHistory.push({
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
      });
    }
  }

  // 2. Process all orders from the Order collection
  for (const order of orders) {
    const isCancelled = order.status === "cancelled";
    const paymentMethodLabel = order.payment?.method === "razorpay" 
      ? "Online" 
      : order.payment?.method === "pay_at_hotel" 
      ? "Pay at Hotel" 
      : order.payment?.method === "wallet" 
      ? "Wallet" 
      : order.payment?.method === "cash"
      ? "Cash"
      : order.payment?.method || "Other";

    let title = `Paid for Order (${paymentMethodLabel})`;
    let badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";

    if (isCancelled) {
      title = `Cancelled Order (${paymentMethodLabel})`;
      badgeClass = "bg-red-50 text-red-700 border-red-200";
    } else if (order.payment?.method === "wallet") {
      badgeClass = "bg-amber-50 text-amber-700 border-amber-200";
    }

    let description = `Order payment - Order #${order.orderId}`;
    if (isCancelled && order.cancellationReason) {
      description = `Order Cancelled (${order.cancellationReason}) - Order #${order.orderId}`;
    }

    unifiedHistory.push({
      id: order._id,
      orderId: order._id,
      type: "deduction",
      status: order.status,
      amount: order.pricing?.total || 0,
      description: description,
      date: order.createdAt,
      paymentMethod: order.payment?.method || "other",
      title: title,
      badgeClass: badgeClass,
      isOrderActivity: true,
      metadata: {
        orderIdStr: order.orderId,
        paymentMethod: order.payment?.method,
        cancellationReason: order.cancellationReason || null,
        cancelledBy: order.cancelledBy || null,
      },
    });
  }

  // Sort by date (newest first)
  unifiedHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Apply onlyAdjustments filter if set to true
  const onlyAdj = String(onlyAdjustments).toLowerCase() === "true";
  if (onlyAdj) {
    unifiedHistory = unifiedHistory.filter((t) => {
      const isWalletAdj = t.metadata?.adjustment === true || t.type === "addition" || t.type === "deduction";
      return isWalletAdj && !t.orderId;
    });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
  const total = unifiedHistory.length;
  const skip = (pageNum - 1) * limitNum;
  const paginated = unifiedHistory.slice(skip, skip + limitNum);

  return successResponse(res, 200, "User wallet history retrieved successfully", {
    userId: user._id.toString(),
    transactions: paginated,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  });
});
