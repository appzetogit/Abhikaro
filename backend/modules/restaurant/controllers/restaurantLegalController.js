import RestaurantTermsAndCondition from "../../admin/models/RestaurantTermsAndCondition.js";
import Restaurant from "../models/Restaurant.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";

/**
 * Get Terms Acceptance Status for the authenticated restaurant
 * GET /api/restaurant/legal/terms-status
 */
export const getTermsAcceptanceStatus = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant?._id;
    if (!restaurantId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const [restaurant, activeTerms] = await Promise.all([
      Restaurant.findById(restaurantId).select("termsAcceptance name").lean(),
      RestaurantTermsAndCondition.findOne({ isActive: true }).lean(),
    ]);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // If no terms exist at all in DB, no acceptance required
    if (!activeTerms || !activeTerms.content) {
      return successResponse(res, 200, "Terms status retrieved", {
        requiresAcceptance: false,
        terms: null,
        termsAcceptance: restaurant.termsAcceptance || null,
      });
    }

    const acceptance = restaurant.termsAcceptance;
    let requiresAcceptance = false;

    if (!acceptance || !acceptance.isAccepted) {
      requiresAcceptance = true;
    } else if (activeTerms.updatedAt && acceptance.termsUpdatedAt) {
      // Check if terms were updated after the restaurant's last acceptance
      const termsUpdatedTime = new Date(activeTerms.updatedAt).getTime();
      const restaurantAcceptedTime = new Date(acceptance.termsUpdatedAt).getTime();
      if (termsUpdatedTime > restaurantAcceptedTime + 1000) {
        requiresAcceptance = true;
      }
    } else if (activeTerms.version && acceptance.version) {
      if (activeTerms.version > acceptance.version) {
        requiresAcceptance = true;
      }
    }

    return successResponse(res, 200, "Terms status retrieved", {
      requiresAcceptance,
      terms: {
        title: activeTerms.title || "Terms & Conditions",
        content: activeTerms.content || "",
        version: activeTerms.version || 1,
        updatedAt: activeTerms.updatedAt,
      },
      termsAcceptance: acceptance || null,
    });
  } catch (error) {
    console.error("Error checking terms acceptance status:", error);
    return errorResponse(res, 500, "Failed to check terms acceptance status");
  }
});

/**
 * Accept Terms & Conditions for the authenticated restaurant
 * POST /api/restaurant/legal/accept-terms
 */
export const acceptTerms = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant?._id;
    if (!restaurantId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const [restaurant, activeTerms] = await Promise.all([
      Restaurant.findById(restaurantId),
      RestaurantTermsAndCondition.findOne({ isActive: true }),
    ]);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const now = new Date();
    restaurant.termsAcceptance = {
      isAccepted: true,
      acceptedAt: now,
      version: activeTerms?.version || 1,
      termsUpdatedAt: activeTerms?.updatedAt || now,
    };

    await restaurant.save();

    return successResponse(
      res,
      200,
      "Terms and conditions accepted successfully",
      {
        termsAcceptance: restaurant.termsAcceptance,
      },
    );
  } catch (error) {
    console.error("Error accepting terms and conditions:", error);
    return errorResponse(res, 500, "Failed to accept terms and conditions");
  }
});
