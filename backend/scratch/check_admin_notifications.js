import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const notifications = await db.collection('adminnotifications').find({}).toArray();
  console.log(`Found ${notifications.length} admin notifications:`);
  for (const n of notifications) {
    console.log(`Notification ID: ${n._id} | Title: ${n.title} | Message: ${n.message}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
