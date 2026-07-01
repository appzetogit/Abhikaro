import mongoose from 'mongoose';
import 'dotenv/config';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

async function debugSpecificSave() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find the specific restaurant
    const restaurant = await Restaurant.findById('6a312d8fe277d6a8fc17ffc4');
    if (!restaurant) {
      console.log('Restaurant not found');
      return;
    }

    console.log('Found restaurant:', {
      _id: restaurant._id,
      name: restaurant.name,
      ownerPhone: restaurant.ownerPhone,
      ownerEmail: restaurant.ownerEmail,
      phone: restaurant.phone,
      email: restaurant.email,
    });

    // Simulate frontend updates
    restaurant.name = 'Om Restaurant & Sweets';
    restaurant.isActive = true;
    restaurant.ownerName = 'Hemant Saini';
    restaurant.ownerPhone = '9660499649';
    restaurant.ownerEmail = 'restored-REST-1777442447531-4747@placeholder.local';

    console.log('Saving restaurant...');
    await restaurant.save();
    console.log('✅ Save successful!');

  } catch (error) {
    console.error('❌ Error during save:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

debugSpecificSave();
