import mongoose from 'mongoose';
import dotenv from 'dotenv';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';

dotenv.config();

const run = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to Database. Zeroing balances and clearing transaction history for all restaurant wallets...');

    const res = await RestaurantWallet.updateMany({}, {
      $set: {
        totalBalance: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
        transactions: [],
        withdrawalRequests: []
      }
    });

    console.log(`Successfully cleared ${res.modifiedCount} restaurant wallets.`);
    await mongoose.disconnect();
    console.log('Disconnected from Database.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

run();
