import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Hotel from '../modules/hotel/models/Hotel.js';

dotenv.config();

const inspect = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const hotel = await Hotel.findOne({ hotelName: /Barbarik Palace/i });
    if (!hotel) {
      console.log('Hotel not found!');
      process.exit(0);
    }
    console.log(`Found hotel: ${hotel.hotelName} (${hotel._id})`);

    const orders = await Order.find({
      $or: [
        { hotelId: hotel._id },
        { hotelReference: hotel.hotelId },
        { hotelName: hotel.hotelName }
      ]
    }).lean();

    console.log(`Orders in Order collection: ${orders.length}`);
    const statusCounts = {};
    orders.forEach(o => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });
    console.log('Status counts on Order collection:', statusCounts);

    // Let's check settlements
    const settlements = await OrderSettlement.find({
      $or: [
        { 'hotelEarning.hotelId': hotel._id },
        { 'hotelEarning.hotelId': hotel._id.toString() }
      ]
    }).lean();
    console.log(`Settlements in OrderSettlement: ${settlements.length}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

inspect();
