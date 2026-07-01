import mongoose from 'mongoose';
import WithdrawalRequest from '../modules/restaurant/models/WithdrawalRequest.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import dotenv from 'dotenv';
dotenv.config();

const printAllWithdrawals = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database.');

    // 1. Fetch all requests from WithdrawalRequest collection
    const collectionRequests = await WithdrawalRequest.find({}).lean();
    console.log(`\n--- WithdrawalRequest Collection (${collectionRequests.length} records) ---`);
    collectionRequests.forEach((req, index) => {
      console.log(`${index + 1}. DB Collection | ID: ${req._id} | Restaurant: ${req.restaurantName || 'N/A'} (ID: ${req.restaurantIdString || 'N/A'}) | Amount: ₹${req.amount} | Status: ${req.status}`);
    });

    // 2. Fetch all wallet withdrawal transactions
    const wallets = await RestaurantWallet.find({}).lean();
    console.log(`\n--- Wallet Ledger Withdrawal Transactions ---`);
    let count = 0;
    for (const wallet of wallets) {
      const restaurant = await Restaurant.findById(wallet.restaurantId).select('name restaurantId').lean();
      const restName = restaurant ? restaurant.name : 'Unknown';
      const restIdStr = restaurant ? restaurant.restaurantId : wallet.restaurantId.toString();

      const walletWithdrawals = (wallet.transactions || []).filter(t => t.type === 'withdrawal');
      for (const tx of walletWithdrawals) {
        count++;
        console.log(`${count}. Wallet Ledger | Tx ID: ${tx._id} | Restaurant: ${restName} (ID: ${restIdStr}) | Amount: ₹${tx.amount} | Status: ${tx.status} | Description: ${tx.description} | Date: ${tx.createdAt}`);
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error running script:', error);
    process.exit(1);
  }
};

printAllWithdrawals();
