import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  // 1. Find all orders with Restored Item
  const restoredOrders = await db.collection('orders').find({
    'items.name': 'Restored Item'
  }).toArray();

  console.log(`\nFound ${restoredOrders.length} orders with 'Restored Item' in the orders collection.`);

  for (const order of restoredOrders) {
    console.log(`\n========================================`);
    console.log(`Order ID: ${order.orderId} (_id: ${order._id})`);
    console.log(`Restaurant: ${order.restaurantName} (ID: ${order.restaurantId})`);
    console.log(`User Name: ${order.userName} Phone: ${order.userPhone}`);
    console.log(`Total: ₹${order.pricing?.total} Subtotal: ₹${order.pricing?.subtotal}`);
    console.log(`Created At: ${order.createdAt}`);

    // Query OrderSettlement for this order
    const settlement = await db.collection('ordersettlements').findOne({
      orderId: order._id
    });

    if (settlement) {
      console.log(`--- OrderSettlement Found ---`);
      console.log(`Settlement ID: ${settlement._id}`);
      if (settlement.calculationSnapshot) {
        console.log(`calculationSnapshot:`, JSON.stringify(settlement.calculationSnapshot, null, 2));
      } else {
        console.log(`calculationSnapshot is null/undefined`);
      }
      if (settlement.metadata) {
        console.log(`metadata:`, JSON.stringify(settlement.metadata, null, 2));
      } else {
        console.log(`metadata is null/undefined`);
      }
    } else {
      console.log(`No OrderSettlement found for orderId: ${order._id}`);
    }

    // Search in other collections for this order ID
    console.log(`--- Searching other collections for order ID ${order._id} ---`);
    const collections = await db.listCollections().toArray();
    for (const colInfo of collections) {
      const colName = colInfo.name;
      if (['orders', 'ordersettlements'].includes(colName) || colName.startsWith('system.')) continue;

      try {
        const doc = await db.collection(colName).findOne({
          $or: [
            { orderId: order._id },
            { orderId: order._id.toString() },
            { orderNumber: order.orderId },
            { _id: order._id },
            { _id: order._id.toString() }
          ]
        });

        if (doc) {
          console.log(`  Found match in "${colName}":`, JSON.stringify(doc, null, 2));
        }
      } catch (err) {
        // Skip
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
