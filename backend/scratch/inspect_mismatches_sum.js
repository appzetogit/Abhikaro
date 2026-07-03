import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const restaurant = await Restaurant.findOne({ name: /kirpa/i });
    if (!restaurant) {
      console.log('Restaurant not found');
      await mongoose.disconnect();
      return;
    }
    
    const wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });
    
    const restaurantIdVariations = [
      restaurant._id.toString(),
      restaurant.restaurantId?.toString(),
    ].filter(Boolean);
    
    const orders = await Order.find({
      restaurantId: { $in: restaurantIdVariations }
    }).lean();
    
    const orderIds = orders.map(o => o._id);
    const settlements = await OrderSettlement.find({ orderId: { $in: orderIds } }).lean();
    const settlementMap = new Map();
    settlements.forEach(s => {
      settlementMap.set(s.orderId.toString(), s);
    });
    
    const adminComms = await AdminCommission.find({ orderId: { $in: orderIds }, status: 'completed' }).lean();
    const adminCommMap = new Map();
    adminComms.forEach(ac => {
      adminCommMap.set(ac.orderId.toString(), ac);
    });

    // We filter orders using the frontend's condition: status == 'delivered' and paymentStatus == 'Paid'
    // Let's verify what the frontend sees for each order.
    let frontendRestaurantTotal = 0;
    let walletTransactionsTotal = 0;
    let matchedCount = 0;
    let unmatchedCount = 0;
    
    for (const order of orders) {
      // paymentStatus display
      let effectivePaymentStatus = order.payment?.status;
      if (order.status === 'delivered') {
        effectivePaymentStatus = 'completed';
      }
      const paymentStatusDisplay = effectivePaymentStatus === 'completed' ? 'Paid' : 'Pending';
      const isDelivered = order.status === 'delivered';
      const isPaid = paymentStatusDisplay === 'Paid';
      
      const settlement = settlementMap.get(order._id.toString());
      const commInfo = adminCommMap.get(order._id.toString()) || {};
      
      let restaurantEarning = settlement?.restaurantEarning?.netEarning ?? commInfo.restaurantEarning ?? 0;
      
      const subtotal = order.pricing?.subtotal || 0;
      const discount = order.pricing?.discount || 0;
      const orderAmount = order.pricing?.total || 0;
      const isHotelQrOrder = (order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId);
      
      if (isHotelQrOrder) {
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
        const pct = Number(order.commissionPercentages?.restaurant || 0);
        if (!isHotelQrOrder && pct > 0) {
          const derivedSubtotal = Math.max(0, orderAmount - (order.pricing?.platformFee || 0) - (order.pricing?.deliveryFee || 0) - (order.pricing?.tax || 0));
          restaurantEarning = Math.round((derivedSubtotal * pct) / 100 * 100) / 100;
        }
      }
      
      if (!restaurantEarning) {
        restaurantEarning = Math.max(0, subtotal - discount);
      }

      if (isDelivered && isPaid) {
        frontendRestaurantTotal += restaurantEarning;
        
        // Find corresponding transaction in wallet
        const tx = wallet.transactions.find(t => t.type === 'payment' && t.orderId?.toString() === order._id.toString());
        if (tx && tx.status === 'Completed') {
          walletTransactionsTotal += tx.amount;
          matchedCount++;
        } else {
          unmatchedCount++;
        }
      }
    }
    
    console.log(`Matched orders with wallet transaction: ${matchedCount}`);
    console.log(`Unmatched orders: ${unmatchedCount}`);
    console.log(`Frontend Restaurant Total: ₹${frontendRestaurantTotal.toFixed(2)}`);
    console.log(`Sum of those orders' tx.amount in wallet: ₹${walletTransactionsTotal.toFixed(2)}`);
    console.log(`Difference: ₹${(frontendRestaurantTotal - walletTransactionsTotal).toFixed(2)}`);
    
    // Let's print the sum of ALL completed payment transactions in the wallet
    const completedPayments = wallet.transactions.filter(t => t.type === 'payment' && t.status === 'Completed');
    const totalPaymentsInWallet = completedPayments.reduce((sum, t) => sum + t.amount, 0);
    console.log(`\nTotal completed payments in wallet: ₹${totalPaymentsInWallet.toFixed(2)}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
