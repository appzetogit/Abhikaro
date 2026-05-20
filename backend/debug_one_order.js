import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';
import OrderSettlement from './modules/order/models/OrderSettlement.js';
import { calculateOrderSettlement } from './modules/order/services/orderSettlementService.js';
import { distributeCommissions } from './modules/order/services/commissionDistributionService.js';

dotenv.config();

async function runFix() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const orderIdStr = 'ORD-1779254748499-807';
    let order = await Order.findOne({ orderId: orderIdStr });
    if (!order) {
      console.log(`Order ${orderIdStr} not found`);
      return;
    }

    console.log("=== ORDER BEFORE FIX ===");
    console.log("orderId:", order.orderId);
    console.log("hotelReference:", order.hotelReference);
    console.log("hotelId:", order.hotelId);
    console.log("commissionDistributed:", order.commissionDistributed);
    console.log("hotelCommission:", order.hotelCommission);
    console.log("adminCommission:", order.adminCommission);
    console.log("restaurantShare:", order.restaurantShare);

    // Reset commissionDistributed so we can re-distribute
    order.commissionDistributed = false;
    await order.save();
    console.log("Reset commissionDistributed to false.");

    // 1. Recalculate settlement
    console.log("\n--- Calculating Order Settlement ---");
    const settlement = await calculateOrderSettlement(order._id);
    console.log("Settlement recalculated successfully!");
    console.log("restaurantEarning:", settlement.restaurantEarning);
    console.log("adminEarning:", settlement.adminEarning);
    console.log("hotelEarning:", settlement.hotelEarning);

    // 2. Distribute commissions
    console.log("\n--- Distributing Commissions ---");
    const distributionResult = await distributeCommissions(order._id);
    console.log("Distribution Result:", distributionResult);

    // Reload order to see updated values
    order = await Order.findById(order._id);
    console.log("\n=== ORDER AFTER FIX ===");
    console.log("commissionDistributed:", order.commissionDistributed);
    console.log("hotelCommission:", order.hotelCommission);
    console.log("adminCommission:", order.adminCommission);
    console.log("restaurantShare:", order.restaurantShare);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error during execution:', error);
  }
}

runFix();
