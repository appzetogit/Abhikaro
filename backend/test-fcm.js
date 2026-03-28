import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config();

console.log('--- FCM Test Script ---');
console.log('PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
console.log('CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
console.log('PRIVATE_KEY length:', process.env.FIREBASE_PRIVATE_KEY?.length);

const projectId = process.env.FIREBASE_PROJECT_ID;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

if (!projectId || !privateKey || !clientEmail) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
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
  console.log('✅ Firebase Admin SDK initialized successfully!');
  
  // Test if we can access messaging service
  const messaging = admin.messaging();
  console.log('✅ messaging() service is available.');

  // Try to send a test message to a dummy token (this should fail with "invalid-registration-token" or similar, but the API call itself should succeed if credentials are good)
  const testToken = 'dummy-token-for-testing';
  const message = {
    notification: {
      title: 'Test Notification',
      body: 'This is a test notification from the backend script',
    },
    token: testToken,
  };

  console.log('📤 Sending test message to dummy token...');
  messaging.send(message)
    .then((response) => {
      console.log('✅ Successfully sent message:', response);
    })
    .catch((error) => {
      if (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/registration-token-not-registered') {
        console.log('✅ Credentials are VALID! (Received expected error for dummy token:', error.code, ')');
      } else {
        console.error('❌ FCM Send Error:', error.code, error.message);
      }
    });

} catch (err) {
  console.error('❌ Initialization Error:', err.message);
}
