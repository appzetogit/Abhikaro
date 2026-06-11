import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { distributeCommissions } from '../modules/order/services/commissionDistributionService.js';
import Order from '../modules/order/models/Order.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const orderIdStr = 'ORD-1781162523268-886';
    const order = await Order.findOne({ orderId: orderIdStr }).lean();
    if (!order) {
      console.log('Order not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('Running distributeCommissions for order ID:', order._id);
    const result = await distributeCommissions(order._id);
    console.log('Result:', result);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error running distributeCommissions:', err);
  }
}

run();
