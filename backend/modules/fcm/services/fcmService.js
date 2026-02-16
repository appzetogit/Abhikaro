import admin from 'firebase-admin';
import User from '../../auth/models/User.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Delivery from '../../delivery/models/Delivery.js';
import Hotel from '../../hotel/models/Hotel.js';
import mongoose from 'mongoose';

let fcmInitialized = false;

/**
 * Get the appropriate model based on role
 */
function getModelByRole(role) {
  const modelMap = {
    user: User,
    restaurant: Restaurant,
    delivery: Delivery,
    hotel: Hotel
  };
  return modelMap[role];
}

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
 * Save or update FCM token for a user/restaurant/delivery/hotel
 * Saves token to appropriate model based on platform (web -> fcmtokenWeb, mobile -> fcmtokenMobile)
 */
export async function saveFcmToken({ userId, role, fcmToken, platform = 'web', deviceId = null }) {
  if (!userId || !role || !fcmToken) {
    throw new Error('userId, role, and fcmToken are required');
  }

  const validRoles = ['user', 'restaurant', 'delivery', 'hotel'];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  const validPlatforms = ['web', 'android', 'ios'];
  const plat = validPlatforms.includes(platform) ? platform : 'web';

  const objectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
  const Model = getModelByRole(role);

  if (!Model) {
    throw new Error(`Model not found for role: ${role}`);
  }

  // Determine which field to update based on platform
  const updateField = plat === 'web' ? 'fcmtokenWeb' : 'fcmtokenMobile';
  const updateDoc = { [updateField]: fcmToken };

  console.log(`💾 [FCM] Saving token to ${role} model...`);
  console.log('💾 [FCM] Platform:', plat);
  console.log('💾 [FCM] Field:', updateField);
  
  const result = await Model.findByIdAndUpdate(
    objectId,
    { $set: updateDoc },
    { new: true, runValidators: true }
  );

  if (!result) {
    throw new Error(`${role} not found`);
  }

  console.log(`✅ [FCM] Token saved successfully to ${role} model`);
  console.log(`💾 [FCM] ${role} ID:`, result._id);

  return result;
}

/**
 * Remove FCM token (e.g. on logout)
 * Removes token from appropriate model by finding document with matching token
 */
export async function removeFcmToken(fcmToken) {
  if (!fcmToken) return;
  
  // Check all models for this token
  const models = [
    { model: User, name: 'User' },
    { model: Restaurant, name: 'Restaurant' },
    { model: Delivery, name: 'Delivery' },
    { model: Hotel, name: 'Hotel' }
  ];
  
  for (const { model, name } of models) {
    const doc = await model.findOne({
      $or: [
        { fcmtokenWeb: fcmToken },
        { fcmtokenMobile: fcmToken }
      ]
    });
    
    if (doc) {
      if (doc.fcmtokenWeb === fcmToken) {
        doc.fcmtokenWeb = null;
      }
      if (doc.fcmtokenMobile === fcmToken) {
        doc.fcmtokenMobile = null;
      }
      await doc.save();
      console.log(`✅ [FCM] Token removed from ${name} model`);
      return;
    }
  }
}

/**
 * Get all FCM tokens for a user/restaurant/delivery/hotel (by role)
 * Returns array of tokens from appropriate model
 */
export async function getTokensForUser(userId, role) {
  const validRoles = ['user', 'restaurant', 'delivery', 'hotel'];
  if (!validRoles.includes(role)) {
    return [];
  }
  
  const objectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
  const Model = getModelByRole(role);
  
  if (!Model) {
    return [];
  }
  
  const doc = await Model.findById(objectId).select('fcmtokenWeb fcmtokenMobile').lean();
  
  if (!doc) {
    return [];
  }
  
  const tokens = [];
  if (doc.fcmtokenWeb) {
    tokens.push(doc.fcmtokenWeb);
  }
  if (doc.fcmtokenMobile) {
    tokens.push(doc.fcmtokenMobile);
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
      // Remove invalid tokens from all models
      const models = [User, Restaurant, Delivery, Hotel];
      for (const Model of models) {
        await Model.updateMany(
          { fcmtokenWeb: { $in: invalidTokens } },
          { $set: { fcmtokenWeb: null } }
        );
        await Model.updateMany(
          { fcmtokenMobile: { $in: invalidTokens } },
          { $set: { fcmtokenMobile: null } }
        );
      }
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
