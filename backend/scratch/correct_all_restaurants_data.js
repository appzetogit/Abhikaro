import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Hotel from '../modules/hotel/models/Hotel.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';
import RestaurantCommission from '../modules/admin/models/RestaurantCommission.js';
import CommissionSettings from '../modules/admin/models/CommissionSettings.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';

dotenv.config();

const TARGET_RESTAURANTS = [
  '69bbb39c4730b941918104ed', // Diamond Resort & Restaurant
  '69d0ef574222eff98f02cb92', // Maa karni Restaurant
  '69d654e7c86eb9b6c8399c62', // Test Restaurant
  '69c11b2e986136d667a656f0'  // Kanha restaurant
];

async function runGlobalCorrection() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.\n');

    // Pre-fetch all hotels
    const hotelsList = await Hotel.find({}).lean();
    const hotelMap = new Map();
    hotelsList.forEach(h => {
      hotelMap.set(h._id.toString(), h);
      if (h.hotelId) hotelMap.set(h.hotelId, h);
    });

    // Fetch global QR commission settings
    let qrGlobalCommission = { hotel: 10, admin: 20 };
    try {
      const latest = await CommissionSettings.findOne().sort({ createdAt: -1 }).lean();
      if (latest?.qrCommission) {
        qrGlobalCommission = {
          hotel: Number(latest.qrCommission.hotel || 10),
          admin: Number(latest.qrCommission.admin || 20)
        };
      }
    } catch (_) {}

    for (const restId of TARGET_RESTAURANTS) {
      const restaurant = await Restaurant.findById(restId);
      if (!restaurant) {
        console.warn(`Restaurant not found for ID: ${restId}`);
        continue;
      }

      console.log(`\n=========================================`);
      console.log(`Processing correction for: ${restaurant.name}`);
      console.log(`=========================================`);

      const restaurantIdStr = restaurant._id.toString();
      const restaurantPublicId = restaurant.restaurantId?.toString();
      const restaurantSlug = restaurant.slug?.toString();

      const variations = [
        restaurantIdStr,
        restaurantPublicId,
        restaurantSlug
      ].filter(Boolean);

      // Fetch all delivered orders
      const orders = await Order.find({
        restaurantId: { $in: variations },
        status: 'delivered'
      }).sort({ createdAt: 1 });

      console.log(`Found ${orders.length} delivered orders.`);

      // Fetch restaurant commission setup
      const restCommDoc = await RestaurantCommission.findOne({ restaurant: restaurant._id, status: true }).lean();

      let correctedCount = 0;

      for (const order of orders) {
        const isQR = order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId;
        const orderDate = new Date(order.createdAt);

        const subtotal = order.pricing?.subtotal || 0;
        const discount = order.pricing?.discount || 0;
        const foodPrice = Math.max(0, subtotal - discount);

        // Determine Hotel details if QR
        let hotelPct = 0;
        let adminPct = 0;
        if (isQR) {
          const hotelRef = order.hotelId || order.hotelReference;
          const hotelDoc = hotelMap.get(hotelRef?.toString());
          if (hotelDoc) {
            hotelPct = Number(hotelDoc.commission) || 10;
            adminPct = Number(hotelDoc.adminCommission) || 20;
          } else {
            hotelPct = qrGlobalCommission.hotel;
            adminPct = qrGlobalCommission.admin;
          }
        }

        // Expected Commission calculations
        let expectedCommissionRate = 0;
        let expectedRestaurantCommission = 0;
        let expectedRestaurantEarning = 0;
        let expectedHotelEarning = 0;
        let expectedAdminCommission = 0;

        if (restCommDoc) {
          // Determine expected commission percentage based on rules or defaults
          const sortedRules = [...(restCommDoc.commissionRules || [])]
            .filter(r => r.isActive)
            .sort((a, b) => b.priority - a.priority || a.minOrderAmount - b.minOrderAmount);

          let matchingRule = null;
          for (const rule of sortedRules) {
            if (foodPrice >= rule.minOrderAmount) {
              if (rule.maxOrderAmount === null || foodPrice <= rule.maxOrderAmount) {
                matchingRule = rule;
                break;
              }
            }
          }

          let rate = 30; // fallback default
          if (matchingRule) {
            rate = matchingRule.value;
          } else if (restCommDoc.defaultCommission) {
            rate = restCommDoc.defaultCommission.value;
          }

          expectedCommissionRate = rate;

          if (isQR) {
            expectedRestaurantCommission = Math.round(foodPrice * (rate / 100) * 100) / 100;
            expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
            expectedHotelEarning = Math.round(foodPrice * (hotelPct / 100) * 100) / 100;
            expectedAdminCommission = Math.round(Math.max(0, expectedRestaurantCommission - expectedHotelEarning) * 100) / 100;
          } else {
            expectedRestaurantCommission = Math.round(foodPrice * (rate / 100) * 100) / 100;
            expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
            expectedHotelEarning = 0;
            expectedAdminCommission = expectedRestaurantCommission;
          }
        } else {
          // No custom commission config setup
          if (isQR) {
            expectedHotelEarning = Math.round(foodPrice * (hotelPct / 100) * 100) / 100;
            expectedAdminCommission = Math.round(foodPrice * (adminPct / 100) * 100) / 100;
            expectedRestaurantCommission = expectedHotelEarning + expectedAdminCommission;
            expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
            expectedCommissionRate = hotelPct + adminPct;
          } else {
            // Default 30%
            expectedCommissionRate = 30;
            expectedRestaurantCommission = Math.round(foodPrice * 0.3 * 100) / 100;
            expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
            expectedAdminCommission = expectedRestaurantCommission;
          }
        }

        // Compare with Stored
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
          console.log(`  Updating Order: ${order.orderId} (Date: ${orderDate.toISOString().split('T')[0]})`);
          console.log(`    Food Price: ₹${foodPrice.toFixed(2)} | Expected Commission Rate: ${expectedCommissionRate}%`);
          console.log(`    Restaurant Earning: Stored = ₹${storedRestaurantEarning.toFixed(2)} -> Expected = ₹${expectedRestaurantEarning.toFixed(2)} (diff = ₹${diff.toFixed(2)})`);

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
          await order.save({ validateBeforeSave: false });

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
            await settlement.save({ validateBeforeSave: false });
          }

          // 3. Update or Create AdminCommission Document
          let adminCommDoc = await AdminCommission.findOne({ orderId: order._id });
          if (!adminCommDoc) {
            adminCommDoc = new AdminCommission({
              orderId: order._id,
              orderAmount: foodPrice,
              commissionAmount: expectedAdminCommission,
              commissionPercentage: isQR ? Math.max(0, expectedCommissionRate - hotelPct) : expectedCommissionRate,
              restaurantId: restaurantIdStr,
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

          correctedCount++;
        }
      }

      console.log(`Corrected ${correctedCount} mismatched orders.`);

      if (correctedCount > 0) {
        // 4. Recalculate Wallet
        console.log('Triggering Wallet auto-sync/recalculation...');
        const originalWallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });
        const originalBalance = originalWallet ? originalWallet.totalBalance : 0;

        const updatedWallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurant._id);

        console.log(`Wallet Synced!`);
        console.log(`  Old Balance: ₹${originalBalance.toFixed(2)}`);
        console.log(`  New Balance: ₹${updatedWallet.totalBalance.toFixed(2)}`);
        console.log(`  Net Difference: ₹${(updatedWallet.totalBalance - originalBalance).toFixed(2)}`);
      }
    }

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  } catch (err) {
    console.error('Global Correction Error:', err);
    try { await mongoose.disconnect(); } catch (_) {}
  }
}

runGlobalCorrection();
