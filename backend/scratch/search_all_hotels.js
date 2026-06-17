import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  console.log('--- Searching hotels for "shyam" ---');
  const hotels = await db.collection('hotels').find({
    $or: [
      { name: /shyam/i },
      { hotelName: /shyam/i },
      { ownerName: /shyam/i },
      { email: /shyam/i }
    ]
  }).toArray();
  console.log(`Found ${hotels.length} hotels:`, JSON.stringify(hotels, null, 2));

  console.log('\n--- Searching delivery partners (deliveries) for "shyam" ---');
  const deliveries = await db.collection('deliveries').find({
    $or: [
      { name: /shyam/i },
      { email: /shyam/i },
      { phone: /shyam/i }
    ]
  }).toArray();
  console.log(`Found ${deliveries.length} delivery partners:`, JSON.stringify(deliveries, null, 2));

  console.log('\n--- Checking hotel withdrawal requests ---');
  const hotelWithdrawals = await db.collection('hotelwithdrawalrequests').find({}).toArray();
  console.log(`Found ${hotelWithdrawals.length} hotel withdrawal requests:`, hotelWithdrawals);

  console.log('\n--- Checking delivery withdrawal requests ---');
  const deliveryWithdrawals = await db.collection('deliverywithdrawalrequests').find({}).toArray();
  console.log(`Found ${deliveryWithdrawals.length} delivery withdrawal requests:`, deliveryWithdrawals);

  await mongoose.disconnect();
}

main().catch(console.error);
