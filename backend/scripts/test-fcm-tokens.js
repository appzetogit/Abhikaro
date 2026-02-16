#!/usr/bin/env node

/**
 * Quick FCM token test script
 *
 * What it does:
 * 1. Loads backend .env
 * 2. Connects to MongoDB
 * 3. Prints how many FCM tokens are stored
 * 4. Shows the latest few tokens (userId, role, platform)
 *
 * Usage (from backend folder):
 *   node scripts/test-fcm-tokens.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import FcmToken from '../modules/fcm/models/FcmToken.js';

async function main() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await connectDB();

    const total = await FcmToken.countDocuments();
    console.log(`\n✅ Total FCM tokens in DB: ${total}\n`);

    if (total === 0) {
      console.log('No FCM tokens found. After logging in from the app (and granting notification permission), run this again.');
      return;
    }

    // Platform breakdown
    const platformBreakdown = await FcmToken.aggregate([
      {
        $group: {
          _id: '$platform',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log('📊 Platform Breakdown:');
    platformBreakdown.forEach((p) => {
      const platform = p._id || 'unknown';
      const count = p.count;
      const percentage = ((count / total) * 100).toFixed(1);
      console.log(`   ${platform.padEnd(10)}: ${count.toString().padStart(4)} tokens (${percentage}%)`);
    });
    console.log('');

    // Role breakdown
    const roleBreakdown = await FcmToken.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log('👥 Role Breakdown:');
    roleBreakdown.forEach((r) => {
      const role = r._id || 'unknown';
      const count = r.count;
      const percentage = ((count / total) * 100).toFixed(1);
      console.log(`   ${role.padEnd(10)}: ${count.toString().padStart(4)} tokens (${percentage}%)`);
    });
    console.log('');

    const latest = await FcmToken.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log('📋 Last 10 tokens:');
    latest.forEach((t, idx) => {
      const tokenPreview = t.fcmToken ? t.fcmToken.substring(0, 30) + '...' : 'N/A';
      console.log(
        `#${idx + 1}: role=${t.role.padEnd(10)} platform=${(t.platform || 'unknown').padEnd(8)} userId=${t.userId} createdAt=${t.createdAt?.toISOString()}`
      );
      console.log(`   Token: ${tokenPreview}`);
    });
  } catch (err) {
    console.error('❌ FCM token test failed:', err);
  } finally {
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  }
}

main();

