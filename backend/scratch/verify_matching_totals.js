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

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database.');

    const restaurant = await Restaurant.findOne({ name: /kirpa/i });
    if (!restaurant) {
      console.log('Restaurant not found');
      await mongoose.disconnect();
      return;
    }

    const restaurantIdVariations = [
      restaurant._id.toString(),
      restaurant.restaurantId?.toString(),
    ].filter(Boolean);

    // Fetch orders using EXACTLY the query that getOrders now uses
    const query = {
      restaurantId: { $in: restaurantIdVariations },
      orderId: { $not: /^ORD-TEST/i } // Exclude test orders
    };

    const orders = await Order.find(query).lean();
    console.log(`Total orders returned by query: ${orders.length}`);

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

    let apiRestaurantTotal = 0;
    let apiOrderTotal = 0;
    let deliveredCount = 0;

    for (const order of orders) {
      // paymentStatus display
      let effectivePaymentStatus = paymentMap.get(order._id.toString()) || order.payment?.status;
      if (order.status === 'delivered') {
        effectivePaymentStatus = 'completed';
      }
      const paymentStatusDisplay = effectivePaymentStatus === 'completed' ? 'Paid' : 'Pending';

      // orderStatus display
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

      // Skip non-delivered or unpaid orders for stats cards sums
      const isDelivered = orderStatusDisplay.toLowerCase() === 'delivered';
      const isPaid = paymentStatusDisplay.toLowerCase() === 'paid';
      if (!isDelivered || !isPaid) continue;

      deliveredCount++;

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

      apiRestaurantTotal += restaurantEarning;
      apiOrderTotal += orderAmount;
    }

    // Now get the wallet details
    const wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });

    console.log('\n--- VERIFICATION RESULTS ---');
    console.log(`Delivered and Paid Orders Count: ${deliveredCount}`);
    console.log(`Expected Restaurant History Total (Restaurant card): ₹${apiRestaurantTotal.toFixed(2)}`);
    console.log(`Actual Restaurant Finance Total (totalEarned in DB):  ₹${wallet.totalEarned.toFixed(2)}`);
    
    if (Math.abs(apiRestaurantTotal - wallet.totalEarned) < 0.01) {
      console.log('\nSUCCESS: Both totals match exactly! Discrepancy is resolved.');
    } else {
      console.log('\nERROR: Totals do not match. Discrepancy still exists.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
