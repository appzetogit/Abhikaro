import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  // Search by exact total pricing or subtotal matching the screenshot
  const query = {
    $or: [
      { 'pricing.total': 1753 },
      { 'pricing.subtotal': 1658 },
      { 'pricing.total': 602 },
      { 'pricing.subtotal': 562 }
    ]
  };

  const orders = await db.collection('orders').find(query).toArray();
  console.log(`Found ${orders.length} matching orders in 'orders' collection:`);
  
  for (const o of orders) {
    console.log(`\n--------------------------------------------`);
    console.log(`Order ID: ${o.orderId} | ID: ${o._id}`);
    console.log(`Restaurant: ${o.restaurantName} (ID: ${o.restaurantId})`);
    console.log(`User: ${o.userName} | Phone: ${o.userPhone}`);
    console.log(`Subtotal: ${o.pricing?.subtotal} | Total: ${o.pricing?.total}`);
    console.log(`Payment: ${JSON.stringify(o.payment)}`);
    console.log(`Items: ${JSON.stringify(o.items)}`);
    
    // Find matching settlements
    const s = await db.collection('ordersettlements').findOne({ orderId: o._id });
    if (s) {
      console.log(`Found Settlement: ${s.orderNumber}`);
      console.log(`  - userPayment:`, JSON.stringify(s.userPayment));
      console.log(`  - restaurantEarning:`, JSON.stringify(s.restaurantEarning));
    } else {
      console.log(`No Settlement found`);
    }

    // Find any trace in other collections (e.g. auditlogs, paymentintents, chats)
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      if (['orders', 'ordersettlements', 'system.indexes'].includes(col.name)) continue;
      try {
        const doc = await db.collection(col.name).findOne({
          $or: [
            { orderId: o._id },
            { orderId: o._id.toString() },
            { orderNumber: o.orderId },
            { _id: o._id },
            { _id: o._id.toString() },
            { text: new RegExp(o.orderId, 'i') },
            { description: new RegExp(o.orderId, 'i') }
          ]
        });
        if (doc) {
          console.log(`Found trace in collection "${col.name}":`);
          console.log(JSON.stringify(doc, null, 2));
        }
      } catch (err) {}
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
