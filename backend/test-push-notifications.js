/**
 * Test script to verify all push notification service functions
 * Run: node test-push-notifications.js
 */

import {
  notifyUserOrderPlaced,
  notifyUserRestaurantAccepted,
  notifyUserOrderReady,
  notifyUserOutForDelivery,
  notifyUserOrderDelivered,
  notifyRestaurantNewOrder,
  notifyAllAdmins,
  notifyUserFromAdmin,
  notifyRestaurantFromAdmin,
  notifyDeliveryFromAdmin
} from './modules/fcm/services/pushNotificationService.js';
import User from './modules/auth/models/User.js';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import Delivery from './modules/delivery/models/Delivery.js';
import Admin from './modules/admin/models/Admin.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testPushNotifications() {
  console.log('\n🧪 ========================================');
  console.log('🧪 Push Notification Service Test');
  console.log('🧪 ========================================\n');

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

  // Find test users
  console.log('2️⃣ Finding test users...\n');
  
  const testUser = await User.findOne({
    $or: [
      { fcmtokenWeb: { $exists: true, $ne: null } },
      { fcmtokenMobile: { $exists: true, $ne: null } }
    ]
  }).lean();

  const testRestaurant = await Restaurant.findOne({
    $or: [
      { fcmtokenWeb: { $exists: true, $ne: null } },
      { fcmtokenMobile: { $exists: true, $ne: null } }
    ]
  }).lean();

  const testDelivery = await Delivery.findOne({
    $or: [
      { fcmtokenWeb: { $exists: true, $ne: null } },
      { fcmtokenMobile: { $exists: true, $ne: null } }
    ]
  }).lean();

  const testAdmin = await Admin.findOne({
    $or: [
      { fcmtokenWeb: { $exists: true, $ne: null } },
      { fcmtokenMobile: { $exists: true, $ne: null } }
    ]
  }).lean();

  if (!testUser) {
    console.warn('⚠️  No user found with FCM tokens. Skipping user notification tests.\n');
  }
  if (!testRestaurant) {
    console.warn('⚠️  No restaurant found with FCM tokens. Skipping restaurant notification tests.\n');
  }
  if (!testDelivery) {
    console.warn('⚠️  No delivery boy found with FCM tokens. Skipping delivery notification tests.\n');
  }
  if (!testAdmin) {
    console.warn('⚠️  No admin found with FCM tokens. Skipping admin notification tests.\n');
  }

  const testResults = [];

  // Test User Notifications
  console.log('3️⃣ Testing User Notifications...\n');
  
  if (testUser) {
    const mockOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderId: 'TEST-ORDER-001',
      userId: testUser._id,
      totalAmount: 500,
      status: 'pending'
    };

    console.log('   📤 Testing notifyUserOrderPlaced...');
    try {
      await notifyUserOrderPlaced(mockOrder);
      testResults.push({ type: 'notifyUserOrderPlaced', success: true });
      console.log('   ✅ Success\n');
    } catch (error) {
      testResults.push({ type: 'notifyUserOrderPlaced', success: false, error: error.message });
      console.log(`   ❌ Failed: ${error.message}\n`);
    }

    console.log('   📤 Testing notifyUserRestaurantAccepted...');
    try {
      await notifyUserRestaurantAccepted(mockOrder);
      testResults.push({ type: 'notifyUserRestaurantAccepted', success: true });
      console.log('   ✅ Success\n');
    } catch (error) {
      testResults.push({ type: 'notifyUserRestaurantAccepted', success: false, error: error.message });
      console.log(`   ❌ Failed: ${error.message}\n`);
    }

    console.log('   📤 Testing notifyUserOrderReady...');
    try {
      await notifyUserOrderReady(mockOrder);
      testResults.push({ type: 'notifyUserOrderReady', success: true });
      console.log('   ✅ Success\n');
    } catch (error) {
      testResults.push({ type: 'notifyUserOrderReady', success: false, error: error.message });
      console.log(`   ❌ Failed: ${error.message}\n`);
    }

    console.log('   📤 Testing notifyUserOutForDelivery...');
    try {
      await notifyUserOutForDelivery(mockOrder);
      testResults.push({ type: 'notifyUserOutForDelivery', success: true });
      console.log('   ✅ Success\n');
    } catch (error) {
      testResults.push({ type: 'notifyUserOutForDelivery', success: false, error: error.message });
      console.log(`   ❌ Failed: ${error.message}\n`);
    }

    console.log('   📤 Testing notifyUserOrderDelivered...');
    try {
      await notifyUserOrderDelivered(mockOrder);
      testResults.push({ type: 'notifyUserOrderDelivered', success: true });
      console.log('   ✅ Success\n');
    } catch (error) {
      testResults.push({ type: 'notifyUserOrderDelivered', success: false, error: error.message });
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  // Test Restaurant Notifications
  console.log('4️⃣ Testing Restaurant Notifications...\n');
  
  if (testRestaurant) {
    const mockOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderId: 'TEST-ORDER-002',
      restaurantId: testRestaurant._id,
      totalAmount: 750,
      status: 'pending'
    };

    console.log('   📤 Testing notifyRestaurantNewOrder...');
    try {
      await notifyRestaurantNewOrder(mockOrder);
      testResults.push({ type: 'notifyRestaurantNewOrder', success: true });
      console.log('   ✅ Success\n');
    } catch (error) {
      testResults.push({ type: 'notifyRestaurantNewOrder', success: false, error: error.message });
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  // Test Admin Notifications
  console.log('5️⃣ Testing Admin Notifications...\n');
  
  console.log('   📤 Testing notifyAllAdmins...');
  try {
    await notifyAllAdmins({
      title: '🧪 Test Admin Broadcast',
      body: 'This is a test broadcast notification to all admins.',
      data: {
        type: 'test',
        tag: `test_admin_broadcast_${Date.now()}`
      }
    });
    testResults.push({ type: 'notifyAllAdmins', success: true });
    console.log('   ✅ Success\n');
  } catch (error) {
    testResults.push({ type: 'notifyAllAdmins', success: false, error: error.message });
    console.log(`   ❌ Failed: ${error.message}\n`);
  }

  // Test Admin-to-User/Restaurant/Delivery Notifications
  console.log('6️⃣ Testing Admin-to-User/Restaurant/Delivery Notifications...\n');
  
  if (testUser) {
    console.log('   📤 Testing notifyUserFromAdmin...');
    try {
      await notifyUserFromAdmin(testUser._id.toString(), {
        title: '🧪 Test Admin-to-User',
        body: 'This is a test notification from admin to user.',
        data: {
          type: 'admin_notification',
          tag: `test_admin_user_${Date.now()}`
        }
      });
      testResults.push({ type: 'notifyUserFromAdmin', success: true });
      console.log('   ✅ Success\n');
    } catch (error) {
      testResults.push({ type: 'notifyUserFromAdmin', success: false, error: error.message });
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  if (testRestaurant) {
    console.log('   📤 Testing notifyRestaurantFromAdmin...');
    try {
      await notifyRestaurantFromAdmin(testRestaurant._id.toString(), {
        title: '🧪 Test Admin-to-Restaurant',
        body: 'This is a test notification from admin to restaurant.',
        data: {
          type: 'admin_notification',
          tag: `test_admin_restaurant_${Date.now()}`
        }
      });
      testResults.push({ type: 'notifyRestaurantFromAdmin', success: true });
      console.log('   ✅ Success\n');
    } catch (error) {
      testResults.push({ type: 'notifyRestaurantFromAdmin', success: false, error: error.message });
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  if (testDelivery) {
    console.log('   📤 Testing notifyDeliveryFromAdmin...');
    try {
      await notifyDeliveryFromAdmin(testDelivery._id.toString(), {
        title: '🧪 Test Admin-to-Delivery',
        body: 'This is a test notification from admin to delivery boy.',
        data: {
          type: 'admin_notification',
          tag: `test_admin_delivery_${Date.now()}`
        }
      });
      testResults.push({ type: 'notifyDeliveryFromAdmin', success: true });
      console.log('   ✅ Success\n');
    } catch (error) {
      testResults.push({ type: 'notifyDeliveryFromAdmin', success: false, error: error.message });
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  // Summary
  console.log('7️⃣ Test Summary:');
  console.log('========================================\n');
  testResults.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.type}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  const successCount = testResults.filter(r => r.success).length;
  const totalCount = testResults.length;
  console.log(`\n📊 Overall: ${successCount}/${totalCount} tests passed\n`);

  await mongoose.disconnect();
  console.log('✅ All notification tests completed. Check your devices!\n');
  process.exit(0);
}

// Run the test
testPushNotifications().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
