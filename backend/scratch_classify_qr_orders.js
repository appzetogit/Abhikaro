import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';

dotenv.config();

async function runCheck() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const qrOrders = await Order.find({ hotelReference: { $ne: null } });
    console.log(`Total QR Orders: ${qrOrders.length}`);

    const stats = {
      zeroCommission_notDistributed: [],
      zeroCommission_distributed: [],
      positiveCommission_notDistributed: [],
      positiveCommission_distributed: []
    };

    for (const order of qrOrders) {
      const isZero = !order.hotelCommission || order.hotelCommission === 0 || order.hotelCommission === 0.00;
      const isDistributed = order.commissionDistributed === true;

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

      if (isZero && !isDistributed) {
        stats.zeroCommission_notDistributed.push(details);
      } else if (isZero && isDistributed) {
        stats.zeroCommission_distributed.push(details);
      } else if (!isZero && !isDistributed) {
        stats.positiveCommission_notDistributed.push(details);
      } else {
        stats.positiveCommission_distributed.push(details);
      }
    }

    console.log(`\n--- STATS ---`);
    console.log(`1. Zero Commission & NOT Distributed: ${stats.zeroCommission_notDistributed.length}`);
    console.log(`2. Zero Commission & Distributed: ${stats.zeroCommission_distributed.length}`);
    console.log(`3. Positive Commission & NOT Distributed: ${stats.positiveCommission_notDistributed.length}`);
    console.log(`4. Positive Commission & Distributed: ${stats.positiveCommission_distributed.length}`);

    if (stats.zeroCommission_distributed.length > 0) {
      console.log(`\nZero Commission & Distributed details:`);
      console.log(JSON.stringify(stats.zeroCommission_distributed, null, 2));
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

runCheck();
