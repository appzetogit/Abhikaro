#!/usr/bin/env node

/**
 * Query FCM tokens by platform
 * 
 * Usage:
 *   node scripts/test-fcm-by-platform.js
 *   node scripts/test-fcm-by-platform.js --platform android
 *   node scripts/test-fcm-by-platform.js --platform ios
 *   node scripts/test-fcm-by-platform.js --platform web
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import FcmToken from '../modules/fcm/models/FcmToken.js';

async function main() {
  try {
    const args = process.argv.slice(2);
    const platformArg = args.find(arg => arg.startsWith('--platform'));
    const platform = platformArg ? platformArg.split('=')[1] : null;

    console.log('🔍 Connecting to MongoDB...');
    await connectDB();

    let query = {};
    if (platform) {
      const validPlatforms = ['web', 'android', 'ios'];
      if (!validPlatforms.includes(platform)) {
        console.error(`❌ Invalid platform. Must be one of: ${validPlatforms.join(', ')}`);
        process.exit(1);
      }
      query.platform = platform;
      console.log(`\n📱 Filtering for platform: ${platform}\n`);
    } else {
      console.log('\n📊 Showing all platforms:\n');
    }

    const tokens = await FcmToken.find(query)
      .sort({ createdAt: -1 })
      .lean();

    if (tokens.length === 0) {
      console.log(`No FCM tokens found${platform ? ` for platform: ${platform}` : ''}.`);
      if (platform === 'android' || platform === 'ios') {
        console.log('\n💡 To register mobile tokens:');
        console.log('   1. Implement FCM in your mobile app (see backend/MOBILE_FCM_INTEGRATION.md)');
        console.log('   2. Get FCM token from Firebase SDK');
        console.log('   3. Call POST /api/fcm/register-token with platform="android" or "ios"');
      }
      return;
    }

    // Group by platform
    const byPlatform = {};
    tokens.forEach(token => {
      const plat = token.platform || 'unknown';
      if (!byPlatform[plat]) {
        byPlatform[plat] = [];
      }
      byPlatform[plat].push(token);
    });

    // Display results
    Object.keys(byPlatform).sort().forEach(plat => {
      const count = byPlatform[plat].length;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📱 Platform: ${plat.toUpperCase()} (${count} token${count !== 1 ? 's' : ''})`);
      console.log('='.repeat(60));

      byPlatform[plat].forEach((token, idx) => {
        const tokenPreview = token.fcmToken 
          ? token.fcmToken.substring(0, 50) + '...' 
          : 'N/A';
        
        console.log(`\n#${idx + 1}:`);
        console.log(`   Token ID: ${token._id}`);
        console.log(`   User ID:  ${token.userId}`);
        console.log(`   Role:     ${token.role}`);
        console.log(`   Platform: ${token.platform || 'unknown'}`);
        console.log(`   Device ID: ${token.deviceId || '(not set)'}`);
        console.log(`   Created:  ${token.createdAt?.toISOString()}`);
        console.log(`   Updated:  ${token.updatedAt?.toISOString()}`);
        console.log(`   Token:    ${tokenPreview}`);
      });
    });

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 Summary:');
    Object.keys(byPlatform).forEach(plat => {
      console.log(`   ${plat.padEnd(10)}: ${byPlatform[plat].length} token(s)`);
    });
    console.log(`   ${'TOTAL'.padEnd(10)}: ${tokens.length} token(s)`);
    console.log('='.repeat(60));

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  }
}

main();
