/**
 * Script to fix restaurant names from onboarding data
 * Run this to update restaurant.name from onboarding.step1.restaurantName
 * 
 * Usage: node backend/scripts/fixRestaurantNames.js
 */

import mongoose from 'mongoose';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import dotenv from 'dotenv';

dotenv.config();

const fixRestaurantNames = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all restaurants where name doesn't match onboarding.step1.restaurantName
    const restaurants = await Restaurant.find({
      'onboarding.step1.restaurantName': { $exists: true, $ne: null },
      $expr: {
        $ne: ['$name', '$onboarding.step1.restaurantName']
      }
    }).select('_id name onboarding.step1.restaurantName');

    console.log(`📊 Found ${restaurants.length} restaurants with mismatched names`);

    let updated = 0;
    let errors = 0;

    for (const restaurant of restaurants) {
      try {
        const correctName = restaurant.onboarding.step1.restaurantName;
        const currentName = restaurant.name;

        if (correctName && correctName !== currentName) {
          await Restaurant.findByIdAndUpdate(restaurant._id, {
            $set: { name: correctName }
          });

          console.log(`✅ Updated restaurant ${restaurant._id}:`);
          console.log(`   Old: "${currentName}"`);
          console.log(`   New: "${correctName}"`);
          updated++;
        }
      } catch (error) {
        console.error(`❌ Error updating restaurant ${restaurant._id}:`, error.message);
        errors++;
      }
    }

    console.log('\n📈 Summary:');
    console.log(`   Total found: ${restaurants.length}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);

    // Also fix the specific restaurant mentioned
    const specificId = '69a2953227388a642ad05496';
    const specificRestaurant = await Restaurant.findById(specificId);
    
    if (specificRestaurant && specificRestaurant.onboarding?.step1?.restaurantName) {
      const correctName = specificRestaurant.onboarding.step1.restaurantName;
      if (specificRestaurant.name !== correctName) {
        await Restaurant.findByIdAndUpdate(specificId, {
          $set: { name: correctName }
        });
        console.log(`\n✅ Fixed specific restaurant ${specificId}:`);
        console.log(`   Old: "${specificRestaurant.name}"`);
        console.log(`   New: "${correctName}"`);
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

fixRestaurantNames();
