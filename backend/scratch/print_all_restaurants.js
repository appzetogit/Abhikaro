import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  const restaurants = await db.collection('restaurants').find({}).toArray();
  console.log(`Total restaurants found: ${restaurants.length}`);
  
  restaurants.forEach((r, idx) => {
    console.log(`\n[${idx + 1}] Name: ${r.name}`);
    console.log(`    Onboarding Name: ${r.onboarding?.step1?.restaurantName}`);
    console.log(`    Mongo ID: ${r._id}`);
    console.log(`    Public ID: ${r.restaurantId}`);
    console.log(`    Owner Email: ${r.ownerEmail || r.email}`);
    console.log(`    Owner Phone: ${r.ownerPhone || r.phone}`);
    console.log(`    Status: ${r.status}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
