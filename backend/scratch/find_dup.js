import mongoose from 'mongoose';
import 'dotenv/config';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

async function findDup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected');

    const duplicates = await Restaurant.find({
      $or: [
        { phone: '919660499649' },
        { ownerPhone: '919660499649' },
        { primaryContactNumber: '919660499649' },
        { phone: '9660499649' },
        { ownerPhone: '9660499649' },
        { primaryContactNumber: '9660499649' }
      ]
    });

    console.log('Found duplicates count:', duplicates.length);
    duplicates.forEach(d => {
      console.log({
        _id: d._id,
        restaurantId: d.restaurantId,
        name: d.name,
        phone: d.phone,
        ownerPhone: d.ownerPhone,
        primaryContactNumber: d.primaryContactNumber
      });
    });

  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

findDup();
