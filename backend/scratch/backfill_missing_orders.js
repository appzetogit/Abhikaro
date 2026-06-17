/**
 * Backfill script: Recreate missing Order documents from OrderSettlement records.
 * Run: node scratch/backfill_missing_orders.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import User from '../modules/auth/models/User.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // Load all restaurants to map mongoId -> name
  const restaurants = await Restaurant.find({}).lean();
  const restaurantMap = new Map();
  restaurants.forEach(r => {
    restaurantMap.set(r._id.toString(), r);
  });

  // Get all settlements
  const settlements = await OrderSettlement.find({}).lean();
  console.log(`📋 Total OrderSettlements in DB: ${settlements.length}`);

  let missingCount = 0;
  let recreatedCount = 0;

  for (const s of settlements) {
    if (!s.orderId) continue;

    // Check if order exists in Order collection
    const orderExists = await Order.exists({ _id: s.orderId });

    if (!orderExists) {
      missingCount++;
      console.log(`⚠️ Missing order detected: ${s.orderNumber} (ID: ${s.orderId})`);

      // Find user if possible
      let user = null;
      if (s.userId) {
        user = await User.findById(s.userId).lean();
      }

      // Find restaurant details
      const rest = s.restaurantId ? restaurantMap.get(s.restaurantId.toString()) : null;
      const restName = rest?.onboarding?.step1?.restaurantName || rest?.name || s.restaurantName || 'Indore';

      // Mock item to satisfy schema validation
      const items = [{
        itemId: 'RESTORED-ITEM-1',
        name: 'Restored Item',
        price: s.userPayment?.subtotal || s.userPayment?.total || 0,
        quantity: 1,
        isVeg: true
      }];

      // Build pricing object
      const pricing = {
        subtotal: s.userPayment?.subtotal || s.userPayment?.total || 0,
        deliveryFee: s.userPayment?.deliveryFee || 0,
        platformFee: s.userPayment?.platformFee || 0,
        tax: s.userPayment?.gst || 0,
        discount: s.userPayment?.discount || 0,
        total: s.userPayment?.total || 0
      };

      // Determine order status
      let orderStatus = 'delivered';
      if (s.cancellationDetails?.cancelled) {
        orderStatus = 'cancelled';
      }

      // Build order document structure
      const newOrder = {
        _id: s.orderId,
        orderId: s.orderNumber || `ORD-${s.orderId}`,
        userId: s.userId || new mongoose.Types.ObjectId(),
        userName: user?.name || 'Customer',
        userPhone: user?.phone || 'N/A',
        restaurantId: s.restaurantId?.toString() || 'REST-UNKNOWN',
        restaurantName: restName,
        items: items,
        address: {
          label: 'Live',
          street: 'Restored Location',
          city: 'Indore',
          state: 'Madhya Pradesh',
          formattedAddress: 'Address details restored from settlement info'
        },
        pricing: pricing,
        payment: {
          method: s.adminEarning?.orderType === 'QR' ? 'pay_at_hotel' : 'online',
          status: s.settlementStatus === 'completed' || s.restaurantEarning?.status === 'credited' ? 'completed' : 'pending'
        },
        status: orderStatus,
        deliveredAt: orderStatus === 'delivered' ? (s.createdAt || new Date()) : undefined,
        cancelledAt: orderStatus === 'cancelled' ? (s.createdAt || new Date()) : undefined,
        cancellationReason: orderStatus === 'cancelled' ? 'Restored cancelled order' : undefined,
        cancelledBy: orderStatus === 'cancelled' ? 'restaurant' : undefined,
        createdAt: s.createdAt || new Date(),
        updatedAt: s.updatedAt || new Date()
      };

      try {
        // Bypass hooks/validation checks that could trigger on pre-save for already delivered/settled orders
        await Order.collection.insertOne(newOrder);
        recreatedCount++;
        console.log(`  ✅ Recreated and inserted order ${s.orderNumber}`);
      } catch (err) {
        console.error(`  ❌ Failed to insert order ${s.orderNumber}:`, err.message);
      }
    }
  }

  console.log('\n--- Backfill Summary ---');
  console.log(`Total Settlements analyzed  : ${settlements.length}`);
  console.log(`Total missing orders found  : ${missingCount}`);
  console.log(`Total orders successfully backfilled: ${recreatedCount}`);
  console.log('------------------------');

  await mongoose.disconnect();
}

main().catch(console.error);
