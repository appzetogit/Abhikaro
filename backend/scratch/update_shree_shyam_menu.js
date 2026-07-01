import mongoose from 'mongoose';
import Menu from '../modules/restaurant/models/Menu.js';
import dotenv from 'dotenv';
dotenv.config();

const updateMenu = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Database connected successfully.');

    const oldRestaurantId = '6a0aef7f6c863eb14688a817';
    const newRestaurantId = '6a312d8fe277d6a8fc17ffc1';

    console.log(`Searching for menu belonging to restaurant: ${oldRestaurantId}`);
    const menu = await Menu.findOne({ restaurant: oldRestaurantId });
    if (!menu) {
      console.log('No menu found for the old restaurant ID.');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`Found menu ID: ${menu._id}. Updating restaurant reference to: ${newRestaurantId}`);
    
    // Check if new restaurant already has a menu (to avoid violating unique constraint)
    const existingMenu = await Menu.findOne({ restaurant: newRestaurantId });
    if (existingMenu) {
      console.log(`Warning: A menu already exists for the new restaurant ID (${existingMenu._id}). Cannot update.`);
      await mongoose.disconnect();
      process.exit(1);
    }

    menu.restaurant = newRestaurantId;
    await menu.save();

    console.log('Successfully updated the menu restaurant reference.');
    console.log(`Menu ID: ${menu._id} is now linked to Restaurant ID: ${menu.restaurant}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error updating menu:', error);
    process.exit(1);
  }
};

updateMenu();
