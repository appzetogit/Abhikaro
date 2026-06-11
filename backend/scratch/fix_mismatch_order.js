import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import { calculateOrderSettlement } from '../modules/order/services/orderSettlementService.js';

dotenv.config();

async function fixOrder() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const orderIdStr = 'ORD-1781156016888-690';
    const order = await Order.findOne({ orderId: orderIdStr });
    if (!order) {
      console.log('Order not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('=== BEFORE FIX ===');
    console.log('commissionBreakdown:', order.commissionBreakdown);
    console.log('hotelCommission:', order.hotelCommission);
    console.log('adminCommission:', order.adminCommission);
    console.log('restaurantShare:', order.restaurantShare);

    // Recalculate based on 25% restaurant commission, 10% hotel commission
    const subtotal = order.pricing.subtotal || 375;
    
    // Total commission rate = 25%
    // Hotel commission rate = 10%
    // Admin commission rate = 15% (25% - 10%)
    
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

    // Remove existing settlement if any, so we get a fresh correct calculation
    await OrderSettlement.deleteOne({ orderId: order._id });
    console.log('Deleted old settlement.');

    // Calculate new settlement
    console.log('Calculating new settlement...');
    const settlement = await calculateOrderSettlement(order._id);
    console.log('\n=== NEW SETTLEMENT ===');
    console.log('userPayment:', settlement.userPayment);
    console.log('restaurantEarning:', settlement.restaurantEarning);
    console.log('deliveryPartnerEarning:', settlement.deliveryPartnerEarning);
    console.log('adminEarning:', settlement.adminEarning);
    console.log('hotelEarning:', settlement.hotelEarning);

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (err) {
    console.error('Error:', err);
  }
}

fixOrder();
