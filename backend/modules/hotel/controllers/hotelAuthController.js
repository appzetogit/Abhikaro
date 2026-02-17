import Hotel from "../models/Hotel.js";
import otpService from "../../auth/services/otpService.js";
import jwtService from "../../auth/services/jwtService.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { normalizePhoneNumber } from "../../../shared/utils/phoneUtils.js";
import { handleAuthFcmToken } from "../../fcm/services/notificationTriggers.js";
import winston from "winston";

/**
 * Build phone query that searches in multiple formats (with/without country code)
 */
const buildPhoneQuery = (normalizedPhone) => {
  if (!normalizedPhone) return null;

  if (normalizedPhone.startsWith("91") && normalizedPhone.length === 12) {
    const phoneWithoutCountryCode = normalizedPhone.substring(2);
    return {
      $or: [
        { phone: normalizedPhone },
        { phone: phoneWithoutCountryCode },
        { phone: `+${normalizedPhone}` },
        { phone: `+91${phoneWithoutCountryCode}` },
      ],
    };
  } else {
    return {
      $or: [
        { phone: normalizedPhone },
        { phone: `91${normalizedPhone}` },
        { phone: `+91${normalizedPhone}` },
        { phone: `+${normalizedPhone}` },
      ],
    };
  }
};

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

/**
 * Send OTP for hotel phone number
 * POST /api/hotel/auth/send-otp
 */
export const sendOTP = asyncHandler(async (req, res) => {
  const { phone, purpose = "login" } = req.body;

  if (!phone) {
    return errorResponse(res, 400, "Phone number is required");
  }

  const phoneRegex =
    /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
  if (!phoneRegex.test(phone)) {
    return errorResponse(res, 400, "Invalid phone number format");
  }

  try {
    const result = await otpService.generateAndSendOTP(
      phone,
      purpose,
      null,
    );
    return successResponse(res, 200, result.message, {
      expiresIn: result.expiresIn,
      identifierType: "phone",
    });
  } catch (error) {
    logger.error(`Error sending OTP: ${error.message}`);
    return errorResponse(res, 500, error.message);
  }
});

/**
 * Verify OTP and login/register hotel
 * POST /api/hotel/auth/verify-otp
 */
export const verifyOTP = asyncHandler(async (req, res) => {
  const {
    phone,
    otp,
    purpose = "login",
    hotelName,
    email,
    address,
    aadharCardImage,
    hotelRentProofImage,
    cancelledCheckImages,
  } = req.body;

  if (!phone || !otp) {
    return errorResponse(res, 400, "Phone number and OTP are required");
  }

  try {
    let hotel;
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      return errorResponse(res, 400, "Invalid phone number format");
    }

    const findQuery = buildPhoneQuery(normalizedPhone);
    hotel = await Hotel.findOne(findQuery);

    if (purpose === "register") {
      // Registration flow
      if (hotel) {
        return errorResponse(
          res,
          400,
          "Hotel already exists with this phone number. Please login.",
        );
      }

      if (!hotelName || !email || !address) {
        return errorResponse(
          res,
          400,
          "Hotel name, email, and address are required for registration",
        );
      }

      // Verify OTP before creating hotel
      await otpService.verifyOTP(phone, otp, purpose, null);

      const hotelData = {
        phone: normalizedPhone,
        phoneVerified: true,
        hotelName,
        email: email.toLowerCase().trim(),
        address,
        signupMethod: "phone",
        isActive: process.env.NODE_ENV === "development", // Auto-approve in development
      };

      // Add document images if provided
      // Ensure images are in correct format: { url: String, publicId: String }
      if (aadharCardImage) {
        // Handle both object format and string format
        if (typeof aadharCardImage === 'object' && aadharCardImage.url) {
          hotelData.aadharCardImage = {
            url: aadharCardImage.url,
            publicId: aadharCardImage.publicId || aadharCardImage.public_id || null,
          };
        } else if (typeof aadharCardImage === 'string') {
          // If only URL is provided, store it
          hotelData.aadharCardImage = {
            url: aadharCardImage,
            publicId: null,
          };
        } else {
          hotelData.aadharCardImage = aadharCardImage;
        }
      }
      if (hotelRentProofImage) {
        // Handle both object format and string format
        if (typeof hotelRentProofImage === 'object' && hotelRentProofImage.url) {
          hotelData.hotelRentProofImage = {
            url: hotelRentProofImage.url,
            publicId: hotelRentProofImage.publicId || hotelRentProofImage.public_id || null,
          };
        } else if (typeof hotelRentProofImage === 'string') {
          hotelData.hotelRentProofImage = {
            url: hotelRentProofImage,
            publicId: null,
          };
        } else {
          hotelData.hotelRentProofImage = hotelRentProofImage;
        }
      }
      if (cancelledCheckImages && Array.isArray(cancelledCheckImages)) {
        // Ensure each image in array is in correct format
        hotelData.cancelledCheckImages = cancelledCheckImages.map((img) => {
          if (typeof img === 'object' && img.url) {
            return {
              url: img.url,
              publicId: img.publicId || img.public_id || null,
            };
          } else if (typeof img === 'string') {
            return {
              url: img,
              publicId: null,
            };
          }
          return img;
        });
      }

      try {
        hotel = await Hotel.create(hotelData);
        logger.info(`New hotel registered: ${hotel._id}`, {
          phone: normalizedPhone,
          hotelId: hotel._id,
        });
      } catch (createError) {
        logger.error(`Error creating hotel: ${createError.message}`, {
          code: createError.code,
          keyPattern: createError.keyPattern,
          phone: normalizedPhone,
        });

        if (createError.code === 11000) {
          if (createError.keyPattern && createError.keyPattern.phone) {
            const phoneQuery = buildPhoneQuery(normalizedPhone) || {
              phone: normalizedPhone,
            };
            hotel = await Hotel.findOne(phoneQuery);
            if (hotel) {
              return errorResponse(
                res,
                400,
                "Hotel already exists with this phone number. Please login.",
              );
            }
          }
          throw new Error(
            `Phone number already exists: ${createError.message}`,
          );
        }
        throw createError;
      }
    } else {
      // Login flow
      if (!hotel) {
        // Tell the client that we need hotel details to proceed with auto-registration
        return successResponse(
          res,
          200,
          "Hotel not found. Please provide hotel details for registration.",
          {
            needsDetails: true,
            identifierType: "phone",
            identifier: normalizedPhone,
          },
        );
      }

      // Verify OTP
      await otpService.verifyOTP(phone, otp, purpose, null);

      // Allow login if active OR in development mode
      if (!hotel.isActive && process.env.NODE_ENV !== "development") {
        return errorResponse(
          res,
          401,
          "Hotel account is inactive. Please wait for admin approval.",
        );
      }
    }

    // Generate tokens
    const tokens = jwtService.generateTokens({
      userId: hotel._id.toString(),
      role: "hotel",
      email: hotel.email || hotel.phone || hotel.hotelId,
    });

    // Set refresh token in httpOnly cookie
    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Register FCM token if provided in request (for mobile apps)
    const { fcmToken, platform: fcmPlatform } = req.body;
    if (fcmToken && typeof fcmToken === 'string') {
      try {
        const platform = fcmPlatform === 'ios' ? 'ios' : (fcmPlatform === 'web' ? 'web' : 'android');
        await handleAuthFcmToken(
          hotel._id.toString(),
          'hotel',
          fcmToken.trim(),
          platform,
          null,
          { sendWelcome: false, sendLoginAlert: false }
        );
        console.log('✅ [FCM Hotel] Token registered during login');
      } catch (fcmError) {
        // Don't fail login if FCM registration fails
        console.error('⚠️ [FCM Hotel] Failed to register token during login:', fcmError.message);
      }
    }

    logger.info(`Hotel ${purpose === "register" ? "registered" : "logged in"}: ${hotel._id}`, {
      phone: normalizedPhone,
      hotelId: hotel._id,
    });

    return successResponse(
      res,
      200,
      purpose === "register" ? "Registration successful" : "Login successful",
      {
        accessToken: tokens.accessToken,
        hotel: {
          _id: hotel._id,
          hotelId: hotel.hotelId,
          hotelName: hotel.hotelName,
          email: hotel.email,
          phone: hotel.phone,
          address: hotel.address,
          isActive: hotel.isActive,
          profileImage: hotel.profileImage,
        },
      },
    );
  } catch (error) {
    logger.error(`Error in verifyOTP: ${error.message}`, {
      phone,
      purpose,
      error: error.message,
    });
    return errorResponse(res, 400, error.message);
  }
});

/**
 * Register FCM token for hotel
 * POST /api/hotel/auth/fcm-token
 * Body: { token, platform? }
 * Requires auth - hotelId & role from JWT token
 */
export const registerFcmToken = asyncHandler(async (req, res) => {
  const { token, platform = 'web' } = req.body;

  console.log('\n📥 [FCM Hotel] ========================================');
  console.log('📥 [FCM Hotel] Received FCM token registration request');
  console.log('📥 [FCM Hotel] Timestamp:', new Date().toISOString());
  console.log('📥 [FCM Hotel] Platform:', platform);
  console.log('📥 [FCM Hotel] Token:', token ? token.substring(0, 30) + '...' : '❌ MISSING');

  if (!token || typeof token !== 'string') {
    console.error('❌ [FCM Hotel] Validation failed: token is required');
    return errorResponse(res, 400, 'token is required');
  }

  const hotel = req.hotel;
  if (!hotel) {
    console.error('❌ [FCM Hotel] Authentication failed: No hotel found');
    return errorResponse(res, 401, 'Authentication required');
  }

  const userId = hotel._id.toString();
  const role = 'hotel';

  console.log('📥 [FCM Hotel] Hotel ID:', userId);
  console.log('📥 [FCM Hotel] Role:', role);
  console.log('📥 [FCM Hotel] Processing token registration...');
  
  try {
    await handleAuthFcmToken(userId, role, token.trim(), platform, null, {
      sendWelcome: false,
      sendLoginAlert: false,
    });

    console.log('✅ [FCM Hotel] Token registration completed successfully');
    console.log('📥 [FCM Hotel] ========================================\n');

    return successResponse(res, 200, 'FCM token registered successfully');
  } catch (error) {
    console.error('❌ [FCM Hotel] Token registration failed:', error.message);
    return errorResponse(res, 500, error.message || 'Failed to register FCM token');
  }
});

/**
 * Get current hotel
 * GET /api/hotel/auth/me
 */
export const getCurrentHotel = asyncHandler(async (req, res) => {
  const hotel = req.hotel;

  return successResponse(res, 200, "Hotel retrieved successfully", {
    hotel: {
      _id: hotel._id,
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName,
      email: hotel.email,
      phone: hotel.phone,
      address: hotel.address,
      location: hotel.location,
      isActive: hotel.isActive,
      profileImage: hotel.profileImage,
      aadharCardImage: hotel.aadharCardImage,
      hotelRentProofImage: hotel.hotelRentProofImage,
      cancelledCheckImages: hotel.cancelledCheckImages,
      qrCode: hotel.qrCode,
      standRequestStatus: hotel.standRequestStatus || "none",
      standRequestedAt: hotel.standRequestedAt,
      standApprovedAt: hotel.standApprovedAt,
      createdAt: hotel.createdAt,
      updatedAt: hotel.updatedAt,
    },
  });
});

/**
 * Request a hotel stand
 * POST /api/hotel/auth/stand-request
 * Requires hotel auth
 */
export const requestStand = asyncHandler(async (req, res) => {
  const hotel = req.hotel;

  // Simple rules: if already approved, do nothing
  if (hotel.standRequestStatus === "approved") {
    return successResponse(res, 200, "Stand request already approved", {
      standRequestStatus: hotel.standRequestStatus,
      standRequestedAt: hotel.standRequestedAt,
      standApprovedAt: hotel.standApprovedAt,
    });
  }

  // If already requested, just echo current state (idempotent)
  if (hotel.standRequestStatus === "requested") {
    return successResponse(res, 200, "Stand request already submitted", {
      standRequestStatus: hotel.standRequestStatus,
      standRequestedAt: hotel.standRequestedAt,
      standApprovedAt: hotel.standApprovedAt,
    });
  }

  const updated = await Hotel.findByIdAndUpdate(
    hotel._id,
    {
      standRequestStatus: "requested",
      standRequestedAt: new Date(),
    },
    { new: true },
  ).select(
    "standRequestStatus standRequestedAt standApprovedAt",
  );

  return successResponse(res, 200, "Stand request submitted successfully", {
    standRequestStatus: updated.standRequestStatus,
    standRequestedAt: updated.standRequestedAt,
    standApprovedAt: updated.standApprovedAt,
  });
});

/**
 * Refresh access token
 * POST /api/hotel/auth/refresh-token
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return errorResponse(res, 401, "Refresh token not provided");
  }

  try {
    const decoded = jwtService.verifyRefreshToken(refreshToken);

    if (decoded.role !== "hotel") {
      return errorResponse(res, 403, "Invalid token. Hotel access required.");
    }

    const hotel = await Hotel.findById(decoded.userId);
    if (!hotel) {
      return errorResponse(res, 401, "Hotel not found");
    }

    const tokens = jwtService.generateTokens({
      userId: hotel._id.toString(),
      role: "hotel",
      email: hotel.email || hotel.phone || hotel.hotelId,
    });

    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return successResponse(res, 200, "Token refreshed", {
      accessToken: tokens.accessToken,
    });
  } catch (error) {
    return errorResponse(res, 401, "Invalid refresh token");
  }
});

/**
 * Logout hotel
 * POST /api/hotel/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  return successResponse(res, 200, "Logout successful");
});
