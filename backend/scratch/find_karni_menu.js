import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const karniId = '69d0ef574222eff98f02cb92';
  const r2309Id = '6a0aef7f6c863eb14688a817';

  const ids = [karniId, r2309Id];

  for (const id of ids) {
    console.log(`\n========================================`);
    console.log(`Searching menu for restaurant ${id}...`);
    
    const menu = await db.collection('menus').findOne({
      $or: [
        { restaurant: id },
        { restaurant: new mongoose.Types.ObjectId(id) },
        { restaurantId: id },
        { restaurantId: new mongoose.Types.ObjectId(id) }
      ]
    });

    if (menu) {
      console.log(`Found menu ID: ${menu._id}`);
      const sections = menu.sections || [];
      console.log(`Sections: ${sections.map(s => s.name).join(', ')}`);
      
      let allItems = [];
      sections.forEach(sec => {
        const items = sec.items || [];
        items.forEach(it => {
          allItems.push({
            name: it.name,
            price: it.price,
            isVeg: it.foodType === 'Veg' || it.isVeg
          });
        });
      });

      console.log(`Total items in menu: ${allItems.length}`);
      allItems.sort((a, b) => b.price - a.price);
      allItems.forEach(it => {
        console.log(`  - ${it.name}: ₹${it.price}`);
      });
    } else {
      console.log(`No menu found!`);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
