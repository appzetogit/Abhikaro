import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const maakarniIds = ['69d0ef574222eff98f02cb92', 'REST-1775300439918-3090'];
    const qrOrders = await Order.find({
      restaurantId: { $in: maakarniIds },
      orderType: 'QR'
    }).sort({ createdAt: -1 }).lean();

    console.log(`Found ${qrOrders.length} QR orders for Maa karni Restaurant:`);

    for (const order of qrOrders) {
      const s = await OrderSettlement.findOne({ orderId: order._id }).lean();
      const pctAdmin = order.commissionPercentages?.admin;
      const isIncorrect = pctAdmin !== 15;
      
      console.log(`\nOrder ID: ${order.orderId} | Status: ${order.status}`);
      console.log(`  Date: ${order.createdAt}`);
      console.log(`  Subtotal: ₹${order.pricing?.subtotal} | Total: ₹${order.pricing?.total}`);
      console.log(`  Percentages: Admin ${order.commissionPercentages?.admin}%, Hotel ${order.commissionPercentages?.hotel}%, Restaurant ${order.commissionPercentages?.restaurant}%`);
      console.log(`  Flat: Admin: ₹${order.adminCommission} | Hotel: ₹${order.hotelCommission} | Restaurant: ₹${order.restaurantShare}`);
      console.log(`  Is Incorrect (should be 15% Admin / 25% Total): ${isIncorrect ? '❌ YES' : '✅ NO'}`);
      
      if (s) {
        console.log(`  Settlement: Status: ${s.settlementStatus} | Escrow: ${s.escrowStatus}`);
        console.log(`  Settlement Restaurant Earning netEarning: ₹${s.restaurantEarning?.netEarning}`);
        console.log(`  Settlement Admin Earning commission: ₹${s.adminEarning?.commission}`);
        console.log(`  Settlement Hotel Earning commission: ₹${s.hotelEarning?.commission}`);
      } else {
        console.log(`  Settlement NOT FOUND`);
      }
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
