import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  const r = await db.collection('restaurants').findOne({
    _id: new mongoose.Types.ObjectId('6a312d8fe277d6a8fc17ffc1')
  });

  console.log('Shree Shyam Restaurant Document:');
  console.log(JSON.stringify(r, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
