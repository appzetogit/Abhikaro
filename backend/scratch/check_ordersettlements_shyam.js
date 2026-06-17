import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  console.log('--- Checking ordersettlements matching Shyam or IDs ---');
  const settlements = await db.collection('ordersettlements').find({
    $or: [
      { restaurantId: '6a0aef7f6c863eb14688a817' },
      { restaurantId: new mongoose.Types.ObjectId('6a0aef7f6c863eb14688a817') },
      { restaurantName: /shyam/i }
    ]
  }).toArray();
  console.log('Settlements:', JSON.stringify(settlements, null, 2));

  console.log('\n--- Checking restaurants with ID 6a0aef7f6c863eb14688a817 ---');
  const rest = await db.collection('restaurants').findOne({
    $or: [
      { _id: '6a0aef7f6c863eb14688a817' },
      { _id: new mongoose.Types.ObjectId('6a0aef7f6c863eb14688a817') }
    ]
  });
  console.log('Restaurant:', rest);

  console.log('\n--- Checking if there are any other withdrawal requests in withdrawalrequests ---');
  const allRequests = await db.collection('withdrawalrequests').find({}).toArray();
  console.log('All requests count:', allRequests.length);
  
  await mongoose.disconnect();
}

main().catch(console.error);
