import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  console.log('--- Searching admins for "shyam" ---');
  const admins = await db.collection('admins').find({
    $or: [
      { name: /shyam/i },
      { email: /shyam/i }
    ]
  }).toArray();
  console.log(`Found ${admins.length} admins:`, JSON.stringify(admins, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
