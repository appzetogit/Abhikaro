
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';

dotenv.config();

async function checkOrder() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const order = await Order.findOne({ status: "preparing" });
    if (order) {
      console.log("Preparing Order found:");
      console.log("orderId:", order.orderId);
      console.log("restaurantId:", order.restaurantId);
      console.log("restaurantId type:", typeof order.restaurantId);
      console.log("Full Order Document (partial):", JSON.stringify(order, null, 2).substring(0, 1000));
    } else {
      console.log("No preparing orders found");
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkOrder();
