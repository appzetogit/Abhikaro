import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import WithdrawalRequest from '../modules/restaurant/models/WithdrawalRequest.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // Find all restaurants with 'shyam' in their name
  const restaurants = await Restaurant.find({
    $or: [
      { name: /shyam/i },
      { 'onboarding.step1.restaurantName': /shyam/i }
    ]
  }).lean();

  console.log(`🏪 Restaurants found matching "shyam": ${restaurants.length}`);
  restaurants.forEach(r => {
    console.log(`  - Name: ${r.name}`);
    console.log(`    Onboarding Name: ${r.onboarding?.step1?.restaurantName}`);
    console.log(`    ID: ${r._id}`);
    console.log(`    Public ID: ${r.restaurantId}`);
  });
  console.log('');

  // Find all order settlements where restaurantName matches 'shyam' or restaurantId matches any of the found restaurants
  const restIds = restaurants.map(r => r._id);
  const restPublicIds = restaurants.map(r => r.restaurantId).filter(Boolean);

  const settlements = await OrderSettlement.find({
    $or: [
      { restaurantName: /shyam/i },
      { restaurantId: { $in: restIds } }
    ]
  }).lean();

  console.log(`📋 Order settlements matching shyam: ${settlements.length}`);
  settlements.forEach(s => {
    console.log(`  - Order: ${s.orderNumber} | RestName: ${s.restaurantName} | RestId: ${s.restaurantId} | NetEarning: ${s.restaurantEarning?.netEarning} | Settled: ${s.restaurantSettled}`);
  });
  console.log('');

  // Find all orders matching shyam
  const orders = await Order.find({
    $or: [
      { restaurantName: /shyam/i },
      { restaurantId: { $in: restIds.map(id => id.toString()) } },
      { restaurantId: { $in: restPublicIds } }
    ]
  }).lean();

  console.log(`🛒 Orders matching shyam: ${orders.length}`);
  orders.forEach(o => {
    console.log(`  - Order: ${o.orderId} | RestName: ${o.restaurantName} | RestId: ${o.restaurantId} | Status: ${o.status}`);
  });
  console.log('');

  // Check wallets of any matching restaurant
  for (const r of restaurants) {
    const wallet = await RestaurantWallet.findOne({ restaurantId: r._id }).lean();
    console.log(`💰 Wallet for ${r.name} (${r._id}):`);
    if (wallet) {
      console.log(`  - Balance: ₹${wallet.totalBalance}`);
      console.log(`  - Earned: ₹${wallet.totalEarned}`);
      console.log(`  - Withdrawn: ₹${wallet.totalWithdrawn}`);
      console.log(`  - Transactions: ${wallet.transactions?.length || 0}`);
    } else {
      console.log(`  - No wallet found`);
    }
  }
  console.log('');

  // Check withdrawal requests of any matching restaurant
  const withdrawals = await WithdrawalRequest.find({
    $or: [
      { restaurantId: { $in: restIds } },
      { restaurantName: /shyam/i }
    ]
  }).lean();

  console.log(`💸 Withdrawal requests matching shyam: ${withdrawals.length}`);
  withdrawals.forEach(w => {
    console.log(`  - Request ID: ${w._id} | Restaurant: ${w.restaurantName} (${w.restaurantId}) | Amount: ₹${w.amount} | Status: ${w.status} | Date: ${w.createdAt || w.requestedAt}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
