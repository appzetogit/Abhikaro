import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
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

  console.log("🔍 Public hotel fetch request:", {
    hotelId,
    params: req.params,
  });

  // Find hotel by hotelId or _id (support both MongoDB ObjectId and custom hotelId)
  let hotel = null;

  // Try by hotelId first (custom ID format like HOTEL-xxx)
  hotel = await Hotel.findOne({ hotelId: hotelId })
    .select(
      "-password -aadharCardImage -hotelRentProofImage -cancelledCheckImages",
    )
    .lean();

  // If not found and hotelId looks like MongoDB ObjectId, try by _id
  if (!hotel && /^[0-9a-fA-F]{24}$/.test(hotelId)) {
    const mongoose = (await import("mongoose")).default;
    if (mongoose.Types.ObjectId.isValid(hotelId)) {
      hotel = await Hotel.findById(hotelId)
        .select(
          "-password -aadharCardImage -hotelRentProofImage -cancelledCheckImages",
        )
        .lean();
    }
  }

  if (!hotel) {
    console.error("❌ Hotel not found:", {
      hotelId,
      searchedBy: ["hotelId", "_id"],
    });
    return errorResponse(res, 404, "Hotel not found");
  }

  console.log("✅ Hotel found:", {
    hotelId: hotel.hotelId,
    hotelName: hotel.hotelName,
    isActive: hotel.isActive,
  });

  // Return public hotel info (no sensitive data)
  return successResponse(res, 200, "Hotel fetched successfully", {
    hotel: {
      _id: hotel._id,
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

/**
 * GET /api/hotel/public/all
 * Get all active hotels for public viewing
 */
export const getAllHotels = asyncHandler(async (req, res) => {
  console.log("🔍 Fetching all public hotels");

  // Find all active hotels
  const hotels = await Hotel.find({ isActive: true })
    .select(
      "-password -aadharCardImage -hotelRentProofImage -cancelledCheckImages",
    )
    .lean();

  console.log(`✅ Found ${hotels.length} active hotels`);

  // Return public hotel info
  return successResponse(res, 200, "Hotels fetched successfully", {
    hotels: hotels.map((hotel) => ({
      _id: hotel._id,
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName,
      email: hotel.email,
      phone: hotel.phone,
      address: hotel.address,
      profileImage: hotel.profileImage,
      isActive: hotel.isActive,
      location: hotel.location,
    })),
  });
});
