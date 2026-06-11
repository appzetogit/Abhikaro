import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';

dotenv.config();

async function verify() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const orderIdStr = 'ORD-1781156016888-690';
    const order = await Order.findOne({ orderId: orderIdStr }).lean();
    if (!order) {
      console.log('Order not found!');
      await mongoose.disconnect();
      return;
    }

    // Query OrderSettlement to check
    const s = await OrderSettlement.findOne({ orderId: order._id }).lean();
    if (!s) {
      console.log('Settlement not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('\n=== Database Check ===');
    console.log('Order commissionPercentages:', order.commissionPercentages);
    console.log('Order commissionBreakdown:', order.commissionBreakdown);
    console.log('Settlement hotelEarning:', s.hotelEarning);
    console.log('Settlement restaurantEarning:', s.restaurantEarning);
    console.log('Settlement adminEarning:', s.adminEarning);

    // Let's mimic the transform logic of orderController.js
    const isHotelQrOrder = (order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId);
    
    let hotelCommissionAmount = (s.hotelEarning && s.hotelEarning.commission !== undefined)
      ? s.hotelEarning.commission
      : (Number(order.commissionBreakdown?.hotel || 0) || Number(order.hotelCommission || 0) || 0);

    let restaurantEarning = s.restaurantEarning?.netEarning ?? 0;
    let deliveryEarning = s.deliveryPartnerEarning?.totalEarning ?? 0;
    let adminEarning = s.adminEarning?.totalEarning ?? 0;

    const earnings = {
      orderTotal: order.pricing?.total || 0,
      restaurantEarning,
      deliveryEarning,
      adminEarning,
      hotelEarning: Math.round(Number(hotelCommissionAmount || 0) * 100) / 100,
    };

    console.log('\n=== Mimicked Transform Output for Frontend ===');
    console.log('Earnings:', earnings);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

verify();
