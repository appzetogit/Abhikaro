import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import Payment from '../modules/payment/models/Payment.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';
import Zone from '../modules/admin/models/Zone.js';
import User from '../modules/auth/models/User.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const restaurant = await Restaurant.findOne({ name: /kirpa/i });
    const restaurantIdVariations = [
      restaurant._id.toString(),
      restaurant.restaurantId?.toString(),
    ].filter(Boolean);

    const orders = await Order.find({ restaurantId: { $in: restaurantIdVariations } }).lean();

    // Fetch settlements
    const orderIds = orders.map(o => o._id);
    const settlements = await OrderSettlement.find({ orderId: { $in: orderIds } }).lean();
    const settlementMap = new Map();
    settlements.forEach(s => settlementMap.set(s.orderId.toString(), s));

    // Fetch admin commissions
    const adminComms = await AdminCommission.find({ orderId: { $in: orderIds }, status: 'completed' }).lean();
    const adminCommMap = new Map();
    adminComms.forEach(ac => adminCommMap.set(ac.orderId.toString(), ac));

    // Fetch payments
    const payments = await Payment.find({ orderId: { $in: orderIds } }).lean();
    const paymentMap = new Map();
    payments.forEach(p => paymentMap.set(p.orderId.toString(), p.status));

    // Transform orders using exact copy of orderController logic
    const transformed = orders.map(order => {
      const paymentRecordStatus = paymentMap.get(order._id.toString());
      const orderPaymentStatus = order.payment?.status;
      let effectivePaymentStatus = paymentRecordStatus || orderPaymentStatus;

      if (order.status === 'delivered') {
        effectivePaymentStatus = 'completed';
      }

      const paymentStatusMap = {
        'completed': 'Paid',
        'pending': 'Pending',
        'failed': 'Failed',
        'refunded': 'Refunded',
        'processing': 'Processing'
      };
      const paymentStatusDisplay = paymentStatusMap[effectivePaymentStatus] || 'Pending';

      const isEffectivelyCancelled = order.status === 'cancelled' || !!order.cancelledAt;
      let orderStatusDisplay = order.status;
      if (isEffectivelyCancelled) {
        orderStatusDisplay = 'Cancelled';
      } else {
        const statusMap = {
          'pending': 'Pending',
          'confirmed': 'Pending',
          'preparing': 'Processing',
          'ready': 'Ready',
          'out_for_delivery': 'Food On The Way',
          'delivered': 'Delivered',
          'scheduled': 'Scheduled',
          'dine_in': 'Dine In'
        };
        orderStatusDisplay = statusMap[order.status] || order.status;
      }

      // Calculations exactly like orderController.js
      const subtotal = order.pricing?.subtotal || 0;
      const discount = order.pricing?.discount || 0;
      const deliveryFee = order.pricing?.deliveryFee || 0;
      const tax = order.pricing?.tax || 0;
      const orderAmount = order.pricing?.total || 0;
      let platformFee = order.pricing?.platformFee || 0; // simplified for comparison

      const settlement = settlementMap.get(order._id.toString());
      const commissionInfo = adminCommMap.get(order._id.toString()) || {};

      let restaurantEarning = settlement?.restaurantEarning?.netEarning ?? commissionInfo.restaurantEarning ?? 0;
      let deliveryEarning = settlement?.deliveryPartnerEarning?.totalEarning ?? order.estimatedEarnings?.totalEarning ?? 0;
      let adminEarning = settlement?.adminEarning?.totalEarning ?? commissionInfo.commissionAmount ?? 0;

      const isHotelQrOrder = (order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId);
      let hotelCommissionAmount = settlement?.hotelEarning?.commission ?? (Number(order.commissionBreakdown?.hotel || 0) || Number(order.hotelCommission || 0) || 0);

      if (isHotelQrOrder) {
        const commissionableFood = Math.max(0, subtotal - discount);
        // derivation of hotel commission
        const pctHotel = Number(order.commissionPercentages?.hotel || 0);
        const pctAdmin = Number(order.commissionPercentages?.admin || 0);
        let hotelCommission = hotelCommissionAmount;
        let qrAdminCommission = Number(order.commissionBreakdown?.admin || 0) || Number(order.adminCommission || 0) || 0;

        if (!hotelCommission && pctHotel > 0 && commissionableFood > 0) {
          hotelCommission = Math.round(((commissionableFood * pctHotel) / 100) * 100) / 100;
        }
        if (!qrAdminCommission && pctAdmin > 0 && commissionableFood > 0) {
          qrAdminCommission = Math.round(((commissionableFood * pctAdmin) / 100) * 100) / 100;
        }

        const qrRestaurantNet = Math.max(0, commissionableFood - hotelCommission - qrAdminCommission);
        if (qrRestaurantNet > 0) {
          restaurantEarning = Math.round(qrRestaurantNet * 100) / 100;
        } else if (!restaurantEarning) {
          const explicitRestaurant = Number(order.restaurantShare || order.commissionBreakdown?.restaurant || 0);
          if (explicitRestaurant > 0) {
            restaurantEarning = explicitRestaurant;
          }
        }
        
        hotelCommissionAmount = Number(hotelCommission || 0) || hotelCommissionAmount;
      }

      if (!restaurantEarning) {
        const pct = Number(order.commissionPercentages?.restaurant || 0);
        if (!isHotelQrOrder && pct > 0) {
          const derivedSubtotal = Math.max(0, orderAmount - platformFee - deliveryFee - tax);
          const derived = (derivedSubtotal * pct) / 100;
          if (derived > 0) restaurantEarning = Math.round(derived * 100) / 100;
        } else if (isHotelQrOrder && Number(orderAmount) > 0) {
          const hotelCommission = Number(order.hotelCommission || 0) || Number(order.commissionBreakdown?.hotel || 0);
          const derived = Number(orderAmount) - Number(adminEarning || 0) - Number(hotelCommission || 0) - Number(deliveryEarning || 0);
          if (derived > 0) restaurantEarning = Math.round(derived * 100) / 100;
        }
      }

      if (!restaurantEarning && !deliveryEarning && !adminEarning) {
        restaurantEarning = Math.max(0, subtotal - discount);
      }

      return {
        orderId: order.orderId,
        status: order.status,
        orderStatusDisplay,
        paymentStatusDisplay,
        restaurantEarning,
        totalAmount: orderAmount,
      };
    });

    let totalPaidDelivered = 0;
    let totalRevenue = 0;
    let totalRestaurantEarning = 0;
    
    transformed.forEach(o => {
      const isDelivered = o.orderStatusDisplay.toLowerCase() === 'delivered';
      const isPaid = o.paymentStatusDisplay.toLowerCase() === 'paid';
      
      if (isDelivered && isPaid) {
        totalPaidDelivered++;
        totalRevenue += o.totalAmount;
        totalRestaurantEarning += o.restaurantEarning;
      }
    });

    console.log(`\nFiltered Paid & Delivered Count: ${totalPaidDelivered}`);
    console.log(`Total Revenue: ₹${totalRevenue.toFixed(2)}`);
    console.log(`Restaurant Earning Total: ₹${totalRestaurantEarning.toFixed(2)}`);

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
