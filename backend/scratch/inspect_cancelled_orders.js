import mongoose from 'mongoose';
import Hotel from '../modules/hotel/models/Hotel.js';
import HotelWallet from '../modules/hotel/models/HotelWallet.js';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
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

    const cancelledOrders = await Order.find({
      $or: [
        { hotelId: hotel._id },
        { hotelReference: hotel.hotelId },
        { hotelName: hotel.hotelName }
      ],
      status: 'cancelled'
    }).lean();

    console.log(`\nCancelled orders count: ${cancelledOrders.length}`);

    for (const order of cancelledOrders) {
      console.log(`\n----------------------------`);
      console.log(`Order ID: ${order.orderId} (${order._id})`);
      console.log(`Status: ${order.status}`);
      console.log(`Pricing Total: ₹${order.pricing?.total}`);
      console.log(`Hotel Commission Field: ₹${order.hotelCommission}`);
      console.log(`Commission Breakdown Hotel: ₹${order.commissionBreakdown?.hotel}`);

      const settlement = await OrderSettlement.findOne({ orderId: order._id }).lean();
      console.log(`Settlement: ${settlement ? 'FOUND' : 'NOT FOUND'}`);
      if (settlement) {
        console.log(`  - Hotel Earning in Settlement: ₹${settlement.hotelEarning?.commission}`);
        console.log(`  - Settlement Status: ${settlement.status}`);
      }

      const wallet = await HotelWallet.findOne({ hotelId: hotel._id }).lean();
      const tx = wallet.transactions.find(t => t.orderId && t.orderId.toString() === order._id.toString());
      console.log(`Wallet Transaction: ${tx ? 'FOUND' : 'NOT FOUND'}`);
      if (tx) {
        console.log(`  - Tx ID: ${tx._id}, Amount: ₹${tx.amount}, Type: ${tx.type}, Status: ${tx.status}, Description: ${tx.description}`);
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

inspect();
