import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';

dotenv.config();

async function runCheck() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all QR orders (orders with hotelReference)
    const qrOrders = await Order.find({ hotelReference: { $ne: null } });
    console.log(`Total QR Orders found: ${qrOrders.length}`);

    const zeroCommissionOrders = [];
    const okOrders = [];

    for (const order of qrOrders) {
      const isZero = !order.hotelCommission || order.hotelCommission === 0 || order.hotelCommission === 0.00;
      const details = {
        orderId: order.orderId,
        hotelReference: order.hotelReference,
        hotelId: order.hotelId,
        hotelName: order.hotelName,
        status: order.status,
        paymentMethod: order.payment?.method,
        hotelCommission: order.hotelCommission,
        commissionDistributed: order.commissionDistributed,
        restaurantShare: order.restaurantShare,
        adminCommission: order.adminCommission,
        totalPrice: order.pricing?.total
      };

      if (isZero) {
        zeroCommissionOrders.push(details);
      } else {
        okOrders.push(details);
      }
    }

    console.log(`\nOK Orders (${okOrders.length}):`);
    console.log(JSON.stringify(okOrders, null, 2));

    console.log(`\nZero Commission Orders (${zeroCommissionOrders.length}):`);
    console.log(JSON.stringify(zeroCommissionOrders, null, 2));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

runCheck();
