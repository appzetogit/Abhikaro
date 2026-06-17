import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  console.log('--- Checking wallet for 6a0aef7f6c863eb14688a817 ---');
  const wallet = await db.collection('restaurantwallets').findOne({
    $or: [
      { restaurantId: '6a0aef7f6c863eb14688a817' },
      { restaurantId: new mongoose.Types.ObjectId('6a0aef7f6c863eb14688a817') }
    ]
  });
  console.log('Wallet:', wallet);

  console.log('\n--- Checking withdrawal requests for 6a0aef7f6c863eb14688a817 ---');
  const requests = await db.collection('withdrawalrequests').find({
    $or: [
      { restaurantId: '6a0aef7f6c863eb14688a817' },
      { restaurantId: new mongoose.Types.ObjectId('6a0aef7f6c863eb14688a817') }
    ]
  }).toArray();
  console.log('Withdrawal requests count:', requests.length);
  requests.forEach(r => console.log(r));

  await mongoose.disconnect();
}

main().catch(console.error);
