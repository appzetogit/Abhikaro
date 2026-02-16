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

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Notification';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/vite.svg',
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
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
