import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';
import Hotel from './modules/hotel/models/Hotel.js';

dotenv.config();

async function runCheck() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const qrOrders = await Order.find({ hotelReference: { $ne: null } });
    console.log(`Total QR Orders: ${qrOrders.length}`);

    const uniqueRefs = [...new Set(qrOrders.map(o => o.hotelReference).filter(Boolean))];
    console.log(`Unique hotel references: ${uniqueRefs.length}`);

    const resolveMap = {};
    const unresolvable = [];

    for (const ref of uniqueRefs) {
      let hotel = await Hotel.findOne({ hotelId: ref });
      if (!hotel && mongoose.Types.ObjectId.isValid(ref)) {
        hotel = await Hotel.findById(ref);
      }
      if (hotel) {
        resolveMap[ref] = {
          id: hotel._id,
          hotelName: hotel.hotelName,
          commission: hotel.commission,
          adminCommission: hotel.adminCommission
        };
      } else {
        unresolvable.push(ref);
      }
    }

    console.log('\n--- RESOLVED HOTELS MAP ---');
    console.log(JSON.stringify(resolveMap, null, 2));

    console.log('\n--- UNRESOLVED REFERENCES ---');
    console.log(JSON.stringify(unresolvable, null, 2));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

runCheck();
