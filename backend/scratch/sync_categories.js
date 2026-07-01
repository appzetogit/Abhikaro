import mongoose from 'mongoose';
import Menu from '../modules/restaurant/models/Menu.js';
import RestaurantCategory from '../modules/restaurant/models/RestaurantCategory.js';
import dotenv from 'dotenv';
dotenv.config();

const syncCategories = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const activeRestaurantId = '6a312d8fe277d6a8fc17ffc1';

    // Find the menu
    const menu = await Menu.findOne({ restaurant: activeRestaurantId });
    if (!menu || !menu.sections || menu.sections.length === 0) {
      console.log('No menu sections found to sync.');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`Found menu with ${menu.sections.length} section(s). Syncing with RestaurantCategory...`);

    let orderIndex = 0;
    for (const section of menu.sections) {
      const sectionName = section.name;
      
      // Calculate item count (items + subsection items)
      let itemCount = section.items ? section.items.length : 0;
      if (section.subsections) {
        section.subsections.forEach(sub => {
          itemCount += sub.items ? sub.items.length : 0;
        });
      }

      console.log(`Processing section: "${sectionName}" with ${itemCount} item(s).`);

      // Find or create category
      let category = await RestaurantCategory.findOne({
        restaurant: activeRestaurantId,
        name: sectionName
      });

      if (category) {
        category.itemCount = itemCount;
        category.isActive = true;
        await category.save();
        console.log(`  - Updated existing category "${sectionName}" to itemCount = ${itemCount}`);
      } else {
        category = new RestaurantCategory({
          restaurant: activeRestaurantId,
          name: sectionName,
          itemCount: itemCount,
          isActive: true,
          order: orderIndex
        });
        await category.save();
        console.log(`  - Created new category "${sectionName}" with itemCount = ${itemCount}`);
      }
      orderIndex++;
    }

    // Deactivate categories that are not in the menu sections
    const sectionNames = menu.sections.map(s => s.name);
    const unusedResult = await RestaurantCategory.updateMany(
      { restaurant: activeRestaurantId, name: { $nin: sectionNames } },
      { $set: { isActive: false, itemCount: 0 } }
    );
    console.log(`Deactivated ${unusedResult.modifiedCount} unused categories.`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error syncing categories:', error);
    process.exit(1);
  }
};

syncCategories();
