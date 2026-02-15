import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import HotelWallet from "../models/HotelWallet.js";

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

  // Get recent transactions (last 50)
  const recentTransactions = wallet.transactions
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50)
    .map((t) => ({
      _id: t._id,
      amount: t.amount,
      type: t.type,
      status: t.status,
      description: t.description,
      orderId: t.orderId,
      createdAt: t.createdAt,
      processedAt: t.processedAt,
    }));

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
