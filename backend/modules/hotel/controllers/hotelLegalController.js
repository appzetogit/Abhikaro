import HotelTermsAndCondition from "../../admin/models/HotelTermsAndCondition.js";
import Hotel from "../models/Hotel.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";

/**
 * Get Terms Acceptance Status for the authenticated hotel
 * GET /api/hotel/legal/terms-status
 */
export const getHotelTermsAcceptanceStatus = asyncHandler(async (req, res) => {
  try {
    const hotelId = req.hotel?._id;
    if (!hotelId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const [hotel, activeTerms] = await Promise.all([
      Hotel.findById(hotelId).select("termsAcceptance hotelName").lean(),
      HotelTermsAndCondition.findOne({ isActive: true }).lean(),
    ]);

    if (!hotel) {
      return errorResponse(res, 404, "Hotel not found");
    }

    // If no terms exist at all in DB, no acceptance required
    if (!activeTerms || !activeTerms.content) {
      return successResponse(res, 200, "Terms status retrieved", {
        requiresAcceptance: false,
        terms: null,
        termsAcceptance: hotel.termsAcceptance || null,
      });
    }

    const acceptance = hotel.termsAcceptance;
    let requiresAcceptance = false;

    if (!acceptance || !acceptance.isAccepted) {
      requiresAcceptance = true;
    } else if (activeTerms.updatedAt && acceptance.termsUpdatedAt) {
      const termsUpdatedTime = new Date(activeTerms.updatedAt).getTime();
      const hotelAcceptedTime = new Date(acceptance.termsUpdatedAt).getTime();
      if (termsUpdatedTime > hotelAcceptedTime + 1000) {
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
        title: activeTerms.title || "Hotel Terms and Conditions",
        content: activeTerms.content || "",
        version: activeTerms.version || 1,
        updatedAt: activeTerms.updatedAt,
      },
      termsAcceptance: acceptance || null,
    });
  } catch (error) {
    console.error("Error checking hotel terms acceptance status:", error);
    return errorResponse(res, 500, "Failed to check hotel terms acceptance status");
  }
});

/**
 * Accept Terms & Conditions for the authenticated hotel
 * POST /api/hotel/legal/accept-terms
 */
export const acceptHotelTerms = asyncHandler(async (req, res) => {
  try {
    const hotelId = req.hotel?._id;
    if (!hotelId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const [hotel, activeTerms] = await Promise.all([
      Hotel.findById(hotelId),
      HotelTermsAndCondition.findOne({ isActive: true }),
    ]);

    if (!hotel) {
      return errorResponse(res, 404, "Hotel not found");
    }

    const now = new Date();
    hotel.termsAcceptance = {
      isAccepted: true,
      acceptedAt: now,
      version: activeTerms?.version || 1,
      termsUpdatedAt: activeTerms?.updatedAt || now,
    };

    await hotel.save();

    return successResponse(
      res,
      200,
      "Hotel terms and conditions accepted successfully",
      {
        termsAcceptance: hotel.termsAcceptance,
      },
    );
  } catch (error) {
    console.error("Error accepting hotel terms and conditions:", error);
    return errorResponse(res, 500, "Failed to accept hotel terms and conditions");
  }
});
