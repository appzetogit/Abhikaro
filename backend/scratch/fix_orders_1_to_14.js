import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import AdminWallet from '../modules/admin/models/AdminWallet.js';
import HotelWallet from '../modules/hotel/models/HotelWallet.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import { calculateOrderSettlement } from '../modules/order/services/orderSettlementService.js';

dotenv.config();

// Helper to resolve Restaurant ObjectId
async function resolveRestaurantObjectId(restaurantId) {
  if (!restaurantId) return null;
  if (mongoose.Types.ObjectId.isValid(restaurantId)) {
    return new mongoose.Types.ObjectId(restaurantId);
  }
  const restDoc = await Restaurant.findOne({
    $or: [
      { restaurantId: restaurantId },
      { slug: restaurantId }
    ]
  }).lean();
  return restDoc ? restDoc._id : null;
}

// Recalculates all fields for AdminWallet
async function syncAdminWallet() {
  const adminWallet = await AdminWallet.findOne({});
  if (!adminWallet) return;

  let balance = 0;
  let commission = 0;
  let platformFee = 0;
  let deliveryFee = 0;
  let gst = 0;
  let withdrawn = 0;

  for (const t of adminWallet.transactions) {
    if (t.status === 'Completed') {
      if (t.type === 'commission') {
        balance += t.amount;
        commission += t.amount;
      } else if (t.type === 'platform_fee') {
        balance += t.amount;
        platformFee += t.amount;
      } else if (t.type === 'delivery_fee') {
        balance += t.amount;
        deliveryFee += t.amount;
      } else if (t.type === 'gst') {
        balance += t.amount;
        gst += t.amount;
      } else if (t.type === 'withdrawal') {
        balance -= t.amount;
        withdrawn += t.amount;
      } else if (t.type === 'deduction') {
        balance -= t.amount;
      } else if (t.type === 'refund') {
        balance = Math.max(0, balance - t.amount);
      }
    }
  }

  adminWallet.totalBalance = Math.round(balance * 100) / 100;
  adminWallet.totalCommission = Math.round(commission * 100) / 100;
  adminWallet.totalPlatformFee = Math.round(platformFee * 100) / 100;
  adminWallet.totalDeliveryFee = Math.round(deliveryFee * 100) / 100;
  adminWallet.totalGST = Math.round(gst * 100) / 100;
  adminWallet.totalWithdrawn = Math.round(withdrawn * 100) / 100;
  adminWallet.lastTransactionAt = new Date();

  await adminWallet.save();
  console.log(`Synced AdminWallet. New total balance: ₹${adminWallet.totalBalance}`);
}

// Recalculates all fields for HotelWallet
async function syncHotelWallet(hotelId) {
  const hotelWallet = await HotelWallet.findOne({ hotelId });
  if (!hotelWallet) return;

  let totalBalance = 0;
  let totalEarned = 0;
  let totalWithdrawn = 0;

  for (const t of hotelWallet.transactions) {
    if (t.status === 'Completed') {
      if (t.type === 'commission' || t.type === 'bonus' || t.type === 'refund') {
        totalBalance += t.amount;
        totalEarned += t.amount;
      } else if (t.type === 'cash_collection') {
        totalEarned += t.amount;
      } else if (t.type === 'withdrawal') {
        totalBalance -= t.amount;
        totalWithdrawn += t.amount;
      } else if (t.type === 'deduction') {
        totalBalance -= t.amount;
        totalEarned = Math.max(0, totalEarned - t.amount);
      }
    }
  }

  hotelWallet.totalBalance = Math.round(totalBalance * 100) / 100;
  hotelWallet.totalEarned = Math.round(totalEarned * 100) / 100;
  hotelWallet.totalWithdrawn = Math.round(totalWithdrawn * 100) / 100;
  hotelWallet.lastTransactionAt = new Date();

  await hotelWallet.save();
  console.log(`Synced HotelWallet for hotelId: ${hotelId}. New total balance: ₹${hotelWallet.totalBalance}`);
}

async function fix() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // ==========================================
    // 1. ORDER 2: ORD-1781156016888-690
    // ==========================================
    console.log('\n--- Processing Order 2 (ORD-1781156016888-690) ---');
    const order2 = await Order.findOne({ orderId: 'ORD-1781156016888-690' });
    if (order2) {
      const s2 = await OrderSettlement.findOne({ orderId: order2._id });
      if (s2) {
        s2.settlementStatus = 'completed';
        s2.escrowStatus = 'released';
        s2.restaurantEarning.status = 'credited';
        s2.adminEarning.status = 'credited';
        s2.hotelEarning.status = 'credited';
        s2.restaurantSettled = true;
        s2.adminSettled = true;
        s2.hotelSettled = true;
        await s2.save();
        console.log('Order 2 settlement updated to completed/released.');
      } else {
        console.log('Warning: Order 2 settlement not found!');
      }
    } else {
      console.log('Warning: Order 2 not found!');
    }

    // ==========================================
    // 2. ORDER 6: ORD-1781108702714-178
    // ==========================================
    console.log('\n--- Processing Order 6 (ORD-1781108702714-178) ---');
    const order6 = await Order.findOne({ orderId: 'ORD-1781108702714-178' });
    if (order6) {
      const subtotal = order6.pricing.subtotal || 1304;
      const hotelAmount = 130.40;  // 10% of 1304
      const adminAmount = 195.60;  // 15% of 1304
      const restaurantAmount = 978.00; // 75% of 1304

      const finalRestaurantId = await resolveRestaurantObjectId(order6.restaurantId);
      if (!finalRestaurantId) {
        throw new Error(`Could not resolve restaurant ObjectId for Order 6: ${order6.restaurantId}`);
      }

      order6.commissionPercentages = { hotel: 10, admin: 15, restaurant: 75, user: 0 };
      order6.commissionBreakdown = { hotel: hotelAmount, admin: adminAmount, restaurant: restaurantAmount, user: 0 };
      order6.hotelCommission = hotelAmount;
      order6.adminCommission = adminAmount;
      order6.restaurantShare = restaurantAmount;
      order6.commissionDistributed = true;
      await order6.save();
      console.log('Order 6 percentages & breakdown updated on Order document.');

      // Regenerate Settlement
      await OrderSettlement.deleteOne({ orderId: order6._id });
      const s6 = await calculateOrderSettlement(order6._id);
      s6.settlementStatus = 'completed';
      s6.escrowStatus = 'released';
      s6.restaurantEarning.status = 'credited';
      s6.adminEarning.status = 'credited';
      s6.hotelEarning.status = 'credited';
      s6.restaurantSettled = true;
      s6.adminSettled = true;
      s6.hotelSettled = true;
      await s6.save();
      console.log('Order 6 settlement regenerated & finalized.');

      // Wallets update
      // Admin Wallet: Add transactions if not exists
      const adminWallet = await AdminWallet.findOne({});
      if (adminWallet) {
        adminWallet.transactions = adminWallet.transactions.filter(t => t.orderId?.toString() !== order6._id.toString());
        adminWallet.transactions.push({
          amount: adminAmount,
          type: 'commission',
          status: 'Completed',
          description: `Restaurant commission from order ${order6.orderId} (15.0% of ₹${subtotal})`,
          orderId: order6._id,
          restaurantId: finalRestaurantId,
          createdAt: new Date(),
          processedAt: new Date()
        });
        if (order6.pricing.platformFee > 0) {
          adminWallet.transactions.push({
            amount: order6.pricing.platformFee,
            type: 'platform_fee',
            status: 'Completed',
            description: `Platform fee from order ${order6.orderId}`,
            orderId: order6._id,
            createdAt: new Date(),
            processedAt: new Date()
          });
        }
        if (order6.pricing.tax > 0) {
          adminWallet.transactions.push({
            amount: order6.pricing.tax,
            type: 'gst',
            status: 'Completed',
            description: `GST from order ${order6.orderId}`,
            orderId: order6._id,
            createdAt: new Date(),
            processedAt: new Date()
          });
        }
        await adminWallet.save();
        await syncAdminWallet();
      }

      // Hotel Wallet: Add transaction
      if (order6.hotelId) {
        const hotelWallet = await HotelWallet.findOrCreateByHotelId(order6.hotelId);
        hotelWallet.transactions = hotelWallet.transactions.filter(t => t.orderId?.toString() !== order6._id.toString());
        hotelWallet.transactions.push({
          amount: hotelAmount,
          type: 'commission',
          status: 'Completed',
          description: `Commission from order ${order6.orderId} (10.00% of ₹${subtotal})`,
          orderId: order6._id,
          createdAt: new Date(),
          processedAt: new Date()
        });
        await hotelWallet.save();
        await syncHotelWallet(order6.hotelId);
      }

      // Restaurant Wallet: sync
      await RestaurantWallet.findOrCreateByRestaurantId(finalRestaurantId);

      // Create AdminCommission record
      await AdminCommission.deleteOne({ orderId: order6._id });
      await AdminCommission.create({
        orderId: order6._id,
        orderAmount: subtotal,
        commissionAmount: adminAmount,
        commissionPercentage: 15,
        restaurantId: finalRestaurantId,
        restaurantName: order6.restaurantName || "Maa karni Restaurant",
        restaurantEarning: restaurantAmount,
        status: 'completed',
        orderDate: order6.createdAt || new Date(),
      });
      console.log('Order 6 AdminCommission record created.');
    }

    // ==========================================
    // 3. ORDER 7: ORD-1781100983513-732
    // ==========================================
    console.log('\n--- Processing Order 7 (ORD-1781100983513-732) ---');
    const order7 = await Order.findOne({ orderId: 'ORD-1781100983513-732' });
    if (order7) {
      const subtotal = order7.pricing.subtotal || 269;
      const hotelAmount = 26.9;
      const adminAmount = 53.8;
      const restaurantAmount = 188.3;

      const finalRestaurantId = await resolveRestaurantObjectId(order7.restaurantId);
      if (!finalRestaurantId) {
        throw new Error(`Could not resolve restaurant ObjectId for Order 7: ${order7.restaurantId}`);
      }

      order7.commissionPercentages = { hotel: 10, admin: 20, restaurant: 70, user: 0 };
      order7.commissionBreakdown = { hotel: hotelAmount, admin: adminAmount, restaurant: restaurantAmount, user: 0 };
      order7.hotelCommission = hotelAmount;
      order7.adminCommission = adminAmount;
      order7.restaurantShare = restaurantAmount;
      order7.commissionDistributed = true;
      await order7.save();

      // Settle Order 7
      await OrderSettlement.deleteOne({ orderId: order7._id });
      const s7 = await calculateOrderSettlement(order7._id);
      s7.settlementStatus = 'completed';
      s7.escrowStatus = 'released';
      s7.restaurantEarning.status = 'credited';
      s7.adminEarning.status = 'credited';
      s7.hotelEarning.status = 'credited';
      s7.restaurantSettled = true;
      s7.adminSettled = true;
      s7.hotelSettled = true;
      await s7.save();
      console.log('Order 7 settlement generated & finalized.');

      // Admin Wallet
      const adminWallet = await AdminWallet.findOne({});
      if (adminWallet) {
        adminWallet.transactions = adminWallet.transactions.filter(t => t.orderId?.toString() !== order7._id.toString());
        adminWallet.transactions.push({
          amount: adminAmount,
          type: 'commission',
          status: 'Completed',
          description: `Restaurant commission from order ${order7.orderId} (20.0% of ₹${subtotal})`,
          orderId: order7._id,
          restaurantId: finalRestaurantId,
          createdAt: new Date(),
          processedAt: new Date()
        });
        if (order7.pricing.platformFee > 0) {
          adminWallet.transactions.push({
            amount: order7.pricing.platformFee,
            type: 'platform_fee',
            status: 'Completed',
            description: `Platform fee from order ${order7.orderId}`,
            orderId: order7._id,
            createdAt: new Date(),
            processedAt: new Date()
          });
        }
        if (order7.pricing.tax > 0) {
          adminWallet.transactions.push({
            amount: order7.pricing.tax,
            type: 'gst',
            status: 'Completed',
            description: `GST from order ${order7.orderId}`,
            orderId: order7._id,
            createdAt: new Date(),
            processedAt: new Date()
          });
        }
        await adminWallet.save();
        await syncAdminWallet();
      }

      // Hotel Wallet
      if (order7.hotelId) {
        const hotelWallet = await HotelWallet.findOrCreateByHotelId(order7.hotelId);
        hotelWallet.transactions = hotelWallet.transactions.filter(t => t.orderId?.toString() !== order7._id.toString());
        hotelWallet.transactions.push({
          amount: hotelAmount,
          type: 'commission',
          status: 'Completed',
          description: `Commission from order ${order7.orderId} (10.00% of ₹${subtotal})`,
          orderId: order7._id,
          createdAt: new Date(),
          processedAt: new Date()
        });
        await hotelWallet.save();
        await syncHotelWallet(order7.hotelId);
      }

      // Restaurant Wallet
      await RestaurantWallet.findOrCreateByRestaurantId(finalRestaurantId);

      // AdminCommission
      await AdminCommission.deleteOne({ orderId: order7._id });
      await AdminCommission.create({
        orderId: order7._id,
        orderAmount: subtotal,
        commissionAmount: adminAmount,
        commissionPercentage: 20,
        restaurantId: finalRestaurantId,
        restaurantName: order7.restaurantName || "Kirpa restaurant&cafe",
        restaurantEarning: restaurantAmount,
        status: 'completed',
        orderDate: order7.createdAt || new Date(),
      });
      console.log('Order 7 AdminCommission record created.');
    }

    // ==========================================
    // 4. ORDER 8: ORD-1781090410623-896
    // ==========================================
    console.log('\n--- Processing Order 8 (ORD-1781090410623-896) ---');
    const order8 = await Order.findOne({ orderId: 'ORD-1781090410623-896' });
    if (order8) {
      const subtotal = order8.pricing.subtotal || 205;
      const hotelAmount = 20.50;  // 10% of 205
      const adminAmount = 30.75;  // 15% of 205
      const restaurantAmount = 153.75; // 75% of 205

      const finalRestaurantId = await resolveRestaurantObjectId(order8.restaurantId);
      if (!finalRestaurantId) {
        throw new Error(`Could not resolve restaurant ObjectId for Order 8: ${order8.restaurantId}`);
      }

      order8.commissionPercentages = { hotel: 10, admin: 15, restaurant: 75, user: 0 };
      order8.commissionBreakdown = { hotel: hotelAmount, admin: adminAmount, restaurant: restaurantAmount, user: 0 };
      order8.hotelCommission = hotelAmount;
      order8.adminCommission = adminAmount;
      order8.restaurantShare = restaurantAmount;
      order8.commissionDistributed = true;
      await order8.save();
      console.log('Order 8 percentages & breakdown updated on Order document.');

      // Regenerate Settlement
      await OrderSettlement.deleteOne({ orderId: order8._id });
      const s8 = await calculateOrderSettlement(order8._id);
      s8.settlementStatus = 'completed';
      s8.escrowStatus = 'released';
      s8.restaurantEarning.status = 'credited';
      s8.adminEarning.status = 'credited';
      s8.hotelEarning.status = 'credited';
      s8.restaurantSettled = true;
      s8.adminSettled = true;
      s8.hotelSettled = true;
      await s8.save();
      console.log('Order 8 settlement regenerated & finalized.');

      // Admin Wallet Update (Clean up and push correct)
      const adminWallet = await AdminWallet.findOne({});
      if (adminWallet) {
        adminWallet.transactions = adminWallet.transactions.filter(t => t.orderId?.toString() !== order8._id.toString());
        adminWallet.transactions.push({
          amount: adminAmount,
          type: 'commission',
          status: 'Completed',
          description: `Restaurant commission from order ${order8.orderId} (15.0% of ₹${subtotal})`,
          orderId: order8._id,
          restaurantId: finalRestaurantId,
          createdAt: new Date(),
          processedAt: new Date()
        });
        if (order8.pricing.platformFee > 0) {
          adminWallet.transactions.push({
            amount: order8.pricing.platformFee,
            type: 'platform_fee',
            status: 'Completed',
            description: `Platform fee from order ${order8.orderId}`,
            orderId: order8._id,
            createdAt: new Date(),
            processedAt: new Date()
          });
        }
        if (order8.pricing.tax > 0) {
          adminWallet.transactions.push({
            amount: order8.pricing.tax,
            type: 'gst',
            status: 'Completed',
            description: `GST from order ${order8.orderId}`,
            orderId: order8._id,
            createdAt: new Date(),
            processedAt: new Date()
          });
        }
        await adminWallet.save();
        await syncAdminWallet();
      }

      // Hotel Wallet Update (Ensure correct commission entry)
      if (order8.hotelId) {
        const hotelWallet = await HotelWallet.findOrCreateByHotelId(order8.hotelId);
        hotelWallet.transactions = hotelWallet.transactions.filter(t => t.orderId?.toString() !== order8._id.toString());
        hotelWallet.transactions.push({
          amount: hotelAmount,
          type: 'commission',
          status: 'Completed',
          description: `Commission from order ${order8.orderId} (10.00% of ₹${subtotal})`,
          orderId: order8._id,
          createdAt: new Date(),
          processedAt: new Date()
        });
        await hotelWallet.save();
        await syncHotelWallet(order8.hotelId);
      }

      // Restaurant Wallet Sync
      await RestaurantWallet.findOrCreateByRestaurantId(finalRestaurantId);

      // Create AdminCommission record
      await AdminCommission.deleteOne({ orderId: order8._id });
      await AdminCommission.create({
        orderId: order8._id,
        orderAmount: subtotal,
        commissionAmount: adminAmount,
        commissionPercentage: 15,
        restaurantId: finalRestaurantId,
        restaurantName: order8.restaurantName || "Maa karni Restaurant",
        restaurantEarning: restaurantAmount,
        status: 'completed',
        orderDate: order8.createdAt || new Date(),
      });
      console.log('Order 8 AdminCommission record created.');
    }

    // ==========================================
    // 5. ORDER 12: ORD-1781071634363-714
    // ==========================================
    console.log('\n--- Processing Order 12 (ORD-1781071634363-714) ---');
    const order12 = await Order.findOne({ orderId: 'ORD-1781071634363-714' });
    if (order12) {
      const subtotal = order12.pricing.subtotal || 480;
      const hotelAmount = 48.00;  // 10% of 480
      const adminAmount = 72.00;  // 15% of 480
      const restaurantAmount = 360.00; // 75% of 480

      const finalRestaurantId = await resolveRestaurantObjectId(order12.restaurantId);
      if (!finalRestaurantId) {
        throw new Error(`Could not resolve restaurant ObjectId for Order 12: ${order12.restaurantId}`);
      }

      order12.commissionPercentages = { hotel: 10, admin: 15, restaurant: 75, user: 0 };
      order12.commissionBreakdown = { hotel: hotelAmount, admin: adminAmount, restaurant: restaurantAmount, user: 0 };
      order12.hotelCommission = hotelAmount;
      order12.adminCommission = adminAmount;
      order12.restaurantShare = restaurantAmount;
      order12.commissionDistributed = true;
      await order12.save();
      console.log('Order 12 percentages & breakdown updated on Order document.');

      // Regenerate Settlement
      await OrderSettlement.deleteOne({ orderId: order12._id });
      const s12 = await calculateOrderSettlement(order12._id);
      s12.settlementStatus = 'completed';
      s12.escrowStatus = 'released';
      s12.restaurantEarning.status = 'credited';
      s12.adminEarning.status = 'credited';
      s12.hotelEarning.status = 'credited';
      s12.restaurantSettled = true;
      s12.adminSettled = true;
      s12.hotelSettled = true;
      await s12.save();
      console.log('Order 12 settlement regenerated & finalized.');

      // Admin Wallet Update
      const adminWallet = await AdminWallet.findOne({});
      if (adminWallet) {
        adminWallet.transactions = adminWallet.transactions.filter(t => t.orderId?.toString() !== order12._id.toString());
        adminWallet.transactions.push({
          amount: adminAmount,
          type: 'commission',
          status: 'Completed',
          description: `Restaurant commission from order ${order12.orderId} (15.0% of ₹${subtotal})`,
          orderId: order12._id,
          restaurantId: finalRestaurantId,
          createdAt: new Date(),
          processedAt: new Date()
        });
        if (order12.pricing.platformFee > 0) {
          adminWallet.transactions.push({
            amount: order12.pricing.platformFee,
            type: 'platform_fee',
            status: 'Completed',
            description: `Platform fee from order ${order12.orderId}`,
            orderId: order12._id,
            createdAt: new Date(),
            processedAt: new Date()
          });
        }
        if (order12.pricing.tax > 0) {
          adminWallet.transactions.push({
            amount: order12.pricing.tax,
            type: 'gst',
            status: 'Completed',
            description: `GST from order ${order12.orderId}`,
            orderId: order12._id,
            createdAt: new Date(),
            processedAt: new Date()
          });
        }
        await adminWallet.save();
        await syncAdminWallet();
      }

      // Hotel Wallet Update
      if (order12.hotelId) {
        const hotelWallet = await HotelWallet.findOrCreateByHotelId(order12.hotelId);
        hotelWallet.transactions = hotelWallet.transactions.filter(t => t.orderId?.toString() !== order12._id.toString());
        hotelWallet.transactions.push({
          amount: hotelAmount,
          type: 'commission',
          status: 'Completed',
          description: `Commission from order ${order12.orderId} (10.00% of ₹${subtotal})`,
          orderId: order12._id,
          createdAt: new Date(),
          processedAt: new Date()
        });
        await hotelWallet.save();
        await syncHotelWallet(order12.hotelId);
      }

      // Restaurant Wallet Sync
      await RestaurantWallet.findOrCreateByRestaurantId(finalRestaurantId);

      // Create AdminCommission record
      await AdminCommission.deleteOne({ orderId: order12._id });
      await AdminCommission.create({
        orderId: order12._id,
        orderAmount: subtotal,
        commissionAmount: adminAmount,
        commissionPercentage: 15,
        restaurantId: finalRestaurantId,
        restaurantName: order12.restaurantName || "Maa karni Restaurant",
        restaurantEarning: restaurantAmount,
        status: 'completed',
        orderDate: order12.createdAt || new Date(),
      });
      console.log('Order 12 AdminCommission record created.');
    }

    console.log('\n--- Syncing all affected Restaurant Wallets ---');
    const maakarniId = new mongoose.Types.ObjectId('69d0ef574222eff98f02cb92');
    const kirpaDoc = await Restaurant.findOne({
      $or: [
        { restaurantId: 'REST-1773051256895-8708' },
        { slug: 'REST-1773051256895-8708' },
        { name: /Kirpa/i }
      ]
    }).lean();
    
    await RestaurantWallet.findOrCreateByRestaurantId(maakarniId);
    if (kirpaDoc) {
      await RestaurantWallet.findOrCreateByRestaurantId(kirpaDoc._id);
    }

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    console.log('Fix completed successfully!');
  } catch (err) {
    console.error('Error during database correction:', err);
  }
}

fix();
