import mongoose from 'mongoose';
import Menu from '../modules/restaurant/models/Menu.js';
import RestaurantCategory from '../modules/restaurant/models/RestaurantCategory.js';
import dotenv from 'dotenv';
dotenv.config();

const migrateAndSync = async (sourceIdStr, targetIdStr) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const oldObjectId = new mongoose.Types.ObjectId(sourceIdStr);
    const newObjectId = new mongoose.Types.ObjectId(targetIdStr);

    console.log(`\n==================================================`);
    console.log(`Starting migration from ${sourceIdStr} to ${targetIdStr}...`);
    console.log(`==================================================\n`);

    const db = mongoose.connection.db;

    // 1. Migrate Menu reference
    console.log('--- Migrating Menu ---');
    const menu = await Menu.findOne({ restaurant: oldObjectId });
    if (menu) {
      // Check if target already has a menu
      const existingMenu = await Menu.findOne({ restaurant: newObjectId });
      if (existingMenu) {
        console.log(`⚠️ Warning: A menu already exists for target ID. Skipping menu reference update.`);
      } else {
        menu.restaurant = newObjectId;
        await menu.save();
        console.log(`✅ Linked Menu (ID: ${menu._id}) to target restaurant.`);
      }
    } else {
      console.log('ℹ️ No menu found for source restaurant ID.');
    }

    // 2. Migrate orders
    const ordersResult = await db.collection('orders').updateMany(
      { restaurantId: { $in: [sourceIdStr, oldObjectId] } },
      { $set: { restaurantId: targetIdStr } }
    );
    console.log(`✅ Updated 'orders': matched ${ordersResult.matchedCount}, modified ${ordersResult.modifiedCount}`);

    // 3. Migrate restaurantcommissions
    const rcResult = await db.collection('restaurantcommissions').updateMany(
      { restaurant: { $in: [sourceIdStr, oldObjectId] } },
      { $set: { restaurant: newObjectId } }
    );
    console.log(`✅ Updated 'restaurantcommissions': matched ${rcResult.matchedCount}, modified ${rcResult.modifiedCount}`);

    // 4. Migrate admincommissions
    const acResult = await db.collection('admincommissions').updateMany(
      { restaurantId: { $in: [sourceIdStr, oldObjectId] } },
      { $set: { restaurantId: newObjectId } }
    );
    console.log(`✅ Updated 'admincommissions': matched ${acResult.matchedCount}, modified ${acResult.modifiedCount}`);

    // 5. Migrate ordersettlements
    const osResult = await db.collection('ordersettlements').updateMany(
      { restaurantId: { $in: [sourceIdStr, oldObjectId] } },
      { $set: { restaurantId: newObjectId } }
    );
    console.log(`✅ Updated 'ordersettlements': matched ${osResult.matchedCount}, modified ${osResult.modifiedCount}`);

    // 6. Migrate restaurantcategories
    const catResult = await db.collection('restaurantcategories').updateMany(
      { restaurant: { $in: [sourceIdStr, oldObjectId] } },
      { $set: { restaurant: newObjectId } }
    );
    console.log(`✅ Updated 'restaurantcategories': matched ${catResult.matchedCount}, modified ${catResult.modifiedCount}`);

    // 7. Sync Menu Categories with RestaurantCategory
    console.log('\n--- Syncing Menu Categories ---');
    const activeMenu = await Menu.findOne({ restaurant: newObjectId });
    if (activeMenu && activeMenu.sections && activeMenu.sections.length > 0) {
      console.log(`Found menu with ${activeMenu.sections.length} section(s). Syncing with RestaurantCategory...`);
      let orderIndex = 0;
      for (const section of activeMenu.sections) {
        const sectionName = section.name;
        
        let itemCount = section.items ? section.items.length : 0;
        if (section.subsections) {
          section.subsections.forEach(sub => {
            itemCount += sub.items ? sub.items.length : 0;
          });
        }

        // Find or create
        let category = await RestaurantCategory.findOne({
          restaurant: newObjectId,
          name: sectionName
        });

        if (category) {
          category.itemCount = itemCount;
          category.isActive = true;
          await category.save();
        } else {
          category = new RestaurantCategory({
            restaurant: newObjectId,
            name: sectionName,
            itemCount: itemCount,
            isActive: true,
            order: orderIndex
          });
          await category.save();
        }
        orderIndex++;
      }
      
      // Deactivate other categories
      const sectionNames = activeMenu.sections.map(s => s.name);
      await RestaurantCategory.updateMany(
        { restaurant: newObjectId, name: { $nin: sectionNames } },
        { $set: { isActive: false, itemCount: 0 } }
      );
      console.log(`✅ Categories synced and updated successfully.`);
    } else {
      console.log('ℹ️ No active menu or sections found to sync categories for.');
    }

    // 8. Verification
    console.log('\n--- Verification ---');
    const finalMenu = await Menu.findOne({ restaurant: newObjectId }).lean();
    if (finalMenu) {
      console.log(`Menu is linked. Sections: ${finalMenu.sections ? finalMenu.sections.length : 0}`);
    } else {
      console.log('❌ Menu not linked!');
    }

    const finalCats = await RestaurantCategory.find({ restaurant: newObjectId, isActive: true }).lean();
    console.log(`Active Categories: ${finalCats.length}`);
    
    console.log(`\n==================================================`);
    console.log(`Migration and Sync Finished!`);
    console.log(`==================================================\n`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during migration and sync:', error);
    process.exit(1);
  }
};

// Execute for Ravi Cafe New
// Source (Old ID): '69afec1d38ccb6b156fc5640'
// Target (New/Active ID): '6a312d90e277d6a8fc17ffc7'
migrateAndSync('69afec1d38ccb6b156fc5640', '6a312d90e277d6a8fc17ffc7');
