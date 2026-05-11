import HotelPrivacyPolicy from "../models/HotelPrivacyPolicy.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";

/**
 * Get Hotel Privacy Policy (Public)
 * GET /api/hotel-privacy/public
 */
export const getHotelPrivacyPublic = asyncHandler(async (req, res) => {
  try {
    const privacy = await HotelPrivacyPolicy.findOne({ isActive: true })
      .select("-updatedBy -createdAt -updatedAt -__v")
      .lean();

    if (!privacy) {
      return successResponse(
        res,
        200,
        "Hotel privacy policy retrieved successfully",
        {
          title: "Hotel Privacy Policy",
          content: "",
        },
      );
    }

    return successResponse(
      res,
      200,
      "Hotel privacy policy retrieved successfully",
      privacy,
    );
  } catch (error) {
    console.error("Error fetching hotel privacy policy:", error);
    return errorResponse(res, 500, "Failed to fetch hotel privacy policy");
  }
});

/**
 * Get Hotel Privacy Policy (Admin)
 * GET /api/admin/hotel-privacy
 */
export const getHotelPrivacy = asyncHandler(async (req, res) => {
  try {
    const privacy = await HotelPrivacyPolicy.findOne({ isActive: true }).lean();

    if (!privacy) {
      return successResponse(
        res,
        200,
        "Hotel privacy policy retrieved successfully",
        {
          title: "Hotel Privacy Policy",
          content: "",
        },
      );
    }

    return successResponse(
      res,
      200,
      "Hotel privacy policy retrieved successfully",
      privacy,
    );
  } catch (error) {
    console.error("Error fetching hotel privacy policy:", error);
    return errorResponse(res, 500, "Failed to fetch hotel privacy policy");
  }
});

/**
 * Update Hotel Privacy Policy (Admin)
 * PUT /api/admin/hotel-privacy
 */
export const updateHotelPrivacy = asyncHandler(async (req, res) => {
  try {
    const { title, content } = req.body;

    if (content === undefined) {
      return errorResponse(res, 400, "Content is required");
    }

    let privacy = await HotelPrivacyPolicy.findOne({ isActive: true });

    if (!privacy) {
      privacy = new HotelPrivacyPolicy({
        title: title || "Hotel Privacy Policy",
        content,
        updatedBy: req.admin?._id || null,
      });
    } else {
      if (title !== undefined) privacy.title = title;
      privacy.content = content;
      privacy.updatedBy = req.admin?._id || null;
    }

    await privacy.save();

    return successResponse(
      res,
      200,
      "Hotel privacy policy updated successfully",
      privacy,
    );
  } catch (error) {
    console.error("Error updating hotel privacy policy:", error);
    return errorResponse(res, 500, "Failed to update hotel privacy policy");
  }
});
