import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import Hotel from "../../hotel/models/Hotel.js";
import HotelWallet from "../../hotel/models/HotelWallet.js";
import mongoose from "mongoose";
import { getHotelCommissionFromOrder } from "../../order/utils/hotelCommissionBase.js";
import HotelLeaderboardRewards from "../models/HotelLeaderboardRewards.js";

/**
 * Get hotel wallet transaction history (admin)
 * GET /api/admin/hotels/:id/wallet/transactions
 * Query: limit (max 100), startDate, endDate
 *
 * This mirrors the hotel-side wallet "transactions" feed (commission + withdrawals),
 * including synthetic commission rows for older orders that never wrote transactions.
 */
export const getHotelWalletTransactionsAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 50, startDate, endDate } = req.query;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponse(res, 400, "Invalid hotel id");
  }

  const hotel = await Hotel.findById(id)
    .select("_id hotelName hotelId commission")
    .lean();
  if (!hotel) {
    return errorResponse(res, 404, "Hotel not found");
  }

  const hotelPct =
    typeof hotel?.commission === "number" && hotel.commission > 0
      ? hotel.commission
      : 10;

  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

  const createdAtFilter = {};
  if (startDate) {
    const d = new Date(startDate);
    if (!Number.isNaN(d.getTime())) createdAtFilter.$gte = d;
  }
  if (endDate) {
    const d = new Date(endDate);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      createdAtFilter.$lte = d;
    }
  }

  const Order = (await import("../../order/models/Order.js")).default;

  const wallet = await HotelWallet.findOrCreateByHotelId(hotel._id);

  const hotelIdStr = hotel.hotelId;
  const hotelObjectId = hotel._id;

  const orders = await Order.find({
    $or: [
      { hotelId: hotelObjectId },
      { hotelReference: hotelIdStr },
      { hotelReference: hotelObjectId.toString() },
    ],
    status: { $ne: "cancelled" },
    ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("userId", "name phone")
    .lean();

  const ordersById = new Map(orders.map((o) => [o._id.toString(), o]));

  const walletTransactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];

  // Map withdrawal txId/requestId -> withdrawalRequest.status
  const withdrawalStatusByTxId = new Map();
  const withdrawalStatusByRequestId = new Map();
  (wallet.withdrawalRequests || []).forEach((wr) => {
    if (!wr) return;
    if (wr.transactionId) withdrawalStatusByTxId.set(wr.transactionId.toString(), wr.status);
    if (wr._id) withdrawalStatusByRequestId.set(wr._id.toString(), wr.status);
  });

  const commissionOrderIds = new Set(
    walletTransactions
      .filter((t) => t?.type === "commission" && t?.orderId)
      .map((t) => t.orderId.toString()),
  );

  const enrichedWalletTx = walletTransactions.map((t) => {
    const order =
      t.orderId && ordersById.size ? ordersById.get(t.orderId.toString()) : null;

    const orderTotal = order?.pricing?.total || null;
    const orderNumber = order?.orderId || null;
    const userName = order?.userId?.name || null;
    const userPhone = order?.userId?.phone || null;

    let displayStatus = t.status;
    if (t.type === "withdrawal" && t._id) {
      let mappedStatus = withdrawalStatusByTxId.get(t._id.toString());
      if (!mappedStatus && typeof t.description === "string") {
        const match = t.description.match(/Request ID:\s*([a-fA-F0-9]+)/);
        if (match && match[1]) mappedStatus = withdrawalStatusByRequestId.get(match[1]);
      }
      if (mappedStatus) displayStatus = mappedStatus;
    }

    const derivedHotelCommission = order
      ? (typeof order?.commissionBreakdown?.hotel === "number" &&
        order.commissionBreakdown.hotel > 0
          ? order.commissionBreakdown.hotel
          : (typeof order?.hotelCommission === "number" && order.hotelCommission > 0
            ? order.hotelCommission
            : getHotelCommissionFromOrder(order, hotelPct)))
      : 0;

    const displayAmount =
      t.type === "commission" && (typeof t.amount !== "number" || t.amount <= 0)
        ? derivedHotelCommission
        : t.amount;

    return {
      _id: t._id,
      amount: displayAmount,
      type: t.type,
      status: displayStatus,
      description: t.description,
      orderId: t.orderId,
      orderNumber,
      orderTotal,
      userName,
      userPhone,
      createdAt: t.createdAt,
      processedAt: t.processedAt,
    };
  });

  const syntheticCommissionTx = orders
    .filter((order) => !commissionOrderIds.has(order._id.toString()))
    .map((order) => {
      const totalAmount = order.pricing?.total || 0;
      const hotelCommission =
        (typeof order?.commissionBreakdown?.hotel === "number" &&
          order.commissionBreakdown.hotel > 0
          ? order.commissionBreakdown.hotel
          : (typeof order?.hotelCommission === "number" && order.hotelCommission > 0
            ? order.hotelCommission
            : getHotelCommissionFromOrder(order, hotelPct)));

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
        createdAt: order.createdAt,
        processedAt: order.createdAt,
      };
    });

  const tx = [...enrichedWalletTx, ...syntheticCommissionTx]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, lim);

  return successResponse(res, 200, "Hotel wallet transactions fetched", {
    hotel: { id: hotel._id, hotelId: hotel.hotelId, hotelName: hotel.hotelName },
    transactions: tx,
  });
});

/**
 * GET /api/admin/hotels
 * Get all hotels with pagination and filters
 */
export const getHotels = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    search = "",
    status = "",
    sortBy = "hotelName",
    sortOrder = "asc",
  } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Build query
  const query = {};

  // Search filter
  if (search) {
    query.$or = [
      { hotelName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } },
      { hotelId: { $regex: search, $options: "i" } },
    ];
  }

  // Status filter
  if (status === "active") {
    query.isActive = true;
  } else if (status === "inactive") {
    query.isActive = false;
  }

  // Build sort
  const sort = {};
  if (sortBy) {
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;
  }

  // Get hotels
  const hotels = await Hotel.find(query)
    .select("-password")
    .sort(sort)
    .skip(skip)
    .limit(limitNum);

  // Get total count
  const total = await Hotel.countDocuments(query);

  // AGGREGATE EARNINGS FOR EACH HOTEL
  const Order = (await import("../../order/models/Order.js")).default;
  const hotelIds = hotels.map((h) => h._id);

  const earningsAggregation = await Order.aggregate([
    {
      $match: {
        $or: [
          { "payment.status": "completed" },
          {
            $and: [
              { "payment.method": "pay_at_hotel" },
              { status: "delivered" },
            ],
          },
        ],
        status: { $ne: "cancelled" },
        $or: [
          { hotelId: { $in: hotelIds } },
          {
            hotelReference: {
              $in: hotels.map((h) => h.hotelId).filter(Boolean),
            },
          },
        ],
      },
    },
    {
      // Group by identifying the hotel (try to normalize to ObjectId if possible, or string)
      // Since some orders use hotelId (ObjectId) and some use hotelReference (String)
      $addFields: {
        matchedHotelId: {
          $ifNull: ["$hotelId", "$hotelReference"],
        },
      },
    },
    {
      $group: {
        _id: "$matchedHotelId",
        totalHotel: { $sum: { $ifNull: ["$commissionBreakdown.hotel", 0] } },
        totalAdmin: { $sum: { $ifNull: ["$commissionBreakdown.admin", 0] } },
        orderCount: { $sum: 1 },
        // Track orders that need fallback (missing breakdown)
        fallbackOrders: {
          $push: {
            $cond: [
              { $gt: [{ $ifNull: ["$commissionBreakdown.hotel", -1] }, -1] },
              "$$REMOVE",
              { amount: "$pricing.total" },
            ],
          },
        },
      },
    },
  ]);

  // Create a map for quick access
  const earningsMap = {};
  earningsAggregation.forEach((item) => {
    earningsMap[item._id.toString()] = item;
  });

  const hotelsWithEarnings = hotels.map((hotel) => {
    const hotelObj = hotel.toObject();
    const hotelIdStr = hotel._id.toString();
    const hotelRef = hotel.hotelId;

    // Get stats from map (check both _id and hotelId reference)
    const stats = earningsMap[hotelIdStr] ||
      earningsMap[hotelRef] || {
        totalHotel: 0,
        totalAdmin: 0,
        orderCount: 0,
        fallbackOrders: [],
      };

    let hotelComm = stats.totalHotel;
    let adminComm = stats.totalAdmin;

    // Handle fallbacks for legacy orders in this page
    if (stats.fallbackOrders && stats.fallbackOrders.length > 0) {
      const hPct = Number(hotel.commission) || 0;
      const aPct = Number(hotel.adminCommission) || 0;

      stats.fallbackOrders.forEach((order) => {
        hotelComm += (order.amount * hPct) / 100;
        adminComm += (order.amount * aPct) / 100;
      });
    }

    return {
      ...hotelObj,
      earnings: {
        hotelCommission: Math.round(hotelComm * 100) / 100,
        adminCommission: Math.round(adminComm * 100) / 100,
        combinedCommission: Math.round((hotelComm + adminComm) * 100) / 100,
        orderCount: stats.orderCount,
      },
    };
  });

  return successResponse(res, 200, "Hotels fetched successfully", {
    hotels: hotelsWithEarnings,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * GET /api/admin/hotels/:id
 * Get hotel by ID
 */
export const getHotelById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hotel = await Hotel.findById(id).select("-password");

  if (!hotel) {
    return errorResponse(res, 404, "Hotel not found");
  }

  return successResponse(res, 200, "Hotel fetched successfully", {
    hotel,
  });
});

/**
 * PUT /api/admin/hotels/:id
 * Update hotel
 */
export const updateHotel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Allowed fields to update
  const allowedFields = [
    "hotelName",
    "email",
    "address",
    "phone",
    "isActive",
    "profileImage",
    // Old document fields
    "aadharCardImage",
    "hotelRentProofImage",
    "cancelledCheckImages",
    // New KYC document fields
    "aadharCardFront",
    "aadharCardBack",
    "panCardFront",
    "panCardBack",
    "hotelAddressVerifyDocumentFront",
    "bankPassbookFront",
    "rejectionReason",
    "commission",
    "adminCommission",
  ];

  const updateData = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      updateData[field] = updates[field];
    }
  }

  // If admin is approving the hotel (inactive -> active),
  // ensure default commissions are set when missing.
  // This keeps Hotel Commission screen consistent after approval.
  const wantsActivate = updateData.isActive === true;
  if (wantsActivate) {
    const existing = await Hotel.findById(id).select("isActive commission adminCommission").lean();
    if (!existing) {
      return errorResponse(res, 404, "Hotel not found");
    }

    const wasInactive = existing.isActive === false;
    if (wasInactive) {
      // Set approval metadata if available in request context
      // (admin middleware typically attaches req.admin / req.user).
      if (!updateData.approvedAt) updateData.approvedAt = new Date();
      if (!updateData.approvedBy) {
        const approverId = req.admin?._id || req.user?._id || req.user?.userId || null;
        if (approverId) updateData.approvedBy = approverId;
      }
      // Clear rejection fields on approve
      updateData.rejectionReason = null;
      updateData.rejectedAt = null;
      updateData.rejectedBy = null;
    }

    // Defaults (only if not explicitly set in this request AND not already set)
    const existingHotelCommission = Number(existing.commission);
    const existingAdminCommission = Number(existing.adminCommission);
    if (updateData.commission === undefined && (!Number.isFinite(existingHotelCommission) || existingHotelCommission <= 0)) {
      updateData.commission = 10;
    }
    if (updateData.adminCommission === undefined && (!Number.isFinite(existingAdminCommission) || existingAdminCommission <= 0)) {
      updateData.adminCommission = 20;
    }
  }

  // Normalize email if provided
  if (updateData.email && typeof updateData.email === "string") {
    updateData.email = updateData.email.toLowerCase().trim();
  }

  const hotel = await Hotel.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!hotel) {
    return errorResponse(res, 404, "Hotel not found");
  }

  return successResponse(res, 200, "Hotel updated successfully", {
    hotel,
  });
});

/**
 * POST /api/admin/hotels
 * Create new hotel (by admin)
 */
export const createHotel = asyncHandler(async (req, res) => {
  const {
    hotelName,
    email,
    address,
    phone,
    aadharCardImage,
    hotelRentProofImage,
    cancelledCheckImages,
    isActive = true, // Default to active, admin can activate later
  } = req.body;

  // Validate required fields
  if (!hotelName || !email || !address || !phone) {
    return errorResponse(
      res,
      400,
      "Hotel name, email, address, and phone are required",
    );
  }

  // Normalize phone
  const { normalizePhoneNumber } =
    await import("../../../shared/utils/phoneUtils.js");
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return errorResponse(res, 400, "Invalid phone number format");
  }

  // Check if hotel already exists with this phone
  const existingHotel = await Hotel.findOne({ phone: normalizedPhone });
  if (existingHotel) {
    return errorResponse(
      res,
      400,
      "Hotel already exists with this phone number",
    );
  }

  // Build hotel data
  const hotelData = {
    phone: normalizedPhone,
    phoneVerified: true, // Admin created hotels are pre-verified
    hotelName: hotelName.trim(),
    email: email.toLowerCase().trim(),
    address: address.trim(),
    signupMethod: "admin", // Mark as created by admin
    isActive: isActive,
  };

  if (isActive) {
    hotelData.approvedAt = new Date();
    const approverId = req.admin?._id || req.user?._id || req.user?.userId || null;
    if (approverId) {
      hotelData.approvedBy = approverId;
    }
  }

  // Add document images if provided
  // Ensure images are in correct format: { url: String, publicId: String }
  if (aadharCardImage) {
    if (typeof aadharCardImage === "object" && aadharCardImage.url) {
      hotelData.aadharCardImage = {
        url: aadharCardImage.url,
        publicId: aadharCardImage.publicId || aadharCardImage.public_id || null,
      };
    } else if (typeof aadharCardImage === "string") {
      hotelData.aadharCardImage = {
        url: aadharCardImage,
        publicId: null,
      };
    } else {
      // Invalid format, skip
      console.warn("Invalid aadharCardImage format:", aadharCardImage);
    }
  }

  if (hotelRentProofImage) {
    if (typeof hotelRentProofImage === "object" && hotelRentProofImage.url) {
      hotelData.hotelRentProofImage = {
        url: hotelRentProofImage.url,
        publicId:
          hotelRentProofImage.publicId || hotelRentProofImage.public_id || null,
      };
    } else if (typeof hotelRentProofImage === "string") {
      hotelData.hotelRentProofImage = {
        url: hotelRentProofImage,
        publicId: null,
      };
    } else {
      // Invalid format, skip
      console.warn("Invalid hotelRentProofImage format:", hotelRentProofImage);
    }
  }

  if (cancelledCheckImages && Array.isArray(cancelledCheckImages)) {
    // Ensure each image in array is in correct format
    hotelData.cancelledCheckImages = cancelledCheckImages
      .filter((img) => img && (img.url || (typeof img === "object" && img.url)))
      .map((img) => {
        if (typeof img === "object" && img.url) {
          return {
            url: img.url,
            publicId: img.publicId || img.public_id || null,
          };
        } else if (typeof img === "string") {
          return {
            url: img,
            publicId: null,
          };
        }
        return img;
      });
  }

  // Create hotel
  try {
    const hotel = await Hotel.create(hotelData);

    console.log("✅ Hotel created successfully:", {
      hotelId: hotel._id,
      hotelName: hotel.hotelName,
      phone: hotel.phone,
    });

    return successResponse(res, 201, "Hotel created successfully", {
      hotel,
    });
  } catch (createError) {
    console.error("❌ Error creating hotel:", {
      message: createError.message,
      code: createError.code,
      keyPattern: createError.keyPattern,
      errors: createError.errors,
    });

    // Handle duplicate key errors
    if (createError.code === 11000) {
      const duplicateField = Object.keys(createError.keyPattern || {})[0];
      return errorResponse(
        res,
        400,
        `Hotel with this ${duplicateField} already exists`,
      );
    }

    // Handle validation errors
    if (createError.name === "ValidationError") {
      const validationErrors = Object.values(createError.errors || {})
        .map((err) => err.message)
        .join(", ");
      return errorResponse(res, 400, `Validation error: ${validationErrors}`);
    }

    // Generic error
    return errorResponse(
      res,
      500,
      `Failed to create hotel: ${createError.message}`,
    );
  }
});

/**
 * DELETE /api/admin/hotels/:id
 * Delete hotel
 */
export const deleteHotel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hotel = await Hotel.findByIdAndDelete(id);

  if (!hotel) {
    return errorResponse(res, 404, "Hotel not found");
  }

  return successResponse(res, 200, "Hotel deleted successfully");
});

/**
 * GET /api/admin/hotels/requests
 * Get hotel join requests (pending/rejected hotels)
 * Query params: status (pending, rejected), page, limit, search
 */
export const getHotelRequests = asyncHandler(async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 50, search } = req.query;

    // Build query
    const query = {};

    // Status filter
    if (status === "pending") {
      // Pending = hotels that are inactive and don't have rejectionReason
      query.isActive = false;
      query.$or = [
        { rejectionReason: { $exists: false } },
        { rejectionReason: null },
      ];
    } else if (status === "rejected") {
      // Rejected = hotels that have rejectionReason
      query.rejectionReason = { $exists: true, $ne: null };
    }

    // Search filter
    if (search) {
      query.$and = [
        {
          $or: [
            { hotelName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } },
            { address: { $regex: search, $options: "i" } },
            { hotelId: { $regex: search, $options: "i" } },
          ],
        },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get hotels
    const hotels = await Hotel.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const total = await Hotel.countDocuments(query);

    return successResponse(res, 200, "Hotel requests fetched successfully", {
      requests: hotels,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching hotel requests:", error);
    return errorResponse(res, 500, "Failed to fetch hotel requests");
  }
});

/**
 * Get accumulated hotel commission stats
 * GET /api/admin/hotels/commission-stats
 *
 * NOTE: We now calculate from Order model instead of OrderSettlement
 * for more "genuine" and "real-time" data as requested.
 */
export const getHotelCommissionStats = asyncHandler(async (req, res) => {
  try {
    const Order = (await import("../../order/models/Order.js")).default;

    // Aggregation Pipeline for global stats
    const statsResult = await Order.aggregate([
      {
        $match: {
          $or: [
            { "payment.status": "completed" },
            {
              $and: [
                { "payment.method": { $in: ["pay_at_hotel", "cash"] } },
                { status: "delivered" },
              ],
            },
          ],
          status: { $ne: "cancelled" },
          $or: [
            { hotelReference: { $ne: null } },
            { hotelId: { $ne: null } },
            { orderType: "QR" },
          ],
        },
      },
      {
        $group: {
          _id: null,
          totalHotelCommission: {
            $sum: { $ifNull: ["$commissionBreakdown.hotel", 0] },
          },
          totalAdminHotelCommission: {
            $sum: { $ifNull: ["$commissionBreakdown.admin", 0] },
          },
          orderCount: { $sum: 1 },
          // Track orders that need fallback (missing breakdown)
          fallbackOrders: {
            $push: {
              $cond: [
                {
                  $eq: [
                    { $ifNull: ["$commissionBreakdown.hotel", "MISSING"] },
                    "MISSING",
                  ],
                },
                {
                  amount: "$pricing.total",
                  hotelId: "$hotelId",
                  hotelRef: "$hotelReference",
                },
                "$$REMOVE",
              ],
            },
          },
        },
      },
    ]);

    const result = statsResult[0] || {
      totalHotelCommission: 0,
      totalAdminHotelCommission: 0,
      orderCount: 0,
      fallbackOrders: [],
    };

    let totalHotelComm = result.totalHotelCommission;
    let totalAdminComm = result.totalAdminHotelCommission;

    // 2. Handle Fallbacks (Legacy Orders)
    if (result.fallbackOrders && result.fallbackOrders.length > 0) {
      // Get unique hotel IDs/Refs from fallback orders
      const hIds = result.fallbackOrders.map((o) => o.hotelId).filter(Boolean);
      const hRefs = result.fallbackOrders
        .map((o) => o.hotelRef)
        .filter(Boolean);

      const hotels = await Hotel.find({
        $or: [{ _id: { $in: hIds } }, { hotelId: { $in: hRefs } }],
      })
        .select("commission adminCommission hotelId")
        .lean();

      // Create maps for quick access
      const hotelMap = {};
      hotels.forEach((h) => {
        hotelMap[h._id.toString()] = h;
        if (h.hotelId) hotelMap[h.hotelId] = h;
      });

      // Apply fallback math
      result.fallbackOrders.forEach((order) => {
        const hotel =
          hotelMap[order.hotelId?.toString()] || hotelMap[order.hotelRef];
        if (hotel) {
          totalHotelComm +=
            (order.amount * (Number(hotel.commission) || 0)) / 100;
          totalAdminComm +=
            (order.amount * (Number(hotel.adminCommission) || 0)) / 100;
        }
      });
    }

    // 3. Aggregate total hotel withdrawals from HotelWallet
    const wallets = await HotelWallet.find({})
      .select("withdrawalRequests")
      .lean();

    let totalHotelWithdrawals = 0;
    wallets.forEach((wallet) => {
      if (Array.isArray(wallet.withdrawalRequests)) {
        wallet.withdrawalRequests.forEach((wr) => {
          if (!wr || typeof wr.amount !== "number") return;
          // Count all requests (Pending + Approved + Processed) towards total withdrawals
          totalHotelWithdrawals += wr.amount;
        });
      }
    });

    return successResponse(
      res,
      200,
      "Hotel commission stats retrieved successfully",
      {
        totalHotelCommission: Math.round(totalHotelComm * 100) / 100,
        totalAdminHotelCommission: Math.round(totalAdminComm * 100) / 100,
        totalCombinedCommission:
          Math.round((totalHotelComm + totalAdminComm) * 100) / 100,
        orderCount: result.orderCount,
        totalHotelWithdrawals:
          Math.round(totalHotelWithdrawals * 100) / 100,
      },
    );
  } catch (error) {
    console.error("Error fetching hotel commission stats:", error);
    return errorResponse(res, 500, "Failed to fetch hotel commission stats");
  }
});

/**
 * Update cash collected override for a specific hotel wallet (admin-only)
 * PUT /api/admin/hotels/:id/wallet/cash-collected
 */
export const updateHotelCashCollected = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cashCollected, balanceAdjustment } = req.body;

  const amount = Number(cashCollected);
  if (Number.isNaN(amount) || amount < 0) {
    return errorResponse(
      res,
      400,
      "cashCollected must be a non-negative number",
    );
  }

  const hotel = await Hotel.findById(id).select("_id hotelName hotelId phone");
  if (!hotel) {
    return errorResponse(res, 404, "Hotel not found");
  }

  const wallet = await HotelWallet.findOrCreateByHotelId(hotel._id);
  wallet.manualCashCollectedOverride = amount;

  // Optional: adjust available balance (admin credit/deduct)
  // balanceAdjustment: { type: 'credit'|'deduct', amount: number, description?: string }
  let appliedAdjustment = null;
  if (balanceAdjustment != null) {
    const adjTypeRaw = balanceAdjustment?.type;
    const adjType = typeof adjTypeRaw === "string" ? adjTypeRaw.trim() : "";
    if (!["credit", "deduct"].includes(adjType)) {
      return errorResponse(res, 400, 'balanceAdjustment.type must be "credit" or "deduct"');
    }

    const adjAmt = Number(balanceAdjustment?.amount);
    if (!Number.isFinite(adjAmt) || adjAmt <= 0) {
      return errorResponse(res, 400, "balanceAdjustment.amount must be a positive number");
    }

    const desc =
      typeof balanceAdjustment?.description === "string"
        ? balanceAdjustment.description.trim()
        : "";

    // Update manual adjustment field (used by admin overview)
    const currentAdj = Number(wallet.manualAvailableBalanceAdjustment) || 0;
    const nextAdj = adjType === "credit" ? currentAdj + adjAmt : currentAdj - adjAmt;
    wallet.manualAvailableBalanceAdjustment = nextAdj;

    // Record transaction AND update wallet aggregates so hotel app balance changes.
    // NOTE: Admin overview handles avoiding double counting when falling back to
    // wallet aggregates (see `getHotelWalletOverview` logic).
    wallet.addTransaction({
      amount: adjAmt,
      type: adjType === "credit" ? "bonus" : "deduction",
      status: "Completed",
      description: desc || (adjType === "credit" ? "Admin Credit" : "Admin Deduct"),
      processedAt: new Date(),
      processedBy: req.admin?._id,
    });
    wallet.markModified("transactions");

    appliedAdjustment = {
      type: adjType,
      amount: adjAmt,
      description: desc || undefined,
      manualAvailableBalanceAdjustment: nextAdj,
    };
  }

  await wallet.save();

  return successResponse(
    res,
    200,
    "Hotel cash collected value updated successfully",
    {
      hotel: {
        id: hotel._id,
        hotelId: hotel.hotelId,
        hotelName: hotel.hotelName,
        phone: hotel.phone,
      },
      cashCollected: amount,
      balanceAdjustment: appliedAdjustment,
    },
  );
});

/**
 * Get detailed QR / hotel-related order earnings for a specific hotel
 * GET /api/admin/hotels/:id/wallet/earnings
 */
export const getHotelWalletOrderEarnings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 200, startDate, endDate } = req.query;

  const hotel = await Hotel.findById(id)
    .select("_id hotelName hotelId commission")
    .lean();

  if (!hotel) {
    return errorResponse(res, 404, "Hotel not found");
  }

  const Order = (await import("../../order/models/Order.js")).default;

  const hotelObjectId = hotel._id;
  const hotelIdStr = hotel.hotelId;
  const lim = Math.min(parseInt(limit, 10) || 200, 500);

  const createdAtFilter = {};
  if (startDate) {
    const d = new Date(startDate);
    if (!Number.isNaN(d.getTime())) {
      createdAtFilter.$gte = d;
    }
  }
  if (endDate) {
    const d = new Date(endDate);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      createdAtFilter.$lte = d;
    }
  }

  const OrderSettlement = (await import("../../order/models/OrderSettlement.js")).default;
  const settlements = await OrderSettlement.find({
    $or: [
      { "hotelEarning.hotelId": hotelObjectId },
      { "hotelEarning.hotelId": hotelObjectId.toString() },
    ]
  }).select("orderId").lean();
  const settlementOrderIds = settlements.map(s => s.orderId).filter(Boolean);

  const orders = await Order.find({
    $or: [
      { _id: { $in: settlementOrderIds } },
      { hotelId: hotelObjectId },
      { hotelReference: hotelIdStr },
      { hotelReference: hotelObjectId.toString() },
    ],
    status: { $ne: "cancelled" },
    "payment.method": {
      $in: ["pay_at_hotel", "cash", "razorpay", "wallet"],
    },
    ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
  })
    .select(
      // include pricing fields so commission base can be derived for legacy orders
      "orderId pricing.total pricing.subtotal pricing.discount pricing.deliveryFee pricing.platformFee pricing.tax pricing.adminOfferDiscount payment.method cashCollected commissionBreakdown.hotel orderType createdAt hotelReference",
    )
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();

  const hotelCommPercent = Number(hotel.commission) || 0;

  let totalOrders = 0;
  let cashOrders = 0;
  let onlineOrders = 0;
  let totalHotelEarningCash = 0;
  let totalHotelEarningOnline = 0;
  let totalCashCollected = 0;

  const rows = orders.map((order) => {
    const total =
      (order.pricing && typeof order.pricing.total === "number"
        ? order.pricing.total
        : 0) || 0;

    // Always compute from subtotal base so Online and Pay-at-Hotel/Cash match,
    // even for historical orders that stored an incorrect hotel breakdown.
    let hotelEarning = getHotelCommissionFromOrder(order, hotelCommPercent);

    // Normalize to 2 decimals
    hotelEarning = Math.round(hotelEarning * 100) / 100;

    const paymentMethod =
      order.payment && typeof order.payment.method === "string"
        ? order.payment.method
        : "unknown";

    const isCashPayment =
      paymentMethod === "pay_at_hotel" || paymentMethod === "cash";
    const isOnlinePayment =
      paymentMethod === "razorpay" || paymentMethod === "wallet";

    const isQrOrder =
      order.orderType === "QR" ||
      Boolean(order.hotelReference) ||
      paymentMethod === "pay_at_hotel";

    if (isQrOrder) {
      totalOrders += 1;
      if (isCashPayment) {
        cashOrders += 1;
        totalHotelEarningCash += hotelEarning;
        if (order.cashCollected === true) {
          totalCashCollected += total;
        }
      } else if (isOnlinePayment) {
        onlineOrders += 1;
        totalHotelEarningOnline += hotelEarning;
      }
    }

    return {
      orderId: order.orderId,
      createdAt: order.createdAt,
      orderType: order.orderType || "DIRECT",
      totalAmount: Math.round(total * 100) / 100,
      hotelEarning,
      paymentMethod,
      cashCollected: order.cashCollected === true,
      isCashPayment,
      isOnlinePayment,
      isQrOrder,
    };
  });

  const walletDoc = await HotelWallet.findOne({ hotelId: hotelObjectId })
    .select("transactions")
    .lean();

  const totalBonus = Array.isArray(walletDoc?.transactions)
    ? walletDoc.transactions
        .filter((t) => t.type === "bonus" && t.status === "Completed")
        .reduce((sum, t) => sum + (t.amount || 0), 0)
    : 0;

  const summary = {
    totalOrders,
    cashOrders,
    onlineOrders,
    totalHotelEarningCash: Math.round(totalHotelEarningCash * 100) / 100,
    totalHotelEarningOnline: Math.round(totalHotelEarningOnline * 100) / 100,
    totalCashCollected: Math.round(totalCashCollected * 100) / 100,
    totalBonus: Math.round(totalBonus * 100) / 100,
  };

  return successResponse(
    res,
    200,
    "Hotel wallet order earnings fetched successfully",
    {
      hotel: {
        id: hotel._id,
        hotelId: hotel.hotelId,
        hotelName: hotel.hotelName,
      },
      summary,
      orders: rows,
    },
  );
});

/**
 * Get QR-origin orders (scan->order) for a specific hotel with profit split
 * GET /api/admin/hotels/:id/qr-orders
 * Query params: page, limit
 */
export const getHotelQROrders = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponse(res, 400, "Invalid hotel id");
  }

  const hotel = await Hotel.findById(id)
    .select("_id hotelName hotelId commission adminCommission")
    .lean();

  if (!hotel) {
    return errorResponse(res, 404, "Hotel not found");
  }

  const Order = (await import("../../order/models/Order.js")).default;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const hotelObjectId = hotel._id;
  const hotelIdStr = hotel.hotelId;

  const OrderSettlement = (await import("../../order/models/OrderSettlement.js")).default;
  const settlements = await OrderSettlement.find({
    $or: [
      { "hotelEarning.hotelId": hotelObjectId },
      { "hotelEarning.hotelId": hotelObjectId.toString() },
    ]
  }).select("orderId").lean();
  const settlementOrderIds = settlements.map(s => s.orderId).filter(Boolean);

  const finalMatch = {
    $and: [
      {
        $or: [
          { _id: { $in: settlementOrderIds } },
          { hotelId: hotelObjectId },
          { hotelReference: hotelIdStr },
          { hotelReference: hotelObjectId.toString() },
        ],
      },
      { status: { $ne: "cancelled" } },
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
          { _id: { $in: settlementOrderIds } },
        ],
      },
    ],
  };

  const [orders, total] = await Promise.all([
    Order.find(finalMatch)
      .select(
        [
          "orderId",
          "userId",
          "restaurantName",
          "restaurantId",
          "pricing.subtotal",
          "pricing.total",
          "orderType",
          "payment.method",
          "payment.status",
          "status",
          "roomNumber",
          "createdAt",
          "commissionBreakdown",
          "commissionPercentages",
          "hotelCommission",
          "adminCommission",
          "restaurantShare",
        ].join(" "),
      )
      .populate("userId", "name phone email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Order.countDocuments(finalMatch),
  ]);

  const hotelPct = Number(hotel.commission) || 0;
  const adminPct = Number(hotel.adminCommission) || 0;

  const rows = orders.map((order) => {
    const amountBase =
      (order.pricing && typeof order.pricing.subtotal === "number"
        ? order.pricing.subtotal
        : typeof order.pricing?.total === "number"
          ? order.pricing.total
          : 0) || 0;

    // Prefer persisted splits only when they are actually set (> 0).
    // Razorpay / online QR orders often have commissionBreakdown keys present as 0;
    // `typeof x === "number"` was true for 0 and blocked the hotel % fallback, so the UI showed all zeros.
    const bdHotel = order.commissionBreakdown?.hotel;
    const bdAdmin = order.commissionBreakdown?.admin;
    const bdRestaurant = order.commissionBreakdown?.restaurant;

    const hotelProfit =
      typeof order.hotelCommission === "number" && order.hotelCommission > 0
        ? order.hotelCommission
        : typeof bdHotel === "number" && bdHotel > 0
          ? bdHotel
          : Math.round(((amountBase * hotelPct) / 100) * 100) / 100;

    const adminProfit =
      typeof order.adminCommission === "number" && order.adminCommission > 0
        ? order.adminCommission
        : typeof bdAdmin === "number" && bdAdmin > 0
          ? bdAdmin
          : Math.round(((amountBase * adminPct) / 100) * 100) / 100;

    const restaurantProfit =
      typeof order.restaurantShare === "number" && order.restaurantShare > 0
        ? order.restaurantShare
        : typeof bdRestaurant === "number" && bdRestaurant > 0
          ? bdRestaurant
          : Math.round((amountBase - hotelProfit - adminProfit) * 100) / 100;

    return {
      _id: order._id,
      orderId: order.orderId,
      createdAt: order.createdAt,
      status: order.status,
      payment: {
        method: order.payment?.method || null,
        status: order.payment?.status || null,
      },
      orderType: order.orderType || null,
      roomNumber: order.roomNumber || null,
      restaurant: {
        name: order.restaurantName || null,
        id: order.restaurantId || null,
      },
      user: order.userId
        ? {
            id: order.userId._id,
            name: order.userId.name || null,
            phone: order.userId.phone || null,
            email: order.userId.email || null,
          }
        : null,
      amountBase: Math.round(amountBase * 100) / 100,
      profits: {
        hotel: Math.round((Number(hotelProfit) || 0) * 100) / 100,
        admin: Math.round((Number(adminProfit) || 0) * 100) / 100,
        restaurant: Math.round((Number(restaurantProfit) || 0) * 100) / 100,
      },
      percentages: {
        hotel: order.commissionPercentages?.hotel ?? hotelPct,
        admin: order.commissionPercentages?.admin ?? adminPct,
        restaurant: order.commissionPercentages?.restaurant ?? null,
      },
    };
  });

  const summary = rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.totalBase += Number(row.amountBase) || 0;
      acc.hotel += Number(row.profits?.hotel) || 0;
      acc.admin += Number(row.profits?.admin) || 0;
      acc.restaurant += Number(row.profits?.restaurant) || 0;
      return acc;
    },
    { count: 0, totalBase: 0, hotel: 0, admin: 0, restaurant: 0 },
  );

  return successResponse(res, 200, "Hotel QR orders fetched successfully", {
    hotel: {
      id: hotel._id,
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName,
    },
    summary: {
      count: summary.count,
      totalBase: Math.round(summary.totalBase * 100) / 100,
      profits: {
        hotel: Math.round(summary.hotel * 100) / 100,
        admin: Math.round(summary.admin * 100) / 100,
        restaurant: Math.round(summary.restaurant * 100) / 100,
      },
    },
    orders: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * Get Hotel Wallet overview for admin
 * GET /api/admin/hotels/wallets
 */
export const getHotelWalletOverview = asyncHandler(async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const hotelQuery = {};

    if (search) {
      hotelQuery.$or = [
        { hotelName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
        { hotelId: { $regex: search, $options: "i" } },
      ];
    }

    const [hotels, totalHotels] = await Promise.all([
      Hotel.find(hotelQuery)
        // Include commission so we can compute fallback earnings
        .select("hotelName hotelId email phone isActive commission")
        .sort({ hotelName: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Hotel.countDocuments(hotelQuery),
    ]);

    if (hotels.length === 0) {
      return successResponse(res, 200, "Hotel wallets overview fetched", {
        hotels: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          pages: 0,
        },
      });
    }

    const hotelIds = hotels.map((h) => h._id);
    const hotelIdStrings = hotelIds.map((id) => id.toString());
    const hotelCodes = hotels
      .map((h) => h.hotelId)
      .filter((id) => typeof id === "string" && id.length > 0);

    // Load wallets for these hotels
    const wallets = await HotelWallet.find({ hotelId: { $in: hotelIds } })
      .select(
        "hotelId totalBalance totalEarned totalWithdrawn withdrawalRequests manualCashCollectedOverride manualAvailableBalanceAdjustment transactions",
      )
      .lean();

    const walletByHotelId = new Map(
      wallets.map((w) => [w.hotelId.toString(), w]),
    );

    // --- Aggregate per-hotel order stats so admin sees same numbers as hotel app ---
    const orderStatsByHotelId = new Map();

    try {
      const Order = (await import("../../order/models/Order.js")).default;

      // Map for quick hotel lookup by both Mongo _id and hotelId string
      const hotelByMongoId = new Map(
        hotels.map((h) => [h._id.toString(), h]),
      );
      const hotelByCode = new Map(
        hotels
          .filter(
            (h) => typeof h.hotelId === "string" && h.hotelId.trim().length > 0,
          )
          .map((h) => [h.hotelId, h]),
      );

      const hotelReferenceCandidates = [
        ...hotelCodes,
        ...hotelIdStrings,
      ];

      const OrderSettlement = (await import("../../order/models/OrderSettlement.js")).default;
      const settlements = await OrderSettlement.find({
        $or: [
          { "hotelEarning.hotelId": { $in: hotelIds } },
          { "hotelEarning.hotelId": { $in: hotelIdStrings } },
        ]
      }).select("orderId hotelEarning.hotelId").lean();
      const settlementOrderIds = settlements.map(s => s.orderId).filter(Boolean);

      const settlementHotelIdMap = new Map();
      settlements.forEach(s => {
        if (s.orderId && s.hotelEarning?.hotelId) {
          settlementHotelIdMap.set(s.orderId.toString(), s.hotelEarning.hotelId.toString());
        }
      });

      const orders =
        hotelIds.length === 0
          ? []
          : await Order.find({
              $or: [
                { _id: { $in: settlementOrderIds } },
                { hotelId: { $in: hotelIds } },
                {
                  hotelReference: {
                    $in: hotelReferenceCandidates,
                  },
                },
              ],
            })
              .select(
                // Added payment.status so we can filter only completed payments (matches hotel app logic)
                "hotelId hotelReference orderType pricing.total pricing.subtotal pricing.discount pricing.deliveryFee pricing.platformFee pricing.tax pricing.adminOfferDiscount commissionBreakdown.hotel status payment.method payment.status cashCollected hotelCashSettled",
              )
              .lean();

      orders.forEach((order) => {
        const hotelIdObj =
          order.hotelId && typeof order.hotelId === "object"
            ? order.hotelId.toString()
            : null;
        const hotelRef =
          typeof order.hotelReference === "string"
            ? order.hotelReference
            : order.hotelReference
            ? order.hotelReference.toString()
            : null;

        // Resolve the hotel document this order belongs to
        let hotelDoc =
          (hotelIdObj && hotelByMongoId.get(hotelIdObj)) ||
          (hotelRef &&
            (hotelByCode.get(hotelRef) || hotelByMongoId.get(hotelRef)));

        if (!hotelDoc) {
          const settlementHotelId = settlementHotelIdMap.get(order._id.toString());
          if (settlementHotelId) {
            hotelDoc = hotelByMongoId.get(settlementHotelId);
          }
        }

        if (!hotelDoc) return;

        const hid = hotelDoc._id.toString();

        let stats = orderStatsByHotelId.get(hid);
        if (!stats) {
          stats = {
            totalRequests: 0,
            totalAmountCollected: 0,
            totalCashCollected: 0,
            hotelEarnings: 0,
          };
          orderStatsByHotelId.set(hid, stats);
        }

        const paymentMethod =
          order.payment && typeof order.payment.method === "string"
            ? order.payment.method
            : null;

        const isValidPaymentMethod = [
          "pay_at_hotel",
          "cash",
          "razorpay",
          "wallet",
        ].includes(paymentMethod);

        const isQrOrder =
          order.orderType === "QR" ||
          Boolean(order.hotelReference) ||
          paymentMethod === "pay_at_hotel";

        const isCashMethod =
          paymentMethod === "pay_at_hotel" || paymentMethod === "cash";

        // Only count orders where payment has actually been completed.
        // Mirror the exact same filter used by the hotel app (hotelOrdersController financialMatch):
        //   - Online orders: payment.status === "completed"
        //   - Cash/PAH orders: status === "delivered" OR cashCollected === true
        // This prevents pending/processing Razorpay orders from inflating the numbers.
        const isPaymentCompleted =
          (order.payment?.status === "completed") ||
          (order.status === "delivered") ||
          (isCashMethod && order.cashCollected === true);

        // Increment stats only if the order is valid, non-cancelled, QR/hotel order,
        // AND payment has actually been completed
        if (order.status !== "cancelled" && isValidPaymentMethod && isQrOrder && isPaymentCompleted) {
          stats.totalRequests += 1;

          const totalAmount =
            (order.pricing && typeof order.pricing.total === "number"
              ? order.pricing.total
              : 0) || 0;

          stats.totalAmountCollected += totalAmount;

          // Always compute from subtotal base so Online and Pay-at-Hotel/Cash match.
          const hotelCommPercent = Number(hotelDoc.commission) || 0;
          stats.hotelEarnings += getHotelCommissionFromOrder(order, hotelCommPercent);

          // Cash collected outstanding at hotel (same logic as hotel app):
          // include only cash/pay_at_hotel orders where hotel has collected
          // cash but NOT yet settled to platform (hotelCashSettled !== true)
          const isOutstandingCash =
            isCashMethod === true &&
            order.cashCollected === true &&
            order.hotelCashSettled !== true;

          if (isOutstandingCash) {
            stats.totalCashCollected += totalAmount;
          }
        }
      });
    } catch (statsError) {
      console.error(
        "Error aggregating hotel order stats for wallet overview:",
        statsError,
      );
    }

    const result = hotels.map((hotel) => {
      const hid = hotel._id.toString();
      const wallet = walletByHotelId.get(hid) || {};
      const stats = orderStatsByHotelId.get(hid) || {};

      // Available / earnings source of truth: the database wallet aggregates.
      // Fall back to order aggregation ONLY if the wallet doesn't exist or has 0 aggregates but has orders.
      const walletTotalEarned = wallet.totalEarned || 0;
      const walletAvailable = wallet.totalBalance || 0;
      const statsTotalEarned = stats.hotelEarnings || 0;

      const useStats = (walletTotalEarned === 0 && statsTotalEarned > 0);

      const hotelEarnings = useStats ? statsTotalEarned : walletTotalEarned;
      const totalWithdrawn = wallet.totalWithdrawn || 0;

      // Mirror same availableBalance calculation logic as hotel app: totalEarned - totalWithdrawn, fallback to totalBalance
      const logicalAvailable = walletTotalEarned - totalWithdrawn;
      const baseAvailable = useStats
        ? (statsTotalEarned - totalWithdrawn)
        : (logicalAvailable > 0 ? logicalAvailable : walletAvailable);

      const manualAdj =
        typeof wallet.manualAvailableBalanceAdjustment === "number"
          ? wallet.manualAvailableBalanceAdjustment
          : Number(wallet.manualAvailableBalanceAdjustment) || 0;

      // Only add manualAdj if we are using stats-based earnings, because wallet.totalBalance/logicalAvailable
      // already includes the manual adjustment transactions.
      const availableBalance = useStats ? baseAvailable + manualAdj : baseAvailable;

      const totalWithdrawalCount = Array.isArray(wallet.withdrawalRequests)
        ? wallet.withdrawalRequests.length
        : 0;

      const hasManualCashOverride =
        typeof wallet.manualCashCollectedOverride === "number" &&
        wallet.manualCashCollectedOverride >= 0;

      const totalCashCollected = hasManualCashOverride
        ? wallet.manualCashCollectedOverride
        : stats.totalCashCollected || 0;

      const totalBonus = Array.isArray(wallet?.transactions)
        ? wallet.transactions
            .filter((t) => t.type === "bonus" && t.status === "Completed")
            .reduce((sum, t) => sum + (t.amount || 0), 0)
        : 0;

      return {
        hotelId: hotel._id,
        hotelName: hotel.hotelName,
        hotelCode: hotel.hotelId,
        phone: hotel.phone,
        email: hotel.email,
        isActive: hotel.isActive,
        totalRequests: stats.totalRequests || 0,
        totalAmountCollected:
          Math.round((stats.totalAmountCollected || 0) * 100) / 100,
        totalCashCollected: Math.round(totalCashCollected * 100) / 100,
        hotelEarnings:
          Math.round((hotelEarnings || 0) * 100) / 100,
        totalBonus: Math.round(totalBonus * 100) / 100,
        availableBalance: Math.max(0, availableBalance),
        totalWithdrawn,
        totalWithdrawalCount,
      };
    });

    return successResponse(res, 200, "Hotel wallets overview fetched", {
      hotels: result,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalHotels,
        pages: Math.ceil(totalHotels / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching hotel wallet overview:", error);
    return errorResponse(res, 500, "Failed to fetch hotel wallet overview");
  }
});

/**
 * Get hotel withdrawal requests (admin)
 * GET /api/admin/hotel-withdrawal/requests
 */
export const getHotelWithdrawalRequests = asyncHandler(async (req, res) => {
  try {
    const { status, hotelId, startDate, endDate, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const hotelIdFilter =
      hotelId && mongoose.Types.ObjectId.isValid(hotelId)
        ? new mongoose.Types.ObjectId(hotelId)
        : null;

    const reqDateFilter = {};
    if (startDate) {
      const d = new Date(startDate);
      if (!Number.isNaN(d.getTime())) reqDateFilter.$gte = d;
    }
    if (endDate) {
      const d = new Date(endDate);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        reqDateFilter.$lte = d;
      }
    }

    // Pull wallets that have withdrawal requests
    const wallets = await HotelWallet.find({
      "withdrawalRequests.0": { $exists: true },
    })
      .populate("hotelId", "hotelName hotelId email phone")
      .lean();

    let allRequests = [];

    wallets.forEach((wallet) => {
      const hotel = wallet.hotelId;
      if (hotelIdFilter && String(hotel?._id || wallet.hotelId) !== String(hotelIdFilter)) return;
      if (!Array.isArray(wallet.withdrawalRequests)) return;

      wallet.withdrawalRequests.forEach((wr) => {
        if (!wr) return;
        if (
          status &&
          ["Pending", "Approved", "Rejected", "Processed"].includes(status) &&
          wr.status !== status
        ) {
          return;
        }

        if (Object.keys(reqDateFilter).length) {
          const dt = wr.processedAt || wr.requestedAt || wr.createdAt || null;
          if (!dt) return;
          const d = new Date(dt);
          if (Number.isNaN(d.getTime())) return;
          if (reqDateFilter.$gte && d < reqDateFilter.$gte) return;
          if (reqDateFilter.$lte && d > reqDateFilter.$lte) return;
        }

        allRequests.push({
          id: wr._id,
          walletId: wallet._id,
          hotelMongoId: hotel?._id || wallet.hotelId,
          hotelName: hotel?.hotelName || "Unknown Hotel",
          hotelIdString: hotel?.hotelId || (hotel?._id || "").toString(),
          hotelEmail: hotel?.email || "N/A",
          hotelPhone: hotel?.phone || "N/A",
          amount: wr.amount,
          status: wr.status,
          paymentMethod: wr.paymentMethod,
          requestedAt: wr.requestedAt,
          processedAt: wr.processedAt,
        });
      });
    });

    // Sort by requestedAt desc
    allRequests.sort(
      (a, b) =>
        new Date(b.requestedAt || b.createdAt || 0) -
        new Date(a.requestedAt || a.createdAt || 0),
    );

    const total = allRequests.length;
    const paginated = allRequests.slice(skip, skip + limitNum);

    return successResponse(res, 200, "Hotel withdrawal requests fetched", {
      requests: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching hotel withdrawal requests:", error);
    return errorResponse(res, 500, "Failed to fetch hotel withdrawal requests");
  }
});

/**
 * Approve hotel withdrawal request (admin)
 * POST /api/admin/hotel-withdrawal/:id/approve
 */
export const approveHotelWithdrawalRequest = asyncHandler(
  async (req, res) => {
    try {
      const { id } = req.params;

      const wallet = await HotelWallet.findOne({
        "withdrawalRequests._id": id,
      });

      if (!wallet) {
        return errorResponse(res, 404, "Withdrawal request not found");
      }

      const request = wallet.withdrawalRequests.id(id);
      if (!request) {
        return errorResponse(res, 404, "Withdrawal request not found");
      }

      if (request.status !== "Pending") {
        return errorResponse(
          res,
          400,
          `Withdrawal request is already ${request.status}`,
        );
      }

      request.status = "Approved";
      request.processedAt = new Date();

      // Mark linked transaction as completed (if exists)
      if (request.transactionId) {
        const tx = wallet.transactions.id(request.transactionId);
        if (tx && tx.type === "withdrawal" && tx.status === "Pending") {
          tx.status = "Completed";
          tx.processedAt = new Date();
        }
      }

      await wallet.save();

      return successResponse(
        res,
        200,
        "Hotel withdrawal request approved successfully",
        {
          request: {
            id: request._id,
            amount: request.amount,
            status: request.status,
            processedAt: request.processedAt,
          },
        },
      );
    } catch (error) {
      console.error("Error approving hotel withdrawal request:", error);
      return errorResponse(
        res,
        500,
        "Failed to approve hotel withdrawal request",
      );
    }
  },
);

/**
 * Reject hotel withdrawal request (admin)
 * POST /api/admin/hotel-withdrawal/:id/reject
 */
export const rejectHotelWithdrawalRequest = asyncHandler(
  async (req, res) => {
    try {
      const { id } = req.params;

      const wallet = await HotelWallet.findOne({
        "withdrawalRequests._id": id,
      });

      if (!wallet) {
        return errorResponse(res, 404, "Withdrawal request not found");
      }

      const request = wallet.withdrawalRequests.id(id);
      if (!request) {
        return errorResponse(res, 404, "Withdrawal request not found");
      }

      if (request.status !== "Pending") {
        return errorResponse(
          res,
          400,
          `Withdrawal request is already ${request.status}`,
        );
      }

      request.status = "Rejected";
      request.processedAt = new Date();

      // Reverse wallet balances for rejected request
      const amount = Number(request.amount) || 0;
      if (amount > 0) {
        wallet.totalBalance = (wallet.totalBalance || 0) + amount;
        wallet.totalWithdrawn = Math.max(
          0,
          (wallet.totalWithdrawn || 0) - amount,
        );
      }

      // Mark linked transaction as cancelled (if exists)
      if (request.transactionId) {
        const tx = wallet.transactions.id(request.transactionId);
        if (tx && tx.type === "withdrawal" && tx.status === "Pending") {
          tx.status = "Cancelled";
          tx.processedAt = new Date();
        }
      }

      await wallet.save();

      return successResponse(
        res,
        200,
        "Hotel withdrawal request rejected successfully",
        {
          request: {
            id: request._id,
            amount: request.amount,
            status: request.status,
            processedAt: request.processedAt,
          },
        },
      );
    } catch (error) {
      console.error("Error rejecting hotel withdrawal request:", error);
      return errorResponse(
        res,
        500,
        "Failed to reject hotel withdrawal request",
      );
    }
  },
);

/**
 * GET /api/admin/hotels/stand-requests
 * Get hotels that have requested a stand (or approved)
 * Query params: status = requested | approved | all
 */
export const getHotelStandRequests = asyncHandler(async (req, res) => {
  try {
    const { status = "requested" } = req.query;

    const query = {};
    if (status === "requested") {
      query.standRequestStatus = "requested";
    } else if (status === "approved") {
      query.standRequestStatus = "approved";
    } else if (status === "none") {
      query.standRequestStatus = { $in: [null, "none"] };
    } else {
      query.standRequestStatus = { $in: ["requested", "approved"] };
    }

    const hotels = await Hotel.find(query)
      .select("-password")
      .sort({ standRequestedAt: -1, createdAt: -1 });

    return successResponse(res, 200, "Hotel stand requests fetched successfully", {
      requests: hotels,
    });
  } catch (error) {
    console.error("Error fetching hotel stand requests:", error);
    return errorResponse(res, 500, "Failed to fetch hotel stand requests");
  }
});

/**
 * POST /api/admin/hotels/stand-requests/:id/approve
 * Approve hotel stand request
 */
export const approveHotelStandRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const admin = req.admin;

  const hotel = await Hotel.findById(id);
  if (!hotel) {
    return errorResponse(res, 404, "Hotel not found");
  }

  hotel.standRequestStatus = "approved";
  hotel.standApprovedAt = new Date();
  hotel.standApprovedBy = admin ? admin._id : null;

  // Ensure standRequestedAt is set if it wasn't previously
  if (!hotel.standRequestedAt) {
    hotel.standRequestedAt = new Date();
  }

  await hotel.save();

  return successResponse(res, 200, "Hotel stand request approved successfully", {
    hotel: {
      _id: hotel._id,
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName,
      phone: hotel.phone,
      email: hotel.email,
      address: hotel.address,
      standRequestStatus: hotel.standRequestStatus,
      standRequestedAt: hotel.standRequestedAt,
      standApprovedAt: hotel.standApprovedAt,
    },
  });
});

/**
 * Hotel Leaderboard (QR orders count)
 * GET /api/admin/hotels/leaderboard?period=month|6months
 */
export const getHotelLeaderboard = asyncHandler(async (req, res) => {
  const { period = "month" } = req.query;

  // Build time window
  const now = new Date();
  let startDate = null;
  let endDate = now;
  let periodLabel = "";

  if (period === "6months") {
    // Fixed seasonal window: Jan-May or Jun-Dec (current window to date)
    const isFirstHalf = now.getMonth() < 5; // 0-4 => Jan-May
    const startMonth = isFirstHalf ? 0 : 5;
    startDate = new Date(now.getFullYear(), startMonth, 1, 0, 0, 0, 0);
    periodLabel = isFirstHalf ? `Jan–May ${now.getFullYear()}` : `Jun–Dec ${now.getFullYear()}`;
  } else {
    // Default: current calendar month
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    startDate = start;
    periodLabel = "This month";
  }

  const Order = (await import("../../order/models/Order.js")).default;

  // Include ALL hotels (even with 0 orders), ranked by QR orders in the window.
  const Hotel = (await import("../../hotel/models/Hotel.js")).default;

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
    {
      $addFields: {
        orders: { $size: "$qrOrders" },
      },
    },
    { $project: { qrOrders: 0 } },
    { $sort: { orders: -1, hotelName: 1 } },
  ]);

  const leaderboard = rows.map((r, idx) => ({
    rank: idx + 1,
    hotelMongoId: r._id,
    hotelId: r.hotelId || null,
    hotelName: r.hotelName || "Unknown Hotel",
    isActive: r.isActive !== false,
    orders: Number(r.orders) || 0,
  }));

  return successResponse(res, 200, "Hotel leaderboard fetched successfully", {
    period: period === "6months" ? "6months" : "month",
    periodLabel,
    range: {
      start: startDate,
      end: endDate,
    },
    leaderboard,
  });
});

function normalizeGifts(input, allowedPositions) {
  const map = new Map();
  (Array.isArray(input) ? input : []).forEach((g) => {
    const pos = Number(g?.position);
    if (!allowedPositions.includes(pos)) return;
    map.set(pos, {
      position: pos,
      name: typeof g?.name === "string" ? g.name.trim() : "",
      image: {
        url: typeof g?.image?.url === "string" ? g.image.url : "",
        publicId: typeof g?.image?.publicId === "string" ? g.image.publicId : "",
      },
    });
  });
  return allowedPositions.map((pos) => map.get(pos) || { position: pos, name: "", image: { url: "", publicId: "" } });
}

function normalizeDiscounts(input, allowedPositions) {
  const map = new Map();
  (Array.isArray(input) ? input : []).forEach((d) => {
    const pos = Number(d?.position);
    if (!allowedPositions.includes(pos)) return;
    const amt = Number(d?.rupeesOff);
    map.set(pos, {
      position: pos,
      rupeesOff: Number.isFinite(amt) && amt > 0 ? amt : 0,
    });
  });
  return allowedPositions.map((pos) => map.get(pos) || { position: pos, rupeesOff: 0 });
}

function normalizeBanner(input) {
  return {
    url: typeof input?.url === "string" ? input.url : "",
    publicId: typeof input?.publicId === "string" ? input.publicId : "",
  };
}

function normalizeWinnerProfiles(input) {
  return {
    month: normalizeBanner(input?.month),
    sixMonths: normalizeBanner(input?.sixMonths),
  };
}

function normalizeBanners(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  arr.forEach((b) => {
    const url = typeof b?.url === "string" ? b.url : "";
    if (!url.trim()) return;
    out.push({
      url,
      publicId: typeof b?.publicId === "string" ? b.publicId : "",
    });
  });
  return out;
}

/**
 * Get leaderboard rewards configuration (admin)
 * GET /api/admin/hotels/leaderboard-rewards
 */
export const getHotelLeaderboardRewards = asyncHandler(async (req, res) => {
  const doc = await HotelLeaderboardRewards.getSettings();
  const payload = doc?.toObject ? doc.toObject() : doc;

  const normalized = {
    banners: normalizeBanners(payload?.banners?.length ? payload.banners : (payload?.banner?.url ? [payload.banner] : [])),
    winnerProfiles: normalizeWinnerProfiles(payload?.winnerProfiles),
    hideWinner: {
      month: payload?.hideWinner?.month === true,
      sixMonths: payload?.hideWinner?.sixMonths === true,
    },
    monthly: {
      gifts: normalizeGifts(payload?.monthly?.gifts, [1, 2, 3, 4, 5]),
      discounts: normalizeDiscounts(payload?.monthly?.discounts, [6, 7, 8, 9, 10]),
      minOrders: Number.isFinite(payload?.monthly?.minOrders) ? payload.monthly.minOrders : 0,
    },
    sixMonths: {
      gifts: normalizeGifts(payload?.sixMonths?.gifts, [1, 2, 3]),
      minOrders: Number.isFinite(payload?.sixMonths?.minOrders) ? payload.sixMonths.minOrders : 0,
    },
    updatedAt: payload?.updatedAt || null,
  };

  return successResponse(res, 200, "Hotel leaderboard rewards fetched successfully", normalized);
});

/**
 * Update leaderboard rewards configuration (admin)
 * PUT /api/admin/hotels/leaderboard-rewards
 */
export const updateHotelLeaderboardRewards = asyncHandler(async (req, res) => {
  const body = req.body || {};

  const nextDoc = await HotelLeaderboardRewards.getSettings();

  const banners = normalizeBanners(body?.banners);
  const winnerProfiles = normalizeWinnerProfiles(body?.winnerProfiles);
  const monthlyGifts = normalizeGifts(body?.monthly?.gifts, [1, 2, 3, 4, 5]);
  const monthlyDiscounts = normalizeDiscounts(body?.monthly?.discounts, [6, 7, 8, 9, 10]);
  const sixMonthsGifts = normalizeGifts(body?.sixMonths?.gifts, [1, 2, 3]);

  nextDoc.banners = banners;
  nextDoc.winnerProfiles = winnerProfiles;
  nextDoc.hideWinner = {
    month: body?.hideWinner?.month === true,
    sixMonths: body?.hideWinner?.sixMonths === true,
  };
  nextDoc.monthly = {
    gifts: monthlyGifts,
    discounts: monthlyDiscounts,
    minOrders: Number.isFinite(body?.monthly?.minOrders) ? Math.max(0, Number(body.monthly.minOrders)) : 0,
  };
  nextDoc.sixMonths = {
    gifts: sixMonthsGifts,
    minOrders: Number.isFinite(body?.sixMonths?.minOrders) ? Math.max(0, Number(body.sixMonths.minOrders)) : 0,
  };
  if (req.admin?._id) {
    nextDoc.updatedBy = req.admin._id;
  }

  await nextDoc.save();

  return successResponse(res, 200, "Hotel leaderboard rewards updated successfully", {
    banners: nextDoc.banners,
    winnerProfiles: nextDoc.winnerProfiles,
    hideWinner: nextDoc.hideWinner,
    monthly: nextDoc.monthly,
    sixMonths: nextDoc.sixMonths,
    updatedAt: nextDoc.updatedAt,
  });
});
