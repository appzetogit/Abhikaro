import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Hotel from '../modules/hotel/models/Hotel.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';

dotenv.config();

const COMMISSION_CHANGE_DATE = new Date('2026-06-20T05:19:27.575Z');

async function runCorrection() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.\n');

    const restaurantId = '69ae9d787592fd06e444100c'; // Kirpa Restaurant _id
    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) {
      console.error('Restaurant not found!');
      await mongoose.disconnect();
      return;
    }

    console.log(`Processing correction for Restaurant: ${restaurant.name}`);

    // Fetch all orders
    const orders = await Order.find({
      $or: [
        { restaurantId: restaurantId },
        { restaurantId: restaurant.restaurantId }
      ]
    }).sort({ createdAt: 1 });

    // Pre-fetch all hotels
    const hotelsList = await Hotel.find({}).lean();
    const hotelMap = new Map();
    hotelsList.forEach(h => {
      hotelMap.set(h._id.toString(), h);
      if (h.hotelId) hotelMap.set(h.hotelId, h);
    });

    let correctedCount = 0;

    for (const order of orders) {
      const isQR = order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId;
      const orderDate = new Date(order.createdAt);
      const expectedCommissionRate = orderDate < COMMISSION_CHANGE_DATE ? 15 : 20;

      const subtotal = order.pricing?.subtotal || 0;
      const discount = order.pricing?.discount || 0;
      const foodPrice = Math.max(0, subtotal - discount);

      // Determine Hotel details if QR
      let hotelPct = 0;
      if (isQR) {
        const hotelRef = order.hotelId || order.hotelReference;
        const hotelDoc = hotelMap.get(hotelRef?.toString());
        if (hotelDoc) {
          hotelPct = Number(hotelDoc.commission) || 10;
        } else {
          hotelPct = 10;
        }
      }

      // Calculate Expected Splits (Should-Be)
      let expectedRestaurantCommission = 0;
      let expectedRestaurantEarning = 0;
      let expectedHotelEarning = 0;
      let expectedAdminCommission = 0;

      if (isQR) {
        expectedRestaurantCommission = Math.round(foodPrice * (expectedCommissionRate / 100) * 100) / 100;
        expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
        expectedHotelEarning = Math.round(foodPrice * (hotelPct / 100) * 100) / 100;
        expectedAdminCommission = Math.round(Math.max(0, expectedRestaurantCommission - expectedHotelEarning) * 100) / 100;
      } else {
        expectedRestaurantCommission = Math.round(foodPrice * (expectedCommissionRate / 100) * 100) / 100;
        expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
        expectedHotelEarning = 0;
        expectedAdminCommission = expectedRestaurantCommission;
      }

      // Check stored values
      const settlement = await OrderSettlement.findOne({ orderId: order._id });
      let storedRestaurantEarning = 0;
      if (settlement) {
        storedRestaurantEarning = settlement.restaurantEarning?.netEarning || 0;
      } else {
        storedRestaurantEarning = order.restaurantShare || order.commissionBreakdown?.restaurant || 0;
      }

      const diff = Math.round((storedRestaurantEarning - expectedRestaurantEarning) * 100) / 100;
      const isMatch = Math.abs(diff) < 0.05;

      if (!isMatch) {
        console.log(`\nCorrecting Order: ${order.orderId} (Date: ${orderDate.toISOString().split('T')[0]})`);
        console.log(`  Food Price: ₹${foodPrice.toFixed(2)} | Expected Commission Rate: ${expectedCommissionRate}%`);
        console.log(`  Restaurant Earning: Stored = ₹${storedRestaurantEarning.toFixed(2)} -> Expected = ₹${expectedRestaurantEarning.toFixed(2)} (diff = ₹${diff.toFixed(2)})`);

        // 1. Update Order Document
        order.commissionBreakdown = {
          hotel: expectedHotelEarning,
          admin: expectedAdminCommission,
          restaurant: expectedRestaurantEarning,
          user: 0
        };
        order.commissionPercentages = {
          hotel: hotelPct,
          admin: isQR ? Math.max(0, expectedCommissionRate - hotelPct) : expectedCommissionRate,
          restaurant: 100 - expectedCommissionRate,
          user: 0
        };
        order.hotelCommission = expectedHotelEarning;
        order.adminCommission = expectedAdminCommission;
        order.restaurantShare = expectedRestaurantEarning;
        order.markModified('commissionBreakdown');
        order.markModified('commissionPercentages');
        await order.save();
        console.log(`  ✅ Order Document updated.`);

        // 2. Update OrderSettlement Document
        if (settlement) {
          settlement.restaurantEarning = {
            foodPrice: foodPrice,
            commission: expectedRestaurantCommission,
            commissionPercentage: 100 - expectedCommissionRate, // Restaurant Share percentage
            netEarning: expectedRestaurantEarning,
            status: settlement.restaurantEarning?.status || 'pending',
            creditedAt: settlement.restaurantEarning?.creditedAt
          };
          settlement.adminEarning = {
            commission: expectedAdminCommission,
            platformFee: settlement.adminEarning?.platformFee || 0,
            deliveryFee: settlement.adminEarning?.deliveryFee || 0,
            gst: settlement.adminEarning?.gst || 0,
            deliveryMargin: settlement.adminEarning?.deliveryMargin || 0,
            hotelCommission: isQR ? expectedAdminCommission : 0,
            orderType: order.orderType || (isQR ? 'QR' : 'DIRECT'),
            totalEarning: expectedAdminCommission + (settlement.adminEarning?.platformFee || 0) + (settlement.adminEarning?.gst || 0),
            status: settlement.adminEarning?.status || 'pending',
            adminCommissionStatus: settlement.adminEarning?.adminCommissionStatus || 'none',
            creditedAt: settlement.adminEarning?.creditedAt
          };
          if (isQR) {
            settlement.hotelEarning = {
              hotelId: settlement.hotelEarning?.hotelId,
              hotelName: settlement.hotelEarning?.hotelName,
              commission: expectedHotelEarning,
              commissionPercentage: hotelPct,
              status: settlement.hotelEarning?.status || 'pending',
              creditedAt: settlement.hotelEarning?.creditedAt
            };
          }
          settlement.markModified('restaurantEarning');
          settlement.markModified('adminEarning');
          if (isQR) settlement.markModified('hotelEarning');
          await settlement.save();
          console.log(`  ✅ OrderSettlement Document updated.`);
        }

        // 3. Update or Create AdminCommission Document
        let adminCommDoc = await AdminCommission.findOne({ orderId: order._id });
        if (!adminCommDoc) {
          adminCommDoc = new AdminCommission({
            orderId: order._id,
            orderAmount: foodPrice,
            commissionAmount: expectedAdminCommission,
            commissionPercentage: isQR ? Math.max(0, expectedCommissionRate - hotelPct) : expectedCommissionRate,
            restaurantId: restaurantId,
            restaurantName: restaurant.name,
            restaurantEarning: expectedRestaurantEarning,
            status: order.status === 'cancelled' ? 'cancelled' : 'completed',
            orderDate: orderDate
          });
        } else {
          adminCommDoc.orderAmount = foodPrice;
          adminCommDoc.commissionAmount = expectedAdminCommission;
          adminCommDoc.commissionPercentage = isQR ? Math.max(0, expectedCommissionRate - hotelPct) : expectedCommissionRate;
          adminCommDoc.restaurantEarning = expectedRestaurantEarning;
          adminCommDoc.status = order.status === 'cancelled' ? 'cancelled' : 'completed';
        }
        await adminCommDoc.save();
        console.log(`  ✅ AdminCommission Document updated.`);

        correctedCount++;
      }
    }

    console.log(`\nProcessed ${correctedCount} mismatched orders.`);

    // 4. Recalculate Restaurant Wallet
    console.log('\nTriggering Wallet recalculation/auto-sync...');
    const originalWallet = await RestaurantWallet.findOne({ restaurantId });
    const originalBalance = originalWallet ? originalWallet.totalBalance : 0;
    
    // This triggers findOrCreateByRestaurantId which backfills/re-evaluates all transactions
    const updatedWallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurantId);
    
    console.log(`\nWallet Synced!`);
    console.log(`  Old Balance: ₹${originalBalance.toFixed(2)}`);
    console.log(`  New Balance: ₹${updatedWallet.totalBalance.toFixed(2)}`);
    console.log(`  Net Difference: ₹${(updatedWallet.totalBalance - originalBalance).toFixed(2)}`);

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  } catch (err) {
    console.error('Correction Error:', err);
    try { await mongoose.disconnect(); } catch (_) {}
  }
}

runCorrection();
