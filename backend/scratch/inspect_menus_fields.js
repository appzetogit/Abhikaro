import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const menu = await db.collection('menus').findOne({});
  console.log('Sample menu structure:', JSON.stringify(menu, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
