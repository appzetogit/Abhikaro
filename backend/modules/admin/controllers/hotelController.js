import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import Hotel from "../../hotel/models/Hotel.js";
import HotelWallet from "../../hotel/models/HotelWallet.js";

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
    isActive = false, // Default to inactive, admin can activate later
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
  const { cashCollected } = req.body;

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
    },
  );
});

/**
 * Get detailed QR / hotel-related order earnings for a specific hotel
 * GET /api/admin/hotels/:id/wallet/earnings
 */
export const getHotelWalletOrderEarnings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 200 } = req.query;

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

  const orders = await Order.find({
    $or: [
      { hotelId: hotelObjectId },
      { hotelReference: hotelIdStr },
      { hotelReference: hotelObjectId.toString() },
    ],
    status: { $ne: "cancelled" },
    "payment.method": {
      $in: ["pay_at_hotel", "cash", "razorpay", "wallet"],
    },
  })
    .select(
      "orderId pricing.total payment.method cashCollected commissionBreakdown.hotel orderType createdAt",
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

    let hotelEarning =
      order.commissionBreakdown &&
      typeof order.commissionBreakdown.hotel === "number"
        ? order.commissionBreakdown.hotel
        : (total * hotelCommPercent) / 100;

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

  const summary = {
    totalOrders,
    cashOrders,
    onlineOrders,
    totalHotelEarningCash: Math.round(totalHotelEarningCash * 100) / 100,
    totalHotelEarningOnline: Math.round(totalHotelEarningOnline * 100) / 100,
    totalCashCollected: Math.round(totalCashCollected * 100) / 100,
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
        "hotelId totalBalance totalEarned totalWithdrawn withdrawalRequests manualCashCollectedOverride",
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

      const orders =
        hotelIds.length === 0
          ? []
          : await Order.find({
              $or: [
                { hotelId: { $in: hotelIds } },
                {
                  hotelReference: {
                    $in: hotelReferenceCandidates,
                  },
                },
              ],
            })
              .select(
                "hotelId hotelReference pricing.total commissionBreakdown.hotel status payment.method cashCollected hotelCashSettled",
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
        const hotelDoc =
          (hotelIdObj && hotelByMongoId.get(hotelIdObj)) ||
          (hotelRef &&
            (hotelByCode.get(hotelRef) || hotelByMongoId.get(hotelRef)));

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

        stats.totalRequests += 1;

        const totalAmount =
          (order.pricing && typeof order.pricing.total === "number"
            ? order.pricing.total
            : 0) || 0;

        // For non-cancelled orders, aggregate revenue & earnings
        if (order.status !== "cancelled") {
          stats.totalAmountCollected += totalAmount;

          const hasHotelCommissionFromOrder =
            order.commissionBreakdown &&
            typeof order.commissionBreakdown.hotel === "number";

          if (hasHotelCommissionFromOrder) {
            stats.hotelEarnings += order.commissionBreakdown.hotel;
          } else {
            // Fallback: derive from hotel's current commission percentage
            const hotelCommPercent = Number(hotelDoc.commission) || 0;
            stats.hotelEarnings += (totalAmount * hotelCommPercent) / 100;
          }

          const paymentMethod =
            order.payment && typeof order.payment.method === "string"
              ? order.payment.method
              : null;
          const isCashMethod =
            paymentMethod === "pay_at_hotel" || paymentMethod === "cash";

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

      // Mirror hotel app logic for withdrawable / available balance:
      // Prefer stats-based earnings, then fall back to wallet aggregates.
      const statsTotalEarned =
        typeof stats.hotelEarnings === "number"
          ? stats.hotelEarnings
          : null;
      const totalEarned =
        statsTotalEarned != null ? statsTotalEarned : wallet.totalEarned || 0;
      const totalWithdrawn = wallet.totalWithdrawn || 0;
      const totalBalance = wallet.totalBalance || 0;
      const withdrawableRaw = totalEarned - totalWithdrawn;
      const availableBalance =
        withdrawableRaw >= 0 ? withdrawableRaw : totalBalance;

      const totalWithdrawalCount = Array.isArray(wallet.withdrawalRequests)
        ? wallet.withdrawalRequests.length
        : 0;

      const hasManualCashOverride =
        typeof wallet.manualCashCollectedOverride === "number" &&
        wallet.manualCashCollectedOverride >= 0;

      const totalCashCollected = hasManualCashOverride
        ? wallet.manualCashCollectedOverride
        : stats.totalCashCollected || 0;

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
          Math.round((stats.hotelEarnings || 0) * 100) / 100,
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
    const { status, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Pull wallets that have withdrawal requests
    const wallets = await HotelWallet.find({
      "withdrawalRequests.0": { $exists: true },
    })
      .populate("hotelId", "hotelName hotelId email phone")
      .lean();

    let allRequests = [];

    wallets.forEach((wallet) => {
      const hotel = wallet.hotelId;
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