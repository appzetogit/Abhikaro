import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import WithdrawalRequest from '../modules/restaurant/models/WithdrawalRequest.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // Find Shree Shyam Restaurant
  const restaurant = await Restaurant.findOne({
    $or: [
      { 'onboarding.step1.restaurantName': /shree shyam/i },
      { name: /shree shyam/i }
    ]
  }).lean();

  if (!restaurant) {
    console.error('❌ Shree Shyam Restaurant not found');
    await mongoose.disconnect();
    return;
  }

  console.log('🏪 Restaurant Found:');
  console.log(`  Name: ${restaurant.onboarding?.step1?.restaurantName || restaurant.name}`);
  console.log(`  ID (Public): ${restaurant.restaurantId}`);
  console.log(`  _id (Mongo): ${restaurant._id}`);
  console.log('');

  // 1. Check in global WithdrawalRequest collection
  const globalWithdrawals = await WithdrawalRequest.find({
    $or: [
      { restaurantId: restaurant._id },
      { restaurantName: /shree shyam/i }
    ]
  }).lean();

  console.log(`📋 Withdrawal requests in WithdrawalRequest collection: ${globalWithdrawals.length}`);
  globalWithdrawals.forEach((w, idx) => {
    console.log(`  ${idx + 1}. Request ID: ${w._id}`);
    console.log(`     Amount    : ₹${w.amount}`);
    console.log(`     Status    : ${w.status}`);
    console.log(`     Method    : ${w.paymentMethod}`);
    console.log(`     Requested : ${w.requestedAt}`);
    console.log(`     UPI ID    : ${w.upiId || 'N/A'}`);
    console.log(`     Bank      : Account: ${w.bankDetails?.accountNumber || 'N/A'}, Holder: ${w.bankDetails?.accountHolderName || 'N/A'}, IFSC: ${w.bankDetails?.ifscCode || 'N/A'}`);
    console.log(`     Txn ID    : ${w.transactionId || 'N/A'}`);
    console.log(`     Reason    : ${w.rejectionReason || 'N/A'}`);
  });
  console.log('');

  // 2. Check Restaurant Wallet
  const wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id }).lean();
  if (!wallet) {
    console.log('💰 No wallet found for this restaurant');
  } else {
    console.log('💰 Wallet Overview:');
    console.log(`  totalBalance: ₹${wallet.totalBalance}`);
    console.log(`  totalEarned: ₹${wallet.totalEarned}`);
    console.log(`  totalWithdrawn: ₹${wallet.totalWithdrawn}`);
    console.log(`  Transactions count: ${wallet.transactions?.length || 0}`);
    console.log(`  Transactions list:`);
    (wallet.transactions || []).forEach((t, idx) => {
      console.log(`    [${idx + 1}] Type: ${t.type} | Amount: ₹${t.amount} | Status: ${t.status} | Description: ${t.description} | Date: ${t.createdAt || t.date}`);
    });
    console.log('');
    console.log(`  Embedded Withdrawal Requests (within wallet): ${wallet.withdrawalRequests?.length || 0}`);
    (wallet.withdrawalRequests || []).forEach((w, idx) => {
      console.log(`    [${idx + 1}] ID: ${w._id} | Amount: ₹${w.amount} | Status: ${w.status} | Method: ${w.paymentMethod}`);
    });
  }

  await mongoose.disconnect();
}

main().catch(console.error);
