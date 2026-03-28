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
    if (!("Notification" in window)) {
      return null;
    }
    
    const permission = await Notification.requestPermission();
    
    if (permission !== "granted") {
      return null;
    }

    const messaging = await getMessaging();
    if (!messaging) {
      return null;
    }

    const vapidKey = await getVapidKey();
    if (!vapidKey) {
      return null;
    }

    const { getToken } = await import("firebase/messaging");
    
    const serviceWorkerRegistration =
      "serviceWorker" in navigator
        ? await navigator.serviceWorker.register("/firebase-messaging-sw.js")
        : undefined;

    const token = await getToken(messaging, {
      vapidKey,
      ...(serviceWorkerRegistration ? { serviceWorkerRegistration } : {}),
    });
    
    return token || null;
  } catch (err) {
    // Handle service worker registration errors gracefully
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
  
  const token = providedToken || (await getFcmToken());
  
  if (!token) {
    return;
  }
  
  if (!accessToken) {
    return;
  }
  
  try {
    const apiClient = (await import("./api/axios.js")).default;
    await apiClient.post(
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
  } catch (err) {
    // Registration failed
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
    // FCM remove token error
  }
}

/**
 * Set up foreground message handler (when app is open)
 * @param {Function} callback - Function to handle notification: (payload) => void
 * @returns {Function} Cleanup function to unsubscribe
 */
export async function onForegroundMessage(callback) {
  try {
    const messaging = await getMessaging();
    if (!messaging) {
      return () => {}; // Return no-op cleanup
    }

    const { onMessage } = await import("firebase/messaging");
    
    // Set up the message handler
    const unsubscribe = onMessage(messaging, (payload) => {
      // Check for duplicate using tag
      const tag = payload.data?.tag || payload.data?.orderId || payload.data?.notificationId;
      if (tag) {
        // Check if we've already shown this notification
        const notificationKey = `fcm_notification_${tag}`;
        const lastShown = sessionStorage.getItem(notificationKey);
        const now = Date.now();
        
        // If same notification was shown in last 2 seconds, skip (prevent duplicates)
        if (lastShown && (now - parseInt(lastShown)) < 2000) {
          return;
        }
        sessionStorage.setItem(notificationKey, now.toString());
      }
      
      // Call the callback with the payload
      if (callback && typeof callback === 'function') {
        callback(payload);
      }
    });

    return unsubscribe;
  } catch (err) {
    return () => {}; // Return no-op cleanup
  }
}
