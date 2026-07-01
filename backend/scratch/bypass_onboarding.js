import mongoose from 'mongoose';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import dotenv from 'dotenv';
dotenv.config();

const bypassOnboarding = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const targetRestaurantIds = [
      '6a312d8fe277d6a8fc17ffc1', // Shree shyam restaurant
      '6a312d8fe277d6a8fc17ffc4'  // Om Restaurant & Sweets
    ];

    for (const id of targetRestaurantIds) {
      console.log(`\nProcessing restaurant ID: ${id}`);
      
      const rest = await Restaurant.findById(id);
      if (!rest) {
        console.log(`❌ Restaurant not found!`);
        continue;
      }

      console.log(`Current completedSteps: ${rest.onboarding?.completedSteps}`);

      // Modify fields individually on the mongoose document
      if (!rest.onboarding) {
        rest.onboarding = { completedSteps: 4 };
      } else {
        rest.onboarding.completedSteps = 4;
      }

      if (!rest.onboarding.step1) rest.onboarding.step1 = {};
      rest.onboarding.step1.restaurantName = rest.name;
      rest.onboarding.step1.ownerName = rest.ownerName || 'Owner';
      rest.onboarding.step1.ownerEmail = rest.ownerEmail || rest.email || '';
      rest.onboarding.step1.ownerPhone = rest.ownerPhone || rest.phone || '';
      rest.onboarding.step1.primaryContactNumber = rest.phone || '';
      if (rest.location) {
        rest.onboarding.step1.location = rest.location;
      }

      if (!rest.onboarding.step2) rest.onboarding.step2 = {};
      rest.onboarding.step2.cuisines = rest.cuisines || [];
      rest.onboarding.step2.openDays = rest.openDays || [];
      
      if (!rest.onboarding.step4) rest.onboarding.step4 = {};
      rest.onboarding.step4.estimatedDeliveryTime = rest.estimatedDeliveryTime || '25-30 mins';
      rest.onboarding.step4.distance = rest.distance || '1.2 km';
      rest.onboarding.step4.priceRange = rest.priceRange || '$$';
      rest.onboarding.step4.featuredDish = rest.featuredDish || '';
      rest.onboarding.step4.featuredPrice = rest.featuredPrice || 249;
      rest.onboarding.step4.offer = rest.offer || 'Flat ₹50 OFF above ₹199';

      // Set phoneVerified to true and isActive to true
      rest.phoneVerified = true;
      rest.isActive = true;

      // Mark modified if necessary (Mongoose sometimes needs this for mixed/nested types)
      rest.markModified('onboarding');

      await rest.save();
      console.log(`✅ Onboarding bypassed successfully for: ${rest.name}`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error bypassing onboarding:', error);
    process.exit(1);
  }
};

bypassOnboarding();
