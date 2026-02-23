/**
 * Cleanup script to remove invalid FCM tokens
 * Run: node cleanup-invalid-tokens.js
 */

import { initializeFcm, sendNotification } from './modules/fcm/services/fcmService.js';
import User from './modules/auth/models/User.js';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import Delivery from './modules/delivery/models/Delivery.js';
import Admin from './modules/admin/models/Admin.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function cleanupInvalidTokens() {
  console.log('\n🧹 ========================================');
  console.log('🧹 FCM Token Cleanup Script');
  console.log('🧹 ========================================\n');

  // Initialize FCM
  if (!initializeFcm()) {
    console.error('❌ FCM not initialized');
    process.exit(1);
  }

  // Connect to MongoDB
  console.log('1️⃣ Connecting to MongoDB...');
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/abhikaro';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }

  // Test all tokens and remove invalid ones
  console.log('2️⃣ Testing and cleaning up invalid tokens...\n');

  const models = [
    { name: 'User', Model: User },
    { name: 'Restaurant', Model: Restaurant },
    { name: 'Delivery', Model: Delivery },
    { name: 'Admin', Model: Admin }
  ];

  let totalCleaned = 0;

  for (const { name, Model } of models) {
    console.log(`📋 Checking ${name} tokens...`);
    
    const docs = await Model.find({
      $or: [
        { fcmtokenWeb: { $exists: true, $ne: null } },
        { fcmtokenMobile: { $exists: true, $ne: null } }
      ]
    }).select('_id fcmtokenWeb fcmtokenMobile').lean();

    console.log(`   Found ${docs.length} ${name}(s) with tokens`);

    for (const doc of docs) {
      const tokens = [];
      if (doc.fcmtokenWeb) tokens.push({ type: 'web', token: doc.fcmtokenWeb });
      if (doc.fcmtokenMobile) tokens.push({ type: 'mobile', token: doc.fcmtokenMobile });

      for (const { type, token } of tokens) {
        // Test token by sending a silent notification
        const result = await sendNotification(
          token,
          { title: 'Test', body: 'Test' },
          { silent: 'true', tag: `test_${Date.now()}` }
        );

        if (!result.success && result.failureCount > 0) {
          console.log(`   ❌ Invalid ${type} token found for ${name} ${doc._id}`);
          
          // Remove invalid token
          const updateField = type === 'web' ? 'fcmtokenWeb' : 'fcmtokenMobile';
          await Model.updateOne(
            { _id: doc._id },
            { $set: { [updateField]: null } }
          );
          
          totalCleaned++;
          console.log(`   ✅ Removed invalid ${type} token`);
        }
      }
    }
    console.log('');
  }

  console.log(`\n✅ Cleanup completed. Removed ${totalCleaned} invalid token(s)\n`);

  await mongoose.disconnect();
  process.exit(0);
}

cleanupInvalidTokens().catch(error => {
  console.error('❌ Cleanup failed:', error);
  process.exit(1);
});
