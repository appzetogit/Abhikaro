import DeliveryTermsAndCondition from "../models/DeliveryTermsAndCondition.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";

/**
 * Get Delivery Terms and Condition (Public)
 * GET /api/delivery-terms/public
 */
export const getDeliveryTermsPublic = asyncHandler(async (req, res) => {
  try {
    const terms = await DeliveryTermsAndCondition.findOne({ isActive: true })
      .select("-updatedBy -createdAt -updatedAt -__v")
      .lean();

    if (!terms) {
      return successResponse(
        res,
        200,
        "Delivery terms and conditions retrieved successfully",
        {
          title: "Delivery Terms and Conditions",
          content: "",
        },
      );
    }

    return successResponse(
      res,
      200,
      "Delivery terms and conditions retrieved successfully",
      terms,
    );
  } catch (error) {
    console.error("Error fetching delivery terms and conditions:", error);
    return errorResponse(res, 500, "Failed to fetch delivery terms and conditions");
  }
});

/**
 * Get Delivery Terms and Condition (Admin)
 * GET /api/admin/delivery-terms
 */
export const getDeliveryTerms = asyncHandler(async (req, res) => {
  try {
    const terms = await DeliveryTermsAndCondition.findOne({ isActive: true }).lean();

    if (!terms) {
      return successResponse(
        res,
        200,
        "Delivery terms and conditions retrieved successfully",
        {
          title: "Delivery Terms and Conditions",
          content: "",
        },
      );
    }

    return successResponse(
      res,
      200,
      "Delivery terms and conditions retrieved successfully",
      terms,
    );
  } catch (error) {
    console.error("Error fetching delivery terms and conditions:", error);
    return errorResponse(res, 500, "Failed to fetch delivery terms and conditions");
  }
});

/**
 * Update Delivery Terms and Condition (Admin)
 * PUT /api/admin/delivery-terms
 */
export const updateDeliveryTerms = asyncHandler(async (req, res) => {
  try {
    const { title, content } = req.body;

    if (content === undefined) {
      return errorResponse(res, 400, "Content is required");
    }

    let terms = await DeliveryTermsAndCondition.findOne({ isActive: true });

    if (!terms) {
      terms = new DeliveryTermsAndCondition({
        title: title || "Delivery Terms and Conditions",
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
      "Delivery terms and conditions updated successfully",
      terms,
    );
  } catch (error) {
    console.error("Error updating delivery terms and conditions:", error);
    return errorResponse(res, 500, "Failed to update delivery terms and conditions");
  }
});

