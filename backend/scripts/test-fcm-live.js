#!/usr/bin/env node

/**
 * Live FCM Token Monitor
 * 
 * Watches the database for new FCM tokens in real-time
 * Shows when tokens are added/updated during signup/login
 * 
 * Usage: node scripts/test-fcm-live.js
 * 
 * Keep this running while testing signup/login
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import FcmToken from '../modules/fcm/models/FcmToken.js';

let lastCount = 0;
let knownTokens = new Set();

async function checkForNewTokens() {
  try {
    const currentCount = await FcmToken.countDocuments();
    const latest = await FcmToken.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    // Check for new tokens
    const newTokens = latest.filter(t => !knownTokens.has(t._id.toString()));
    
    if (newTokens.length > 0) {
      console.log('\n🎉 [FCM] NEW TOKEN(S) DETECTED!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      newTokens.forEach((token, idx) => {
        console.log(`\n✨ Token #${idx + 1}:`);
        console.log(`   Role: ${token.role}`);
        console.log(`   Platform: ${token.platform}`);
        console.log(`   UserId: ${token.userId}`);
        console.log(`   Created: ${token.createdAt?.toISOString()}`);
        console.log(`   Token: ${token.fcmToken.substring(0, 40)}...`);
        console.log(`   Document ID: ${token._id}`);
        
        knownTokens.add(token._id.toString());
      });
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
    
    if (currentCount !== lastCount) {
      console.log(`\n📊 [FCM] Total tokens in DB: ${currentCount} (was ${lastCount})`);
      lastCount = currentCount;
    }
    
    // Add all existing tokens to known set
    latest.forEach(t => knownTokens.add(t._id.toString()));
    
  } catch (err) {
    console.error('❌ [FCM] Monitor error:', err.message);
  }
}

async function main() {
  try {
    console.log('🔍 [FCM] Live Token Monitor Started');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Watching for new FCM tokens...');
    console.log('📝 Perform signup/login in the app to see tokens appear here');
    console.log('📝 Press Ctrl+C to stop\n');
    
    await connectDB();
    
    // Get initial count
    lastCount = await FcmToken.countDocuments();
    const initial = await FcmToken.find({}).lean();
    initial.forEach(t => knownTokens.add(t._id.toString()));
    
    console.log(`📊 [FCM] Initial token count: ${lastCount}`);
    console.log('⏳ [FCM] Waiting for new tokens...\n');
    
    // Check every 2 seconds
    setInterval(checkForNewTokens, 2000);
    
    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 [FCM] Monitor stopped');
      await mongoose.connection.close();
      process.exit(0);
    });
    
  } catch (err) {
    console.error('❌ Monitor failed:', err.message);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  }
}

main();
