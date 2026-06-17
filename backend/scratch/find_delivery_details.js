import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const deliveries = await db.collection('deliveries').find({}).toArray();
  console.log(`Found ${deliveries.length} deliveries:`);
  
  for (const d of deliveries) {
    // Check if any delivery doc mentions the order id
    const str = JSON.stringify(d);
    if (str.includes('6a2e6c64a8ddf93186aeb234') || str.includes('6a28d5c784d35ff1dfca0b1c')) {
      console.log(`\n========================================`);
      console.log(`Delivery ID: ${d._id}`);
      console.log(JSON.stringify(d, null, 2));
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
