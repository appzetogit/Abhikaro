import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  const allWithdrawals = await db.collection('withdrawalrequests').find({}).toArray();
  console.log(`📋 Checked ${allWithdrawals.length} withdrawal requests:`);
  
  allWithdrawals.forEach((w, idx) => {
    console.log(`  [${idx + 1}] ID: ${w._id} | Rest: ${w.restaurantName} | Amount: ₹${w.amount} | Status: ${w.status} | transactionId: ${w.transactionId}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
