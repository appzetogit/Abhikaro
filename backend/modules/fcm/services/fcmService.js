import admin from 'firebase-admin';
import User from '../../auth/models/User.js';
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
 * Saves token to User model based on platform (web -> fcmtokenWeb, mobile -> fcmtokenMobile)
 */
export async function saveFcmToken({ userId, role, fcmToken, platform = 'web', deviceId = null }) {
  if (!userId || !role || !fcmToken) {
    throw new Error('userId, role, and fcmToken are required');
  }

  // Only support user role - tokens are stored in User model
  if (role !== 'user') {
    throw new Error('FCM tokens are only supported for user role');
  }

  const validPlatforms = ['web', 'android', 'ios'];
  const plat = validPlatforms.includes(platform) ? platform : 'web';

  const objectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

  // Determine which field to update based on platform
  const updateField = plat === 'web' ? 'fcmtokenWeb' : 'fcmtokenMobile';
  const updateDoc = { [updateField]: fcmToken };

  console.log('💾 [FCM] Saving token to User model...');
  console.log('💾 [FCM] Platform:', plat);
  console.log('💾 [FCM] Field:', updateField);
  
  const result = await User.findByIdAndUpdate(
    objectId,
    { $set: updateDoc },
    { new: true, runValidators: true }
  );

  if (!result) {
    throw new Error('User not found');
  }

  console.log('✅ [FCM] Token saved successfully to User model');
  console.log('💾 [FCM] User ID:', result._id);

  return result;
}

/**
 * Remove FCM token (e.g. on logout)
 * Removes token from User model by finding user with matching token
 */
export async function removeFcmToken(fcmToken) {
  if (!fcmToken) return;
  
  // Find user with this token in either field and remove it
  const user = await User.findOne({
    $or: [
      { fcmtokenWeb: fcmToken },
      { fcmtokenMobile: fcmToken }
    ]
  });
  
  if (user) {
    if (user.fcmtokenWeb === fcmToken) {
      user.fcmtokenWeb = null;
    }
    if (user.fcmtokenMobile === fcmToken) {
      user.fcmtokenMobile = null;
    }
    await user.save();
  }
}

/**
 * Get all FCM tokens for a user (by role)
 * Returns array of tokens from User model
 */
export async function getTokensForUser(userId, role) {
  if (role !== 'user') {
    return []; // Only support user role
  }
  
  const objectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
  const user = await User.findById(objectId).select('fcmtokenWeb fcmtokenMobile').lean();
  
  if (!user) {
    return [];
  }
  
  const tokens = [];
  if (user.fcmtokenWeb) {
    tokens.push(user.fcmtokenWeb);
  }
  if (user.fcmtokenMobile) {
    tokens.push(user.fcmtokenMobile);
  }
  
  return tokens;
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
      // Remove invalid tokens from User model
      await User.updateMany(
        { fcmtokenWeb: { $in: invalidTokens } },
        { $set: { fcmtokenWeb: null } }
      );
      await User.updateMany(
        { fcmtokenMobile: { $in: invalidTokens } },
        { $set: { fcmtokenMobile: null } }
      );
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
