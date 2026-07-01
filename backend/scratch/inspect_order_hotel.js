import mongoose from 'mongoose';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import dotenv from 'dotenv';
dotenv.config();

const inspect = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const orderId = 'ORD-1777551017848-151';
    console.log(`Searching for order: ${orderId}`);
    
    const order = await Order.findOne({ orderId: orderId }).lean();
    if (!order) {
      console.log('Order not found!');
      process.exit(0);
    }
    
    console.log('Order from DB:', JSON.stringify(order, null, 2));
    
    const settlement = await OrderSettlement.findOne({ orderId: order._id }).lean();
    console.log('Settlement from DB:', settlement ? JSON.stringify(settlement, null, 2) : 'NOT FOUND');

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

inspect();
