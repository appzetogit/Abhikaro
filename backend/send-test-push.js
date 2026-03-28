import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { sendToUser } from './modules/fcm/services/fcmService.js';
import User from './modules/auth/models/User.js';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import Delivery from './modules/delivery/models/Delivery.js';
import Admin from './modules/admin/models/Admin.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function sendTest() {
  const role = process.argv[2];
  const email = process.argv[3];

  if (!role || !email) {
    console.log('Usage: node send-test-push.js <role> <email>');
    console.log('Roles: user, restaurant, delivery, admin');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    let model;
    switch (role) {
      case 'user': model = User; break;
      case 'restaurant': model = Restaurant; break;
      case 'delivery': model = Delivery; break;
      case 'admin': model = Admin; break;
      default: console.error('Invalid role'); process.exit(1);
    }

    const target = await model.findOne({ email });
    if (!target) {
      console.error(`❌ ${role} with email ${email} not found`);
      process.exit(1);
    }

    console.log(`🚀 Sending test notification to ${role}: ${email} (${target._id})`);
    
    const result = await sendToUser(target._id, role, {
      title: 'Test Notification',
      body: 'If you see this, push notifications are working! 🚀',
    }, { type: 'test' });

    console.log('📊 Result:', result);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

sendTest();
