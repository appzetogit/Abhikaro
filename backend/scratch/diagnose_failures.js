import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import Razorpay from 'razorpay';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables');
  process.exit(1);
}

import PaymentIntent from '../modules/payment/models/PaymentIntent.js';
import { getRazorpayCredentials } from '../shared/utils/envService.js';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB.');

  const creds = await getRazorpayCredentials();
  console.log('\n--- Razorpay credentials configured in Env ---');
  console.log(`Key ID: ${creds.keyId ? `${creds.keyId.substring(0, 8)}... (length: ${creds.keyId.length})` : 'MISSING'}`);
  console.log(`Key Secret: ${creds.keySecret ? `${creds.keySecret.substring(0, 4)}... (length: ${creds.keySecret.length})` : 'MISSING'}`);
  console.log(`Webhook Secret (env): ${process.env.RAZORPAY_WEBHOOK_SECRET ? `${process.env.RAZORPAY_WEBHOOK_SECRET.substring(0, 4)}...` : 'MISSING'}`);

  if (!creds.keyId || !creds.keySecret) {
    console.error('❌ Razorpay credentials missing. Cannot check Razorpay API.');
    await mongoose.disconnect();
    return;
  }

  const razorpay = new Razorpay({
    key_id: creds.keyId,
    key_secret: creds.keySecret
  });

  console.log('\n--- Fetching recent PaymentIntents from MongoDB ---');
  const intents = await PaymentIntent.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  if (intents.length === 0) {
    console.log('No PaymentIntents found in DB.');
  }

  for (const intent of intents) {
    console.log(`\nIntent ID: ${intent._id}`);
    console.log(`  Amount: ₹${intent.amount / 100}`);
    console.log(`  Status in DB: ${intent.status}`);
    console.log(`  Razorpay Order ID: ${intent.razorpayOrderId}`);
    console.log(`  Razorpay Payment ID in DB: ${intent.razorpayPaymentId || 'None'}`);
    console.log(`  Created At: ${intent.createdAt}`);
    console.log(`  Address Label: ${intent.payload?.address?.label}`);

    if (intent.razorpayOrderId) {
      try {
        console.log(`  Fetching Order from Razorpay API...`);
        const rzpOrder = await razorpay.orders.fetch(intent.razorpayOrderId);
        console.log(`    Razorpay Order Status: ${rzpOrder.status}`);
        console.log(`    Razorpay Order Amount Paid: ₹${rzpOrder.amount_paid / 100}`);
        console.log(`    Razorpay Order Attempts: ${rzpOrder.attempts}`);

        if (rzpOrder.attempts > 0) {
          console.log(`    Fetching Payments for Razorpay Order...`);
          const payments = await razorpay.orders.fetchPayments(intent.razorpayOrderId);
          console.log(`    Payments count: ${payments.count}`);
          if (payments.items && payments.items.length > 0) {
            payments.items.forEach((p, idx) => {
              console.log(`      [Payment ${idx+1}] ID: ${p.id}, Status: ${p.status}, Amount: ₹${p.amount / 100}, Method: ${p.method}, Error: ${p.error_code} - ${p.error_description}`);
            });
          }
        }
      } catch (err) {
        console.error('    ❌ Razorpay API Error:', err);
      }
    }
    console.log('----------------------------------------------------');
  }

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB.');
}

run().catch(err => {
  console.error('Error running diagnostics:', err);
  mongoose.disconnect();
});
