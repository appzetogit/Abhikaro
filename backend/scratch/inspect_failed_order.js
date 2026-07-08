import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

import Order from '../modules/order/models/Order.js';
import PaymentIntent from '../modules/payment/models/PaymentIntent.js';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB.');

  const order = await Order.findById('6a4cd9c8a78a335933d9d0ac').lean();
  console.log('Order:');
  console.log(JSON.stringify(order, null, 2));

  const intent = await PaymentIntent.findOne({ orderId: '6a4cd9c8a78a335933d9d0ac' }).lean();
  console.log('\nPaymentIntent for this Order:');
  console.log(JSON.stringify(intent, null, 2));

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
