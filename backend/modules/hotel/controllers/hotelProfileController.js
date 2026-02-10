import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import Hotel from "../models/Hotel.js";

/**
 * GET /api/hotel/profile
 * Returns the authenticated hotel's profile
 */
export const getHotelProfile = asyncHandler(async (req, res) => {
  const hotel = req.hotel;
  return successResponse(res, 200, "Hotel profile fetched successfully", {
    hotel,
  });
});

/**
 * PUT /api/hotel/profile
 * Updates authenticated hotel's profile fields
 */
export const updateHotelProfile = asyncHandler(async (req, res) => {
  const hotelId = req.hotel?._id;
  if (!hotelId) return errorResponse(res, 401, "Unauthorized");

  const updates = {};
  const allowed = [
    "hotelName",
    "email",
    "address",
    "profileImage",
    "aadharCardImage",
    "hotelRentProofImage",
    "cancelledCheckImages",
    "isActive",
  ];

  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  // Normalize email if provided
  if (updates.email && typeof updates.email === "string") {
    updates.email = updates.email.toLowerCase().trim();
  }

  const updatedHotel = await Hotel.findByIdAndUpdate(hotelId, updates, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!updatedHotel) return errorResponse(res, 404, "Hotel not found");

  return successResponse(res, 200, "Hotel profile updated successfully", {
    hotel: updatedHotel,
  });
});

/**
 * GET /api/hotel/qr-code
 * Returns unique QR code data for the authenticated hotel
 * If QR code already exists, returns it. Otherwise generates and saves a new one.
 */
export const getHotelQRCode = asyncHandler(async (req, res) => {
  const hotel = req.hotel;
  
  if (!hotel) {
    return errorResponse(res, 401, "Unauthorized");
  }

  // Check if QR code already exists
  if (hotel.qrCode) {
    // If QR code is in old JSON format, convert it to URL format
    let qrData = hotel.qrCode;
    try {
      const parsed = JSON.parse(hotel.qrCode);
      // If it's JSON format (old), convert to URL
      if (parsed.type === "hotel" && parsed.hotelId) {
        const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || "http://localhost:5173";
        qrData = `${frontendUrl}/hotel/view/${parsed.hotelId}?hotelRef=${parsed.hotelId}`;
        // Update in database
        hotel.qrCode = qrData;
        await hotel.save();
      }
    } catch (e) {
      // Not JSON, assume it's already a URL
    }
    
    return successResponse(res, 200, "QR code data fetched successfully", {
      qrData: qrData,
      hotelId: hotel.hotelId || hotel._id.toString(),
      hotelName: hotel.hotelName,
      alreadyGenerated: true,
    });
  }

  // Generate QR code URL that links to this hotel with reference parameter
  // Get frontend URL from environment or use default
  const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || "http://localhost:5173";
  const hotelId = hotel.hotelId || hotel._id.toString();
  
  // Create URL that will open hotel details page with hotel reference for order tracking
  const qrPayload = `${frontendUrl}/hotel/view/${hotelId}?hotelRef=${hotelId}`;

  console.log("🔗 Generating QR code:", {
    frontendUrl,
    hotelId,
    qrPayload,
    env: {
      FRONTEND_URL: process.env.FRONTEND_URL,
      VITE_FRONTEND_URL: process.env.VITE_FRONTEND_URL
    }
  });

  // Save QR code to database
  hotel.qrCode = qrPayload;
  await hotel.save();

  return successResponse(res, 200, "QR code generated and saved successfully", {
    qrData: qrPayload,
    hotelId: hotel.hotelId || hotel._id.toString(),
    hotelName: hotel.hotelName,
    alreadyGenerated: false,
  });
});
