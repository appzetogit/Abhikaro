import mongoose from 'mongoose';
import Hotel from '../modules/hotel/models/Hotel.js';
import Order from '../modules/order/models/Order.js';
import { getHotelCommissionFromOrder } from '../modules/order/utils/hotelCommissionBase.js';
import dotenv from 'dotenv';
dotenv.config();

const calculate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const hotel = await Hotel.findOne({ hotelName: /Barbarik Palace/i });
    if (!hotel) {
      console.log('Hotel not found!');
      process.exit(0);
    }
    console.log(`Found hotel: ${hotel.hotelName} (${hotel._id})`);

    const query = {
      $or: [
        { hotelId: hotel._id },
        { hotelReference: hotel.hotelId },
        { hotelReference: hotel._id.toString() }
      ]
    };

    const allOrders = await Order.find(query).lean();
    console.log(`Total orders found: ${allOrders.length}`);

    // Group by status
    const byStatus = {};
    allOrders.forEach(o => {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    });
    console.log('Status counts:', byStatus);

    // Sum of pricing.total by status
    const totalAmountByStatus = {};
    const hotelCommissionByStatus = {};
    const hotelPct = hotel.commission || 10;

    allOrders.forEach(o => {
      const tot = o.pricing?.total || 0;
      const comm = getHotelCommissionFromOrder(o, hotelPct);
      totalAmountByStatus[o.status] = (totalAmountByStatus[o.status] || 0) + tot;
      hotelCommissionByStatus[o.status] = (hotelCommissionByStatus[o.status] || 0) + comm;
    });

    console.log('\nTotal Amount by Status:', totalAmountByStatus);
    console.log('Hotel Commission by Status:', hotelCommissionByStatus);

    // Sum of all delivered
    const deliveredCount = byStatus['delivered'] || 0;
    const deliveredTotal = totalAmountByStatus['delivered'] || 0;
    const deliveredComm = hotelCommissionByStatus['delivered'] || 0;

    console.log(`\nDelivered Only:`);
    console.log(`  Count: ${deliveredCount}`);
    console.log(`  Total Amount: ₹${deliveredTotal}`);
    console.log(`  Total Commission: ₹${deliveredComm}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

calculate();
