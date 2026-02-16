import { saveFcmToken, sendToUser } from './fcmService.js';

/**
 * Save FCM token and optionally send notification
 */
export async function handleAuthFcmToken(userId, role, fcmToken, platform, deviceId, options = {}) {
  if (!userId || !fcmToken) {
    console.warn('⚠️  [FCM] Skipping token save: missing userId or fcmToken');
    return;
  }

  console.log('💾 [FCM] Saving token to database...');
  console.log('💾 [FCM] UserId:', userId);
  console.log('💾 [FCM] Role:', role);
  console.log('💾 [FCM] Platform:', platform);
  console.log('💾 [FCM] Token:', fcmToken.substring(0, 30) + '...');

  try {
    const result = await saveFcmToken({ userId, role, fcmToken, platform, deviceId });
    console.log('✅ [FCM] Token saved to database successfully');
    console.log('✅ [FCM] Document ID:', result._id);
    console.log('✅ [FCM] Created/Updated at:', result.createdAt || result.updatedAt);
  } catch (err) {
    console.error('❌ [FCM] Token save error:', err.message);
    console.error('❌ [FCM] Error stack:', err.stack);
    throw err;
  }

  if (options.sendWelcome) {
    sendToUser(userId, role, {
      title: 'Welcome to Abhi Karo!',
      body: 'Thank you for signing up. Start exploring restaurants and order your favorite food.',
    }, { type: 'welcome' }).catch((e) => console.error('Welcome notification error:', e.message));
  }

  if (options.sendLoginAlert) {
    sendToUser(userId, role, {
      title: 'Login Successful',
      body: 'You have successfully logged in to your account.',
    }, { type: 'login' }).catch((e) => console.error('Login notification error:', e.message));
  }
}
