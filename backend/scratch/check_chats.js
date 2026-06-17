import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const chats = await db.collection('chats').find({}).toArray();
  console.log(`Found ${chats.length} chats:`);
  for (const c of chats) {
    console.log(`Chat ID: ${c._id} | OrderId: ${c.orderId} | Status: ${c.status}`);
    if (c.messages && c.messages.length > 0) {
      console.log(`  Messages (${c.messages.length}):`);
      c.messages.forEach(m => {
        console.log(`    - [${m.senderType}]: ${m.text}`);
      });
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
