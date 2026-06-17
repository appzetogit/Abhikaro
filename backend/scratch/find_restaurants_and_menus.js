import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const karni = await db.collection('restaurants').findOne({ name: /karni/i });
  console.log('\nMaa Karni Restaurant Doc:');
  console.log(JSON.stringify(karni, null, 2));

  const r2309 = await db.collection('restaurants').findOne({ name: /2309/i });
  console.log('\nRestaurant 2309 Doc:');
  console.log(JSON.stringify(r2309, null, 2));

  // Find all menus and print their restaurantIds
  const menus = await db.collection('menus').find({}).project({ restaurantId: 1 }).toArray();
  console.log('\nAll menus in DB:', menus);

  await mongoose.disconnect();
}

main().catch(console.error);
