import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const restaurants = [
    { name: 'Maa karni Restaurant', id: '69d0ef574222eff98f02cb92' },
    { name: 'Restaurant 2309', id: '6a0aef7f6c863eb14688a817' }
  ];

  for (const r of restaurants) {
    console.log(`\n========================================`);
    console.log(`Restaurant: ${r.name} (ID: ${r.id})`);
    
    // Find menu
    const menu = await db.collection('menus').findOne({
      $or: [
        { restaurantId: r.id },
        { restaurantId: new mongoose.Types.ObjectId(r.id) }
      ]
    });
    
    if (menu) {
      console.log(`Found menu ID: ${menu._id}`);
      const categories = menu.categories || [];
      console.log(`Number of categories: ${categories.length}`);
      
      let allItems = [];
      categories.forEach(cat => {
        const items = cat.items || [];
        items.forEach(item => {
          allItems.push({
            name: item.name,
            price: item.price,
            isVeg: item.isVeg,
            description: item.description
          });
        });
      });
      
      console.log(`Total items in menu: ${allItems.length}`);
      allItems.sort((a, b) => b.price - a.price);
      console.log(`Top 15 items by price:`);
      allItems.slice(0, 15).forEach(item => {
        console.log(`  - ${item.name}: ₹${item.price} (${item.isVeg ? 'Veg' : 'Non-Veg'})`);
      });
    } else {
      console.log(`No menu found for restaurant ID: ${r.id}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
