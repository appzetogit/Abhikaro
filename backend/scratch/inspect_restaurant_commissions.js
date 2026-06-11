import mongoose from 'mongoose';
import dotenv from 'dotenv';
import RestaurantCommission from '../modules/admin/models/RestaurantCommission.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const list = await RestaurantCommission.find({}).lean();
    console.log(`Found ${list.length} RestaurantCommission configurations:`);

    for (const r of list) {
      console.log(`- Restaurant: "${r.restaurantName}" (Id: ${r.restaurant})`);
      console.log(`  Default Commission: Type: ${r.defaultCommission.type}, Value: ${r.defaultCommission.value}`);
      console.log(`  Rules Count: ${r.commissionRules?.length || 0}`);
      console.log(`  Status: ${r.status}`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
