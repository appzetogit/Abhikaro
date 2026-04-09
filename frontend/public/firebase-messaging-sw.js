/* Firebase Cloud Messaging Service Worker (Web Push)
 *
 * Why this exists:
 * - When the app tab is CLOSED / in background, FCM messages are received by the Service Worker.
 * - We must show the notification ourselves via `showNotification()` to reliably display it.
 *
 * Config:
 * - We fetch Firebase config from backend public env endpoint (no auth).
 * - Endpoints tried: `/api/env/public` then `/env/public` (some deployments mount /api differently).
 */

/* eslint-disable no-undef */
/* eslint-disable no-restricted-globals */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Firebase compat SDK for Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

let _messaging = null;
let _firebaseReady = false;

async function fetchPublicEnv() {
  const candidates = ['/api/env/public', '/env/public'];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: 'GET', credentials: 'include' });
      if (!res.ok) continue;
      const json = await res.json();
      // Expected shape: { success: true, data: { FIREBASE_API_KEY, ... } }
      if (json?.success && json?.data) return json.data;
    } catch (e) {
      // ignore and try next candidate
    }
  }
  return null;
}

async function ensureFirebaseMessaging() {
  if (_firebaseReady && _messaging) return _messaging;

  const env = await fetchPublicEnv();

  // Minimal config required for messaging
  const projectId = env?.FIREBASE_PROJECT_ID || '';
  const apiKey = env?.FIREBASE_API_KEY || '';
  const messagingSenderId = env?.FIREBASE_MESSAGING_SENDER_ID || '';
  const appId = env?.FIREBASE_APP_ID || '';

  if (!projectId || !apiKey || !messagingSenderId || !appId) {
    console.warn('[FCM SW] Missing Firebase public env variables; cannot init messaging', {
      hasProjectId: !!projectId,
      hasApiKey: !!apiKey,
      hasSenderId: !!messagingSenderId,
      hasAppId: !!appId,
    });
    return null;
  }

  const authDomain =
    env?.FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : '');
  const storageBucket =
    env?.FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.appspot.com` : '');

  try {
    if (!firebase.apps?.length) {
      firebase.initializeApp({
        apiKey,
        authDomain,
        projectId,
        storageBucket,
        messagingSenderId,
        appId,
      });
    }
    _messaging = firebase.messaging();
    _firebaseReady = true;
    return _messaging;
  } catch (e) {
    console.warn('[FCM SW] Failed to init firebase messaging:', e?.message || e);
    return null;
  }
}

// Ensure messaging init ASAP (best-effort)
ensureFirebaseMessaging();

// Background handler: show a notification
// Note: Must register handler AFTER messaging is available; we retry a few times.
async function setupBackgroundHandler() {
  const messaging = await ensureFirebaseMessaging();
  if (!messaging) return false;

  messaging.onBackgroundMessage((payload) => {
    try {
      const title = payload?.notification?.title || payload?.data?.title || 'AbhiKaro';
      const body = payload?.notification?.body || payload?.data?.body || '';
      const data = payload?.data || {};
      const tag =
        data?.tag || data?.orderId || data?.notificationId || String(Date.now());

      // Optional: deep link (frontend can route based on this)
      const link = data?.link || data?.click_action || '/';

      const options = {
        body,
        icon: data?.icon || '/vite.svg',
        badge: data?.badge || '/vite.svg',
        tag,
        data: { ...data, link },
        // Audible ONLY for new-order channels; keep all other notifications silent.
        // Android Chrome will use default system notification sound (custom MP3 is not reliable in background).
        silent: !(
          (data?.channelId === 'delivery_new_order' ||
            data?.channelId === 'restaurant_new_order') &&
          (data?.type === 'new_order' || !!data?.orderId)
        ),
        requireInteraction: true,
        vibrate: [200, 100, 200],
      };

      // If there is an open window client, ask it to play alert.mp3 (foreground-controlled audio).
      // Only for delivery new-order; won't work if the app is fully closed (no clients).
      const isAudibleNewOrder =
        (data?.channelId === 'delivery_new_order' ||
          data?.channelId === 'restaurant_new_order') &&
        (data?.type === 'new_order' || !!data?.orderId);
      if (isAudibleNewOrder) {
        try {
          self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
              clientList.forEach((client) => {
                client.postMessage({ type: 'PLAY_ALERT_SOUND', data });
              });
            });
        } catch {
          // ignore
        }
      }

      return self.registration.showNotification(title, options);
    } catch (e) {
      // Never throw from SW handler
      return undefined;
    }
  });

  return true;
}

// Try a few times in case env fetch is slow during SW startup
(async () => {
  for (let i = 0; i < 5; i += 1) {
    const ok = await setupBackgroundHandler();
    if (ok) break;
    // small delay
    await new Promise((r) => setTimeout(r, 300));
  }
})();

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const urlToOpen = data.link || data.click_action || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
      return undefined;
    }),
  );
});
