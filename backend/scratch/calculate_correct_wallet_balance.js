import mongoose from 'mongoose';
import Hotel from '../modules/hotel/models/Hotel.js';
import HotelWallet from '../modules/hotel/models/HotelWallet.js';
import dotenv from 'dotenv';
dotenv.config();

const calculate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const hotel = await Hotel.findOne({ hotelName: /Barbarik Palace/i });
    const wallet = await HotelWallet.findOne({ hotelId: hotel._id }).lean();

    console.log('--- Unique Order Commission Sum ---');
    const seenOrders = new Set();
    let uniqueCommissionSum = 0;
    const duplicates = [];

    for (const tx of wallet.transactions) {
      if (tx.type === 'commission') {
        const orderIdStr = tx.orderId ? tx.orderId.toString() : tx.description;
        if (seenOrders.has(orderIdStr)) {
          duplicates.push(tx);
        } else {
          seenOrders.add(orderIdStr);
          uniqueCommissionSum += tx.amount;
        }
      }
    }

    console.log('Duplicate transactions found:');
    duplicates.forEach(tx => {
      console.log(`- Amount: ${tx.amount}, OrderId: ${tx.orderId}, Description: ${tx.description}`);
    });

    const duplicateSum = duplicates.reduce((sum, tx) => sum + tx.amount, 0);
    console.log(`\nCurrent wallet totalBalance: ${wallet.totalBalance}`);
    console.log(`Current wallet totalEarned: ${wallet.totalEarned}`);
    console.log(`Duplicate credits sum: ${duplicateSum}`);
    console.log(`Correct wallet balance (current - duplicates): ${wallet.totalBalance - duplicateSum}`);

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

calculate();
