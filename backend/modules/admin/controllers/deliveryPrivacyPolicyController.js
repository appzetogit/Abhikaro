import DeliveryPrivacyPolicy from "../models/DeliveryPrivacyPolicy.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";

/**
 * Get Delivery Privacy Policy (Public)
 * GET /api/delivery-privacy/public
 */
export const getDeliveryPrivacyPublic = asyncHandler(async (req, res) => {
  try {
    const policy = await DeliveryPrivacyPolicy.findOne({ isActive: true })
      .select("-updatedBy -createdAt -updatedAt -__v")
      .lean();

    if (!policy) {
      return successResponse(res, 200, "Delivery privacy policy retrieved successfully", {
        title: "Delivery Privacy Policy",
        content: "",
      });
    }

    return successResponse(res, 200, "Delivery privacy policy retrieved successfully", policy);
  } catch (error) {
    console.error("Error fetching delivery privacy policy:", error);
    return errorResponse(res, 500, "Failed to fetch delivery privacy policy");
  }
});

/**
 * Get Delivery Privacy Policy (Admin)
 * GET /api/admin/delivery-privacy
 */
export const getDeliveryPrivacy = asyncHandler(async (req, res) => {
  try {
    const policy = await DeliveryPrivacyPolicy.findOne({ isActive: true }).lean();

    if (!policy) {
      return successResponse(res, 200, "Delivery privacy policy retrieved successfully", {
        title: "Delivery Privacy Policy",
        content: "",
      });
    }

    return successResponse(res, 200, "Delivery privacy policy retrieved successfully", policy);
  } catch (error) {
    console.error("Error fetching delivery privacy policy:", error);
    return errorResponse(res, 500, "Failed to fetch delivery privacy policy");
  }
});

/**
 * Update Delivery Privacy Policy (Admin)
 * PUT /api/admin/delivery-privacy
 */
export const updateDeliveryPrivacy = asyncHandler(async (req, res) => {
  try {
    const { title, content } = req.body;

    if (content === undefined) {
      return errorResponse(res, 400, "Content is required");
    }

    let policy = await DeliveryPrivacyPolicy.findOne({ isActive: true });

    if (!policy) {
      policy = new DeliveryPrivacyPolicy({
        title: title || "Delivery Privacy Policy",
        content,
        updatedBy: req.admin?._id || null,
      });
    } else {
      if (title !== undefined) policy.title = title;
      policy.content = content;
      policy.updatedBy = req.admin?._id || null;
    }

    await policy.save();

    return successResponse(res, 200, "Delivery privacy policy updated successfully", policy);
  } catch (error) {
    console.error("Error updating delivery privacy policy:", error);
    return errorResponse(res, 500, "Failed to update delivery privacy policy");
  }
});

