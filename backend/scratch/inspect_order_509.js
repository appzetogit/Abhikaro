import mongoose from 'mongoose';
import Order from '../modules/order/models/Order.js';
import dotenv from 'dotenv';
dotenv.config();

const inspect = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const order = await Order.findOne({ orderId: 'ORD-1781369437414-509' }).lean();
    console.log(order);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

inspect();
