import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const s1 = await db.collection('ordersettlements').findOne({ orderNumber: 'ORD-1781427300679-102' });
  console.log('\nSettlement 1 (Maa karni):');
  console.log(JSON.stringify(s1, null, 2));

  const s2 = await db.collection('ordersettlements').findOne({ orderNumber: 'ORD-1781061063275-657' });
  console.log('\nSettlement 2 (Restaurant 2309):');
  console.log(JSON.stringify(s2, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
