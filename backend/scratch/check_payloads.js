import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  // Find restored orders
  const restoredOrders = await db.collection('orders').find({
    'items.name': 'Restored Item'
  }).toArray();

  console.log(`\nFound ${restoredOrders.length} restored orders.`);

  let matchedIntentsCount = 0;
  for (const order of restoredOrders) {
    console.log(`\n------------------------------------------------`);
    console.log(`Order ID: ${order.orderId} | ID: ${order._id}`);
    
    // We can search paymentintents by orderId
    let intent = await db.collection('paymentintents').findOne({
      $or: [
        { orderId: order._id },
        { orderId: order._id.toString() },
        { 'payload.orderId': order.orderId },
        { razorpayOrderId: order.payment?.razorpayOrderId }
      ]
    });

    if (intent) {
      matchedIntentsCount++;
      console.log(`✅ Found PaymentIntent: ID: ${intent._id} | Status: ${intent.status}`);
      console.log(`   Items in Payload:`);
      const payloadItems = intent.payload?.items;
      if (payloadItems && Array.isArray(payloadItems)) {
        payloadItems.forEach((item, idx) => {
          console.log(`     - [${idx+1}] Name: ${item.name} | Qty: ${item.quantity} | Price: ${item.price}`);
        });
      } else {
        console.log(`     No items in payload or payload:`, JSON.stringify(intent.payload));
      }
    } else {
      console.log(`❌ No PaymentIntent found for this order.`);
    }
  }

  console.log(`\nSummary: Matched ${matchedIntentsCount} / ${restoredOrders.length} orders to PaymentIntents`);

  await mongoose.disconnect();
}

main().catch(console.error);
