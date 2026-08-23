import RestaurantTermsAndCondition from "../models/RestaurantTermsAndCondition.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";

let getIO = null;
async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import("../../../server.js");
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

/**
 * Get Restaurant Terms and Condition (Public)
 * GET /api/restaurant/public/terms
 */
export const getRestaurantTermsPublic = asyncHandler(async (req, res) => {
  try {
    const terms = await RestaurantTermsAndCondition.findOne({ isActive: true })
      .select("-updatedBy -createdAt -__v")
      .lean();

    if (!terms) {
      return successResponse(
        res,
        200,
        "Restaurant terms and conditions retrieved successfully",
        {
          title: "Restaurant Terms and Conditions",
          content: "<p>No terms and conditions available at the moment.</p>",
          version: 1,
          updatedAt: new Date(),
        },
      );
    }

    return successResponse(
      res,
      200,
      "Restaurant terms and conditions retrieved successfully",
      terms,
    );
  } catch (error) {
    console.error("Error fetching restaurant terms and conditions:", error);
    return errorResponse(res, 500, "Failed to fetch restaurant terms and conditions");
  }
});

/**
 * Get Restaurant Terms and Condition (Admin)
 * GET /api/admin/restaurant-terms
 */
export const getRestaurantTerms = asyncHandler(async (req, res) => {
  try {
    let terms = await RestaurantTermsAndCondition.findOne({ isActive: true }).lean();

    if (!terms) {
      terms = await RestaurantTermsAndCondition.create({
        title: "Restaurant Terms and Conditions",
        content:
          '<p>Enter your restaurant Terms &amp; Conditions here.</p><p><br></p><p><strong>Note:</strong> This content will be shown inside the restaurant app.</p>',
        updatedBy: req.admin?._id || null,
        version: 1,
      });
    }

    return successResponse(
      res,
      200,
      "Restaurant terms and conditions retrieved successfully",
      terms,
    );
  } catch (error) {
    console.error("Error fetching restaurant terms and conditions:", error);
    return errorResponse(res, 500, "Failed to fetch restaurant terms and conditions");
  }
});

/**
 * Update Restaurant Terms and Condition (Admin)
 * PUT /api/admin/restaurant-terms
 */
export const updateRestaurantTerms = asyncHandler(async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!content) {
      return errorResponse(res, 400, "Content is required");
    }

    let terms = await RestaurantTermsAndCondition.findOne({ isActive: true });

    if (!terms) {
      terms = new RestaurantTermsAndCondition({
        title: title || "Restaurant Terms and Conditions",
        content,
        updatedBy: req.admin?._id || null,
        version: 1,
      });
    } else {
      if (title !== undefined) terms.title = title;
      terms.content = content;
      terms.updatedBy = req.admin?._id || null;
      terms.version = (terms.version || 1) + 1;
    }

    await terms.save();

    // Broadcast real-time update to all connected restaurant clients
    try {
      const io = await getIOInstance();
      if (io) {
        io.emit("restaurant_terms_updated", {
          version: terms.version,
          updatedAt: terms.updatedAt,
          title: terms.title,
        });
      }
    } catch (socketErr) {
      console.warn("Could not emit restaurant_terms_updated socket event:", socketErr?.message);
    }

    return successResponse(
      res,
      200,
      "Restaurant terms and conditions updated successfully",
      terms,
    );
  } catch (error) {
    console.error("Error updating restaurant terms and conditions:", error);
    return errorResponse(res, 500, "Failed to update restaurant terms and conditions");
  }
});

