import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

import Order from '../modules/order/models/Order.js';
import PaymentIntent from '../modules/payment/models/PaymentIntent.js';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB.');

  console.log('--- Orders with amount 682 or created around July 7 ---');
  const start = new Date('2026-07-07T16:00:00.000Z');
  const end = new Date('2026-07-07T17:00:00.000Z');
  const orders = await Order.find({
    $or: [
      { 'pricing.total': 682 },
      { createdAt: { $gte: start, $lte: end } }
    ]
  }).lean();
  console.log(`Found ${orders.length} orders:`);
  orders.forEach(o => {
    console.log(`ID: ${o._id}`);
    console.log(`Order ID: ${o.orderId}`);
    console.log(`Total: ${o.pricing?.total}`);
    console.log(`Payment: ${JSON.stringify(o.payment)}`);
    console.log(`User: ${o.userName} (${o.userId})`);
    console.log(`Created: ${o.createdAt}`);
    console.log('---------------------------');
  });

  console.log('\n--- PaymentIntents with amount 68200 or created around July 7 ---');
  const intents = await PaymentIntent.find({
    $or: [
      { amount: 68200 },
      { createdAt: { $gte: start, $lte: end } }
    ]
  }).lean();
  console.log(`Found ${intents.length} payment intents:`);
  intents.forEach(i => {
    console.log(`ID: ${i._id}`);
    console.log(`Amount: ${i.amount}`);
    console.log(`Status: ${i.status}`);
    console.log(`Order ID: ${i.orderId}`);
    console.log(`Razorpay Order ID: ${i.razorpayOrderId}`);
    console.log(`Razorpay Payment ID: ${i.razorpayPaymentId}`);
    console.log(`Created: ${i.createdAt}`);
    console.log('---------------------------');
  });

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
