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
    const wallet = await HotelWallet.findOne({ hotelId: hotel._id }).lean();

    console.log('--- Unlinked Transactions ---');
    let totalUnlinkedAmount = 0;
    for (const tx of wallet.transactions) {
      if (tx.type !== 'commission') continue;

      let order = await Order.findById(tx.orderId).lean();
      if (!order && tx.description) {
        const match = tx.description.match(/ORD-\d+-\d+/);
        if (match) {
          order = await Order.findOne({ orderId: match[0] }).lean();
        }
      }

      if (order) {
        const hasHotelId = order.hotelId && order.hotelId.toString() === hotel._id.toString();
        const hasHotelRef = order.hotelReference && (order.hotelReference === hotel.hotelId || order.hotelReference === hotel._id.toString());
        if (!hasHotelId && !hasHotelRef) {
          console.log(`OrderID: ${order.orderId}, Status: ${order.status}, Tx Amount: ${tx.amount}, Description: ${tx.description}`);
          totalUnlinkedAmount += tx.amount;
        }
      } else {
        console.log(`Tx with NO ORDER: Amount: ${tx.amount}, Description: ${tx.description}`);
        totalUnlinkedAmount += tx.amount;
      }
    }
    console.log(`Total Unlinked Amount: ${totalUnlinkedAmount}`);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

inspect();
