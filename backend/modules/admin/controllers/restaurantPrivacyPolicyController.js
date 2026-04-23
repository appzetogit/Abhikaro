import RestaurantPrivacyPolicy from "../models/RestaurantPrivacyPolicy.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";

/**
 * Get Restaurant Privacy Policy (Public)
 * GET /api/restaurant/public/privacy
 */
export const getRestaurantPrivacyPublic = asyncHandler(async (req, res) => {
  try {
    const privacy = await RestaurantPrivacyPolicy.findOne({ isActive: true })
      .select("-updatedBy -createdAt -updatedAt -__v")
      .lean();

    if (!privacy) {
      return successResponse(res, 200, "Restaurant privacy policy retrieved successfully", {
        title: "Restaurant Privacy Policy",
        content: "<p>No privacy policy available at the moment.</p>",
      });
    }

    return successResponse(res, 200, "Restaurant privacy policy retrieved successfully", privacy);
  } catch (error) {
    console.error("Error fetching restaurant privacy policy:", error);
    return errorResponse(res, 500, "Failed to fetch restaurant privacy policy");
  }
});

/**
 * Get Restaurant Privacy Policy (Admin)
 * GET /api/admin/restaurant-privacy
 */
export const getRestaurantPrivacy = asyncHandler(async (req, res) => {
  try {
    let privacy = await RestaurantPrivacyPolicy.findOne({ isActive: true }).lean();

    if (!privacy) {
      privacy = await RestaurantPrivacyPolicy.create({
        title: "Restaurant Privacy Policy",
        content:
          '<p>Enter your restaurant Privacy Policy here.</p><p><br></p><p><strong>Note:</strong> This content will be shown inside the restaurant app.</p>',
        updatedBy: req.admin?._id || null,
      });
    }

    return successResponse(res, 200, "Restaurant privacy policy retrieved successfully", privacy);
  } catch (error) {
    console.error("Error fetching restaurant privacy policy:", error);
    return errorResponse(res, 500, "Failed to fetch restaurant privacy policy");
  }
});

/**
 * Update Restaurant Privacy Policy (Admin)
 * PUT /api/admin/restaurant-privacy
 */
export const updateRestaurantPrivacy = asyncHandler(async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!content) {
      return errorResponse(res, 400, "Content is required");
    }

    let privacy = await RestaurantPrivacyPolicy.findOne({ isActive: true });

    if (!privacy) {
      privacy = new RestaurantPrivacyPolicy({
        title: title || "Restaurant Privacy Policy",
        content,
        updatedBy: req.admin?._id || null,
      });
    } else {
      if (title !== undefined) privacy.title = title;
      privacy.content = content;
      privacy.updatedBy = req.admin?._id || null;
    }

    await privacy.save();

    return successResponse(res, 200, "Restaurant privacy policy updated successfully", privacy);
  } catch (error) {
    console.error("Error updating restaurant privacy policy:", error);
    return errorResponse(res, 500, "Failed to update restaurant privacy policy");
  }
});

