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
    "aadharCardFront",
    "aadharCardBack",
    "panCardFront",
    "panCardBack",
    "hotelAddressVerifyDocumentFront",
    "bankPassbookFront",
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
    // Get correct frontend URL
    const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || 
      (process.env.NODE_ENV === 'production' ? 'https://foods.abhikaro.in' : 'http://localhost:5173');
    
    const hotelId = hotel.hotelId || hotel._id.toString();

    // If QR code is in old JSON format, convert it to the public landing URL
    let qrData = hotel.qrCode;
    let needsUpdate = false;
    
    try {
      const parsed = JSON.parse(hotel.qrCode);
      // If it's JSON format (old), convert to URL
      if (parsed.type === "hotel" && parsed.hotelId) {
        qrData = `${frontendUrl}/hotel-menu?ref=${parsed.hotelId}`;
        needsUpdate = true;
      }
    } catch (e) {
      // Not JSON, assume it's already a URL
      // Normalize:
      // - ensure it points to /hotel-menu?ref=...
      // - ensure origin matches current environment (dev/prod)
      if (qrData && typeof qrData === 'string') {
        try {
          const existing = new URL(qrData);
          const current = new URL(frontendUrl);
          const isProd = process.env.NODE_ENV === 'production';

          const refParam =
            existing.searchParams.get('ref') ||
            existing.searchParams.get('hotelRef') ||
            null;
          const hotelIdFromPath =
            existing.pathname.match(/\/hotel\/view\/([^/?]+)/)?.[1] ||
            existing.pathname.match(/\/hotel-menu\/([^/?]+)/)?.[1] ||
            null;
          const derivedHotelId = refParam || hotelIdFromPath || hotelId;

          const shouldRealignOrigin = existing.origin !== current.origin;
          const isExpectedPath = existing.pathname === '/hotel-menu' && existing.searchParams.get('ref');

          // In dev/staging it's common to have stored prod origin; realign it.
          // Also migrate any legacy /hotel/view links to the public landing route.
          if ((!isProd && shouldRealignOrigin) || !isExpectedPath) {
            qrData = `${current.origin}/hotel-menu?ref=${derivedHotelId}`;
            needsUpdate = true;
          }
        } catch {
          // Fallback: if string contains a recognizable host mismatch pattern, rebuild
          const hotelIdMatch = qrData.match(/\/hotel\/view\/([^/?]+)/);
          const hotelRefMatch = qrData.match(/hotelRef=([^&]+)/);
          const refMatch = qrData.match(/[?&]ref=([^&]+)/);
          const derivedHotelId =
            (refMatch && refMatch[1]) ||
            (hotelIdMatch && hotelIdMatch[1]) ||
            (hotelRefMatch && hotelRefMatch[1]) ||
            hotelId;
          qrData = `${frontendUrl}/hotel-menu?ref=${derivedHotelId}`;
          needsUpdate = true;
        }
      }
    }
    
    // Update in database if URL was changed
    if (needsUpdate) {
      hotel.qrCode = qrData;
      await hotel.save();
      console.log('✅ Realigned QR code URL to current environment base URL:', {
        updatedUrl: qrData,
        env: process.env.NODE_ENV,
      });
    }
    
    return successResponse(res, 200, "QR code data fetched successfully", {
      qrData: qrData,
      hotelId,
      hotelName: hotel.hotelName,
      alreadyGenerated: true,
    });
  }

  // Generate QR code URL that links to the public landing route (scan -> activate hotel reference -> home)
  // Get frontend URL from environment or use default based on NODE_ENV
  const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || 
    (process.env.NODE_ENV === 'production' ? 'https://foods.abhikaro.in' : 'http://localhost:5173');
  const hotelId = hotel.hotelId || hotel._id.toString();
  
  // Create URL that will open the QR landing page and then redirect user to home/menu
  const qrPayload = `${frontendUrl}/hotel-menu?ref=${hotelId}`;

  console.log("🔗 Generating QR code:", {
    frontendUrl,
    hotelId,
    qrPayload,
    env: {
      FRONTEND_URL: process.env.FRONTEND_URL,
      VITE_FRONTEND_URL: process.env.VITE_FRONTEND_URL,
      NODE_ENV: process.env.NODE_ENV
    }
  });

  // Save QR code to database
  hotel.qrCode = qrPayload;
  await hotel.save();
  
  console.log("✅ QR code saved to database:", qrPayload);

  return successResponse(res, 200, "QR code generated and saved successfully", {
    qrData: qrPayload,
    hotelId: hotel.hotelId || hotel._id.toString(),
    hotelName: hotel.hotelName,
    alreadyGenerated: false,
  });
});
