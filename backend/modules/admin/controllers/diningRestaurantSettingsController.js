import Restaurant from "../../restaurant/models/Restaurant.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";

/**
 * Update Restaurant Dining Commission (%)
 * PATCH /api/admin/restaurants/:id/dining-commission
 * Body: { diningCommissionPercentage: number (0-100) }
 */
export const updateRestaurantDiningCommission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { diningCommissionPercentage } = req.body;

  if (
    typeof diningCommissionPercentage !== "number" ||
    diningCommissionPercentage < 0 ||
    diningCommissionPercentage > 100
  ) {
    return errorResponse(
      res,
      400,
      "Dining commission must be a number between 0 and 100"
    );
  }

  const restaurant = await Restaurant.findById(id);
  if (!restaurant) {
    return errorResponse(res, 404, "Restaurant not found");
  }

  restaurant.diningCommissionPercentage = diningCommissionPercentage;
  await restaurant.save();

  return successResponse(res, 200, "Dining commission updated successfully", {
    restaurant: {
      id: restaurant._id,
      diningCommissionPercentage: restaurant.diningCommissionPercentage,
    },
  });
});
