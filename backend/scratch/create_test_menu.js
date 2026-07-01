import mongoose from 'mongoose';
import Menu from '../modules/restaurant/models/Menu.js';
import RestaurantCategory from '../modules/restaurant/models/RestaurantCategory.js';
import dotenv from 'dotenv';
dotenv.config();

const createTestMenu = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const testRestId = '69d654e7c86eb9b6c8399c62';
    const testRestObjectId = new mongoose.Types.ObjectId(testRestId);

    // 1. Check if menu already exists
    let menu = await Menu.findOne({ restaurant: testRestObjectId });
    if (menu) {
      console.log(`Menu already exists for Test Restaurant: ID ${menu._id}`);
    } else {
      console.log('Creating a new test menu for Test Restaurant...');
      
      const newMenu = new Menu({
        restaurant: testRestObjectId,
        sections: [
          {
            id: 'sec-1775654380275',
            name: 'Starter',
            isEnabled: true,
            order: 0,
            items: [
              {
                id: 'item-1775654380276-0.45381922624088167',
                name: 'Burger',
                price: 1,
                originalPrice: 1,
                description: 'Bzkdkfkkfvkkv',
                foodType: 'Veg',
                isAvailable: true,
                approvalStatus: 'approved',
                stock: 'Unlimited'
              }
            ]
          }
        ]
      });

      await newMenu.save();
      console.log(`✅ Test menu created successfully! ID: ${newMenu._id}`);
    }

    // 2. Sync category
    let category = await RestaurantCategory.findOne({
      restaurant: testRestObjectId,
      name: 'Starter'
    });

    if (category) {
      category.itemCount = 1;
      category.isActive = true;
      await category.save();
      console.log(`✅ Category "Starter" updated for Test Restaurant.`);
    } else {
      category = new RestaurantCategory({
        restaurant: testRestObjectId,
        name: 'Starter',
        itemCount: 1,
        isActive: true,
        order: 0
      });
      await category.save();
      console.log(`✅ Category "Starter" created for Test Restaurant.`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error creating test menu:', error);
    process.exit(1);
  }
};

createTestMenu();
