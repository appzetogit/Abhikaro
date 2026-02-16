import admin from 'firebase-admin';
import FcmToken from '../models/FcmToken.js';
import mongoose from 'mongoose';

let fcmInitialized = false;

/**
 * Initialize Firebase Admin SDK (uses env vars - never expose to frontend)
 */
export function initializeFcm() {
  if (fcmInitialized) return true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    console.warn(
      '⚠️ FCM not initialized: Missing FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, or FIREBASE_CLIENT_EMAIL in .env'
    );
    return false;
  }

  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey,
          clientEmail,
        }),
      });
    }
    fcmInitialized = true;
    console.log('✅ Firebase Admin SDK initialized for FCM');
    return true;
  } catch (err) {
    console.error('❌ FCM initialization error:', err.message);
    return false;
  }
}

/**
 * Save or update FCM token for a user
 * Overwrites old token for same device; allows multiple tokens for multiple devices
 */
export async function saveFcmToken({ userId, role, fcmToken, platform = 'web', deviceId = null }) {
  if (!userId || !role || !fcmToken) {
    throw new Error('userId, role, and fcmToken are required');
  }

  const validRoles = ['user', 'restaurant', 'hotel', 'delivery'];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  const validPlatforms = ['web', 'android', 'ios'];
  const plat = validPlatforms.includes(platform) ? platform : 'web';

  const userModelMap = {
    user: 'User',
    restaurant: 'Restaurant',
    hotel: 'Hotel',
    delivery: 'Delivery',
  };

  const objectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
  const userModel = userModelMap[role];

  // Upsert: update if same fcmToken exists (token refresh), else create
  const doc = {
    userId: objectId,
    userModel,
    role,
    fcmToken,
    platform: plat,
    deviceId: deviceId || null,
  };

  console.log('💾 [FCM] Checking if token already exists...');
  const existing = await FcmToken.findOne({ fcmToken });
  
  if (existing) {
    console.log('🔄 [FCM] Token exists, updating...');
  } else {
    console.log('✨ [FCM] New token, creating document...');
  }
  
  const result = await FcmToken.findOneAndUpdate(
    { fcmToken },
    { $set: { ...doc, updatedAt: new Date() } },
    { upsert: true, new: true, runValidators: true }
  );

  if (existing) {
    console.log('🔄 [FCM] Token updated successfully (existing token refreshed)');
  } else {
    console.log('✨ [FCM] New token created successfully in database');
  }
  
  console.log('💾 [FCM] Document saved with ID:', result._id);
  console.log('💾 [FCM] Timestamp:', result.createdAt || result.updatedAt);

  return result;
}

/**
 * Remove FCM token (e.g. on logout)
 */
export async function removeFcmToken(fcmToken) {
  if (!fcmToken) return;
  await FcmToken.deleteOne({ fcmToken });
}

/**
 * Get all FCM tokens for a user (by role)
 */
export async function getTokensForUser(userId, role) {
  const objectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
  const tokens = await FcmToken.find({ userId: objectId, role }).lean();
  return tokens.map((t) => t.fcmToken);
}

/**
 * Send FCM notification to device(s)
 * @param {string|string[]} tokens - FCM token(s)
 * @param {object} notification - { title, body }
 * @param {object} data - optional data payload
 */
export async function sendNotification(tokens, notification, data = {}) {
  if (!initializeFcm()) return { success: false, error: 'FCM not initialized' };

  const tokenArray = Array.isArray(tokens) ? tokens : [tokens].filter(Boolean);
  if (tokenArray.length === 0) return { success: false, error: 'No tokens provided' };

  const message = {
    notification: {
      title: notification.title || 'Notification',
      body: notification.body || '',
    },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [String(k), String(v)])
    ),
    tokens: tokenArray,
    android: {
      priority: 'high',
    },
    apns: {
      payload: { aps: { sound: 'default' } },
    },
    webpush: {
      headers: { Urgency: 'high' },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error?.code === 'messaging/invalid-registration-token') {
        invalidTokens.push(tokenArray[idx]);
      }
    });
    if (invalidTokens.length > 0) {
      await FcmToken.deleteMany({ fcmToken: { $in: invalidTokens } });
    }
    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokensRemoved: invalidTokens.length,
    };
  } catch (err) {
    console.error('FCM send error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send notification to user by userId and role
 */
export async function sendToUser(userId, role, notification, data = {}) {
  const tokens = await getTokensForUser(userId, role);
  if (tokens.length === 0) return { success: false, error: 'No tokens found for user' };
  return sendNotification(tokens, notification, data);
}
