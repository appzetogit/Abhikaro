import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const restoredOrders = await db.collection('orders').find({
    'items.name': 'Restored Item'
  }).limit(5).toArray();

  for (const order of restoredOrders) {
    console.log(`\n========================================`);
    console.log(`Order: ${order.orderId} (${order._id})`);
    
    // Search auditlogs
    const logs = await db.collection('auditlogs').find({
      $or: [
        { orderId: order._id },
        { orderId: order._id.toString() },
        { description: new RegExp(order.orderId, 'i') },
        { 'details.orderId': order._id.toString() }
      ]
    }).toArray();

    console.log(`Found ${logs.length} audit logs:`);
    for (const log of logs) {
      console.log(JSON.stringify(log, null, 2));
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
