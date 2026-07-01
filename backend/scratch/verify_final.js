import mongoose from 'mongoose';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';
import RestaurantCategory from '../modules/restaurant/models/RestaurantCategory.js';
import dotenv from 'dotenv';
dotenv.config();

const verify = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const targetRestaurants = [
      { id: '6a312d8fe277d6a8fc17ffc1', name: 'Shree shyam restaurant' },
      { id: '6a312d8fe277d6a8fc17ffc4', name: 'Om Restaurant & Sweets' }
    ];

    for (const rest of targetRestaurants) {
      console.log(`\n==================================================`);
      console.log(`Checking restaurant details for: ${rest.name} (${rest.id})`);
      console.log(`==================================================`);
      
      const fullRest = await Restaurant.findById(rest.id).lean();
      console.log(JSON.stringify(fullRest, null, 2));
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during verification:', error);
    process.exit(1);
  }
};

verify();
