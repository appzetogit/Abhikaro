import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import Payment from '../modules/payment/models/Payment.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';
import Hotel from '../modules/hotel/models/Hotel.js';
import CommissionSettings from '../modules/admin/models/CommissionSettings.js';
import TableBooking from '../modules/dining/models/TableBooking.js';

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

    const targetRestaurantObjectIds = [
      restaurant._id,
    ];

    // Fetch all delivered orders excluding ORD-TEST
    const orders = await Order.find({
      restaurantId: { $in: restaurantIdVariations },
      status: 'delivered',
      orderId: { $not: /^ORD-TEST/i }
    }).lean();

    // Fetch dining bookings
    const bookings = await TableBooking.find({
      restaurant: { $in: targetRestaurantObjectIds },
      status: { $in: ['completed', 'dining_completed'] },
      paymentStatus: 'paid'
    }).lean();

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

    // Get qr global commission
    let qrGlobalCommission = { hotel: 0, admin: 0 };
    try {
      const latest = await CommissionSettings.findOne().sort({ createdAt: -1 }).lean();
      if (latest?.qrCommission) {
        qrGlobalCommission = {
          hotel: Number(latest.qrCommission.hotel || 0),
          admin: Number(latest.qrCommission.admin || 0)
        };
      }
    } catch (_) {}

    // Get hotel configurations
    let hotelConfigByKey = new Map();
    try {
      const hotelObjectIds = [];
      const hotelIdStrings = [];
      for (const o of orders) {
        if (o?.hotelId) hotelObjectIds.push(new mongoose.Types.ObjectId(o.hotelId));
        if (o?.hotelReference) hotelIdStrings.push(o.hotelReference);
      }
      const or = [];
      if (hotelObjectIds.length) or.push({ _id: { $in: hotelObjectIds } });
      if (hotelIdStrings.length) or.push({ hotelId: { $in: hotelIdStrings } });
      if (or.length) {
        const hotels = await Hotel.find({ $or: or }).lean();
        for (const h of hotels) {
          if (h?._id) hotelConfigByKey.set(String(h._id), h);
          if (h?.hotelId) hotelConfigByKey.set(String(h.hotelId), h);
        }
      }
    } catch (_) {}

    let calculatedWalletEarned = 0;
    
    // Process order payouts exactly matching getOrders logic
    for (const order of orders) {
      const paymentRecordStatus = paymentMap.get(order._id.toString());
      const orderPaymentStatus = order.payment?.status;
      let effectivePaymentStatus = paymentRecordStatus || orderPaymentStatus;
      if (order.status === 'delivered') {
        effectivePaymentStatus = 'completed';
      }
      const paymentStatusDisplay = effectivePaymentStatus === 'completed' ? 'Paid' : 'Pending';

      const subtotal = order.pricing?.subtotal || 0;
      const discount = order.pricing?.discount || 0;
      const deliveryFee = order.pricing?.deliveryFee || 0;
      const tax = order.pricing?.tax || 0;
      const orderAmount = order.pricing?.total || 0;

      let platformFee = order.pricing?.platformFee;
      if (platformFee === undefined || platformFee === null) {
        const settlement = settlementMap.get(order._id.toString());
        if (settlement?.userPayment?.platformFee !== undefined) {
          platformFee = settlement.userPayment.platformFee;
        } else {
          const calculatedTotal = subtotal - discount + deliveryFee + tax;
          const difference = orderAmount - calculatedTotal;
          platformFee = (difference > 0 && difference <= 50) ? difference : 0;
        }
      }

      const settlement = settlementMap.get(order._id.toString());
      const commissionInfo = adminCommMap.get(order._id.toString()) || {};

      let restaurantEarning = settlement?.restaurantEarning?.netEarning ?? commissionInfo.restaurantEarning ?? 0;
      let deliveryEarning = settlement?.deliveryPartnerEarning?.totalEarning ?? order.estimatedEarnings?.totalEarning ?? 0;
      let adminEarning = settlement?.adminEarning?.totalEarning ?? commissionInfo.commissionAmount ?? 0;

      const isHotelQrOrder = (order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId);
      let hotelCommissionAmount = settlement?.hotelEarning?.commission ?? (Number(order.commissionBreakdown?.hotel || 0) || Number(order.hotelCommission || 0) || 0);

      if (isHotelQrOrder) {
        const commissionableFood = Math.max(0, subtotal - discount);
        const hotelCfg = hotelConfigByKey.get(String(order.hotelId || "")) || hotelConfigByKey.get(String(order.hotelReference || "")) || null;

        const pctHotel = Number(hotelCfg?.commission || 0) || Number(qrGlobalCommission?.hotel || 0) || Number(order.commissionPercentages?.hotel || 0);
        const pctAdmin = Number(hotelCfg?.adminCommission || 0) || Number(qrGlobalCommission?.admin || 0) || Number(order.commissionPercentages?.admin || 0);

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

      calculatedWalletEarned += restaurantEarning;
    }

    // Process dining bookings payouts
    for (const booking of bookings) {
      const payout = booking.restaurantEarning || 0;
      calculatedWalletEarned += payout;
    }

    console.log(`\nNew predicted Wallet totalEarned (excluding test order): ₹${calculatedWalletEarned.toFixed(2)}`);
    console.log(`New predicted Restaurant History Total (excluding test order): ₹${(calculatedWalletEarned).toFixed(2)}`);

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
