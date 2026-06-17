/**
 * Script to list all restaurants and their order settlement counts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const restaurants = await db.collection('restaurants')
    .find({})
    .project({ _id: 1, name: 1, 'onboarding.step1.restaurantName': 1 })
    .toArray();

  const settlementAgg = await db.collection('ordersettlements').aggregate([
    {
      $group: {
        _id: '$restaurantId',
        count: { $sum: 1 }
      }
    }
  ]).toArray();

  const settlementMap = new Map();
  settlementAgg.forEach(s => {
    if (s._id) {
      settlementMap.set(s._id.toString(), s.count);
    }
  });

  console.log('\n--- Restaurant Order Settlement Counts ---');
  let totalSettlements = 0;
  restaurants.forEach((r, idx) => {
    const name = r.onboarding?.step1?.restaurantName || r.name || 'Unknown Restaurant';
    const count = settlementMap.get(r._id.toString()) || 0;
    totalSettlements += count;
    console.log(`${idx + 1}. ${name}: ${count} settlements`);
  });
  console.log('-----------------------------------------');
  console.log(`Total Settlements: ${totalSettlements}\n`);

  await mongoose.disconnect();
}

main().catch(console.error);
