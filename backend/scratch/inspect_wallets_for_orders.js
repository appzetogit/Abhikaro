import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import AdminWallet from '../modules/admin/models/AdminWallet.js';
import HotelWallet from '../modules/hotel/models/HotelWallet.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';

dotenv.config();

const orderIds = [
  'ORD-1781156016888-690', // Order 2
  'ORD-1781108702714-178', // Order 6
  'ORD-1781090410623-896', // Order 8
  'ORD-1781071634363-714'  // Order 12
];

async function inspect() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const orderIdStr of orderIds) {
      console.log(`\n================== INSPECTING ORDER: ${orderIdStr} ==================`);
      const order = await Order.findOne({ orderId: orderIdStr }).lean();
      if (!order) {
        console.log('Order not found in DB');
        continue;
      }
      
      console.log(`Order Db ID: ${order._id}`);
      console.log(`Status: ${order.status}`);
      console.log(`Payment Method: ${order.payment?.method} | Status: ${order.payment?.status}`);
      console.log(`commissionDistributed on Order: ${order.commissionDistributed}`);
      console.log(`Percentages: ${JSON.stringify(order.commissionPercentages)}`);
      console.log(`Breakdown: ${JSON.stringify(order.commissionBreakdown)}`);

      const settlement = await OrderSettlement.findOne({ orderId: order._id }).lean();
      if (settlement) {
        console.log(`Settlement Status: ${settlement.settlementStatus} | Escrow Status: ${settlement.escrowStatus}`);
        console.log(`Settlement Restaurant Earning: ${JSON.stringify(settlement.restaurantEarning)}`);
        console.log(`Settlement Admin Earning: ${JSON.stringify(settlement.adminEarning)}`);
        console.log(`Settlement Hotel Earning: ${JSON.stringify(settlement.hotelEarning)}`);
      } else {
        console.log('Settlement NOT FOUND');
      }

      // Check Admin Wallet Transactions
      const adminWallet = await AdminWallet.findOne({});
      if (adminWallet) {
        const txs = adminWallet.transactions.filter(t => t.orderId?.toString() === order._id.toString());
        console.log(`Admin Wallet Transactions count: ${txs.length}`);
        txs.forEach(t => {
          console.log(`  - Type: ${t.type} | Amount: ₹${t.amount} | Status: ${t.status} | Desc: "${t.description}"`);
        });
      }

      // Check Hotel Wallet Transactions
      if (order.hotelId) {
        const hotelWallet = await HotelWallet.findOne({ hotelId: order.hotelId });
        if (hotelWallet) {
          const txs = hotelWallet.transactions.filter(t => t.orderId?.toString() === order._id.toString());
          console.log(`Hotel Wallet (${order.hotelName}) Transactions count: ${txs.length}`);
          txs.forEach(t => {
            console.log(`  - Type: ${t.type} | Amount: ₹${t.amount} | Status: ${t.status} | Desc: "${t.description}"`);
          });
        } else {
          console.log(`Hotel Wallet for ${order.hotelName} (${order.hotelId}) NOT FOUND`);
        }
      }

      // Check Restaurant Wallet Transactions
      let finalRestaurantId = order.restaurantId;
      if (finalRestaurantId && !mongoose.Types.ObjectId.isValid(finalRestaurantId)) {
        const Restaurant = (await import('../modules/restaurant/models/Restaurant.js')).default;
        const restDoc = await Restaurant.findOne({
          $or: [
            { restaurantId: finalRestaurantId },
            { slug: finalRestaurantId }
          ]
        }).lean();
        if (restDoc) {
          finalRestaurantId = restDoc._id;
        }
      }
      
      const restWallet = await RestaurantWallet.findOne({ restaurantId: finalRestaurantId });
      if (restWallet) {
        const txs = restWallet.transactions.filter(t => t.orderId?.toString() === order._id.toString());
        console.log(`Restaurant Wallet (${order.restaurantName}) Transactions count: ${txs.length}`);
        txs.forEach(t => {
          console.log(`  - Type: ${t.type} | Amount: ₹${t.amount} | Status: ${t.status} | Desc: "${t.description}"`);
        });
      } else {
        console.log(`Restaurant Wallet for ${order.restaurantName} NOT FOUND`);
      }

      // Check Admin Commission
      const adminComm = await AdminCommission.findOne({ orderId: order._id }).lean();
      if (adminComm) {
        console.log(`AdminCommission Record: Amount: ₹${adminComm.commissionAmount} (${adminComm.commissionPercentage}%) | Restaurant Net: ₹${adminComm.restaurantEarning} | Status: ${adminComm.status}`);
      } else {
        console.log('AdminCommission Record NOT FOUND');
      }
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

inspect();
