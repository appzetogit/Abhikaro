/**
 * Test script to verify FCM notifications are working
 * Run: node test-notifications.js
 */

import { initializeFcm, sendToUser, getTokensForUser } from './modules/fcm/services/fcmService.js';
import User from './modules/auth/models/User.js';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import Delivery from './modules/delivery/models/Delivery.js';
import Admin from './modules/admin/models/Admin.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testNotifications() {
  console.log('\n🧪 ========================================');
  console.log('🧪 FCM Notification Test Script');
  console.log('🧪 ========================================\n');

  // 1. Check FCM initialization
  console.log('1️⃣ Checking FCM initialization...');
  const fcmInitialized = initializeFcm();
  if (!fcmInitialized) {
    console.error('❌ FCM not initialized. Check environment variables:');
    console.error('   - FIREBASE_PROJECT_ID');
    console.error('   - FIREBASE_PRIVATE_KEY');
    console.error('   - FIREBASE_CLIENT_EMAIL');
    process.exit(1);
  }
  console.log('✅ FCM initialized successfully\n');

  // 2. Connect to MongoDB
  console.log('2️⃣ Connecting to MongoDB...');
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/abhikaro';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }

  // 3. Find users with FCM tokens
  console.log('3️⃣ Finding users with FCM tokens...\n');

  const usersWithTokens = await User.find({
    $or: [
      { fcmtokenWeb: { $exists: true, $ne: null } },
      { fcmtokenMobile: { $exists: true, $ne: null } }
    ]
  }).select('_id name email fcmtokenWeb fcmtokenMobile').limit(1).lean();

  const restaurantsWithTokens = await Restaurant.find({
    $or: [
      { fcmtokenWeb: { $exists: true, $ne: null } },
      { fcmtokenMobile: { $exists: true, $ne: null } }
    ]
  }).select('_id name email fcmtokenWeb fcmtokenMobile').limit(1).lean();

  const deliveriesWithTokens = await Delivery.find({
    $or: [
      { fcmtokenWeb: { $exists: true, $ne: null } },
      { fcmtokenMobile: { $exists: true, $ne: null } }
    ]
  }).select('_id name phone fcmtokenWeb fcmtokenMobile').limit(1).lean();

  const adminsWithTokens = await Admin.find({
    $or: [
      { fcmtokenWeb: { $exists: true, $ne: null } },
      { fcmtokenMobile: { $exists: true, $ne: null } }
    ]
  }).select('_id name email fcmtokenWeb fcmtokenMobile').limit(1).lean();

  console.log(`📊 Found ${usersWithTokens.length} user(s) with tokens`);
  console.log(`📊 Found ${restaurantsWithTokens.length} restaurant(s) with tokens`);
  console.log(`📊 Found ${deliveriesWithTokens.length} delivery boy(s) with tokens`);
  console.log(`📊 Found ${adminsWithTokens.length} admin(s) with tokens\n`);

  if (usersWithTokens.length === 0 && restaurantsWithTokens.length === 0 && 
      deliveriesWithTokens.length === 0 && adminsWithTokens.length === 0) {
    console.warn('⚠️  No users found with FCM tokens. Please login to the app first to register tokens.\n');
    await mongoose.disconnect();
    process.exit(0);
  }

  // 4. Test sending notifications
  console.log('4️⃣ Testing notification sending...\n');

  const testResults = [];

  // Test User notification
  if (usersWithTokens.length > 0) {
    const user = usersWithTokens[0];
    console.log(`📤 Testing notification to User: ${user.name || user.email} (${user._id})`);
    const tokens = await getTokensForUser(user._id.toString(), 'user');
    console.log(`   Found ${tokens.length} token(s)`);
    
    if (tokens.length > 0) {
      const result = await sendToUser(
        user._id.toString(),
        'user',
        {
          title: '🧪 Test Notification - User',
          body: 'This is a test notification from the backend test script.'
        },
        {
          type: 'test',
          tag: `test_user_${Date.now()}`
        }
      );
      testResults.push({ type: 'User', success: result.success, ...result });
      console.log(`   Result: ${result.success ? '✅ Success' : '❌ Failed'} - ${result.error || 'Sent'}\n`);
    } else {
      console.log('   ⚠️  No tokens found\n');
      testResults.push({ type: 'User', success: false, error: 'No tokens' });
    }
  }

  // Test Restaurant notification
  if (restaurantsWithTokens.length > 0) {
    const restaurant = restaurantsWithTokens[0];
    console.log(`📤 Testing notification to Restaurant: ${restaurant.name || restaurant.email} (${restaurant._id})`);
    const tokens = await getTokensForUser(restaurant._id.toString(), 'restaurant');
    console.log(`   Found ${tokens.length} token(s)`);
    
    if (tokens.length > 0) {
      const result = await sendToUser(
        restaurant._id.toString(),
        'restaurant',
        {
          title: '🧪 Test Notification - Restaurant',
          body: 'This is a test notification from the backend test script.'
        },
        {
          type: 'test',
          tag: `test_restaurant_${Date.now()}`
        }
      );
      testResults.push({ type: 'Restaurant', success: result.success, ...result });
      console.log(`   Result: ${result.success ? '✅ Success' : '❌ Failed'} - ${result.error || 'Sent'}\n`);
    } else {
      console.log('   ⚠️  No tokens found\n');
      testResults.push({ type: 'Restaurant', success: false, error: 'No tokens' });
    }
  }

  // Test Delivery notification
  if (deliveriesWithTokens.length > 0) {
    const delivery = deliveriesWithTokens[0];
    console.log(`📤 Testing notification to Delivery: ${delivery.name || delivery.phone} (${delivery._id})`);
    const tokens = await getTokensForUser(delivery._id.toString(), 'delivery');
    console.log(`   Found ${tokens.length} token(s)`);
    
    if (tokens.length > 0) {
      const result = await sendToUser(
        delivery._id.toString(),
        'delivery',
        {
          title: '🧪 Test Notification - Delivery',
          body: 'This is a test notification from the backend test script.'
        },
        {
          type: 'test',
          tag: `test_delivery_${Date.now()}`
        }
      );
      testResults.push({ type: 'Delivery', success: result.success, ...result });
      console.log(`   Result: ${result.success ? '✅ Success' : '❌ Failed'} - ${result.error || 'Sent'}\n`);
    } else {
      console.log('   ⚠️  No tokens found\n');
      testResults.push({ type: 'Delivery', success: false, error: 'No tokens' });
    }
  }

  // Test Admin notification
  if (adminsWithTokens.length > 0) {
    const admin = adminsWithTokens[0];
    console.log(`📤 Testing notification to Admin: ${admin.name || admin.email} (${admin._id})`);
    const tokens = await getTokensForUser(admin._id.toString(), 'admin');
    console.log(`   Found ${tokens.length} token(s)`);
    
    if (tokens.length > 0) {
      const result = await sendToUser(
        admin._id.toString(),
        'admin',
        {
          title: '🧪 Test Notification - Admin',
          body: 'This is a test notification from the backend test script.'
        },
        {
          type: 'test',
          tag: `test_admin_${Date.now()}`
        }
      );
      testResults.push({ type: 'Admin', success: result.success, ...result });
      console.log(`   Result: ${result.success ? '✅ Success' : '❌ Failed'} - ${result.error || 'Sent'}\n`);
    } else {
      console.log('   ⚠️  No tokens found\n');
      testResults.push({ type: 'Admin', success: false, error: 'No tokens' });
    }
  }

  // 5. Summary
  console.log('5️⃣ Test Summary:');
  console.log('========================================\n');
  testResults.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.type}: ${result.success ? 'Success' : 'Failed'}`);
    if (result.successCount !== undefined) {
      console.log(`   Sent to ${result.successCount} device(s)`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  });

  const successCount = testResults.filter(r => r.success).length;
  const totalCount = testResults.length;
  console.log(`\n📊 Overall: ${successCount}/${totalCount} tests passed\n`);

  await mongoose.disconnect();
  console.log('✅ Test completed. Check your devices for notifications!\n');
  process.exit(0);
}

// Run the test
testNotifications().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
