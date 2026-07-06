import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables');
  process.exit(1);
}

// Dynamically import models
import WebhookDeadLetter from '../modules/payment/models/WebhookDeadLetter.js';
import PaymentIntent from '../modules/payment/models/PaymentIntent.js';
import Order from '../modules/order/models/Order.js';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB.');

  console.log('\n--- 1. Recent Webhook Dead Letter Queue (DLQ) Entries ---');
  const dlqEntries = await WebhookDeadLetter.find().sort({ createdAt: -1 }).limit(10).lean();
  if (dlqEntries.length === 0) {
    console.log('No WebhookDeadLetter entries found.');
  } else {
    dlqEntries.forEach((entry, idx) => {
      console.log(`[${idx + 1}] Event Type: ${entry.eventType}`);
      console.log(`    Created At: ${entry.createdAt}`);
      console.log(`    Reason: ${entry.reason}`);
      console.log(`    Razorpay Order ID: ${entry.razorpayOrderId}`);
      console.log(`    Razorpay Payment ID: ${entry.razorpayPaymentId}`);
      console.log(`    Notes: ${entry.notes}`);
      console.log(`    Payload keys: ${Object.keys(entry.rawEvent || {})}`);
      console.log('----------------------------------------------------');
    });
  }

  console.log('\n--- 2. Recent Stuck Payment Intents (Status != succeeded, failed) ---');
  const stuckIntents = await PaymentIntent.find({ status: { $nin: ['succeeded', 'failed'] } })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  
  if (stuckIntents.length === 0) {
    console.log('No stuck payment intents found.');
  } else {
    stuckIntents.forEach((intent, idx) => {
      console.log(`[${idx + 1}] Intent ID: ${intent._id}`);
      console.log(`    Status: ${intent.status}`);
      console.log(`    User ID: ${intent.userId}`);
      console.log(`    Amount (Paise): ${intent.amount}`);
      console.log(`    Razorpay Order ID: ${intent.razorpayOrderId}`);
      console.log(`    Created At: ${intent.createdAt}`);
      console.log(`    Restaurant ID: ${intent.payload?.restaurantId}`);
      console.log(`    Restaurant Name: ${intent.payload?.restaurantName}`);
      console.log('----------------------------------------------------');
    });
  }

  console.log('\n--- 3. Recent Succeeded Payment Intents but No Order ID ---');
  const succeededIntentsNoOrder = await PaymentIntent.find({ status: 'succeeded', orderId: null })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  
  if (succeededIntentsNoOrder.length === 0) {
    console.log('No succeeded payment intents without Order ID found.');
  } else {
    succeededIntentsNoOrder.forEach((intent, idx) => {
      console.log(`[${idx + 1}] Intent ID: ${intent._id}`);
      console.log(`    Razorpay Order ID: ${intent.razorpayOrderId}`);
      console.log(`    Razorpay Payment ID: ${intent.razorpayPaymentId}`);
      console.log(`    Created At: ${intent.createdAt}`);
      console.log('----------------------------------------------------');
    });
  }

  console.log('\n--- 4. Checking if any Payment Intents exist in the DB ---');
  const totalIntentsCount = await PaymentIntent.countDocuments();
  console.log(`Total PaymentIntents: ${totalIntentsCount}`);
  
  const statusBreakdown = await PaymentIntent.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  console.log('Status Breakdown:', statusBreakdown);

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB.');
}

run().catch(err => {
  console.error('Error running diagnostic script:', err);
  mongoose.disconnect();
});
