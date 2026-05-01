import Delivery from '../models/Delivery.js';
import otpService from '../../auth/services/otpService.js';
import jwtService from '../../auth/services/jwtService.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { handleAuthFcmToken } from '../../fcm/services/notificationTriggers.js';
import winston from 'winston';
import { normalizeDeliveryProfileImages } from '../utils/profileImageNormalize.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

function hasNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function extractIndianMobile10(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digitsOnly = phone.trim().replace(/\D/g, '');
  if (!digitsOnly) return null;

  let ten = digitsOnly;
  if (ten.length > 10 && ten.startsWith('91')) ten = ten.slice(-10);
  if (ten.length === 11 && ten.startsWith('0')) ten = ten.slice(-10);

  if (ten.length !== 10) return null;
  if (!/^[6-9]\d{9}$/.test(ten)) return null;
  return ten;
}

function buildDeliveryPhoneQuery(mobile10) {
  if (!mobile10) return null;
  return {
    $or: [
      { phone: mobile10 },
      { phone: `91${mobile10}` },
      { phone: `+91${mobile10}` },
      { phone: `+91 ${mobile10}` },
      { phone: `+91-${mobile10}` },
      { phone: `+91-${mobile10}` },
      { phone: `+91${mobile10}` },
      { phone: `+${mobile10}` },
    ],
  };
}

/**
 * Determine which delivery signup step is required.
 * Returns:
 * - "details" if required basic profile fields are missing
 * - "documents" if docs/profile photo are missing
 * - null if signup is complete
 */
function getRequiredSignupStep(delivery) {
  if (!delivery) return 'details';

  // If the delivery partner is already approved/active, do NOT force them back into signup.
  // Legacy profiles may have missing optional fields, but they should still be able to use the app.
  if (delivery.status === 'approved' || delivery.status === 'active') {
    return null;
  }

  const profileImageUrl =
    delivery?.profileImage?.url ||
    delivery?.documents?.photo ||
    delivery?.documents?.profilePhoto ||
    null;

  const needsDetails =
    !hasNonEmptyString(delivery.name) ||
    delivery.name === 'Delivery Partner' ||
    !hasNonEmptyString(delivery.email) ||
    !hasNonEmptyString(delivery.location?.city) ||
    !hasNonEmptyString(delivery.vehicle?.number) ||
    !hasNonEmptyString(delivery.vehicle?.model) ||
    !hasNonEmptyString(delivery.documents?.pan?.number) ||
    !hasNonEmptyString(delivery.documents?.aadhar?.number);

  if (needsDetails) return 'details';

  const needsDocuments =
    !hasNonEmptyString(profileImageUrl) ||
    !hasNonEmptyString(delivery.documents?.aadhar?.document) ||
    !hasNonEmptyString(delivery.documents?.pan?.document) ||
    !hasNonEmptyString(delivery.documents?.drivingLicense?.document);

  if (needsDocuments) return 'documents';

  return null;
}

/**
 * Send OTP for delivery boy phone number
 * POST /api/delivery/auth/send-otp
 */
export const sendOTP = asyncHandler(async (req, res) => {
  const { phone, purpose = 'login' } = req.body;

  // Validate phone number
  if (!phone) {
    return errorResponse(res, 400, 'Phone number is required');
  }

  const mobile10 = extractIndianMobile10(phone);
  if (!mobile10) {
    return errorResponse(res, 400, 'Invalid mobile number. Please enter a valid 10 digit mobile number');
  }

  try {
    const result = await otpService.generateAndSendOTP(mobile10, purpose, null);
    return successResponse(res, 200, result.message, {
      expiresIn: result.expiresIn,
      identifierType: result.identifierType
    });
  } catch (error) {
    logger.error(`Error sending OTP: ${error.message}`);
    return errorResponse(res, 500, error.message);
  }
});

/**
 * Verify OTP and login/register delivery boy
 * POST /api/delivery/auth/verify-otp
 */
export const verifyOTP = asyncHandler(async (req, res) => {
  const { phone, otp, purpose = 'login', name } = req.body;

  // Validate inputs
  if (!phone || !otp) {
    return errorResponse(res, 400, 'Phone number and OTP are required');
  }

  const mobile10 = extractIndianMobile10(phone);
  if (!mobile10) {
    return errorResponse(res, 400, 'Invalid mobile number. Please enter a valid 10 digit mobile number');
  }

  // Normalize name - convert null/undefined to empty string for optional field
  const normalizedName = name && typeof name === 'string' ? name.trim() : null;

  try {
    let delivery;
    const identifier = mobile10;
    const findQuery = buildDeliveryPhoneQuery(mobile10) || { phone: mobile10 };

    if (purpose === 'register') {
      // Registration flow
      // Check if delivery boy already exists
      delivery = await Delivery.findOne(findQuery);

      if (delivery) {
        return errorResponse(res, 400, 'Delivery boy already exists with this phone number. Please login.');
      }

      // Name is mandatory for explicit registration
      if (!normalizedName) {
        return errorResponse(res, 400, 'Name is required for registration');
      }

      // Verify OTP before creating delivery boy
      await otpService.verifyOTP(mobile10, otp, purpose, null);

      const deliveryData = {
        name: normalizedName,
        phone: mobile10,
        phoneVerified: true,
        signupMethod: 'phone',
        status: 'pending', // New delivery boys start as pending approval
        isActive: true // Allow login to see verification message
      };

      try {
        delivery = await Delivery.create(deliveryData);
        logger.info(`New delivery boy registered: ${delivery._id}`, { 
          phone: mobile10, 
          deliveryId: delivery._id,
          deliveryIdField: delivery.deliveryId
        });
      } catch (createError) {
        // Handle duplicate key error
        if (createError.code === 11000) {
          delivery = await Delivery.findOne(findQuery);
          if (!delivery) {
            throw createError;
          }
          return errorResponse(res, 400, 'Delivery boy already exists with this phone number. Please login.');
        } else {
          throw createError;
        }
      }
    } else {
      // Login (with optional auto-registration)
      delivery = await Delivery.findOne(findQuery);

      // Verify OTP first (before creating user)
      await otpService.verifyOTP(mobile10, otp, purpose, null);

      if (!delivery) {
        // New user - create minimal record for signup flow
        // Use provided name or placeholder
        const deliveryData = {
          name: normalizedName || 'Delivery Partner', // Placeholder if not provided
          phone: mobile10,
          phoneVerified: true,
          signupMethod: 'phone',
          status: 'pending', // New delivery boys start as pending approval
          isActive: true // Allow login to see verification message
        };

        try {
          delivery = await Delivery.create(deliveryData);
          logger.info(`New delivery boy created for signup: ${delivery._id}`, { 
            phone: mobile10, 
            deliveryId: delivery._id,
            deliveryIdField: delivery.deliveryId,
            hasName: !!normalizedName
          });
        } catch (createError) {
          if (createError.code === 11000) {
            delivery = await Delivery.findOne(findQuery);
            if (!delivery) {
              throw createError;
            }
            logger.info(`Delivery boy found after duplicate key error: ${delivery._id}`);
          } else {
            throw createError;
          }
        }
      } else {
        // Existing delivery boy login - update verification status if needed
        if (!delivery.phoneVerified) {
          delivery.phoneVerified = true;
          await delivery.save();
        }
      }

      const requiredStep = getRequiredSignupStep(delivery);
      if (requiredStep) {
        // Generate tokens for signup flow
        const tokens = jwtService.generateTokens({
          userId: delivery._id.toString(),
          role: 'delivery',
          email: delivery.email || delivery.phone || delivery.deliveryId
        });

        // Store refresh token
        delivery.refreshToken = tokens.refreshToken;
        await delivery.save();

        // Set refresh token in httpOnly cookie
        res.cookie('refreshToken', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });

        // Register FCM token if provided in request (for mobile apps)
        const { fcmToken: signupFcmToken, platform: signupFcmPlatform } = req.body;
        if (signupFcmToken && typeof signupFcmToken === 'string') {
          try {
            const platform = signupFcmPlatform === 'ios' ? 'ios' : (signupFcmPlatform === 'web' ? 'web' : 'android');
            await handleAuthFcmToken(
              delivery._id.toString(),
              'delivery',
              signupFcmToken.trim(),
              platform,
              null,
              { sendWelcome: false, sendLoginAlert: false }
            );
            console.log('✅ [FCM Delivery] Token registered during signup flow');
          } catch (fcmError) {
            // Don't fail signup if FCM registration fails
            console.error('⚠️ [FCM Delivery] Failed to register token during signup:', fcmError.message);
          }
        }

        return successResponse(res, 200, 'OTP verified. Please complete your profile.', {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: {
            id: delivery._id,
            name: delivery.name,
            phone: delivery.phone,
            email: delivery.email,
            deliveryId: delivery.deliveryId,
            status: delivery.status,
            signupStep: requiredStep,
            signupComplete: false,
            rejectionReason: delivery.rejectionReason || null // Include rejection reason for blocked accounts
          },
          needsSignup: true // Signal that signup needs to be completed
        });
      }
    }

    // Check if delivery boy is active (blocked/pending status partners can still login to see rejection reason or verification message)
    if (!delivery.isActive && delivery.status !== 'blocked' && delivery.status !== 'pending') {
      return errorResponse(res, 403, 'Your account has been deactivated. Please contact support.');
    }

    // Generate tokens
    const tokens = jwtService.generateTokens({
      userId: delivery._id.toString(),
      role: 'delivery',
      email: delivery.email || delivery.phone || delivery.deliveryId
    });

    // Store refresh token in database
    delivery.refreshToken = tokens.refreshToken;
    await delivery.save();

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Update last login
    delivery.lastLogin = new Date();
    await delivery.save();

    // Register FCM token if provided in request (for mobile apps)
    const { fcmToken, platform: fcmPlatform } = req.body;
    if (fcmToken && typeof fcmToken === 'string') {
      try {
        const platform = fcmPlatform === 'ios' ? 'ios' : (fcmPlatform === 'web' ? 'web' : 'android');
        await handleAuthFcmToken(
          delivery._id.toString(),
          'delivery',
          fcmToken.trim(),
          platform,
          null,
          { sendWelcome: false, sendLoginAlert: false }
        );
        console.log('✅ [FCM Delivery] Token registered during login');
      } catch (fcmError) {
        // Don't fail login if FCM registration fails
        console.error('⚠️ [FCM Delivery] Failed to register token during login:', fcmError.message);
      }
    }

    const deliveryPlain = delivery.toObject({ depopulate: true });
    normalizeDeliveryProfileImages(deliveryPlain, req);
    const signupStep = getRequiredSignupStep(deliveryPlain);

    // Return access token and delivery boy info
    return successResponse(res, 200, 'Authentication successful', {
      accessToken: tokens.accessToken,
      user: {
        id: delivery._id,
        deliveryId: delivery.deliveryId,
        name: delivery.name,
        email: delivery.email,
        phone: delivery.phone,
        phoneVerified: delivery.phoneVerified,
        signupMethod: delivery.signupMethod,
        profileImage: deliveryPlain.profileImage,
        isActive: delivery.isActive,
        status: delivery.status,
        signupStep: signupStep,
        signupComplete: !signupStep,
        rejectionReason: delivery.rejectionReason || null, // Include rejection reason for blocked accounts
        metrics: delivery.metrics,
        earnings: delivery.earnings
      }
    });
  } catch (error) {
    logger.error(`Error verifying OTP: ${error.message}`);
    return errorResponse(res, 400, error.message);
  }
});

/**
 * Refresh Access Token
 * POST /api/delivery/auth/refresh-token
 */
export const refreshToken = asyncHandler(async (req, res) => {
  // Get refresh token from cookie or header
  const refreshToken = req.cookies?.refreshToken || req.headers['x-refresh-token'];

  if (!refreshToken) {
    return errorResponse(res, 401, 'Refresh token not found');
  }

  try {
    // Verify refresh token
    const decoded = jwtService.verifyRefreshToken(refreshToken);

    // Ensure it's a delivery token
    if (decoded.role !== 'delivery') {
      return errorResponse(res, 401, 'Invalid token for delivery');
    }

    // Get delivery boy from database and verify refresh token matches
    const delivery = await Delivery.findById(decoded.userId).select('+refreshToken');

    if (!delivery || !delivery.isActive) {
      return errorResponse(res, 401, 'Delivery boy not found or inactive');
    }

    // Verify refresh token matches stored token
    if (delivery.refreshToken !== refreshToken) {
      return errorResponse(res, 401, 'Invalid refresh token');
    }

    // Generate new access token
    const accessToken = jwtService.generateAccessToken({
      userId: delivery._id.toString(),
      role: 'delivery',
      email: delivery.email || delivery.phone || delivery.deliveryId
    });

    // Update refresh token cookie expiry to extend session
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    return successResponse(res, 200, 'Token refreshed successfully', {
      accessToken
    });
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid refresh token');
  }
});

/**
 * Logout
 * POST /api/delivery/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  // Get delivery boy from request (set by auth middleware)
  if (req.delivery) {
    // Clear refresh token from database
    req.delivery.refreshToken = null;
    await req.delivery.save();
  }

  // Clear refresh token cookie
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  return successResponse(res, 200, 'Logged out successfully');
});

/**
 * Register FCM token for delivery boy
 * POST /api/delivery/auth/fcm-token
 * Body: { token, platform? }
 * Requires auth - deliveryId & role from JWT token
 */
export const registerFcmToken = asyncHandler(async (req, res) => {
  const { token, platform = 'android' } = req.body;

  console.log('\n📥 [FCM Delivery] ========================================');
  console.log('📥 [FCM Delivery] Received FCM token registration request');
  console.log('📥 [FCM Delivery] Timestamp:', new Date().toISOString());
  console.log('📥 [FCM Delivery] Platform:', platform);
  console.log('📥 [FCM Delivery] Token:', token ? token.substring(0, 30) + '...' : '❌ MISSING');

  if (!token || typeof token !== 'string') {
    console.error('❌ [FCM Delivery] Validation failed: token is required');
    return errorResponse(res, 400, 'token is required');
  }

  const delivery = req.delivery;
  if (!delivery) {
    console.error('❌ [FCM Delivery] Authentication failed: No delivery found');
    return errorResponse(res, 401, 'Authentication required');
  }

  const userId = delivery._id.toString();
  const role = 'delivery';

  console.log('📥 [FCM Delivery] Delivery ID:', userId);
  console.log('📥 [FCM Delivery] Role:', role);
  console.log('📥 [FCM Delivery] Processing token registration...');
  
  try {
    await handleAuthFcmToken(userId, role, token.trim(), platform, null, {
      sendWelcome: false,
      sendLoginAlert: false,
    });

    console.log('✅ [FCM Delivery] Token registration completed successfully');
    console.log('📥 [FCM Delivery] ========================================\n');

    return successResponse(res, 200, 'FCM token registered successfully');
  } catch (error) {
    console.error('❌ [FCM Delivery] Token registration failed:', error.message);
    return errorResponse(res, 500, error.message || 'Failed to register FCM token');
  }
});

/**
 * Get current delivery boy
 * GET /api/delivery/auth/me
 */
export const getCurrentDelivery = asyncHandler(async (req, res) => {
  const d = req.delivery.toObject({ depopulate: true });
  normalizeDeliveryProfileImages(d, req);
  const signupStep = getRequiredSignupStep(d);

  return successResponse(res, 200, 'Delivery boy retrieved successfully', {
    user: {
      id: d._id,
      deliveryId: d.deliveryId,
      name: d.name,
      email: d.email,
      phone: d.phone,
      phoneVerified: d.phoneVerified,
      signupMethod: d.signupMethod,
      profileImage: d.profileImage,
      isActive: d.isActive,
      status: d.status,
      signupStep,
      signupComplete: !signupStep,
      location: d.location,
      vehicle: d.vehicle,
      documents: d.documents,
      availability: d.availability,
      metrics: d.metrics,
      earnings: d.earnings,
      wallet: d.wallet,
      level: d.level,
      lastLogin: d.lastLogin
    }
  });
});

