import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // We have three restaurants:
    // 1. Ravi Cafe (69afec1d38ccb6b156fc5640)
    // 2. Kanha restaurant (let's find its ID by slug / name)
    // 3. Diamond Resort & Restaurant (let's find its ID by slug / name)

    const restaurants = await db.collection('restaurants')
      .find({
        $or: [
          { _id: new mongoose.Types.ObjectId("69afec1d38ccb6b156fc5640") },
          { restaurantName: /Kanha/i },
          { restaurantName: /Diamond/i }
        ]
      })
      .toArray();

    console.log('Found restaurants:', restaurants.map(r => `${r.restaurantName} (${r._id})`));

    const restaurantIds = restaurants.map(r => r._id);

    // Let's find menus for these restaurants
    const menus = await db.collection('menus')
      .find({ restaurantId: { $in: restaurantIds } })
      .toArray();

    console.log('\nFound menus count:', menus.length);

    // Dump all items from these menus with their prices to see if we can find matches!
    const targetPrices = [1190, 400, 1000, 1830, 240, 40, 295, 475, 35];
    console.log('\nSearching for menu items matching prices:', targetPrices);

    menus.forEach(menu => {
      const rest = restaurants.find(r => r._id.toString() === menu.restaurantId.toString());
      console.log(`\nMenu for ${rest ? rest.restaurantName : 'Unknown'}:`);
      
      // Menus often have sections -> items
      if (Array.isArray(menu.sections)) {
        menu.sections.forEach(sec => {
          if (Array.isArray(sec.items)) {
            sec.items.forEach(item => {
              if (targetPrices.includes(item.price)) {
                console.log(`  [MATCH] Name: "${item.name}", Price: ₹${item.price}, isVeg: ${item.isVeg}`);
              }
              // Check variations if any
              if (Array.isArray(item.variations)) {
                item.variations.forEach(v => {
                  if (targetPrices.includes(v.price)) {
                    console.log(`  [MATCH VARIATION] Name: "${item.name} - ${v.name}", Price: ₹${v.price}`);
                  }
                });
              }
            });
          }
          if (Array.isArray(sec.subsections)) {
            sec.subsections.forEach(sub => {
              if (Array.isArray(sub.items)) {
                sub.items.forEach(item => {
                  if (targetPrices.includes(item.price)) {
                    console.log(`  [MATCH] Name: "${item.name}", Price: ₹${item.price}, isVeg: ${item.isVeg}`);
                  }
                  if (Array.isArray(item.variations)) {
                    item.variations.forEach(v => {
                      if (targetPrices.includes(v.price)) {
                        console.log(`  [MATCH VARIATION] Name: "${item.name} - ${v.name}", Price: ₹${v.price}`);
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

run();
