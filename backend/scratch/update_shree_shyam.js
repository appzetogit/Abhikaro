import mongoose from 'mongoose';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import dotenv from 'dotenv';
dotenv.config();

const updateRestaurant = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Database connected successfully.');

    const restaurantId = '6a312d8fe277d6a8fc17ffc1';
    console.log(`Updating restaurant: ${restaurantId}`);

    const updateData = {
      ownerName: 'Sonu Sharma',
      ownerPhone: '918290982309',
      phone: '918290982309',
      phoneVerified: true
    };

    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedRestaurant) {
      console.log('Restaurant not found!');
      process.exit(0);
    }

    console.log('Successfully updated restaurant to:');
    console.log(JSON.stringify(updatedRestaurant, null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during update:', error);
    process.exit(1);
  }
};

updateRestaurant();
