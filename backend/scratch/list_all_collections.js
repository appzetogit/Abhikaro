import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  console.log('\n--- Collections and Document Counts ---');
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`  - ${col.name}: ${count} docs`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
