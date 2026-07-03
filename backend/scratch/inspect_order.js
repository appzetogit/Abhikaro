import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';

dotenv.config();

async function inspect() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('Connected.\n');

    const orderId = 'ORD-1780292789749-63';
    console.log(`Searching for Settlement of: ${orderId}...`);
    const doc = await OrderSettlement.findOne({ orderNumber: orderId }).lean();
    console.log('=== SETTLEMENT ===');
    console.log(JSON.stringify(doc, null, 2));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

inspect();
