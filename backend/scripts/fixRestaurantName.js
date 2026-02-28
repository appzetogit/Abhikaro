/**
 * Quick script to fix a specific restaurant's name
 * Run: node backend/scripts/fixRestaurantName.js
 */

import mongoose from 'mongoose';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import dotenv from 'dotenv';

dotenv.config();

const fixRestaurantName = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Fix the specific restaurant
    const restaurantId = '69a2953227388a642ad05496';
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      console.log('❌ Restaurant not found');
      await mongoose.disconnect();
      process.exit(1);
    }

    const correctName = restaurant.onboarding?.step1?.restaurantName;
    
    if (!correctName) {
      console.log('❌ No restaurantName found in onboarding.step1');
      await mongoose.disconnect();
      process.exit(1);
    }

    if (restaurant.name === correctName) {
      console.log('✅ Restaurant name is already correct');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`📝 Updating restaurant name:`);
    console.log(`   Old: "${restaurant.name}"`);
    console.log(`   New: "${correctName}"`);

    restaurant.name = correctName;
    await restaurant.save();

    console.log('✅ Restaurant name updated successfully');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

fixRestaurantName();
