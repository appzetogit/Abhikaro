import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import AdminPromoCode from "../models/AdminPromoCode.js";
import Order from "../../order/models/Order.js";

/**
 * @desc    Get all promo codes (Admin)
 * @route   GET /api/admin/promo-codes
 * @access  Private (Admin with page.promo_codes permission)
 */
export const getPromoCodes = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = "",
    status = "all", // 'all', 'active', 'inactive', 'expired'
    discountType,
  } = req.query;

  const query = {};

  // Search by code, title, or description
  if (search && search.trim()) {
    const regex = new RegExp(search.trim(), "i");
    query.$or = [{ code: regex }, { title: regex }, { description: regex }];
  }

  // Filter by discountType
  if (discountType && ["percentage", "flat"].includes(discountType)) {
    query.discountType = discountType;
  }

  const now = new Date();

  // Filter by status
  if (status === "active") {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    query.isActive = true;
    query.startDate = { $lte: now };
    query.endDate = { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
  } else if (status === "inactive") {
    query.isActive = false;
  } else if (status === "expired") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    query.endDate = { $lt: startOfToday };
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const [promoCodes, total] = await Promise.all([
    AdminPromoCode.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("applicableRestaurants", "name")
      .lean(),
    AdminPromoCode.countDocuments(query),
  ]);

  // Overall stats
  const [totalCount, activeCount, expiredCount] = await Promise.all([
    AdminPromoCode.countDocuments({}),
    AdminPromoCode.countDocuments({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
    }),
    AdminPromoCode.countDocuments({
      endDate: { $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
    }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      promoCodes,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
      stats: {
        total: totalCount,
        active: activeCount,
        inactive: totalCount - activeCount - expiredCount < 0 ? 0 : totalCount - activeCount - expiredCount,
        expired: expiredCount,
      },
    },
  });
});

/**
 * @desc    Get single promo code by ID (Admin)
 * @route   GET /api/admin/promo-codes/:id
 * @access  Private (Admin)
 */
export const getPromoCodeById = asyncHandler(async (req, res) => {
  const promoCode = await AdminPromoCode.findById(req.params.id)
    .populate("applicableRestaurants", "name")
    .lean();

  if (!promoCode) {
    return res.status(404).json({
      success: false,
      message: "Promo code not found",
    });
  }

  res.status(200).json({
    success: true,
    data: { promoCode },
  });
});

/**
 * @desc    Create new promo code (Admin)
 * @route   POST /api/admin/promo-codes
 * @access  Private (Admin)
 */
export const createPromoCode = asyncHandler(async (req, res) => {
  const {
    code,
    title,
    description = "",
    discountType = "percentage",
    discountValue,
    maxDiscount = null,
    minOrderAmount = 0,
    startDate,
    endDate,
    validDays = [],
    usageLimitPerUser = 1,
    totalUsageLimit = 0,
    isActive = true,
    applicableType = "all",
    applicableRestaurants = [],
  } = req.body;

  if (!code || !String(code).trim()) {
    return res.status(400).json({
      success: false,
      message: "Promo code string is required",
    });
  }

  if (!title || !String(title).trim()) {
    return res.status(400).json({
      success: false,
      message: "Promo code title is required",
    });
  }

  if (discountValue === undefined || discountValue === null || Number(discountValue) <= 0) {
    return res.status(400).json({
      success: false,
      message: "Valid discount value greater than 0 is required",
    });
  }

  if (discountType === "percentage" && Number(discountValue) > 100) {
    return res.status(400).json({
      success: false,
      message: "Percentage discount cannot exceed 100%",
    });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "Start date and End date are required",
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end < start) {
    return res.status(400).json({
      success: false,
      message: "End date cannot be earlier than Start date",
    });
  }

  const normalizedCode = String(code).trim().toUpperCase();

  // Check uniqueness
  const existing = await AdminPromoCode.findOne({ code: normalizedCode });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: `Promo code '${normalizedCode}' already exists`,
    });
  }

  // Normalize validDays (lowercase)
  const normalizedDays = Array.isArray(validDays)
    ? validDays.map((d) => String(d).toLowerCase().trim()).filter(Boolean)
    : [];

  const newPromo = await AdminPromoCode.create({
    code: normalizedCode,
    title: String(title).trim(),
    description: String(description || "").trim(),
    discountType,
    discountValue: Number(discountValue),
    maxDiscount: discountType === "percentage" && maxDiscount ? Number(maxDiscount) : null,
    minOrderAmount: Number(minOrderAmount || 0),
    startDate: start,
    endDate: end,
    validDays: normalizedDays,
    usageLimitPerUser: Number(usageLimitPerUser ?? 1),
    totalUsageLimit: Number(totalUsageLimit || 0),
    isActive: Boolean(isActive),
    applicableType,
    applicableRestaurants: Array.isArray(applicableRestaurants) ? applicableRestaurants : [],
    createdBy: req.admin?._id || req.user?._id || null,
  });

  res.status(201).json({
    success: true,
    message: "Promo code created successfully",
    data: { promoCode: newPromo },
  });
});

/**
 * @desc    Update promo code (Admin)
 * @route   PUT /api/admin/promo-codes/:id
 * @access  Private (Admin)
 */
export const updatePromoCode = asyncHandler(async (req, res) => {
  const promoCode = await AdminPromoCode.findById(req.params.id);

  if (!promoCode) {
    return res.status(404).json({
      success: false,
      message: "Promo code not found",
    });
  }

  const {
    code,
    title,
    description,
    discountType,
    discountValue,
    maxDiscount,
    minOrderAmount,
    startDate,
    endDate,
    validDays,
    usageLimitPerUser,
    totalUsageLimit,
    isActive,
    applicableType,
    applicableRestaurants,
  } = req.body;

  if (code && String(code).trim().toUpperCase() !== promoCode.code) {
    const normalizedCode = String(code).trim().toUpperCase();
    const existing = await AdminPromoCode.findOne({
      code: normalizedCode,
      _id: { $ne: promoCode._id },
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Promo code '${normalizedCode}' is already in use`,
      });
    }
    promoCode.code = normalizedCode;
  }

  if (title) promoCode.title = String(title).trim();
  if (description !== undefined) promoCode.description = String(description || "").trim();
  if (discountType) promoCode.discountType = discountType;
  if (discountValue !== undefined) {
    const val = Number(discountValue);
    if (promoCode.discountType === "percentage" && val > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }
    promoCode.discountValue = val;
  }
  if (maxDiscount !== undefined) {
    promoCode.maxDiscount = maxDiscount ? Number(maxDiscount) : null;
  }
  if (minOrderAmount !== undefined) promoCode.minOrderAmount = Number(minOrderAmount);
  if (startDate) promoCode.startDate = new Date(startDate);
  if (endDate) promoCode.endDate = new Date(endDate);

  if (promoCode.endDate < promoCode.startDate) {
    return res.status(400).json({
      success: false,
      message: "End date cannot be earlier than Start date",
    });
  }

  if (validDays !== undefined && Array.isArray(validDays)) {
    promoCode.validDays = validDays.map((d) => String(d).toLowerCase().trim()).filter(Boolean);
  }

  if (usageLimitPerUser !== undefined) promoCode.usageLimitPerUser = Number(usageLimitPerUser);
  if (totalUsageLimit !== undefined) promoCode.totalUsageLimit = Number(totalUsageLimit);
  if (isActive !== undefined) promoCode.isActive = Boolean(isActive);
  if (applicableType) promoCode.applicableType = applicableType;
  if (applicableRestaurants !== undefined) {
    promoCode.applicableRestaurants = Array.isArray(applicableRestaurants)
      ? applicableRestaurants
      : [];
  }

  await promoCode.save();

  res.status(200).json({
    success: true,
    message: "Promo code updated successfully",
    data: { promoCode },
  });
});

/**
 * @desc    Toggle promo code status (Admin)
 * @route   PATCH /api/admin/promo-codes/:id/status
 * @access  Private (Admin)
 */
export const togglePromoCodeStatus = asyncHandler(async (req, res) => {
  const promoCode = await AdminPromoCode.findById(req.params.id);

  if (!promoCode) {
    return res.status(404).json({
      success: false,
      message: "Promo code not found",
    });
  }

  promoCode.isActive = !promoCode.isActive;
  await promoCode.save();

  res.status(200).json({
    success: true,
    message: `Promo code ${promoCode.isActive ? "activated" : "deactivated"} successfully`,
    data: { promoCode },
  });
});

/**
 * @desc    Delete promo code (Admin)
 * @route   DELETE /api/admin/promo-codes/:id
 * @access  Private (Admin)
 */
export const deletePromoCode = asyncHandler(async (req, res) => {
  const promoCode = await AdminPromoCode.findById(req.params.id);

  if (!promoCode) {
    return res.status(404).json({
      success: false,
      message: "Promo code not found",
    });
  }

  await AdminPromoCode.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: "Promo code deleted successfully",
  });
});

/**
 * @desc    Get active public promo codes (For users in Cart/Checkout)
 * @route   GET /api/admin/promo-codes/public/active
 * @access  Public / User
 */
export const getActivePublicPromoCodes = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const todayName = dayNames[now.getDay()];

  // Find promo codes that are active, within date range
  const promoCodes = await AdminPromoCode.find({
    isActive: true,
    startDate: { $lte: endOfToday },
    endDate: { $gte: startOfToday },
  })
    .select(
      "code title description discountType discountValue maxDiscount minOrderAmount startDate endDate validDays usageLimitPerUser applicableType"
    )
    .sort({ discountValue: -1 })
    .lean();

  // Filter or tag day validity
  const processed = promoCodes.map((p) => {
    const isDayValid =
      !p.validDays ||
      p.validDays.length === 0 ||
      p.validDays.map((d) => d.toLowerCase()).includes(todayName);

    return {
      ...p,
      isAvailableToday: isDayValid,
    };
  });

  res.status(200).json({
    success: true,
    data: { promoCodes: processed },
  });
});

/**
 * @desc    Validate a promo code for user checkout
 * @route   POST /api/admin/promo-codes/validate
 * @access  Public / User
 */
export const validatePromoCode = asyncHandler(async (req, res) => {
  const { code, subtotal, restaurantId } = req.body;
  const userId = req.user?._id || req.body.userId || null;

  if (!code || !String(code).trim()) {
    return res.status(400).json({
      success: false,
      message: "Please provide a promo code",
    });
  }

  const normalizedCode = String(code).trim().toUpperCase();

  const promoCode = await AdminPromoCode.findOne({
    code: normalizedCode,
  });

  if (!promoCode) {
    return res.status(200).json({
      success: false,
      message: `Invalid promo code '${normalizedCode}'`,
    });
  }

  const evaluation = promoCode.evaluateValidity({
    orderAmount: Number(subtotal || 0),
    currentDate: new Date(),
    restaurantId,
  });

  if (!evaluation.isValid) {
    return res.status(200).json({
      success: false,
      message: evaluation.reason || "Promo code cannot be applied",
    });
  }

  // Check per-user usage limit if user is authenticated
  if (userId && promoCode.usageLimitPerUser > 0) {
    const userUsageCount = await Order.countDocuments({
      userId,
      "pricing.adminOfferName": normalizedCode,
      status: { $ne: "cancelled" },
    });

    if (userUsageCount >= promoCode.usageLimitPerUser) {
      return res.status(200).json({
        success: false,
        message: `You have already used this promo code ${userUsageCount} time(s). Limit is ${promoCode.usageLimitPerUser}.`,
      });
    }
  }

  res.status(200).json({
    success: true,
    message: `Promo code '${normalizedCode}' applied successfully!`,
    data: {
      code: promoCode.code,
      title: promoCode.title,
      description: promoCode.description,
      discountType: promoCode.discountType,
      discountValue: promoCode.discountValue,
      discountAmount: evaluation.discountAmount,
      maxDiscount: promoCode.maxDiscount,
      minOrderAmount: promoCode.minOrderAmount,
    },
  });
});
