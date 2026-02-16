#!/usr/bin/env node

/**
 * Complete FCM Test Script
 * 
 * Tests the entire FCM flow:
 * 1. Checks Firebase Admin SDK initialization
 * 2. Checks MongoDB connection
 * 3. Lists all FCM tokens in DB
 * 4. Tests sending a notification (optional)
 * 
 * Usage: node scripts/test-fcm-complete.js [--send-test]
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import FcmToken from '../modules/fcm/models/FcmToken.js';
import { initializeFcm, sendNotification } from '../modules/fcm/services/fcmService.js';

async function main() {
  const sendTest = process.argv.includes('--send-test');
  
  try {
    console.log('🔍 Testing FCM Setup...\n');
    
    // 1. Check MongoDB connection
    console.log('1️⃣ Connecting to MongoDB...');
    await connectDB();
    console.log('   ✅ MongoDB connected\n');
    
    // 2. Check Firebase Admin SDK
    console.log('2️⃣ Checking Firebase Admin SDK...');
    let fcmInitialized = false;
    try {
      fcmInitialized = initializeFcm();
      if (fcmInitialized) {
        console.log('   ✅ Firebase Admin SDK initialized\n');
      } else {
        console.log('   ⚠️  Firebase Admin SDK not initialized');
        console.log('   Check: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env\n');
      }
    } catch (err) {
      console.log('   ❌ Error initializing Firebase Admin SDK:', err.message);
      console.log('   Check: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env\n');
    }
    
    // 3. Count FCM tokens
    console.log('3️⃣ Checking FCM tokens in database...');
    const total = await FcmToken.countDocuments();
    console.log(`   📊 Total FCM tokens: ${total}\n`);
    
    if (total === 0) {
      console.log('   ⚠️  No FCM tokens found.');
      console.log('   📝 To get tokens:');
      console.log('      1. Restart backend & frontend servers');
      console.log('      2. Clear browser cache & service workers');
      console.log('      3. Login from app and allow notifications');
      console.log('      4. Run this script again\n');
    } else {
      // 4. List tokens
      console.log('4️⃣ Latest FCM tokens:');
      const latest = await FcmToken.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      
      latest.forEach((t, idx) => {
        console.log(`   ${idx + 1}. Role: ${t.role}, Platform: ${t.platform}, UserId: ${t.userId}`);
        console.log(`      Created: ${t.createdAt?.toISOString()}`);
        console.log(`      Token: ${t.fcmToken.substring(0, 20)}...`);
        console.log('');
      });
      
      // 5. Optional: Send test notification
      if (sendTest && latest.length > 0) {
        console.log('5️⃣ Sending test notification...');
        const testToken = latest[0].fcmToken;
        const result = await sendNotification(
          testToken,
          {
            title: 'FCM Test',
            body: 'This is a test notification from the backend'
          },
          { test: 'true' }
        );
        
        if (result.success) {
          console.log('   ✅ Test notification sent successfully\n');
        } else {
          console.log(`   ❌ Failed to send: ${result.error}\n`);
        }
      }
    }
    
    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Summary:');
    console.log(`   MongoDB: ✅ Connected`);
    console.log(`   Firebase Admin: ${fcmInitialized ? '✅' : '❌'} ${fcmInitialized ? 'Initialized' : 'Not initialized'}`);
    console.log(`   FCM Tokens: ${total} found`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err.stack);
  } finally {
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  }
}

main();
