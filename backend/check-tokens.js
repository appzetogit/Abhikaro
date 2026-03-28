import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './modules/auth/models/User.js';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import Delivery from './modules/delivery/models/Delivery.js';
import Hotel from './modules/hotel/models/Hotel.js';
import Admin from './modules/admin/models/Admin.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI missing in .env');
  process.exit(1);
}

async function checkTokens() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const models = [
      { name: 'User', model: User },
      { name: 'Restaurant', model: Restaurant },
      { name: 'Delivery', model: Delivery },
      { name: 'Hotel', model: Hotel },
      { name: 'Admin', model: Admin }
    ];

    for (const { name, model } of models) {
      const webTokens = await model.countDocuments({ fcmtokenWeb: { $ne: null, $exists: true } });
      const mobileTokens = await model.countDocuments({ fcmtokenMobile: { $ne: null, $exists: true } });
      console.log(`📊 ${name}: ${webTokens} web tokens, ${mobileTokens} mobile tokens`);
      
      if (webTokens > 0 || mobileTokens > 0) {
        const sample = await model.findOne({ $or: [
          { fcmtokenWeb: { $ne: null, $exists: true } },
          { fcmtokenMobile: { $ne: null, $exists: true } }
        ] }).select('fcmtokenWeb fcmtokenMobile email name').lean();
        console.log(`   Sample ${name}:`, sample.email || sample.name || sample._id, 
          sample.fcmtokenWeb ? '(Web Token: Present)' : '',
          sample.fcmtokenMobile ? '(Mobile Token: Present)' : '');
      }
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

checkTokens();
