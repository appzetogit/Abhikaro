import HotelTermsAndCondition from "../models/HotelTermsAndCondition.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";

/**
 * Get Hotel Terms and Condition (Public)
 * GET /api/hotel-terms/public
 */
export const getHotelTermsPublic = asyncHandler(async (req, res) => {
  try {
    const terms = await HotelTermsAndCondition.findOne({ isActive: true })
      .select("-updatedBy -createdAt -updatedAt -__v")
      .lean();

    if (!terms) {
      return successResponse(
        res,
        200,
        "Hotel terms and conditions retrieved successfully",
        {
          title: "Hotel Terms and Conditions",
          content: "",
        },
      );
    }

    return successResponse(
      res,
      200,
      "Hotel terms and conditions retrieved successfully",
      terms,
    );
  } catch (error) {
    console.error("Error fetching hotel terms and conditions:", error);
    return errorResponse(res, 500, "Failed to fetch hotel terms and conditions");
  }
});

/**
 * Get Hotel Terms and Condition (Admin)
 * GET /api/admin/hotel-terms
 */
export const getHotelTerms = asyncHandler(async (req, res) => {
  try {
    const terms = await HotelTermsAndCondition.findOne({ isActive: true }).lean();

    if (!terms) {
      return successResponse(
        res,
        200,
        "Hotel terms and conditions retrieved successfully",
        {
          title: "Hotel Terms and Conditions",
          content: "",
        },
      );
    }

    return successResponse(
      res,
      200,
      "Hotel terms and conditions retrieved successfully",
      terms,
    );
  } catch (error) {
    console.error("Error fetching hotel terms and conditions:", error);
    return errorResponse(res, 500, "Failed to fetch hotel terms and conditions");
  }
});

/**
 * Update Hotel Terms and Condition (Admin)
 * PUT /api/admin/hotel-terms
 */
export const updateHotelTerms = asyncHandler(async (req, res) => {
  try {
    const { title, content } = req.body;

    if (content === undefined) {
      return errorResponse(res, 400, "Content is required");
    }

    let terms = await HotelTermsAndCondition.findOne({ isActive: true });

    if (!terms) {
      terms = new HotelTermsAndCondition({
        title: title || "Hotel Terms and Conditions",
        content,
        updatedBy: req.admin?._id || null,
      });
    } else {
      if (title !== undefined) terms.title = title;
      terms.content = content;
      terms.updatedBy = req.admin?._id || null;
    }

    await terms.save();

    return successResponse(
      res,
      200,
      "Hotel terms and conditions updated successfully",
      terms,
    );
  } catch (error) {
    console.error("Error updating hotel terms and conditions:", error);
    return errorResponse(res, 500, "Failed to update hotel terms and conditions");
  }
});

