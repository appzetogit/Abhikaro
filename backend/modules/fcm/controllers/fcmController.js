import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { saveFcmToken, removeFcmToken } from '../services/fcmService.js';
import { handleAuthFcmToken } from '../services/notificationTriggers.js';
import Hotel from '../../hotel/models/Hotel.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneUtils.js';
import { sendPushNotification } from '../services/pushNotificationService.js';

/**
 * Register/update FCM token
 * POST /api/fcm/register-token
 * Body: { fcmToken, platform?, deviceId?, sendWelcome?, sendLoginAlert? }
 * Requires auth - userId & role from token
 */
export const registerToken = asyncHandler(async (req, res) => {
  const { fcmToken, platform = 'web', deviceId, sendWelcome, sendLoginAlert } = req.body;

  console.log('\n📥 [FCM] ========================================');
  console.log('📥 [FCM] Received FCM token registration request');
  console.log('📥 [FCM] Timestamp:', new Date().toISOString());
  console.log('📥 [FCM] Platform:', platform);
  console.log('📥 [FCM] Token:', fcmToken ? fcmToken.substring(0, 30) + '...' : '❌ MISSING');
  console.log('📥 [FCM] Options:', { sendWelcome: !!sendWelcome, sendLoginAlert: !!sendLoginAlert });

  if (!fcmToken || typeof fcmToken !== 'string') {
    console.error('❌ [FCM] Validation failed: fcmToken is required');
    return errorResponse(res, 400, 'fcmToken is required');
  }

  const userId = req.user?.userId;
  const role = req.user?.role || 'user';

  console.log('📥 [FCM] User ID:', userId);
  console.log('📥 [FCM] Role:', role);

  if (!userId) {
    console.error('❌ [FCM] Authentication failed: No userId');
    return errorResponse(res, 401, 'Authentication required');
  }

  console.log('📥 [FCM] Processing token registration...');
  
  await handleAuthFcmToken(userId, role, fcmToken.trim(), platform, deviceId || null, {
    sendWelcome: !!sendWelcome,
    sendLoginAlert: !!sendLoginAlert,
  });

  console.log('✅ [FCM] Token registration completed successfully');
  console.log('📥 [FCM] ========================================\n');

  return successResponse(res, 200, 'FCM token registered successfully');
});

/**
 * Remove FCM token (on logout)
 * POST /api/fcm/remove-token
 * Body: { fcmToken }
 */
export const unregisterToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;
  if (!fcmToken) {
    return errorResponse(res, 400, 'fcmToken is required');
  }
  await removeFcmToken(fcmToken);
  return successResponse(res, 200, 'FCM token removed');
});

/**
 * Admin-only: send a test push notification to a hotel by phone number.
 * POST /api/fcm/test/hotel
 * Body: { phone, title?, body? }
 */
export const testHotelPush = asyncHandler(async (req, res) => {
  const role = req.user?.role;
  const requesterId = req.user?.userId?.toString?.() || req.user?.userId;
  const isAdmin = role === 'admin';
  const isHotel = role === 'hotel';
  if (!isAdmin && !isHotel) {
    return errorResponse(res, 403, 'Admin/Hotel access required');
  }

  const { phone, title, body } = req.body || {};
  const requestedPhone = typeof phone === 'string' ? phone : null;

  let hotel = null;
  if (isHotel) {
    if (!requesterId) {
      return errorResponse(res, 401, 'Authentication required');
    }
    hotel = await Hotel.findById(requesterId)
      .select('_id phone hotelName fcmtokenWeb fcmtokenMobile')
      .lean();
  } else {
    if (!requestedPhone) {
      return errorResponse(res, 400, 'phone is required');
    }

    const normalized = normalizePhoneNumber(requestedPhone);
    if (!normalized) {
      return errorResponse(res, 400, 'Invalid phone number format');
    }

    // Try a robust lookup (with/without country code)
    const phoneWithoutCountry =
      normalized.startsWith('91') && normalized.length === 12
        ? normalized.substring(2)
        : normalized;

    hotel = await Hotel.findOne({
      $or: [
        { phone: normalized },
        { phone: phoneWithoutCountry },
        { phone: `+${normalized}` },
        { phone: `+91${phoneWithoutCountry}` },
      ],
    })
      .select('_id phone hotelName fcmtokenWeb fcmtokenMobile')
      .lean();
  }

  if (!hotel) {
    return errorResponse(res, 404, 'Hotel not found for this phone');
  }

  const hasToken = Boolean(hotel.fcmtokenWeb || hotel.fcmtokenMobile);
  if (!hasToken) {
    return successResponse(res, 200, 'Hotel found but has no FCM token registered', {
      hotelId: hotel._id?.toString?.(),
      hotelName: hotel.hotelName || null,
      phone: hotel.phone || null,
      hasToken: false,
    });
  }

  const payload = {
    title: title || 'Test notification',
    body: body || 'Test push from server',
    data: {
      type: 'test_push',
      channelId: 'hotel_test_push',
      tag: `hotel_test_push_${hotel._id}_${Date.now()}`,
    },
  };

  const result = await sendPushNotification(hotel._id.toString(), 'hotel', payload);

  return successResponse(res, 200, result.success ? 'Test push sent' : 'Test push failed', {
    hotelId: hotel._id?.toString?.(),
    hotelName: hotel.hotelName || null,
    phone: hotel.phone || null,
    hasToken: true,
    result,
  });
});
