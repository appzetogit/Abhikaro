import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const feedbacks = await db.collection('feedbackexperiences').find({
    $or: [
      { orderId: 'ORD-1781427300679-102' },
      { orderId: '6a2e6c64a8ddf93186aeb234' },
      { orderId: 'ORD-1781061063275-657' },
      { orderId: '6a28d5c784d35ff1dfca0b1c' },
      { restaurantName: /karni/i },
      { restaurantName: /2309/i },
      { text: /karni/i },
      { text: /2309/i }
    ]
  }).toArray();

  console.log(`Found ${feedbacks.length} feedbacks:`);
  for (const f of feedbacks) {
    console.log(JSON.stringify(f, null, 2));
  }

  await mongoose.disconnect();
}

main().catch(console.error);
