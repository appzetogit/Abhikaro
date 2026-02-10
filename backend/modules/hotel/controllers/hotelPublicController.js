import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import Hotel from "../models/Hotel.js";

/**
 * GET /api/hotel/public/:hotelId
 * Get hotel by hotelId for public viewing (QR code scanning)
 */
export const getHotelByHotelId = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;

  if (!hotelId) {
    return errorResponse(res, 400, "Hotel ID is required");
  }

  // Find hotel by hotelId or _id
  const hotel = await Hotel.findOne({
    $or: [
      { hotelId: hotelId },
      { _id: hotelId }
    ]
  }).select("-password -aadharCardImage -hotelRentProofImage -cancelledCheckImages");

  if (!hotel) {
    return errorResponse(res, 404, "Hotel not found");
  }

  // Return public hotel info (no sensitive data)
  return successResponse(res, 200, "Hotel fetched successfully", {
    hotel: {
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName,
      email: hotel.email,
      phone: hotel.phone,
      address: hotel.address,
      profileImage: hotel.profileImage,
      isActive: hotel.isActive,
      location: hotel.location,
    },
  });
});
