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

    const wallets = await HotelWallet.find().lean();
    console.log(`Scanning ${wallets.length} hotel wallets...`);

    let totalMismatches = 0;

    for (const wallet of wallets) {
      const hotel = await Hotel.findById(wallet.hotelId).lean();
      if (!hotel) {
        console.log(`Hotel not found for wallet: ${wallet.hotelId}`);
        continue;
      }

      for (const tx of wallet.transactions) {
        if (tx.type !== 'commission') continue;

        const order = await Order.findById(tx.orderId).lean();
        if (!order) {
          console.log(`[MISMATCH - DELETED ORDER] Hotel: ${hotel.hotelName}, Tx ID: ${tx._id}, OrderId: ${tx.orderId} not found in Order collection.`);
          totalMismatches++;
          continue;
        }

        const matchesHotelId = order.hotelId && order.hotelId.toString() === hotel._id.toString();
        const matchesHotelRef = order.hotelReference && (
          order.hotelReference === hotel.hotelId || 
          order.hotelReference === hotel._id.toString()
        );

        if (!matchesHotelId && !matchesHotelRef) {
          console.log(`[MISMATCH - ORDER MISSING HOTEL REFS]`);
          console.log(`  Hotel: ${hotel.hotelName} (${hotel._id})`);
          console.log(`  Order: ${order.orderId} (${order._id})`);
          console.log(`  Order Status: ${order.status}`);
          console.log(`  Order hotelId: ${order.hotelId}`);
          console.log(`  Order hotelReference: ${order.hotelReference}`);
          console.log(`  Order hotelName: ${order.hotelName}`);
          console.log(`  Tx ID: ${tx._id}, Amount: ₹${tx.amount}`);
          totalMismatches++;
        }
      }
    }

    console.log(`\nScan completed. Total mismatched transactions: ${totalMismatches}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

inspect();
