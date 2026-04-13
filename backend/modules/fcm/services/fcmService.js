import admin from 'firebase-admin';
import User from '../../auth/models/User.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Delivery from '../../delivery/models/Delivery.js';
import Hotel from '../../hotel/models/Hotel.js';
import Admin from '../../admin/models/Admin.js';
import mongoose from 'mongoose';

import { ensureFirebaseAdminApp } from '../../../shared/utils/firebaseAdminInit.js';

let fcmInitialized = false;

/**
 * Get the appropriate model based on role
 */
function getModelByRole(role) {
  const modelMap = {
    user: User,
    restaurant: Restaurant,
    delivery: Delivery,
    hotel: Hotel,
    admin: Admin
  };
  return modelMap[role];
}

/**
 * Initialize Firebase Admin default app for FCM (shared loader: JSON file or .env)
 */
export async function initializeFcm() {
  if (fcmInitialized) return true;

  try {
    const ok = await ensureFirebaseAdminApp();
    if (!ok) {
      return false;
    }
    fcmInitialized = true;
    console.log('✅ FCM: Firebase Admin ready (admin.messaging)');
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

  const validRoles = ['user', 'restaurant', 'delivery', 'hotel', 'admin'];
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
  const validRoles = ['user', 'restaurant', 'delivery', 'hotel', 'admin'];
  if (!validRoles.includes(role)) {
    console.warn(`⚠️ [FCM] Invalid role: ${role}`);
    return [];
  }
  
  const objectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
  const Model = getModelByRole(role);
  
  if (!Model) {
    console.warn(`⚠️ [FCM] No model found for role: ${role}`);
    return [];
  }
  
  const doc = await Model.findById(objectId).select('fcmtokenWeb fcmtokenMobile').lean();
  
  if (!doc) {
    console.warn(`⚠️ [FCM] No document found for ${role} ${userId}`);
    return [];
  }
  
  const tokens = [];
  if (doc.fcmtokenMobile) {
    tokens.push(String(doc.fcmtokenMobile));
    console.log(`✅ [FCM] Found mobile token for ${role} ${userId}`);
  }
  if (doc.fcmtokenWeb) {
    tokens.push(String(doc.fcmtokenWeb));
    console.log(`✅ [FCM] Found web token for ${role} ${userId}`);
  }

  // Deduplicate in case the same device token is saved in both fields
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  
  if (uniqueTokens.length === 0) {
    console.warn(`⚠️ [FCM] No FCM tokens found for ${role} ${userId}`);
  }
  
  return uniqueTokens;
}

/**
 * Send FCM notification to device(s)
 * @param {string|string[]} tokens - FCM token(s)
 * @param {object} notification - { title, body }
 * @param {object} data - optional data payload
 */
export async function sendNotification(tokens, notification, data = {}) {
  if (!await initializeFcm()) return { success: false, error: 'FCM not initialized' };

  const tokenArrayRaw = Array.isArray(tokens) ? tokens : [tokens];
  // Deduplicate tokens to avoid duplicate notifications when the same token
  // is stored multiple times (e.g. web + mobile fields).
  const tokenArray = Array.from(new Set(tokenArrayRaw.map((t) => String(t || '').trim()).filter(Boolean)));
  if (tokenArray.length === 0) return { success: false, error: 'No tokens provided' };

  // Ensure tag is present in data for deduplication
  const dataWithTag = { ...data };
  if (!dataWithTag.tag) {
    dataWithTag.tag = dataWithTag.orderId || dataWithTag.notificationId || Date.now().toString();
  }

  // Extract image URL from data if present
  const imageUrl = dataWithTag.image || null;
  
  // Build notification object with image if available
  const notificationObj = {
    title: notification.title || 'Notification',
    body: notification.body || '',
  };
  
  // Add image to notification if available (for display in notification)
  if (imageUrl) {
    notificationObj.image = imageUrl;
  }

  // Build Android-specific config with image + channel/sound (for native apps).
  // NOTE: For Android custom sound, the app must create a notification channel with the same channelId
  // and a raw sound resource (e.g. res/raw/alert.mp3). FCM can reference that channel/sound.
  const androidConfig = {
    priority: 'high',
  };
  
  // Ensure android.notification exists if we need to set channel/sound/image
  const androidNotification = {};

  // Map channelId from data payload (recommended for app-side routing)
  if (dataWithTag.channelId) {
    androidNotification.channelId = String(dataWithTag.channelId);
  }

  // Sound: For Android, use raw resource name WITHOUT extension (e.g. "alert" for res/raw/alert.mp3)
  if (dataWithTag.sound) {
    androidNotification.sound = String(dataWithTag.sound);
  }

  // Add image to Android notification if available
  if (imageUrl) {
    androidNotification.imageUrl = imageUrl;
  }

  if (Object.keys(androidNotification).length > 0) {
    androidConfig.notification = androidNotification;
  }

  // Build iOS/APNS config with sound/image
  // iOS sound should be a bundled sound file name or "default"; we keep default unless overridden.
  const apnsSound = dataWithTag.sound ? String(dataWithTag.sound) : 'default';
  const apnsConfig = {
    payload: { 
      aps: { 
        sound: apnsSound,
        ...(imageUrl && { 'mutable-content': 1 }) // Enable mutable content for image
      } 
    },
  };
  
  // Add image URL to APNS payload for iOS notification extension
  if (imageUrl) {
    apnsConfig.payload.imageUrl = imageUrl;
  }

  const message = {
    notification: notificationObj,
    data: Object.fromEntries(
      Object.entries(dataWithTag).map(([k, v]) => [String(k), String(v)])
    ),
    tokens: tokenArray,
    android: androidConfig,
    apns: apnsConfig,
    webpush: {
      headers: { Urgency: 'high' },
      notification: {
        tag: dataWithTag.tag, // Use tag for web push deduplication
        // Best-effort: prevent default notification sound (browser support varies).
        // If the app is open, the frontend can play its own alert.mp3 instead.
        silent: true,
        requireInteraction: true,
        vibrate: [200, 100, 200],
        ...(imageUrl && { image: imageUrl }) // Add image to webpush notification
      }
    },
  };

  try {
    console.log(`📤 [FCM] Sending notification: "${notification.title}" - "${notification.body}"`);
    if (imageUrl) {
      console.log(`🖼️ [FCM] Image URL included: ${imageUrl}`);
    }
    // firebase-admin API differs by version:
    // - Newer versions: messaging.sendEachForMulticast
    // - Older versions: messaging.sendMulticast
    //
    // IMPORTANT: Some environments mis-route batch endpoints and return 404 on `/batch`.
    // For reliability, if multicast fails, we fall back to sending per-token.
    const messaging = admin.messaging();
    const sendFn =
      typeof messaging.sendEachForMulticast === 'function'
        ? messaging.sendEachForMulticast.bind(messaging)
        : (typeof messaging.sendMulticast === 'function'
          ? messaging.sendMulticast.bind(messaging)
          : null);

    let response = null;
    if (sendFn) {
      try {
        response = await sendFn(message);
      } catch (multicastErr) {
        const raw = multicastErr?.errorInfo?.message || multicastErr?.message || '';
        const looksLikeBatch404 =
          String(raw).includes('/batch') &&
          (String(raw).includes('404') || String(raw).includes('Not Found'));

        if (!looksLikeBatch404) {
          throw multicastErr;
        }

        console.warn('⚠️ [FCM] Multicast failed with /batch 404; falling back to per-token send()');

        // Per-token fallback (avoids batch endpoint entirely)
        const baseMessage = { ...message };
        delete baseMessage.tokens;

        // small concurrency cap
        const concurrency = 5;
        let idx = 0;
        let successCount = 0;
        let failureCount = 0;
        const invalidTokens = [];

        async function worker() {
          while (idx < tokenArray.length) {
            const myIdx = idx++;
            const token = tokenArray[myIdx];
            try {
              await messaging.send({ ...baseMessage, token });
              successCount++;
            } catch (err) {
              failureCount++;
              const code = err?.errorInfo?.code || err?.code;
              const msg = err?.errorInfo?.message || err?.message;
              console.error(`❌ [FCM] Token ${myIdx} failed:`, code, msg);
              if (
                code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered'
              ) {
                invalidTokens.push(token);
              }
            }
          }
        }

        const workers = Array.from({ length: Math.min(concurrency, tokenArray.length) }, () => worker());
        await Promise.all(workers);

        // mimic multicast response shape used below
        response = {
          successCount,
          failureCount,
          responses: [], // not used when we already tracked invalidTokens
          __invalidTokens: invalidTokens,
        };
      }
    } else {
      // No multicast available; send one by one
      const baseMessage = { ...message };
      delete baseMessage.tokens;
      let successCount = 0;
      let failureCount = 0;
      const invalidTokens = [];
      for (let i = 0; i < tokenArray.length; i++) {
        const token = tokenArray[i];
        try {
          await messaging.send({ ...baseMessage, token });
          successCount++;
        } catch (err) {
          failureCount++;
          const code = err?.errorInfo?.code || err?.code;
          const msg = err?.errorInfo?.message || err?.message;
          console.error(`❌ [FCM] Token ${i} failed:`, code, msg);
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(token);
          }
        }
      }
      response = {
        successCount,
        failureCount,
        responses: [],
        __invalidTokens: invalidTokens,
      };
    }
    
    console.log(`📊 [FCM] Send response: ${response.successCount} success, ${response.failureCount} failures`);
    
    const invalidTokens = Array.isArray(response.__invalidTokens) ? response.__invalidTokens : [];
    if (invalidTokens.length === 0 && Array.isArray(response.responses)) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`❌ [FCM] Token ${idx} failed:`, resp.error?.code, resp.error?.message);
          if (
            resp.error?.code === 'messaging/invalid-registration-token' ||
            resp.error?.code === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(tokenArray[idx]);
          }
        }
      });
    }
    
    if (invalidTokens.length > 0) {
      console.log(`🧹 [FCM] Removing ${invalidTokens.length} invalid token(s)`);
      // Remove invalid tokens from all models
      const models = [User, Restaurant, Delivery, Hotel, Admin];
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
    
    if (response.successCount > 0) {
      console.log(`✅ [FCM] Notification sent successfully to ${response.successCount} device(s)`);
    } else {
      console.warn(`⚠️ [FCM] No notifications were sent successfully`);
    }
    
    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokensRemoved: invalidTokens.length,
    };
  } catch (err) {
    console.error('❌ [FCM] Send error:', err);
    console.error('❌ [FCM] Error details:', err.message, err.stack);
    return { success: false, error: err.message };
  }
}

/**
 * Send notification to user by userId and role
 */
export async function sendToUser(userId, role, notification, data = {}) {
  const tokens = await getTokensForUser(userId, role);
  if (tokens.length === 0) {
    console.warn(`⚠️ [FCM] No tokens found for ${role} ${userId}`);
    return { success: false, error: 'No tokens found for user' };
  }
  const preferMobileOnly =
    data?.preferMobileOnly === true ||
    data?.preferMobileOnly === "true" ||
    data?.singleDevice === true ||
    data?.singleDevice === "true";

  const finalTokens = preferMobileOnly ? tokens.slice(0, 1) : tokens;
  console.log(`📤 [FCM] Sending notification to ${role} ${userId} with ${finalTokens.length} token(s)`);
  return sendNotification(finalTokens, notification, data);
}
