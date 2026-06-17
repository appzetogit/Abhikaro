import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  console.log('--- Searching auditlogs for Shyam or restaurant ID ---');
  const logs = await db.collection('auditlogs').find({
    $or: [
      { restaurantId: '6a312d8fe277d6a8fc17ffc1' },
      { restaurantId: new mongoose.Types.ObjectId('6a312d8fe277d6a8fc17ffc1') },
      { userId: '6a312d8fe277d6a8fc17ffc1' },
      { userId: new mongoose.Types.ObjectId('6a312d8fe277d6a8fc17ffc1') },
      { description: /shyam/i },
      { action: /withdraw/i },
      { description: /withdraw/i }
    ]
  }).sort({ createdAt: -1 }).limit(100).toArray();

  console.log(`Found ${logs.length} audit logs:`);
  logs.forEach((log, idx) => {
    console.log(`\n[${idx + 1}] Action: ${log.action}`);
    console.log(`    User/Actor : ${log.userId || log.actorId}`);
    console.log(`    Description: ${log.description}`);
    console.log(`    IP/Details : ${JSON.stringify(log.metadata || log.details || {})}`);
    console.log(`    Created At : ${log.createdAt}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
