import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import HotelWallet from "../models/HotelWallet.js";
import Order from "../../order/models/Order.js";
import Joi from "joi";

/**
 * GET /api/hotel/wallet
 * Returns the authenticated hotel's wallet information
 */
export const getHotelWallet = asyncHandler(async (req, res) => {
  const hotel = req.hotel; // Authenticated hotel is available via middleware

  if (!hotel) {
    return errorResponse(res, 401, "Unauthorized");
  }

  // Get or create hotel wallet
  const wallet = await HotelWallet.findOrCreateByHotelId(hotel._id);

  // Build transaction history combining real wallet transactions (if any)
  // with synthetic commission entries for older orders that never created
  // wallet transactions. This way, older commission earnings still show up
  // even after new withdrawal transactions are added.
  const hotelIdStr = hotel.hotelId;
  const hotelObjectId = hotel._id;

  const orders = await Order.find({
    $or: [
      { hotelId: hotelObjectId },
      { hotelReference: hotelIdStr },
      { hotelReference: hotelObjectId.toString() },
    ],
    status: { $ne: "cancelled" },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("userId", "name phone")
    .lean();

  const ordersById = new Map(orders.map((o) => [o._id.toString(), o]));

  const walletTransactions = wallet.transactions || [];

  // Map withdrawal transactionId / requestId -> withdrawalRequest.status
  const withdrawalStatusByTxId = new Map();
  const withdrawalStatusByRequestId = new Map();
  (wallet.withdrawalRequests || []).forEach((wr) => {
    if (!wr) return;
    if (wr.transactionId) {
      const key = wr.transactionId.toString();
      withdrawalStatusByTxId.set(key, wr.status);
    }
    if (wr._id) {
      withdrawalStatusByRequestId.set(wr._id.toString(), wr.status);
    }
  });

  // Track which orders already have a commission transaction in wallet
  const commissionOrderIds = new Set(
    walletTransactions
      .filter((t) => t.type === "commission" && t.orderId)
      .map((t) => t.orderId.toString()),
  );

  const enrichedWalletTx = walletTransactions.map((t) => {
    const order =
      t.orderId && ordersById.size
        ? ordersById.get(t.orderId.toString())
        : null;

    const orderTotal = order?.pricing?.total || null;
    const orderNumber = order?.orderId || null;
    const userName = order?.userId?.name || null;
    const userPhone = order?.userId?.phone || null;

    const profitAmount =
      t.type === "commission"
        ? t.amount
        : t.type === "cash_collection"
        ? 0
        : 0;

    // For withdrawal transactions, override status from withdrawalRequests map
    let displayStatus = t.status;
    if (t.type === "withdrawal" && t._id) {
      // 1) Try mapping by transactionId
      let mappedStatus = withdrawalStatusByTxId.get(t._id.toString());

      // 2) Fallback: parse Request ID from description and map by requestId
      if (!mappedStatus && typeof t.description === "string") {
        const match = t.description.match(/Request ID:\s*([a-fA-F0-9]+)/);
        if (match && match[1]) {
          mappedStatus = withdrawalStatusByRequestId.get(match[1]);
        }
      }

      if (mappedStatus) {
        displayStatus = mappedStatus;
      }
    }

    return {
      _id: t._id,
      amount: t.amount,
      type: t.type,
      status: displayStatus,
      description: t.description,
      orderId: t.orderId,
      orderNumber,
      orderTotal,
      userName,
      userPhone,
      profitAmount,
      createdAt: t.createdAt,
      processedAt: t.processedAt,
    };
  });

  // Synthetic commission entries for orders that don't yet have a
  // commission transaction in wallet (legacy data)
  const syntheticCommissionTx = orders
    .filter((order) => !commissionOrderIds.has(order._id.toString()))
    .map((order) => {
      const totalAmount = order.pricing?.total || 0;
      const hotelCommission =
        (order.commissionBreakdown &&
          typeof order.commissionBreakdown.hotel === "number" &&
          order.commissionBreakdown.hotel) ||
        0;

      return {
        _id: order._id,
        amount: hotelCommission,
        type: "commission",
        status: "Completed",
        description: `Commission from order ${order.orderId}`,
        orderId: order._id,
        orderNumber: order.orderId,
        orderTotal: totalAmount,
        userName: order.userId?.name || null,
        userPhone: order.userId?.phone || null,
        profitAmount: hotelCommission,
        createdAt: order.createdAt,
        processedAt: order.createdAt,
      };
    });

  const recentTransactions = [...enrichedWalletTx, ...syntheticCommissionTx]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);

  const walletData = {
    hotelId: hotel.hotelId || hotel._id.toString(),
    balance: wallet.totalBalance || 0,
    totalEarned: wallet.totalEarned || 0,
    totalWithdrawn: wallet.totalWithdrawn || 0,
    pendingPayout: (wallet.totalEarned || 0) - (wallet.totalWithdrawn || 0),
    transactions: recentTransactions,
    updatedAt: wallet.updatedAt || new Date().toISOString(),
  };

  return successResponse(res, 200, "Hotel wallet fetched successfully", {
    wallet: walletData,
  });
});

const hotelWithdrawalSchema = Joi.object({
  amount: Joi.number().positive().required(),
  paymentMethod: Joi.string()
    .valid("bank_transfer", "upi", "card")
    .default("bank_transfer"),
});

/**
 * POST /api/hotel/wallet/withdraw
 * Create a withdrawal request for the authenticated hotel
 */
export const createHotelWithdrawalRequest = asyncHandler(async (req, res) => {
  const hotel = req.hotel;

  if (!hotel) {
    return errorResponse(res, 401, "Unauthorized");
  }

  const { error, value } = hotelWithdrawalSchema.validate(req.body);
  if (error) {
    return errorResponse(res, 400, error.details[0].message);
  }

  const { amount, paymentMethod } = value;

  // Find or create wallet
  const wallet = await HotelWallet.findOrCreateByHotelId(hotel._id);

  // Available = total earned - already withdrawn; fallback to totalBalance.
  // This uses wallet aggregates when they exist.
  const logicalAvailable =
    (wallet.totalEarned || 0) - (wallet.totalWithdrawn || 0);
  let availableBalance =
    logicalAvailable > 0 ? logicalAvailable : wallet.totalBalance || 0;

  // Fallback for older wallets where aggregates are 0 but orders already have
  // commissionBreakdown.hotel recorded (like your existing test orders).
  if (!availableBalance || availableBalance <= 0) {
    const hotelIdStr = hotel.hotelId;
    const hotelObjectId = hotel._id;

    const orders = await Order.find({
      $or: [
        { hotelId: hotelObjectId },
        { hotelReference: hotelIdStr },
        { hotelReference: hotelObjectId.toString() },
      ],
      status: { $ne: "cancelled" },
    })
      .select("pricing.total commissionBreakdown.hotel")
      .lean();

    let totalHotelEarned = 0;
    orders.forEach((order) => {
      const hotelComm =
        (order.commissionBreakdown &&
          typeof order.commissionBreakdown.hotel === "number" &&
          order.commissionBreakdown.hotel) ||
        0;
      totalHotelEarned += hotelComm;
    });

    const alreadyRequested = (wallet.withdrawalRequests || []).reduce(
      (sum, r) =>
        sum +
        (r && typeof r.amount === "number" ? Number(r.amount) || 0 : 0),
      0,
    );

    const fallbackAvailable = totalHotelEarned - alreadyRequested;
    if (fallbackAvailable > 0) {
      availableBalance = fallbackAvailable;
    }
  }

  if (!availableBalance || availableBalance <= 0 || availableBalance < amount) {
    return errorResponse(
      res,
      400,
      "Insufficient balance for withdrawal request",
    );
  }

  // Prevent multiple pending requests
  const hasPendingRequest =
    wallet.withdrawalRequests &&
    wallet.withdrawalRequests.some((r) => r.status === "Pending");

  if (hasPendingRequest) {
    return errorResponse(
      res,
      400,
      "You already have a pending withdrawal request",
    );
  }

  // Create withdrawal request (embedded in wallet)
  wallet.withdrawalRequests.push({
    amount,
    status: "Pending",
    paymentMethod,
    requestedAt: new Date(),
  });

  const withdrawalRequest =
    wallet.withdrawalRequests[wallet.withdrawalRequests.length - 1];

  // Create a matching withdrawal transaction marked as Pending
  const tx = wallet.addTransaction({
    amount,
    type: "withdrawal",
    status: "Pending",
    description: `Withdrawal request created - Request ID: ${withdrawalRequest._id.toString()}`,
  });

  // Deduct balance immediately so admin can see reserved amount
  wallet.totalBalance = Math.max(0, availableBalance - amount);
  wallet.totalWithdrawn = (wallet.totalWithdrawn || 0) + amount;

  // Link transaction to withdrawal request for easier tracking
  withdrawalRequest.transactionId = tx._id;

  await wallet.save();

  return successResponse(res, 201, "Withdrawal request created successfully", {
    withdrawalRequest: {
      id: withdrawalRequest._id,
      amount: withdrawalRequest.amount,
      status: withdrawalRequest.status,
      requestedAt: withdrawalRequest.requestedAt,
    },
    wallet: {
      balance: wallet.totalBalance,
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
    },
  });
});
