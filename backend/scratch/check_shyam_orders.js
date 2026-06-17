import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  console.log('--- Orders with restaurantId "6a0aef7f6c863eb14688a817" ---');
  const orders1 = await db.collection('orders').find({
    restaurantId: '6a0aef7f6c863eb14688a817'
  }).toArray();
  console.log(`Count: ${orders1.length}`);
  orders1.forEach(o => {
    console.log(`  - Order: ${o.orderId} | Name: ${o.restaurantName} | Status: ${o.status} | Total: ${o.pricing?.total}`);
  });

  console.log('\n--- Orders with restaurantId "6a312d8fe277d6a8fc17ffc1" ---');
  const orders2 = await db.collection('orders').find({
    restaurantId: '6a312d8fe277d6a8fc17ffc1'
  }).toArray();
  console.log(`Count: ${orders2.length}`);
  orders2.forEach(o => {
    console.log(`  - Order: ${o.orderId} | Name: ${o.restaurantName} | Status: ${o.status} | Total: ${o.pricing?.total}`);
  });

  console.log('\n--- Orders with restaurantId "REST-1779101567693-2213" ---');
  const orders3 = await db.collection('orders').find({
    restaurantId: 'REST-1779101567693-2213'
  }).toArray();
  console.log(`Count: ${orders3.length}`);
  orders3.forEach(o => {
    console.log(`  - Order: ${o.orderId} | Name: ${o.restaurantName} | Status: ${o.status} | Total: ${o.pricing?.total}`);
  });

  console.log('\n--- Orders with restaurantName matching /shyam/i ---');
  const orders4 = await db.collection('orders').find({
    restaurantName: /shyam/i
  }).toArray();
  console.log(`Count: ${orders4.length}`);
  orders4.forEach(o => {
    console.log(`  - Order: ${o.orderId} | RestId: ${o.restaurantId} | Name: ${o.restaurantName} | Status: ${o.status} | Total: ${o.pricing?.total}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
