import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import WithdrawalRequest from '../modules/restaurant/models/WithdrawalRequest.js';
import BusinessSettings from '../modules/admin/models/BusinessSettings.js';

// We will mock the express req and res objects to run the controllers
import { createWithdrawalRequest, approveWithdrawalRequest, rejectWithdrawalRequest } from '../modules/restaurant/controllers/withdrawalController.js';

// Helper to wrap Express controller in a Promise
function runController(controller, req) {
  return new Promise((resolve, reject) => {
    const res = {};
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.jsonData = data;
      resolve(res);
      return res;
    };
    const next = (err) => {
      if (err) reject(err);
      else resolve(res);
    };
    controller(req, res, next);
  });
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // Find Shree Shyam Restaurant
  const restaurant = await Restaurant.findOne({
    $or: [
      { 'onboarding.step1.restaurantName': /shree shyam/i },
      { name: /shree shyam/i }
    ]
  });

  if (!restaurant) {
    console.error('❌ Shree Shyam Restaurant not found');
    await mongoose.disconnect();
    return;
  }

  console.log(`🏪 Selected Restaurant: ${restaurant.name} (${restaurant._id})`);

  // Print initial balance
  let wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });
  console.log(`💰 Initial Wallet Balance: ₹${wallet.totalBalance}`);

  console.log('⚙️ Mocking withdraw schedule to be open for today...');
  const settings = await BusinessSettings.getSettings();
  const originalSchedule = {
    enabled: settings.withdrawSchedule?.enabled,
    dayOfWeek: settings.withdrawSchedule?.dayOfWeek,
    startTime: settings.withdrawSchedule?.startTime,
    timeZone: settings.withdrawSchedule?.timeZone
  };
  
  const today = new Date();
  const currentDow = today.getDay(); // 0-6
  
  settings.withdrawSchedule = {
    enabled: true,
    dayOfWeek: currentDow,
    startTime: "00:00",
    timeZone: "Asia/Kolkata"
  };
  await settings.save();

  try {
    // ----------------------------------------------------
    // Test Case 1: Create Withdrawal Request for ₹500
    // ----------------------------------------------------
    console.log('\n--- 🧪 Test Case 1: Create Withdrawal Request for ₹500 ---');
    const reqCreate = {
      restaurant: restaurant,
      body: { amount: 500 }
    };

    const resCreate = await runController(createWithdrawalRequest, reqCreate);
    console.log(`Response Code: ${resCreate.statusCode}`);
    console.log('Response JSON:', JSON.stringify(resCreate.jsonData, null, 2));

    if (resCreate.statusCode !== 201) {
      throw new Error('Create withdrawal request failed');
    }

    const createdRequestId = resCreate.jsonData.data.withdrawalRequest.id;

    // Verify linked transaction ID in DB
    const requestDoc = await WithdrawalRequest.findById(createdRequestId);
    console.log(`Created Request ID in DB: ${requestDoc._id}`);
    console.log(`Linked Transaction ID: ${requestDoc.transactionId}`);
    
    // Check if the transaction exists in the wallet transactions array
    wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });
    const linkedTx = wallet.transactions.id(requestDoc.transactionId);
    console.log(`Transaction found in wallet: ${!!linkedTx}`);
    if (linkedTx) {
      console.log(`  Tx Amount: ₹${linkedTx.amount}`);
      console.log(`  Tx Type  : ${linkedTx.type}`);
      console.log(`  Tx Status: ${linkedTx.status}`);
    }
    console.log(`Wallet Balance after creation: ₹${wallet.totalBalance} (Expected: ₹${(1458.80 - 500).toFixed(2)})`);

    // Assert transaction ID exists
    if (!requestDoc.transactionId) {
      throw new Error('❌ FAIL: transactionId is undefined on the withdrawal request!');
    } else {
      console.log('✅ PASS: transactionId is successfully populated and linked!');
    }

    // ----------------------------------------------------
    // Test Case 2: Approve the Withdrawal Request
    // ----------------------------------------------------
    console.log('\n--- 🧪 Test Case 2: Approve the Withdrawal Request ---');
    const reqApprove = {
      admin: { _id: new mongoose.Types.ObjectId() },
      params: { id: createdRequestId.toString() }
    };

    const resApprove = await runController(approveWithdrawalRequest, reqApprove);
    console.log(`Response Code: ${resApprove.statusCode}`);
    console.log('Response JSON:', JSON.stringify(resApprove.jsonData, null, 2));

    // Check request status and transaction status in DB
    const approvedRequestDoc = await WithdrawalRequest.findById(createdRequestId);
    wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });
    const approvedTx = wallet.transactions.id(approvedRequestDoc.transactionId);

    console.log(`Request Status in DB: ${approvedRequestDoc.status} (Expected: Approved)`);
    console.log(`Transaction Status in DB: ${approvedTx?.status} (Expected: Completed)`);
    console.log(`Final Wallet Balance: ₹${wallet.totalBalance}`);
    console.log(`Final Wallet Total Withdrawn: ₹${wallet.totalWithdrawn}`);

    if (approvedRequestDoc.status === 'Approved' && approvedTx?.status === 'Completed') {
      console.log('✅ PASS: Request approved and transaction marked Completed!');
    } else {
      throw new Error('❌ FAIL: Approve workflow failed');
    }

    // ----------------------------------------------------
    // Test Case 3: Create and Reject Withdrawal Request for ₹300 (Refund Test)
    // ----------------------------------------------------
    console.log('\n--- 🧪 Test Case 3: Create and Reject Withdrawal Request for ₹300 ---');
    const reqCreate2 = {
      restaurant: restaurant,
      body: { amount: 300 }
    };

    const resCreate2 = await runController(createWithdrawalRequest, reqCreate2);
    const createdRequestId2 = resCreate2.jsonData.data.withdrawalRequest.id;

    // Verify balance deducted
    wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });
    console.log(`Wallet Balance after second creation: ₹${wallet.totalBalance} (Expected: ₹${(958.80 - 300).toFixed(2)})`);

    const reqReject = {
      admin: { _id: new mongoose.Types.ObjectId() },
      params: { id: createdRequestId2.toString() },
      body: { rejectionReason: 'KYC mismatch or bank details invalid' }
    };

    const resReject = await runController(rejectWithdrawalRequest, reqReject);
    console.log(`Reject Response Code: ${resReject.statusCode}`);

    const rejectedRequestDoc = await WithdrawalRequest.findById(createdRequestId2);
    wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });
    const rejectedTx = wallet.transactions.id(rejectedRequestDoc.transactionId);

    console.log(`Request Status in DB: ${rejectedRequestDoc.status} (Expected: Rejected)`);
    console.log(`Request Rejection Reason: "${rejectedRequestDoc.rejectionReason}"`);
    console.log(`Transaction Status in DB: ${rejectedTx?.status} (Expected: Cancelled)`);
    console.log(`Wallet Balance after Rejection: ₹${wallet.totalBalance} (Expected refund to: ₹958.80)`);

    if (rejectedRequestDoc.status === 'Rejected' && rejectedTx?.status === 'Cancelled' && Math.abs(wallet.totalBalance - 958.80) < 0.01) {
      console.log('✅ PASS: Request rejected, transaction marked Cancelled, and balance fully refunded!');
    } else {
      throw new Error('❌ FAIL: Reject / Refund workflow failed');
    }

    // Clean up test documents from database so we don't mess up real history
    console.log('\n🧹 Cleaning up test withdrawal requests...');
    await WithdrawalRequest.deleteOne({ _id: createdRequestId });
    await WithdrawalRequest.deleteOne({ _id: createdRequestId2 });

    // Clean up transactions from wallet
    wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });
    wallet.transactions = wallet.transactions.filter(
      (t) => t._id.toString() !== approvedRequestDoc.transactionId.toString() &&
             t._id.toString() !== rejectedRequestDoc.transactionId.toString()
    );
    wallet.totalBalance = 1458.80; // Restore original balance
    wallet.totalWithdrawn = 0;
    await wallet.save();
    console.log('🧹 Wallet transactions cleaned up, balance restored to ₹1458.80.');

  } finally {
    // Restore original schedule settings
    console.log('⚙️ Restoring withdraw schedule settings...');
    settings.withdrawSchedule = originalSchedule;
    await settings.save();
  }

  await mongoose.disconnect();
}

main().catch(console.error);
