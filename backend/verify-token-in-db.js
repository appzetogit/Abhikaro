import mongoose from 'mongoose';
import User from './modules/auth/models/User.js';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import Delivery from './modules/delivery/models/Delivery.js';
import Admin from './modules/admin/models/Admin.js';
import Hotel from './modules/hotel/models/Hotel.js';
import dotenv from 'dotenv';
dotenv.config();

const token = 'dxzTiOYxTuqLlfW0qiqsUe:APA91bF93Y24dPcgMvyck14iDyhFpZnOdibSiIfqOTprkD68-RNJdacAA3MQqdPzZcMB_b1e8pf1wTZI3dk2ffRmYpqjyYf6zyMfGjK01koX8atZNy07Ctg';

async function verify() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected');
  
  const models = [
    { m: User, name: 'User' },
    { m: Restaurant, name: 'Restaurant' },
    { m: Delivery, name: 'Delivery' },
    { m: Admin, name: 'Admin' },
    { m: Hotel, name: 'Hotel' }
  ];
  
  let found = false;
  for (const { m, name } of models) {
    const doc = await m.findOne({
      $or: [
        { fcmtokenWeb: token },
        { fcmtokenMobile: token }
      ]
    });
    
    if (doc) {
      console.log(`🎯 FOUND in ${name}! ID: ${doc._id}, EMAIL: ${doc.email}`);
      found = true;
    }
  }
  
  if (!found) {
    console.log('❌ TOKEN NOT FOUND IN DATABASE');
  }
  
  process.exit(0);
}

verify();
