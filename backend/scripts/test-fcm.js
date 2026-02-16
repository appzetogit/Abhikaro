/**
 * Test FCM push notification
 * Usage: node scripts/test-fcm.js <userId> [role]
 * Example: node scripts/test-fcm.js 6992ee329b9db6db60125ca9 user
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { sendToUser, getTokensForUser } from '../modules/fcm/services/fcmService.js';

const userId = process.argv[2];
const role = process.argv[3] || 'user';

if (!userId) {
  console.error('Usage: node scripts/test-fcm.js <userId> [role]');
  console.error('Example: node scripts/test-fcm.js 6992ee329b9db6db60125ca9 user');
  process.exit(1);
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Check if user has FCM tokens
    const tokens = await getTokensForUser(userId, role);
    if (tokens.length === 0) {
      console.log('⚠️ No FCM tokens found for this user.');
      console.log('   User must log in and allow notifications first.');
      console.log('   Tokens are saved on login/signup when permission is granted.');
      return;
    }
    console.log(`Found ${tokens.length} token(s) for user\n`);

    const result = await sendToUser(
      userId,
      role,
      { title: 'Test Notification', body: 'FCM test from backend script.' },
      { type: 'test' }
    );

    if (result.success) {
      console.log('✅ Notification sent:', result);
    } else {
      console.log('❌ Failed:', result.error || result);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
