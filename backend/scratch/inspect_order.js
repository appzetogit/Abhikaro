import mongoose from 'mongoose';
import Order from '../modules/order/models/Order.js';
import dotenv from 'dotenv';
dotenv.config();

const inspect = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const orderId = 'ORD-1780759475330-790';
    console.log(`Searching for order: ${orderId}`);
    
    const order = await Order.findOne({ orderId: orderId }).lean();
    if (!order) {
      console.log('Order not found!');
      process.exit(0);
    }
    
    console.log('Order from DB:', JSON.stringify(order, null, 2));
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

inspect();
