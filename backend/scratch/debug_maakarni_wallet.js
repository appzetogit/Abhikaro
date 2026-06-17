/**
 * Debug script: Inspect Maa Karni Restaurant wallet and all delivered orders
 * Run: node scratch/debug_maakarni_wallet.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import Order from '../modules/order/models/Order.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // Find Maa Karni Restaurant
  const restaurant = await Restaurant.findOne({
    $or: [
      { restaurantId: 'REST-1775300439918-3090' },
      { 'onboarding.step1.restaurantName': /maa karni/i },
      { name: /maa karni/i }
    ]
  }).lean();

  if (!restaurant) {
    console.error('❌ Restaurant not found');
    process.exit(1);
  }

  console.log('🏪 Restaurant Found:');
  console.log(`  Name: ${restaurant.onboarding?.step1?.restaurantName || restaurant.name}`);
  console.log(`  ID: ${restaurant.restaurantId}`);
  console.log(`  _id: ${restaurant._id}`);
  console.log('');

  const restaurantMongoId = restaurant._id.toString();
  const restaurantPublicId = restaurant.restaurantId;
  const restaurantSlug = restaurant.slug;
  const idVariations = [restaurantMongoId, restaurantPublicId, restaurantSlug].filter(Boolean);

  console.log(`🔍 Searching orders with restaurantId in: ${JSON.stringify(idVariations)}\n`);

  // Find all delivered orders
  const orders = await Order.find({
    restaurantId: { $in: idVariations },
    status: 'delivered'
  }).select('orderId restaurantId pricing payment status deliveredAt createdAt').lean();

  console.log(`📦 Total Delivered Orders: ${orders.length}`);
  let totalSubtotal = 0;
  let totalFoodPrice = 0;
  for (const o of orders) {
    const subtotal = o.pricing?.subtotal || 0;
    const discount = o.pricing?.discount || 0;
    const foodPrice = subtotal - discount;
    totalSubtotal += subtotal;
    totalFoodPrice += foodPrice;
    console.log(`  Order: ${o.orderId} | restaurantId stored: ${o.restaurantId} | subtotal: ₹${subtotal} | foodPrice: ₹${foodPrice} | date: ${o.deliveredAt || o.createdAt}`);
  }
  console.log(`  Total Subtotal: ₹${totalSubtotal.toFixed(2)}`);
  console.log(`  Total Food Price (subtotal - discount): ₹${totalFoodPrice.toFixed(2)}\n`);

  // Check OrderSettlements
  const settlements = await OrderSettlement.find({
    restaurantId: restaurant._id
  }).lean();
  console.log(`📋 OrderSettlements found: ${settlements.length}`);
  let totalNetEarning = 0;
  let totalSettledNetEarning = 0;
  for (const s of settlements) {
    const netEarning = s.restaurantEarning?.netEarning || 0;
    const status = s.restaurantEarning?.status;
    totalNetEarning += netEarning;
    if (status === 'credited') totalSettledNetEarning += netEarning;
    console.log(`  Settlement: ${s.orderNumber} | netEarning: ₹${netEarning} | status: ${status}`);
  }
  console.log(`  Total Net Earning (all settlements): ₹${totalNetEarning.toFixed(2)}`);
  console.log(`  Total Credited Net Earning: ₹${totalSettledNetEarning.toFixed(2)}\n`);

  // Wallet
  const wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id }).lean();
  if (!wallet) {
    console.log('💰 No wallet found for this restaurant');
  } else {
    console.log('💰 Current Wallet State:');
    console.log(`  totalBalance: ₹${wallet.totalBalance}`);
    console.log(`  totalEarned: ₹${wallet.totalEarned}`);
    console.log(`  totalWithdrawn: ₹${wallet.totalWithdrawn}`);
    console.log(`  Transactions (${wallet.transactions?.length || 0} total):`);
    for (const t of (wallet.transactions || [])) {
      console.log(`    [${t.type}] ₹${t.amount} | status: ${t.status} | desc: ${t.description?.substring(0,80)} | balanceAfter: ${t.balanceAfter}`);
    }
  }

  // Manually compute what balance SHOULD be
  console.log('\n🧮 Expected Balance Calculation:');
  const paymentTxs = (wallet?.transactions || []).filter(t => t.type === 'payment' && t.status === 'Completed');
  let manualBalance = 0;
  for (const t of paymentTxs) {
    manualBalance += t.amount;
  }
  const deductionTxs = (wallet?.transactions || []).filter(t => (t.type === 'withdrawal' || t.type === 'deduction') && t.status === 'Completed');
  for (const t of deductionTxs) {
    manualBalance -= t.amount;
  }
  console.log(`  Sum of all Completed payment txs: ₹${paymentTxs.reduce((s, t) => s + t.amount, 0).toFixed(2)}`);
  console.log(`  Sum of all Completed withdrawal/deduction txs: ₹${deductionTxs.reduce((s, t) => s + t.amount, 0).toFixed(2)}`);
  console.log(`  Expected totalBalance: ₹${Math.max(0, manualBalance).toFixed(2)}`);

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

main().catch(e => { console.error(e); process.exit(1); });
