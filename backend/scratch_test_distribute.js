import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';
import { distributeCommissions } from './modules/order/services/commissionDistributionService.js';

dotenv.config();

async function runTest() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const orderIdStr = 'ORD-1779275107858-47';
    const order = await Order.findOne({ orderId: orderIdStr });
    if (!order) {
      console.log('Order not found');
      return;
    }

    console.log('Order commissionDistributed before:', order.commissionDistributed);

    console.log('Calling distributeCommissions...');
    const result = await distributeCommissions(order._id);
    console.log('Result:', result);

    const updatedOrder = await Order.findOne({ orderId: orderIdStr });
    console.log('Order commissionDistributed after:', updatedOrder.commissionDistributed);
    console.log('hotelCommission:', updatedOrder.hotelCommission);
    console.log('adminCommission:', updatedOrder.adminCommission);
    console.log('restaurantShare:', updatedOrder.restaurantShare);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

runTest();
