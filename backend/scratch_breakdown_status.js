import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';

dotenv.config();

async function runCheck() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const qrOrders = await Order.find({
      hotelReference: { $ne: null },
      commissionDistributed: { $ne: true }
    });

    const breakdown = {};
    for (const order of qrOrders) {
      const isZero = !order.hotelCommission || order.hotelCommission === 0 || order.hotelCommission === 0.00;
      const key = `${order.status}_${isZero ? 'zero' : 'positive'}`;
      if (!breakdown[key]) {
        breakdown[key] = [];
      }
      breakdown[key].push(order.orderId);
    }

    console.log('\n--- STATUS & COMMISSION BREAKDOWN FOR UNDISTRIBUTED QR ORDERS ---');
    for (const [key, list] of Object.entries(breakdown)) {
      console.log(`${key}: ${list.length} orders`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

runCheck();
