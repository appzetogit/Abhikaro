import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import WithdrawalRequest from '../modules/restaurant/models/WithdrawalRequest.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import TableBooking from '../modules/dining/models/TableBooking.js';
import RestaurantCommission from '../modules/admin/models/RestaurantCommission.js';

dotenv.config();

async function inspectFinance() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.\n');

    const restaurantId = '69ae9d787592fd06e444100c';
    const restaurant = await Restaurant.findById(restaurantId).lean();

    const restaurantObjectId = restaurant._id.toString();
    const restaurantPublicId = restaurant.restaurantId.toString();
    const restaurantSlug = restaurant.slug.toString();

    const restaurantIdVariations = [
      restaurantPublicId,
      restaurantObjectId,
      restaurant.id?.toString?.(),
      restaurantSlug
    ].filter(Boolean);

    const now = new Date();
    const currentDay = now.getDay();
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    const currentCycleStart = new Date(now);
    currentCycleStart.setDate(now.getDate() - daysFromMonday);
    currentCycleStart.setHours(0, 0, 0, 0);
    
    const currentCycleEnd = new Date(currentCycleStart);
    currentCycleEnd.setDate(currentCycleStart.getDate() + 6);
    currentCycleEnd.setHours(23, 59, 59, 999);

    const restaurantIdQuery = { restaurantId: { $in: Array.from(new Set(restaurantIdVariations)) } };

    let currentCycleOrders = await Order.find({
      ...restaurantIdQuery,
      status: 'delivered',
      $or: [
        { deliveredAt: { $gte: currentCycleStart, $lte: currentCycleEnd } },
        { 'tracking.delivered.timestamp': { $gte: currentCycleStart, $lte: currentCycleEnd } }
      ]
    }).lean();

    if (currentCycleOrders.length === 0) {
      currentCycleOrders = await Order.find({
        ...restaurantIdQuery,
        status: 'delivered',
        createdAt: { $gte: currentCycleStart, $lte: currentCycleEnd }
      }).lean();
    }

    console.log('Current Cycle Date Range:', currentCycleStart.toISOString(), 'to', currentCycleEnd.toISOString());
    console.log('Current Cycle Orders count:', currentCycleOrders.length);

    let currentCycleTotal = 0;
    let currentCycleCommission = 0;

    let restaurantCommission = await RestaurantCommission.findOne({
      restaurant: restaurantObjectId,
      status: true
    }).lean();

    const calculateCommissionForOrder = (orderAmount) => {
      if (!restaurantCommission || !restaurantCommission.status) {
        return { commission: (orderAmount * 30) / 100 };
      }
      const sortedRules = [...(restaurantCommission.commissionRules || [])]
        .filter(rule => rule.isActive)
        .sort((a, b) => b.priority - a.priority || a.minOrderAmount - b.minOrderAmount);

      let matchingRule = null;
      for (const rule of sortedRules) {
        if (orderAmount >= rule.minOrderAmount) {
          if (rule.maxOrderAmount === null || orderAmount <= rule.maxOrderAmount) {
            matchingRule = rule;
            break;
          }
        }
      }
      let commission = 0;
      if (matchingRule) {
        commission = matchingRule.type === 'percentage' ? (orderAmount * matchingRule.value) / 100 : matchingRule.value;
      } else if (restaurantCommission.defaultCommission) {
        const val = restaurantCommission.defaultCommission.value || 30;
        commission = restaurantCommission.defaultCommission.type === 'percentage' ? (orderAmount * val) / 100 : val;
      } else {
        commission = (orderAmount * 30) / 100;
      }
      return { commission: Math.round(commission * 100) / 100 };
    };

    currentCycleOrders.forEach(order => {
      const foodPrice = (order.pricing?.subtotal || 0) - (order.pricing?.discount || 0);
      const commissionData = calculateCommissionForOrder(foodPrice);
      currentCycleTotal += foodPrice;
      currentCycleCommission += commissionData.commission;
    });

    const currentCyclePayout = Math.round((currentCycleTotal - currentCycleCommission) * 100) / 100;

    const allWithdrawals = await WithdrawalRequest.find({
      restaurantId: restaurant._id,
      status: { $in: ['Pending', 'Approved'] }
    }).lean();

    const totalWithdrawals = allWithdrawals.reduce((sum, req) => sum + (req.amount || 0), 0);
    const availablePayout = Math.max(0, Math.round((currentCyclePayout - totalWithdrawals) * 100) / 100);

    let wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });
    let withdrawableBalance = wallet ? wallet.totalBalance : 0;

    console.log('\nFinance Calculation Results:');
    console.log('  currentCyclePayout:', currentCyclePayout);
    console.log('  totalWithdrawals:', totalWithdrawals);
    console.log('  availablePayout (estimatedPayout field):', availablePayout);
    console.log('  wallet.totalBalance (withdrawableBalance field):', withdrawableBalance);
    console.log('  wallet.totalEarned:', wallet?.totalEarned);
    console.log('  wallet.totalWithdrawn:', wallet?.totalWithdrawn);

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    await mongoose.disconnect();
  }
}

inspectFinance();
