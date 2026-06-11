import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';

dotenv.config();

async function inspect() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const orderIdStr = 'ORD-1781156016888-690';
    const o = await Order.findOne({ orderId: orderIdStr }).lean();
    if (!o) {
      console.log('Order not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('Order Type:', o.orderType);
    console.log('hotelReference:', o.hotelReference);
    console.log('hotelId:', o.hotelId);
    console.log('hotelName:', o.hotelName);
    console.log('payment.method:', o.payment?.method);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}
inspect();