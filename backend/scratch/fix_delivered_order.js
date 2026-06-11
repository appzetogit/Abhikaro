import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import AdminWallet from '../modules/admin/models/AdminWallet.js';
import { calculateOrderSettlement } from '../modules/order/services/orderSettlementService.js';

dotenv.config();

async function fixDeliveredOrder() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const orderIdStr = 'ORD-1781162523268-886';
    const order = await Order.findOne({ orderId: orderIdStr });
    if (!order) {
      console.log('Order not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('=== BEFORE FIX ===');
    console.log('Order commissionBreakdown:', order.commissionBreakdown);

    // 1. Recalculate based on 25% restaurant commission, 10% hotel commission
    const subtotal = order.pricing.subtotal || 504;
    const hotelAmount = Math.round(subtotal * 0.10 * 100) / 100;
    const totalCommissionAmount = Math.round(subtotal * 0.25 * 100) / 100;
    const adminAmount = Math.round((totalCommissionAmount - hotelAmount) * 100) / 100;
    const restaurantAmount = Math.round((subtotal - totalCommissionAmount) * 100) / 100;

    order.commissionPercentages = {
      hotel: 10,
      admin: 15,
      restaurant: 75,
      user: 0
    };

    order.commissionBreakdown = {
      hotel: hotelAmount,
      admin: adminAmount,
      restaurant: restaurantAmount,
      user: 0
    };

    order.hotelCommission = hotelAmount;
    order.adminCommission = adminAmount;
    order.restaurantShare = restaurantAmount;

    await order.save();
    console.log('\n=== Order document updated! ===');

    // 2. Remove existing settlement and recalculate
    await OrderSettlement.deleteOne({ orderId: order._id });
    console.log('Deleted old settlement.');

    const settlement = await calculateOrderSettlement(order._id);
    settlement.restaurantEarning.status = 'credited';
    settlement.restaurantEarning.creditedAt = new Date();
    settlement.deliveryPartnerEarning.status = 'credited';
    settlement.deliveryPartnerEarning.creditedAt = new Date();
    settlement.adminEarning.status = 'credited';
    settlement.adminEarning.creditedAt = new Date();
    settlement.hotelEarning.status = 'credited';
    settlement.hotelEarning.creditedAt = new Date();
    settlement.restaurantSettled = true;
    settlement.deliveryPartnerSettled = true;
    settlement.hotelSettled = true;
    settlement.adminSettled = true;
    settlement.settlementStatus = 'completed';
    await settlement.save();

    console.log('\n=== Settlement regenerated! ===');
    console.log('restaurantEarning:', settlement.restaurantEarning);
    console.log('hotelEarning:', settlement.hotelEarning);
    console.log('adminEarning:', settlement.adminEarning);

    // 3. Fix Admin Wallet
    const adminWallet = await AdminWallet.findOne({});
    if (adminWallet) {
      console.log('\n=== Fixing Admin Wallet ===');
      console.log('Original transactions count:', adminWallet.transactions.length);
      console.log('Original balance:', adminWallet.totalBalance);

      // Filter out old transactions for this order
      adminWallet.transactions = adminWallet.transactions.filter(
        t => t.orderId?.toString() !== order._id.toString()
      );

      // Add correct transactions
      adminWallet.transactions.push({
        amount: adminAmount,
        type: 'commission',
        status: 'Completed',
        description: `Restaurant commission from order ${order.orderId} (15.0% of ₹${subtotal})`,
        orderId: order._id,
        restaurantId: order.restaurantId,
        createdAt: new Date(),
        processedAt: new Date()
      });

      if (order.pricing.platformFee > 0) {
        adminWallet.transactions.push({
          amount: order.pricing.platformFee,
          type: 'platform_fee',
          status: 'Completed',
          description: `Platform fee from order ${order.orderId}`,
          orderId: order._id,
          createdAt: new Date(),
          processedAt: new Date()
        });
      }

      if (order.pricing.tax > 0) {
        adminWallet.transactions.push({
          amount: order.pricing.tax,
          type: 'gst',
          status: 'Completed',
          description: `GST from order ${order.orderId}`,
          orderId: order._id,
          createdAt: new Date(),
          processedAt: new Date()
        });
      }

      // Recalculate totals
      let balance = 0;
      let commission = 0;
      let platformFee = 0;
      let deliveryFee = 0;
      let gst = 0;
      let withdrawn = 0;

      for (const t of adminWallet.transactions) {
        if (t.status === 'Completed') {
          if (t.type === 'commission') {
            balance += t.amount;
            commission += t.amount;
          } else if (t.type === 'platform_fee') {
            balance += t.amount;
            platformFee += t.amount;
          } else if (t.type === 'delivery_fee') {
            balance += t.amount;
            deliveryFee += t.amount;
          } else if (t.type === 'gst') {
            balance += t.amount;
            gst += t.amount;
          } else if (t.type === 'withdrawal') {
            balance -= t.amount;
            withdrawn += t.amount;
          } else if (t.type === 'deduction') {
            balance -= t.amount;
          } else if (t.type === 'refund') {
            balance = Math.max(0, balance - t.amount);
          }
        }
      }

      adminWallet.totalBalance = Math.round(balance * 100) / 100;
      adminWallet.totalCommission = Math.round(commission * 100) / 100;
      adminWallet.totalPlatformFee = Math.round(platformFee * 100) / 100;
      adminWallet.totalDeliveryFee = Math.round(deliveryFee * 100) / 100;
      adminWallet.totalGST = Math.round(gst * 100) / 100;
      adminWallet.totalWithdrawn = Math.round(withdrawn * 100) / 100;
      adminWallet.lastTransactionAt = new Date();

      await adminWallet.save();
      console.log('Admin Wallet corrected!');
      console.log('New balance:', adminWallet.totalBalance);
    }

    // 4. Force Restaurant Wallet Sync
    console.log('\n=== Syncing Restaurant Wallet ===');
    const restWallet = await RestaurantWallet.findOrCreateByRestaurantId(order.restaurantId);
    console.log('Restaurant Wallet balance:', restWallet.totalBalance);

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (err) {
    console.error('Error:', err);
  }
}

fixDeliveredOrder();
