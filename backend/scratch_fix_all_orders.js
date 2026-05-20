import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';
import Hotel from './modules/hotel/models/Hotel.js';
import { calculateOrderSettlement } from './modules/order/services/orderSettlementService.js';
import { distributeCommissions } from './modules/order/services/commissionDistributionService.js';

dotenv.config();

async function runMigration() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all QR orders (orders with hotelReference) that are NOT distributed
    const undistributedOrders = await Order.find({
      hotelReference: { $ne: null },
      commissionDistributed: { $ne: true }
    });

    console.log(`Found ${undistributedOrders.length} undistributed QR orders.`);

    let succeededDeliveredCount = 0;
    let failedDeliveredCount = 0;
    let cancelledProcessedCount = 0;
    let cancelledFailedCount = 0;

    for (let i = 0; i < undistributedOrders.length; i++) {
      const order = undistributedOrders[i];
      const isZero = !order.hotelCommission || order.hotelCommission === 0 || order.hotelCommission === 0.00;
      console.log(`\n[${i + 1}/${undistributedOrders.length}] Processing Order: ${order.orderId} (Status: ${order.status}, IsZero: ${isZero})`);

      try {
        // 1. Resolve Hotel
        let hotel = null;
        if (order.hotelReference) {
          hotel = await Hotel.findOne({ hotelId: order.hotelReference });
          if (!hotel && mongoose.Types.ObjectId.isValid(order.hotelReference)) {
            hotel = await Hotel.findById(order.hotelReference);
          }
        }
        if (!hotel && order.hotelId) {
          hotel = await Hotel.findById(order.hotelId);
        }

        if (hotel) {
          if (!order.hotelId || order.hotelId.toString() !== hotel._id.toString()) {
            order.hotelId = hotel._id;
            await order.save();
            console.log(`-> Resolved and updated hotelId to: ${hotel._id} (${hotel.hotelName})`);
          } else {
            console.log(`-> hotelId already correctly set: ${order.hotelId} (${hotel.hotelName})`);
          }
        } else {
          console.warn(`-> ⚠️ Could not resolve hotel for reference: ${order.hotelReference || order.hotelId}`);
        }

        // 2. Separate logic by status
        if (order.status === 'delivered') {
          // If commission is zero, we must recalculate the settlement first
          if (isZero) {
            console.log('-> Recalculating settlement for zero-commission order...');
            const settlement = await calculateOrderSettlement(order._id);
            console.log(`-> Recalculated settlement: restEarning=${settlement.restaurantEarning?.netEarning}, hotelEarning=${settlement.hotelEarning?.commission}, adminEarning=${settlement.adminEarning?.commission}`);
          }

          // Reload order document to get fresh pricing / commission updates
          const freshOrder = await Order.findById(order._id);

          // Force commissionDistributed = false so distributeCommissions will run
          freshOrder.commissionDistributed = false;
          await freshOrder.save();

          console.log('-> Distributing commissions...');
          const distResult = await distributeCommissions(freshOrder._id);
          console.log('-> Distribution Result:', JSON.stringify(distResult));

          succeededDeliveredCount++;
        } else if (order.status === 'cancelled') {
          // Cancelled orders: database integrity updated above if hotel was found, no distribution needed.
          console.log('-> Order is cancelled. Database integrity updated (if applicable). Skipping wallet distribution.');
          cancelledProcessedCount++;
        } else {
          console.log(`-> Order status is ${order.status}. Skipping distribution.`);
        }
      } catch (orderError) {
        console.error(`❌ Error processing order ${order.orderId}:`, orderError);
        if (order.status === 'delivered') {
          failedDeliveredCount++;
        } else if (order.status === 'cancelled') {
          cancelledFailedCount++;
        }
      }
    }

    console.log('\n======================================');
    console.log('         MIGRATION SUMMARY');
    console.log('======================================');
    console.log(`Total Undistributed Orders Found: ${undistributedOrders.length}`);
    console.log(`Delivered Orders Succeeded:      ${succeededDeliveredCount}`);
    console.log(`Delivered Orders Failed:         ${failedDeliveredCount}`);
    console.log(`Cancelled Orders Integrity Fix:  ${cancelledProcessedCount}`);
    console.log(`Cancelled Orders Failed:         ${cancelledFailedCount}`);
    console.log('======================================');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Fatal Migration Error:', error);
  }
}

runMigration();
