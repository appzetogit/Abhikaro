import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import RestaurantCommission from '../modules/admin/models/RestaurantCommission.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database.');
    
    const restaurant = await Restaurant.findOne({ name: /kirpa/i });
    if (!restaurant) {
      console.log('Restaurant "Kirpa restaurant&cafe" not found.');
      await mongoose.disconnect();
      return;
    }
    
    const restaurantId = restaurant._id;
    const publicRestId = restaurant.restaurantId;
    
    // Find restaurant commission settings
    const commissions = await RestaurantCommission.find({ restaurant: restaurantId });
    console.log('\nCommissions for Kirpa:', commissions);
    
    // Mimic the backend API getOrders logic to fetch the exact same list of orders
    const query = {
      restaurantId: { $in: [restaurantId.toString(), publicRestId?.toString()].filter(Boolean) }
    };
    
    const orders = await Order.find(query).lean();
    console.log(`\nTotal orders fetched for Kirpa: ${orders.length}`);
    
    // Fetch settlements
    const orderIds = orders.map(o => o._id);
    const settlements = await OrderSettlement.find({ orderId: { $in: orderIds } }).lean();
    const settlementMap = new Map();
    settlements.forEach(s => {
      settlementMap.set(s.orderId.toString(), s);
    });
    
    // Fetch admin commissions
    const adminComms = await AdminCommission.find({ orderId: { $in: orderIds }, status: 'completed' }).lean();
    const adminCommMap = new Map();
    adminComms.forEach(ac => {
      adminCommMap.set(ac.orderId.toString(), ac);
    });

    let transformedOrders = [];
    for (let index = 0; index < orders.length; index++) {
      const order = orders[index];
      
      // Determine paymentStatus
      let effectivePaymentStatus = order.payment?.status;
      if (order.status === 'delivered') {
        effectivePaymentStatus = 'completed';
      }
      const paymentStatusDisplay = effectivePaymentStatus === 'completed' ? 'Paid' : 'Pending'; // simplistic mapping for paid/pending

      // Determine orderStatus
      const isEffectivelyCancelled = order.status === 'cancelled' || !!order.cancelledAt;
      let orderStatusDisplay = order.status;
      if (isEffectivelyCancelled) {
        orderStatusDisplay = 'cancelled';
      } else {
        orderStatusDisplay = order.status; // e.g. delivered
      }

      // Calculate earnings
      const settlement = settlementMap.get(order._id.toString());
      const commInfo = adminCommMap.get(order._id.toString()) || {};
      
      let restaurantEarning = settlement?.restaurantEarning?.netEarning ?? commInfo.restaurantEarning ?? 0;
      
      const subtotal = order.pricing?.subtotal || 0;
      const discount = order.pricing?.discount || 0;
      const orderAmount = order.pricing?.total || 0;
      
      const isHotelQrOrder = (order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId);
      
      if (isHotelQrOrder) {
        // use breakdown
        const commissionableFood = Math.max(0, subtotal - discount);
        const hotelCommissionAmount = settlement?.hotelEarning?.commission ?? (Number(order.commissionBreakdown?.hotel || 0) || Number(order.hotelCommission || 0) || 0);
        let qrAdminCommission = Number(order.commissionBreakdown?.admin || 0) || Number(order.adminCommission || 0) || 0;
        const qrRestaurantNet = Math.max(0, commissionableFood - hotelCommissionAmount - qrAdminCommission);
        if (qrRestaurantNet > 0) {
          restaurantEarning = Math.round(qrRestaurantNet * 100) / 100;
        } else if (!restaurantEarning) {
          restaurantEarning = Number(order.restaurantShare || order.commissionBreakdown?.restaurant || 0);
        }
      }
      
      if (!restaurantEarning) {
        // fallback
        const pct = Number(order.commissionPercentages?.restaurant || 0);
        if (!isHotelQrOrder && pct > 0) {
          const derivedSubtotal = Math.max(0, orderAmount - (order.pricing?.platformFee || 0) - (order.pricing?.deliveryFee || 0) - (order.pricing?.tax || 0));
          restaurantEarning = Math.round((derivedSubtotal * pct) / 100 * 100) / 100;
        }
      }
      
      if (!restaurantEarning) {
        // last resort
        restaurantEarning = Math.max(0, subtotal - discount);
      }

      transformedOrders.push({
        orderId: order.orderId,
        _id: order._id.toString(),
        orderStatus: orderStatusDisplay,
        paymentStatus: paymentStatusDisplay,
        totalAmount: orderAmount,
        earnings: {
          restaurantEarning
        }
      });
    }

    // Now compute frontend stats
    let totalOrders = transformedOrders.length;
    let orderTotal = 0;
    let restaurantTotal = 0;
    
    let countedOrders = 0;
    for (const o of transformedOrders) {
      const isDelivered = String(o.orderStatus || "").toLowerCase() === 'delivered';
      const isPaid = String(o.paymentStatus || "").toLowerCase() === 'paid';
      if (!isDelivered || !isPaid) continue;
      
      countedOrders++;
      orderTotal += Number(o.totalAmount || 0);
      restaurantTotal += Number(o.earnings?.restaurantEarning || 0);
    }
    
    console.log('\nFrontend calculations on fetched orders list:');
    console.log(`Total Orders in list: ${totalOrders}`);
    console.log(`Delivered & Paid Orders count: ${countedOrders}`);
    console.log(`Calculated Total Revenue: ₹${orderTotal.toFixed(2)}`);
    console.log(`Calculated Restaurant Total: ₹${restaurantTotal.toFixed(2)}`);

    // Let's print wallet totalEarned
    const wallet = await RestaurantWallet.findOne({ restaurantId: restaurantId });
    console.log(`\nWallet totalEarned: ₹${wallet.totalEarned.toFixed(2)}`);
    console.log(`Wallet totalBalance: ₹${wallet.totalBalance.toFixed(2)}`);
    console.log(`Wallet totalWithdrawn: ₹${wallet.totalWithdrawn.toFixed(2)}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
