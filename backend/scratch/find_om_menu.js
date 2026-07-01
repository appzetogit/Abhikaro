import mongoose from 'mongoose';
import Menu from '../modules/restaurant/models/Menu.js';
import RestaurantCategory from '../modules/restaurant/models/RestaurantCategory.js';
import dotenv from 'dotenv';
dotenv.config();

const findOmMenu = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const activeId = '6a312d8fe277d6a8fc17ffc4';
    const oldId = '69f19e8f870f195b03093cd1';

    console.log('\n--- Checking Menus in Database ---');
    const menus = await Menu.find({ restaurant: { $in: [activeId, oldId] } }).lean();
    console.log(`Found ${menus.length} matching menu(s):`);
    for (const menu of menus) {
      console.log(`Menu ID: ${menu._id}, Restaurant ID on Menu: ${menu.restaurant}`);
      console.log(`Sections count: ${menu.sections ? menu.sections.length : 0}`);
      if (menu.sections) {
        console.log('Sections:', menu.sections.map(s => `${s.name} (${s.items?.length || 0} items)`));
      }
    }

    console.log('\n--- Checking Categories in Database ---');
    const categories = await RestaurantCategory.find({ restaurant: { $in: [activeId, oldId] } }).lean();
    console.log(`Found ${categories.length} matching category/categories:`);
    categories.forEach(cat => {
      console.log(`Category ID: ${cat._id}, Restaurant ID: ${cat.restaurant}, Name: ${cat.name}, Active: ${cat.isActive}, Items: ${cat.itemCount}`);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error finding Om Restaurant menu:', error);
    process.exit(1);
  }
};

findOmMenu();
