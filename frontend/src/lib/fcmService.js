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
      if (import.meta.env.DEV) {
        console.warn("[FCM] Notifications API not available in this browser");
      }
      return null;
    }

    if (Notification.permission === "denied") {
      if (import.meta.env.DEV) {
        console.warn("[FCM] Notification permission denied — enable notifications for this site in browser settings");
      }
      return null;
    }

    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        if (import.meta.env.DEV) {
          console.warn("[FCM] Notification permission not granted:", permission);
        }
        return null;
      }
    }

    const messaging = await getMessaging();
    if (!messaging) {
      if (import.meta.env.DEV) {
        console.warn("[FCM] Firebase Messaging not supported or Firebase app missing");
      }
      return null;
    }

    const vapidKey = await getVapidKey();
    if (!vapidKey || String(vapidKey).trim() === "") {
      if (import.meta.env.DEV) {
        console.warn(
          "[FCM] Missing VAPID key — set FIREBASE_VAPID_KEY in backend .env or VITE_FIREBASE_VAPID_KEY in frontend .env",
        );
      }
      return null;
    }

    const { getToken } = await import("firebase/messaging");

    let serviceWorkerRegistration;
    if ("serviceWorker" in navigator) {
      serviceWorkerRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      await navigator.serviceWorker.ready;
    }

    const token = await getToken(messaging, {
      vapidKey: String(vapidKey).trim(),
      ...(serviceWorkerRegistration ? { serviceWorkerRegistration } : {}),
    });

    return token || null;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[FCM] getFcmToken failed:", err?.message || err);
    }
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
    if (import.meta.env.DEV) {
      console.log("[FCM] Token registered with backend");
    }
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || "unknown error";
    if (import.meta.env.DEV) {
      console.warn("[FCM] Backend registration failed:", msg, err?.response?.status);
    }
  }
}

/**
 * Register a *native* (Android/iOS) FCM token with backend.
 * Use this in Flutter InAppWebView wrappers where Web Push isn't reliable.
 *
 * @param {string} accessToken - JWT access token for the logged-in role (hotel/restaurant/user/etc.)
 * @param {string} nativeFcmToken - token obtained from firebase_messaging (native)
 * @param {object} options - { platform: 'android'|'ios', deviceId?: string|null }
 */
export async function registerNativeFcmToken(accessToken, nativeFcmToken, options = {}) {
  const { platform = "android", deviceId = null } = options || {};

  if (!nativeFcmToken || typeof nativeFcmToken !== "string") return;
  if (!accessToken) return;

  try {
    const apiClient = (await import("./api/axios.js")).default;
    await apiClient.post(
      "/fcm/register-token",
      {
        fcmToken: nativeFcmToken.trim(),
        platform: platform === "ios" ? "ios" : "android",
        deviceId: deviceId || null,
        // native wrapper handles its own welcome/login UX
        sendWelcome: false,
        sendLoginAlert: false,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (import.meta.env.DEV) {
      console.log("[FCM] Native token registered with backend");
    }
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || "unknown error";
    if (import.meta.env.DEV) {
      console.warn("[FCM] Native backend registration failed:", msg, err?.response?.status);
    }
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
