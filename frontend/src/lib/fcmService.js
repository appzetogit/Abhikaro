/**
 * FCM (Firebase Cloud Messaging) service for web push notifications
 * Uses Firebase Web SDK - credentials stay in frontend config (VAPID key is public)
 */

let messagingInstance = null;

async function getMessaging() {
  if (messagingInstance) return messagingInstance;
  const { getMessaging, isSupported } = await import("firebase/messaging");
  const supported = await isSupported();
  if (!supported) return null;
  // Ensure Firebase is initialized (app may be undefined at module load)
  const { ensureFirebaseInitialized, firebaseApp } = await import("./firebase.js");
  await ensureFirebaseInitialized();
  const { getApps } = await import("firebase/app");
  const app = firebaseApp || getApps()?.[0];
  if (!app) return null;
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

/**
 * Get VAPID key from backend public env or frontend env
 */
async function getVapidKey() {
  try {
    const { adminAPI } = await import("./api/index.js");
    const res = await adminAPI.getPublicEnvVariables();
    if (res?.data?.success && res?.data?.data?.FIREBASE_VAPID_KEY) {
      return res.data.data.FIREBASE_VAPID_KEY;
    }
  } catch (e) {
    // ignore
  }
  return import.meta.env.VITE_FIREBASE_VAPID_KEY || "";
}

/**
 * Request notification permission and return FCM token
 * @returns {Promise<string|null>} FCM token or null
 */
export async function getFcmToken() {
  try {
    console.log("🔔 [FCM] Starting token retrieval...");
    
    if (!("Notification" in window)) {
      console.warn("🔔 [FCM] Notifications not supported in this browser");
      return null;
    }
    
    console.log("🔔 [FCM] Requesting notification permission...");
    const permission = await Notification.requestPermission();
    console.log(`🔔 [FCM] Permission result: ${permission}`);
    
    if (permission !== "granted") {
      console.warn("⚠️  [FCM] Notification permission denied");
      console.warn("⚠️  [FCM] Cannot get FCM token without notification permission");
      console.warn("⚠️  [FCM] User must click 'Allow' when browser prompts for notifications");
      console.warn("⚠️  [FCM] Token will NOT be stored in database until permission is granted");
      return null;
    }
    
    console.log("✅ [FCM] Notification permission granted!");

    const messaging = await getMessaging();
    if (!messaging) {
      console.warn("🔔 [FCM] Firebase messaging not available");
      return null;
    }

    console.log("🔔 [FCM] Getting VAPID key...");
    const vapidKey = await getVapidKey();
    if (!vapidKey) {
      console.warn("🔔 [FCM] VAPID key not configured. Add FIREBASE_VAPID_KEY in Admin or VITE_FIREBASE_VAPID_KEY in .env");
      return null;
    }
    console.log("🔔 [FCM] VAPID key found");

    const { getToken } = await import("firebase/messaging");
    
    console.log("🔔 [FCM] Requesting FCM token from Firebase...");
    // Firebase automatically looks for /firebase-messaging-sw.js at the root
    // The backend serves this dynamically via proxy, or it's in public/ as fallback
    const token = await getToken(messaging, { vapidKey });
    
    if (token) {
      console.log("✅ [FCM] Token received:", token.substring(0, 30) + "...");
    } else {
      console.warn("🔔 [FCM] No token returned from Firebase");
    }
    
    return token || null;
  } catch (err) {
    // Handle service worker registration errors gracefully
    if (err?.code === 'messaging/failed-service-worker-registration' || 
        err?.message?.includes('service worker') ||
        err?.message?.includes('ServiceWorker')) {
      console.warn("FCM: Service worker registration failed.");
      console.warn("Ensure:");
      console.warn("  1. Backend server is running on port 5000");
      console.warn("  2. Backend route /firebase-messaging-sw.js is accessible");
      console.warn("  3. Firebase config is set in backend environment variables");
      console.warn("Error:", err?.message || err);
    } else {
      console.warn("FCM getToken error:", err?.message || err);
    }
    // Return null to allow app to continue without FCM (non-blocking)
    return null;
  }
}

/**
 * Register FCM token with backend (call after login/signup)
 * @param {string} accessToken - JWT access token
 * @param {object} options - { fcmToken?, sendWelcome?, sendLoginAlert? }
 */
export async function registerFcmToken(accessToken, options = {}) {
  const { fcmToken: providedToken, sendWelcome = false, sendLoginAlert = false } = options;
  
  console.log("📤 [FCM] Starting token registration...");
  console.log("📤 [FCM] Options:", { sendWelcome, sendLoginAlert });
  
  const token = providedToken || (await getFcmToken());
  
  if (!token) {
    console.warn("⚠️  [FCM] No token available, skipping registration");
    console.warn("⚠️  [FCM] Reason: Notification permission was denied or token retrieval failed");
    console.warn("⚠️  [FCM] Token will NOT be stored in database");
    console.warn("⚠️  [FCM] To fix: Allow notifications in browser settings and login again");
    return;
  }
  
  if (!accessToken) {
    console.warn("📤 [FCM] No access token available, skipping registration");
    return;
  }

  console.log("📤 [FCM] Sending token to backend:", token.substring(0, 30) + "...");
  
  try {
    const apiClient = (await import("./api/axios.js")).default;
    const response = await apiClient.post(
      "/fcm/register-token",
      {
        fcmToken: token,
        platform: "web",
        sendWelcome: !!sendWelcome,
        sendLoginAlert: !!sendLoginAlert,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    
    console.log("✅ [FCM] Token registered successfully!");
    console.log("✅ [FCM] Backend response:", response.data);
  } catch (err) {
    console.error("❌ [FCM] Registration failed:", err?.response?.data?.message || err?.message);
    console.error("❌ [FCM] Error details:", err?.response?.data || err);
  }
}

/**
 * Remove FCM token on logout
 */
export async function removeFcmToken() {
  const token = await getFcmToken();
  if (!token) return;
  try {
    const apiClient = (await import("./api/axios.js")).default;
    await apiClient.post("/fcm/remove-token", { fcmToken: token });
  } catch (err) {
    console.warn("FCM remove token error:", err?.message);
  }
}
