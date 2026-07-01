import mongoose from 'mongoose';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';
import dotenv from 'dotenv';
dotenv.config();

const findRestaurant = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Database connected successfully.');
    
    
    console.log('Searching for menus...');
    const restaurantIds = ['6a312d8fe277d6a8fc17ffc1', '6a0aef7f6c863eb14688a817'];
    
    const menus = await Menu.find({ restaurant: { $in: restaurantIds } }).lean();
    console.log(`Found ${menus.length} matching menu(s):`);
    for (const menu of menus) {
      console.log(`Menu ID: ${menu._id}, Restaurant ID: ${menu.restaurant}`);
      console.log(`Sections count: ${menu.sections ? menu.sections.length : 0}`);
      if (menu.sections && menu.sections.length > 0) {
        console.log('Sections names:', menu.sections.map(s => s.name));
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

findRestaurant();
