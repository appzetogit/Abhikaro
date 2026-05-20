import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';
import { calculateOrderSettlement } from './modules/order/services/orderSettlementService.js';

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

    console.log('Order before recalculation:');
    console.log({
      orderId: order.orderId,
      orderType: order.orderType,
      hotelId: order.hotelId,
      hotelReference: order.hotelReference,
      hotelCommission: order.hotelCommission,
      commissionDistributed: order.commissionDistributed
    });

    console.log('\nRecalculating settlement...');
    const settlement = await calculateOrderSettlement(order._id);
    console.log('Recalculated Settlement:');
    console.log(JSON.stringify(settlement, null, 2));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

runTest();
