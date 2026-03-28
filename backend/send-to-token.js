import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

const token = 'dxzTiOYxTuqLlfW0qiqsUe:APA91bF93Y24dPcgMvyck14iDyhFpZnOdibSiIfqOTprkD68-RNJdacAA3MQqdPzZcMB_b1e8pf1wTZI3dk2ffRmYpqjyYf6zyMfGjK01koX8atZNy07Ctg';

async function sendToExplicitToken() {
  console.log('🚀 Direct test to token:', token.substring(0, 30) + '...');
  
  try {
    const projectId = 'abhikaro-d2df6';
    const clientEmail = 'firebase-adminsdk-fbsvc@abhikaro-d2df6.iam.gserviceaccount.com';
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey
            })
        });
        console.log('✅ Admin initialized manually');
    }

    const message = {
        token: token,
        notification: {
            title: 'Test Success! 🚀',
            body: 'Antigravity has proven the notification delivery works directly to your browser.'
        },
        data: {
            type: 'manual_test',
            click_action: '/'
        },
        android: { priority: 'high' },
        webpush: {
            headers: { Urgency: 'high' },
            notification: { requireInteraction: true }
        }
    };

    console.log('🚀 Sending message...');
    const result = await admin.messaging().send(message);
    console.log('✅ Message sent successfully! Response ID:', result);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error sending message:', error.message);
    if (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/registration-token-not-registered') {
        console.log('⚠️  NOTE: The token provided is invalid or stale (maybe from a previous project registration). Please refresh your browser.');
    }
    process.exit(1);
  }
}

sendToExplicitToken();
