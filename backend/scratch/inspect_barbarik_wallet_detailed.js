import mongoose from 'mongoose';
import Hotel from '../modules/hotel/models/Hotel.js';
import HotelWallet from '../modules/hotel/models/HotelWallet.js';
import Order from '../modules/order/models/Order.js';
import dotenv from 'dotenv';
dotenv.config();

const inspect = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const hotel = await Hotel.findOne({ hotelName: /Barbarik Palace/i });
    if (!hotel) {
      console.log('Hotel not found!');
      process.exit(0);
    }
    console.log(`Found hotel: ${hotel.hotelName} (${hotel._id})`);

    const wallet = await HotelWallet.findOne({ hotelId: hotel._id }).lean();
    if (!wallet) {
      console.log('Wallet not found!');
      process.exit(0);
    }

    console.log(`Wallet Balance: ${wallet.totalBalance}`);
    console.log(`Total Earned: ${wallet.totalEarned}`);
    console.log(`Total Withdrawn: ${wallet.totalWithdrawn}`);
    console.log(`Transactions count: ${wallet.transactions.length}`);

    console.log('\n--- Transactions list ---');
    let totalCompletedCommissions = 0;
    let completedDeliveredCommissions = 0;
    let completedCancelledCommissions = 0;

    for (const tx of wallet.transactions) {
      let orderStatus = 'N/A';
      let orderIdStr = 'N/A';
      if (tx.orderId) {
        const order = await Order.findById(tx.orderId).lean();
        if (order) {
          orderStatus = order.status;
          orderIdStr = order.orderId;
        }
      }
      console.log(`Tx ID: ${tx._id}, Amount: ₹${tx.amount}, Type: ${tx.type}, Status: ${tx.status}, OrderId: ${orderIdStr}, OrderStatus: ${orderStatus}, Description: ${tx.description}`);

      if (tx.status === 'Completed' && tx.type === 'commission') {
        totalCompletedCommissions += tx.amount;
        if (orderStatus === 'delivered') {
          completedDeliveredCommissions += tx.amount;
        } else if (orderStatus === 'cancelled') {
          completedCancelledCommissions += tx.amount;
        }
      }
    }

    console.log(`\nCalculated Sum of Completed Commissions: ₹${totalCompletedCommissions}`);
    console.log(`Delivered Completed Commissions: ₹${completedDeliveredCommissions}`);
    console.log(`Cancelled Completed Commissions: ₹${completedCancelledCommissions}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

inspect();
