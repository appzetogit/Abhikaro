import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';

dotenv.config();

async function verify() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const order1 = await Order.findOne({ orderId: 'ORD-1781156016888-690' }).lean();
    const order2 = await Order.findOne({ orderId: 'ORD-1781162523268-886' }).lean();

    if (order1) {
      console.log('\n=== Order 1: ORD-1781156016888-690 ===');
      console.log('Mongo _id:', order1._id);
      console.log('Status:', order1.status);
      console.log('Order Type:', order1.orderType);
      console.log('Payment Method:', order1.payment?.method);
      console.log('Admin Commission:', order1.adminCommission);
      console.log('Restaurant Share:', order1.restaurantShare);
      console.log('Hotel Commission:', order1.hotelCommission);
      console.log('commissionDistributed:', order1.commissionDistributed);
    } else {
      console.log('Order 1 not found!');
    }

    if (order2) {
      console.log('\n=== Order 2: ORD-1781162523268-886 ===');
      console.log('Mongo _id:', order2._id);
      console.log('Status:', order2.status);
      console.log('Order Type:', order2.orderType);
      console.log('Payment Method:', order2.payment?.method);
      console.log('Admin Commission:', order2.adminCommission);
      console.log('Restaurant Share:', order2.restaurantShare);
      console.log('Hotel Commission:', order2.hotelCommission);
      console.log('commissionDistributed:', order2.commissionDistributed);
    } else {
      console.log('Order 2 not found!');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

verify();
