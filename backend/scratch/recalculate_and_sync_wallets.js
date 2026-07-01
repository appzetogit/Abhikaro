import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import Hotel from '../modules/hotel/models/Hotel.js';
import HotelWallet from '../modules/hotel/models/HotelWallet.js';

dotenv.config();

const syncWallets = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to Database.');

    const restaurants = await Restaurant.find().lean();
    console.log(`Syncing ${restaurants.length} Restaurant wallets...`);

    // 1. Sync all Restaurant Wallets using their model's native auto-backfill/sync method
    for (const rest of restaurants) {
      try {
        console.log(`Syncing wallet for restaurant: ${rest.name} (${rest._id})`);
        const wallet = await RestaurantWallet.findOrCreateByRestaurantId(rest._id);
        console.log(`-> Updated Balance: ₹${wallet.totalBalance.toFixed(2)} (Earned: ₹${wallet.totalEarned.toFixed(2)}, Withdrawn: ₹${wallet.totalWithdrawn.toFixed(2)})`);
      } catch (err) {
        console.error(`Error syncing restaurant wallet for ${rest.name}:`, err.message);
      }
    }

    const hotels = await Hotel.find().lean();
    console.log(`\nSyncing ${hotels.length} Hotel wallets...`);

    // 2. Sync all Hotel Wallets with custom self-healing backfill
    for (const hotel of hotels) {
      try {
        const hotelId = hotel._id;
        const hotelIdStr = hotelId.toString();

        // Find or create hotel wallet
        const wallet = await HotelWallet.findOrCreateByHotelId(hotelId);
        let needsSave = false;

        // Fetch settlements associated with this hotel
        const settlements = await OrderSettlement.find({
          $or: [
            { 'hotelEarning.hotelId': hotelId },
            { 'hotelEarning.hotelId': hotelIdStr }
          ]
        }).lean();

        // Fetch orders associated with this hotel
        const orders = await Order.find({
          hotelId: hotelId,
          status: 'delivered'
        }).lean();

        // Build set of already credited order IDs
        const walletOrderIdSet = new Set(
          (wallet.transactions || [])
            .filter(t => t.type === 'commission' && t.orderId)
            .map(t => t.orderId.toString())
        );

        // Track and process order commissions
        for (const order of orders) {
          const orderIdStr = order._id.toString();
          if (walletOrderIdSet.has(orderIdStr)) continue;

          const commission = Number(order.hotelCommission || order.commissionBreakdown?.hotel || 0);
          if (commission <= 0) continue;

          wallet.transactions.push({
            amount: Math.round(commission * 100) / 100,
            type: 'commission',
            status: 'Completed',
            description: `Commission for Order #${order.orderId || orderIdStr}`,
            orderId: order._id,
            createdAt: order.deliveredAt || order.createdAt || new Date()
          });

          walletOrderIdSet.add(orderIdStr);
          needsSave = true;
          console.log(`[HotelWallet] Backfilled via Order: ${order.orderId} -> ₹${commission}`);
        }

        // Process settlements commissions
        for (const s of settlements) {
          const orderIdStr = s.orderId?.toString();
          if (!orderIdStr || walletOrderIdSet.has(orderIdStr)) continue;

          const commission = Number(s.hotelEarning?.commission || 0);
          if (commission <= 0) continue;

          // Fetch order details
          let orderDate = s.createdAt || new Date();
          let orderNumber = s.orderNumber || orderIdStr;
          try {
            const orderDoc = await Order.findById(s.orderId).select('deliveredAt createdAt status orderId').lean();
            const finalStatuses = new Set(['delivered']);
            if (orderDoc && !finalStatuses.has(orderDoc.status)) continue;
            orderDate = orderDoc?.deliveredAt || orderDoc?.createdAt || orderDate;
            orderNumber = orderDoc?.orderId || orderNumber;
          } catch (_) {}

          wallet.transactions.push({
            amount: Math.round(commission * 100) / 100,
            type: 'commission',
            status: 'Completed',
            description: `Commission for Order #${orderNumber}`,
            orderId: s.orderId,
            createdAt: orderDate
          });

          walletOrderIdSet.add(orderIdStr);
          needsSave = true;
          console.log(`[HotelWallet] Backfilled via Settlement: ${orderNumber} -> ₹${commission}`);
        }

        // Deduplicate hotel transactions
        const seenHotelOrderIds = new Set();
        const uniqueHotelTxs = [];
        let hasHotelDuplicates = false;
        for (const t of wallet.transactions) {
          if (t.type === 'commission' && t.orderId) {
            const key = t.orderId.toString();
            if (seenHotelOrderIds.has(key)) {
              hasHotelDuplicates = true;
              continue;
            }
            seenHotelOrderIds.add(key);
          }
          uniqueHotelTxs.push(t);
        }
        if (hasHotelDuplicates) {
          wallet.transactions = uniqueHotelTxs;
          needsSave = true;
        }

        // Ledger Recalculation
        if (needsSave || wallet.transactions.length > 0) {
          let runningBalance = 0;
          let totalEarned = 0;
          let totalWithdrawn = 0;

          // Sort chronologically
          const indexed = wallet.transactions.map((t, idx) => ({ t, idx }));
          indexed.sort((a, b) => {
            const dateA = new Date(a.t.createdAt || a.t.processedAt || 0);
            const dateB = new Date(b.t.createdAt || b.t.processedAt || 0);
            if (dateA.getTime() !== dateB.getTime()) {
              return dateA - dateB;
            }
            return a.idx - b.idx;
          });

          indexed.forEach(({ t }) => {
            if (t.status === 'Completed') {
              if (t.type === 'commission' || t.type === 'bonus' || t.type === 'refund') {
                runningBalance += t.amount;
                totalEarned += t.amount;
              } else if (t.type === 'cash_collection') {
                totalEarned += t.amount;
              } else if (t.type === 'withdrawal') {
                runningBalance -= t.amount;
                totalWithdrawn += t.amount;
              } else if (t.type === 'deduction') {
                runningBalance -= t.amount;
                totalEarned = Math.max(0, totalEarned - t.amount);
              }
            }
          });

          wallet.transactions = indexed.map(({ t }) => t);
          wallet.totalBalance = Math.max(0, runningBalance);
          wallet.totalEarned = Math.max(0, totalEarned);
          wallet.totalWithdrawn = Math.max(0, totalWithdrawn);
          wallet.markModified('transactions');
          needsSave = true;
        }

        if (needsSave) {
          await wallet.save();
          console.log(`-> Updated Hotel: ${hotel.hotelName || hotelIdStr}. Balance: ₹${wallet.totalBalance.toFixed(2)} (Earned: ₹${wallet.totalEarned.toFixed(2)})`);
        }
      } catch (err) {
        console.error(`Error syncing hotel wallet for ${hotel.hotelName}:`, err.message);
      }
    }

    console.log('\nAll restaurant and hotel wallets synced successfully.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Wallet sync run failed:', error);
    process.exit(1);
  }
};

syncWallets();
