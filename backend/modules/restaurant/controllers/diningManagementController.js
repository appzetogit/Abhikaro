import Restaurant from "../models/Restaurant.js";
import RestaurantDiningOffer from "../models/RestaurantDiningOffer.js";
import Menu from "../models/Menu.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";

/**
 * Get dining config for current restaurant (restaurant auth)
 * GET /api/restaurant/dining-config
 */
export const getDiningConfig = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.restaurant._id)
    .select("name slug location profileImage deliveryTimings diningConfig diningSettings ownerName ownerPhone onboarding")
    .lean();
  if (!restaurant) return errorResponse(res, 404, "Restaurant not found");

  const diningConfig = restaurant.diningConfig || {};
  const diningSettings = restaurant.diningSettings || {};

  const adminAllowsDining =
    diningSettings.isEnabled === false ? false : true;
  // When admin has already enabled dining, don't show "pending" so restaurant doesn't see stale request message
  const requestStatus =
    adminAllowsDining && diningSettings.requestStatus === "pending"
      ? "none"
      : (diningSettings.requestStatus || "none");
  const recommendedCategorySlug = diningSettings.diningType || null;
  const adminMaxGuests = Number.isFinite(diningSettings.maxGuests)
    ? Math.max(1, Number(diningSettings.maxGuests))
    : null;

  // Get the actual restaurant name from onboarding if available, otherwise use restaurant.name
  let actualRestaurantName = restaurant.onboarding?.step1?.restaurantName || restaurant.name || "";
  
  // If restaurant.name itself is a default name, prefer onboarding name
  if (actualRestaurantName && /^restaurant\s*\d+$/i.test(actualRestaurantName.trim()) && restaurant.onboarding?.step1?.restaurantName) {
    actualRestaurantName = restaurant.onboarding.step1.restaurantName;
  }
  
  // Check if the saved name in diningConfig is a default/placeholder name (like "Restaurant 6911")
  // If so, replace it with the actual restaurant name
  const savedName = diningConfig.basicDetails?.name;
  const isDefaultName = savedName && /^restaurant\s*\d+$/i.test(savedName.trim());
  const displayName = (savedName && !isDefaultName) ? savedName : actualRestaurantName;
  
  // Auto-fix: If we detected a default name and have a valid actual name, update the database
  // This is a one-time fix to correct saved default names
  const needsNameUpdate = isDefaultName && actualRestaurantName && actualRestaurantName.trim() && !/^restaurant\s*\d+$/i.test(actualRestaurantName.trim());
  const existingSlug = diningConfig.pageControls?.diningSlug || restaurant.slug || "";
  const isDefaultSlug = existingSlug && /^restaurant-?\d+$/i.test(existingSlug);
  const needsSlugUpdate = isDefaultSlug && actualRestaurantName && !/^restaurant\s*\d+$/i.test(actualRestaurantName.trim());
  
  if (needsNameUpdate || needsSlugUpdate) {
    const updateData = {};
    if (needsNameUpdate) {
      updateData['diningConfig.basicDetails.name'] = actualRestaurantName;
    }
    if (needsSlugUpdate) {
      const newSlug = actualRestaurantName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      if (newSlug) {
        updateData['diningConfig.pageControls.diningSlug'] = newSlug;
      }
    }
    
    // Update the restaurant document (fire and forget)
    if (Object.keys(updateData).length > 0) {
      Restaurant.findByIdAndUpdate(req.restaurant._id, {
        $set: updateData
      }).catch(err => {
        // Log error but don't fail the request
        console.error('Failed to auto-update diningConfig:', err);
      });
    }
  }

  const merged = {
    ...diningConfig,
    basicDetails: {
      name: displayName,
      address:
        diningConfig.basicDetails?.address ??
        restaurant.location?.formattedAddress ??
        restaurant.location?.address ??
        "",
      description: diningConfig.basicDetails?.description ?? "",
      costForTwo: diningConfig.basicDetails?.costForTwo ?? null,
      openingTime:
        diningConfig.basicDetails?.openingTime ??
        restaurant.deliveryTimings?.openingTime ??
        "12:00",
      closingTime:
        diningConfig.basicDetails?.closingTime ??
        restaurant.deliveryTimings?.closingTime ??
        "23:59",
      isOpen: diningConfig.basicDetails?.isOpen ?? true,
    },
    coverImage: diningConfig.coverImage || restaurant.profileImage || {},
    gallery: diningConfig.gallery || [],
    tableBooking: diningConfig.tableBooking || {
      enabled: false,
      timeSlots: [],
      minGuestsPerBooking: 1,
      maxGuestsPerBooking: 10,
      approvalMode: "manual",
    },
    seatingCapacity: diningConfig.seatingCapacity ?? null,
    pageControls: (() => {
      const existingPageControls = diningConfig.pageControls || {};
      let diningSlug = existingPageControls.diningSlug || restaurant.slug || "";
      
      // If the slug is based on a default name pattern (like "restaurant-6911"), generate a new one from actual name
      if (diningSlug && /^restaurant-?\d+$/i.test(diningSlug) && actualRestaurantName && !/^restaurant\s*\d+$/i.test(actualRestaurantName.trim())) {
        // Generate slug from actual restaurant name
        diningSlug = actualRestaurantName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        
        // If generated slug is empty, fall back to restaurant.slug
        if (!diningSlug) {
          diningSlug = restaurant.slug || "";
        }
      }
      
      return {
        reviewsEnabled: existingPageControls.reviewsEnabled !== false,
        shareEnabled: existingPageControls.shareEnabled !== false,
        diningSlug: diningSlug,
      };
    })(),
    categories: diningConfig.categories || [],
    enabled: diningConfig.enabled ?? false,
    effectiveEnabled:
      (diningConfig.enabled ?? false) && adminAllowsDining,
    adminControls: {
      isEnabledByAdmin: adminAllowsDining,
      requestStatus,
      lastRequestAt: diningSettings.lastRequestAt || null,
      lastDecisionAt: diningSettings.lastDecisionAt || null,
      recommendedCategorySlug,
      maxGuests: adminMaxGuests,
    },
  };

  return successResponse(res, 200, "Dining config retrieved", {
    diningConfig: merged,
    restaurantId: restaurant._id,
    slug: restaurant.slug,
    ownerName: restaurant.ownerName || null,
    ownerPhone: restaurant.ownerPhone || null,
  });
});

/**
 * Update dining config (restaurant auth)
 * PATCH /api/restaurant/dining-config
 */
export const updateDiningConfig = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const body = req.body;

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) return errorResponse(res, 404, "Restaurant not found");

  if (!restaurant.diningConfig) restaurant.diningConfig = {};
  if (!restaurant.diningSettings) restaurant.diningSettings = {};

  const adminHasDisabled =
    restaurant.diningSettings.isEnabled === false;
  const hasPendingRequest =
    restaurant.diningSettings.requestStatus === "pending";

  // Only block enabling when admin has explicitly disabled. If admin has already enabled, allow and clear stale pending.
  if (body.enabled === true && adminHasDisabled) {
    return errorResponse(
      res,
      403,
      hasPendingRequest
        ? "Dining enable request is pending with admin. You cannot enable dining until it is approved."
        : "Dining service is currently disabled by admin. Please send a request to enable.",
    );
  }

  if (body.enabled !== undefined)
    restaurant.diningConfig.enabled = !!body.enabled;

  // When admin has already enabled dining, clear stale pending request so UI stops showing "request pending"
  if (body.enabled === true && hasPendingRequest && !adminHasDisabled) {
    restaurant.diningSettings.requestStatus = "none";
    restaurant.diningSettings.lastDecisionAt = new Date();
  }

  // Build a fresh diningConfig object so Mongoose persists all nested fields (e.g. basicDetails.description)
  const existing = restaurant.diningConfig || {};
  const existingBasic = existing.basicDetails || {};
  const existingTable = existing.tableBooking || {};
  const existingPage = existing.pageControls || {};

  const basicDetails = body.basicDetails
    ? {
        name: body.basicDetails.name !== undefined ? body.basicDetails.name : existingBasic.name,
        address: body.basicDetails.address !== undefined ? body.basicDetails.address : existingBasic.address,
        description: body.basicDetails.description !== undefined ? body.basicDetails.description : existingBasic.description,
        costForTwo: body.basicDetails.costForTwo !== undefined ? (body.basicDetails.costForTwo == null ? null : Number(body.basicDetails.costForTwo)) : existingBasic.costForTwo,
        openingTime: body.basicDetails.openingTime !== undefined ? body.basicDetails.openingTime : existingBasic.openingTime,
        closingTime: body.basicDetails.closingTime !== undefined ? body.basicDetails.closingTime : existingBasic.closingTime,
        isOpen: body.basicDetails.isOpen !== undefined ? !!body.basicDetails.isOpen : existingBasic.isOpen,
      }
    : existingBasic;

  const tableBooking = body.tableBooking
    ? {
        enabled: body.tableBooking.enabled !== undefined ? !!body.tableBooking.enabled : existingTable.enabled,
        timeSlots: body.tableBooking.timeSlots !== undefined ? (Array.isArray(body.tableBooking.timeSlots) ? body.tableBooking.timeSlots : []) : existingTable.timeSlots,
        minGuestsPerBooking: body.tableBooking.minGuestsPerBooking !== undefined ? (Number(body.tableBooking.minGuestsPerBooking) || 1) : existingTable.minGuestsPerBooking,
        maxGuestsPerBooking: body.tableBooking.maxGuestsPerBooking !== undefined ? (Number(body.tableBooking.maxGuestsPerBooking) || 10) : existingTable.maxGuestsPerBooking,
        approvalMode: body.tableBooking.approvalMode !== undefined ? (body.tableBooking.approvalMode === "auto" ? "auto" : "manual") : existingTable.approvalMode,
      }
    : existingTable;

  let pageControls = { ...existingPage };
  if (body.pageControls) {
    if (body.pageControls.reviewsEnabled !== undefined) pageControls.reviewsEnabled = !!body.pageControls.reviewsEnabled;
    if (body.pageControls.shareEnabled !== undefined) pageControls.shareEnabled = !!body.pageControls.shareEnabled;
    if (body.pageControls.diningSlug !== undefined) {
      const slug = String(body.pageControls.diningSlug)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/(^-|-$)/g, "");
      const existingRest = await Restaurant.findOne({ slug, _id: { $ne: restaurantId } });
      if (existingRest) return errorResponse(res, 400, "This dining slug is already taken");
      restaurant.slug = slug || restaurant.slug;
      pageControls.diningSlug = slug || restaurant.slug;
    }
  }

  restaurant.diningConfig = {
    ...existing,
    enabled: body.enabled !== undefined ? !!body.enabled : existing.enabled,
    basicDetails,
    coverImage: body.coverImage !== undefined ? body.coverImage : existing.coverImage,
    gallery: body.gallery !== undefined ? (Array.isArray(body.gallery) ? body.gallery : []) : (existing.gallery || []),
    tableBooking,
    seatingCapacity: body.seatingCapacity !== undefined ? (body.seatingCapacity == null ? null : Math.max(0, Number(body.seatingCapacity))) : existing.seatingCapacity,
    pageControls,
    categories: body.categories !== undefined ? (Array.isArray(body.categories) ? body.categories : []) : (existing.categories || []),
  };

  await restaurant.save();
  return successResponse(res, 200, "Dining config updated", {
    diningConfig: restaurant.diningConfig,
  });
});

/**
 * Create a dining enable request (restaurant auth)
 * POST /api/restaurant/dining-config/request-enable
 */
export const requestDiningEnable = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) return errorResponse(res, 404, "Restaurant not found");

  if (!restaurant.diningSettings) {
    restaurant.diningSettings = {};
  }

  if (restaurant.diningSettings.isEnabled !== false) {
    return errorResponse(
      res,
      400,
      "Dining is already enabled by admin for this restaurant.",
    );
  }

  if (restaurant.diningSettings.requestStatus === "pending") {
    return errorResponse(
      res,
      400,
      "You already have a pending dining enable request.",
    );
  }

  restaurant.diningSettings.requestStatus = "pending";
  restaurant.diningSettings.lastRequestAt = new Date();

  await restaurant.save();

  return successResponse(res, 200, "Dining enable request sent to admin.", {
    diningSettings: restaurant.diningSettings,
  });
});

/**
 * Update seating capacity only (admin only)
 * PATCH /api/admin/restaurants/:id/dining-seating
 */
export const updateDiningSeating = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { seatingCapacity } = req.body;

  const restaurant = await Restaurant.findById(id);
  if (!restaurant) return errorResponse(res, 404, "Restaurant not found");

  if (!restaurant.diningConfig) restaurant.diningConfig = {};
  restaurant.diningConfig.seatingCapacity =
    seatingCapacity == null ? null : Math.max(0, Number(seatingCapacity));
  await restaurant.save();

  return successResponse(res, 200, "Seating capacity updated", {
    seatingCapacity: restaurant.diningConfig.seatingCapacity,
  });
});

/**
 * Get dining offers for current restaurant
 * GET /api/restaurant/dining-offers
 */
export const getDiningOffers = asyncHandler(async (req, res) => {
  const offers = await RestaurantDiningOffer.find({
    restaurant: req.restaurant._id,
  })
    .sort({ order: 1, createdAt: -1 })
    .lean();
  return successResponse(res, 200, "Dining offers retrieved", { offers });
});

/**
 * Create dining offer
 * POST /api/restaurant/dining-offers
 */
export const createDiningOffer = asyncHandler(async (req, res) => {
  const {
    type,
    title,
    description,
    discountType,
    discountValue,
    validFrom,
    validTo,
    isActive,
  } = req.body;
  if (!type || !["prebook", "walkin"].includes(type))
    return errorResponse(res, 400, "Valid type (prebook or walkin) required");
  if (
    !title ||
    !discountType ||
    !["flat", "percentage"].includes(discountType) ||
    discountValue == null
  )
    return errorResponse(
      res,
      400,
      "title, discountType (flat/percentage), discountValue required",
    );
  if (!validFrom || !validTo)
    return errorResponse(res, 400, "validFrom and validTo required");

  const offer = await RestaurantDiningOffer.create({
    restaurant: req.restaurant._id,
    type,
    title: String(title).trim(),
    description: description ? String(description).trim() : "",
    discountType,
    discountValue: Number(discountValue),
    validFrom: new Date(validFrom),
    validTo: new Date(validTo),
    isActive: isActive !== false,
  });
  return successResponse(res, 201, "Dining offer created", { offer });
});

/**
 * Update dining offer
 * PATCH /api/restaurant/dining-offers/:offerId
 */
export const updateDiningOffer = asyncHandler(async (req, res) => {
  const offer = await RestaurantDiningOffer.findOne({
    _id: req.params.offerId,
    restaurant: req.restaurant._id,
  });
  if (!offer) return errorResponse(res, 404, "Offer not found");

  const {
    type,
    title,
    description,
    discountType,
    discountValue,
    validFrom,
    validTo,
    isActive,
  } = req.body;
  if (type !== undefined)
    offer.type = ["prebook", "walkin"].includes(type) ? type : offer.type;
  if (title !== undefined) offer.title = String(title).trim();
  if (description !== undefined) offer.description = String(description).trim();
  if (discountType !== undefined)
    offer.discountType = ["flat", "percentage"].includes(discountType)
      ? discountType
      : offer.discountType;
  if (discountValue !== undefined) offer.discountValue = Number(discountValue);
  if (validFrom !== undefined) offer.validFrom = new Date(validFrom);
  if (validTo !== undefined) offer.validTo = new Date(validTo);
  if (isActive !== undefined) offer.isActive = !!isActive;
  await offer.save();
  return successResponse(res, 200, "Offer updated", { offer });
});

/**
 * Delete dining offer
 * DELETE /api/restaurant/dining-offers/:offerId
 */
export const deleteDiningOffer = asyncHandler(async (req, res) => {
  const deleted = await RestaurantDiningOffer.findOneAndDelete({
    _id: req.params.offerId,
    restaurant: req.restaurant._id,
  });
  if (!deleted) return errorResponse(res, 404, "Offer not found");
  return successResponse(res, 200, "Offer deleted");
});

/**
 * Get dining menu
 * GET /api/restaurant/dining-menu
 */
export const getDiningMenu = asyncHandler(async (req, res) => {
  const menu = await Menu.findOne({ restaurant: req.restaurant._id }).lean();
  if (!menu)
    return successResponse(res, 200, "Dining menu", {
      sections: [],
      addons: [],
    });
  const sections = (menu.sections || []).map((sec) => ({
    ...sec,
    items: (sec.items || []).map((item) => ({
      ...item,
      dineInPrice: item.dineInPrice ?? item.price,
      availableForDining: item.availableForDining !== false,
    })),
    subsections: (sec.subsections || []).map((sub) => ({
      ...sub,
      items: (sub.items || []).map((item) => ({
        ...item,
        dineInPrice: item.dineInPrice ?? item.price,
        availableForDining: item.availableForDining !== false,
      })),
    })),
  }));
  return successResponse(res, 200, "Dining menu", {
    sections,
    addons: menu.addons || [],
  });
});

/**
 * Update dine-in item
 * PATCH /api/restaurant/dining-menu/items
 */
export const updateDiningMenuItem = asyncHandler(async (req, res) => {
  const { sectionId, itemId, subsectionId, dineInPrice, availableForDining } =
    req.body;
  if (!sectionId || !itemId)
    return errorResponse(res, 400, "sectionId and itemId required");

  const menu = await Menu.findOne({ restaurant: req.restaurant._id });
  if (!menu || !menu.sections) return errorResponse(res, 404, "Menu not found");

  let updated = false;
  for (const section of menu.sections) {
    if (section.id !== sectionId) continue;
    if (subsectionId) {
      const sub = (section.subsections || []).find(
        (s) => s.id === subsectionId,
      );
      if (sub) {
        const item = (sub.items || []).find((i) => i.id === itemId);
        if (item) {
          if (dineInPrice !== undefined)
            item.dineInPrice = dineInPrice == null ? null : Number(dineInPrice);
          if (availableForDining !== undefined)
            item.availableForDining = !!availableForDining;
          updated = true;
          break;
        }
      }
    } else {
      const item = (section.items || []).find((i) => i.id === itemId);
      if (item) {
        if (dineInPrice !== undefined)
          item.dineInPrice = dineInPrice == null ? null : Number(dineInPrice);
        if (availableForDining !== undefined)
          item.availableForDining = !!availableForDining;
        updated = true;
        break;
      }
    }
  }
  if (!updated) return errorResponse(res, 404, "Item not found");
  await menu.save();
  return successResponse(res, 200, "Dining menu item updated");
});
