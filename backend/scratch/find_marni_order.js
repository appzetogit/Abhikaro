import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  // Find orders with subtotal 1658 or restaurant containing "karni"
  const orders = await db.collection('orders').find({
    $or: [
      { restaurantName: /karni/i },
      { 'pricing.subtotal': 1658 },
      { restaurantName: /2309/i },
      { 'pricing.subtotal': 562 }
    ]
  }).toArray();

  console.log(`Found ${orders.length} orders:`);
  for (const order of orders) {
    console.log(`\n========================================`);
    console.log(JSON.stringify(order, null, 2));

    // Search for any other documents matching this order's ID in all collections
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      if (['orders', 'system.indexes'].includes(col.name)) continue;
      try {
        const match = await db.collection(col.name).findOne({
          $or: [
            { orderId: order._id },
            { orderId: order._id.toString() },
            { orderNumber: order.orderId },
            { _id: order._id },
            { _id: order._id.toString() }
          ]
        });
        if (match) {
          console.log(`  -> Found match in collection "${col.name}":`, JSON.stringify(match, null, 2));
        }
      } catch (e) {}
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
