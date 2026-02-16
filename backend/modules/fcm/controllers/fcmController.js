import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { saveFcmToken, removeFcmToken } from '../services/fcmService.js';
import { handleAuthFcmToken } from '../services/notificationTriggers.js';

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
