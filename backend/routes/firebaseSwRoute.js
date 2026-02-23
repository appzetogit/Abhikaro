/**
 * Serves firebase-messaging-sw.js with Firebase config from env
 * Required for FCM web push - must be served with application/javascript MIME type
 */
import express from 'express';
import { getAllEnvVars } from '../shared/utils/envService.js';

const router = express.Router();

router.get('/firebase-messaging-sw.js', async (req, res) => {
  try {
    const env = await getAllEnvVars();
    const config = {
      apiKey: env.FIREBASE_API_KEY || '',
      authDomain: env.FIREBASE_AUTH_DOMAIN || (env.FIREBASE_PROJECT_ID ? `${env.FIREBASE_PROJECT_ID}.firebaseapp.com` : ''),
      projectId: env.FIREBASE_PROJECT_ID || '',
      storageBucket: env.FIREBASE_STORAGE_BUCKET || (env.FIREBASE_PROJECT_ID ? `${env.FIREBASE_PROJECT_ID}.appspot.com` : ''),
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId: env.FIREBASE_APP_ID || '',
    };

    const swContent = `// Firebase Cloud Messaging Service Worker - Auto-generated
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "${(config.apiKey || '').replace(/"/g, '\\"')}",
  authDomain: "${(config.authDomain || '').replace(/"/g, '\\"')}",
  projectId: "${(config.projectId || '').replace(/"/g, '\\"')}",
  storageBucket: "${(config.storageBucket || '').replace(/"/g, '\\"')}",
  messagingSenderId: "${(config.messagingSenderId || '').replace(/"/g, '\\"')}",
  appId: "${(config.appId || '').replace(/"/g, '\\"')}"
});

const messaging = firebase.messaging();

// Function to play notification sound using Web Audio API
async function playNotificationSound() {
    try {
        const audioUrl = '/audio/alert.mp3';
        console.log('🔊 [SW] Attempting to play notification sound:', audioUrl);
        const response = await fetch(audioUrl);
        if (!response.ok) {
            console.warn('[SW] Could not fetch audio file:', response.status);
            return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new (self.AudioContext || self.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0);
        console.log('✅ [SW] Notification sound played successfully');
        source.onended = () => {
            try {
                audioContext.close();
            } catch (e) {
                // Ignore errors during cleanup
            }
        };
    } catch (error) {
        console.warn('[SW] Could not play notification sound:', error);
    }
}

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Received background message:', payload);
    console.log('[SW] Payload keys:', Object.keys(payload));
    console.log('[SW] Has notification object:', !!payload.notification);
    console.log('[SW] Has data object:', !!payload.data);

    // Play sound for new order notifications
    const isNewOrder = payload.data?.type === 'new_order' || payload.data?.orderId;
    if (isNewOrder) {
        console.log('🔔 [SW] New order notification received - will play sound');
        playNotificationSound();
    }

    // Extract title and body from notification object or data
    const title = payload.notification?.title || payload.data?.title || 'Abhikaro Update';
    const body = payload.notification?.body || payload.data?.body || '';
    const tag = payload.data?.tag || payload.data?.orderId || payload.data?.notificationId || 'admin_broadcast';

    // Icon and Image needs to be absolute URLs for maximum compatibility
    const icon = payload.notification?.icon || payload.data?.icon || '/vite.svg';
    const image = payload.notification?.image || payload.data?.image || null;
    const sound = payload.notification?.sound || payload.data?.sound || (isNewOrder ? '/audio/alert.mp3' : null);

    const notificationOptions = {
        body: body,
        icon: icon,
        image: image,
        data: payload.data || {},
        tag: tag, // THIS IS KEY FOR DEDUPLICATION
        badge: '/vite.svg',
        requireInteraction: true,
        vibrate: [200, 100, 200]
    };

    // Add sound if available
    if (sound) {
        notificationOptions.sound = sound;
    }

    console.log('[SW] Displaying notification: ' + title + ' (Tag: ' + tag + ')');
    console.log('[SW] Notification options:', JSON.stringify(notificationOptions));
    
    // Always show notification manually to ensure it appears
    return self.registration.showNotification(title, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.notification.tag);
    event.notification.close();

    const data = event.notification.data;
    const urlToOpen = data?.link || data?.click_action || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (urlToOpen.includes(client.url) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
`;

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    // Allow Firebase scripts in service worker - CSP for service worker context
    res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://www.google.com https://apis.google.com; connect-src 'self' https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebase.googleapis.com https://fcm.googleapis.com https://*.googleapis.com;");
    res.send(swContent);
  } catch (err) {
    console.error('firebase-messaging-sw.js error:', err.message);
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://www.google.com https://apis.google.com; connect-src 'self' https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebase.googleapis.com https://fcm.googleapis.com https://*.googleapis.com;");
    res.status(500).send('// FCM SW config error: ' + err.message);
  }
});

export default router;
