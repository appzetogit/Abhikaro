import mongoose from 'mongoose';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';
import RestaurantCategory from '../modules/restaurant/models/RestaurantCategory.js';
import dotenv from 'dotenv';
dotenv.config();

const findRaviTestMenu = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    // Ravi Cafe New: Active ID is 6a312d90e277d6a8fc17ffc7
    // Historical IDs: 69d654e7c86eb9b6c8399c62, 69afec1d38ccb6b156fc5640
    
    // Test Restaurant: Active ID in DB is 69d654e7c86eb9b6c8399c62
    
    const ids = ['6a312d90e277d6a8fc17ffc7', '69d654e7c86eb9b6c8399c62', '69afec1d38ccb6b156fc5640'];
    
    console.log('\n--- Checking All Menus and Restaurant Names ---');
    const menus = await Menu.find({}).lean();
    console.log(`Found ${menus.length} menu(s) in total:`);
    for (const menu of menus) {
      const rest = await Restaurant.findById(menu.restaurant).lean();
      const restName = rest ? rest.name : 'UNKNOWN (NOT FOUND)';
      const restId = rest ? rest.restaurantId : 'N/A';
      console.log(`Menu ID: ${menu._id}`);
      console.log(`  Restaurant DB ID: ${menu.restaurant}`);
      console.log(`  Restaurant Name: ${restName}`);
      console.log(`  Restaurant Public ID: ${restId}`);
      console.log(`  Sections: ${menu.sections ? menu.sections.map(s => `${s.name} (${s.items?.length || 0})`).join(', ') : 'None'}`);
    }

    console.log('\n--- Checking Categories ---');
    const categories = await RestaurantCategory.find({ restaurant: { $in: ids } }).lean();
    console.log(`Found ${categories.length} matching category/categories:`);
    categories.forEach(cat => {
      console.log(`Category ID: ${cat._id}, Restaurant ID: ${cat.restaurant}, Name: ${cat.name}, Active: ${cat.isActive}, Items: ${cat.itemCount}`);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error finding menus:', error);
    process.exit(1);
  }
};

findRaviTestMenu();
