import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import HotelWallet from '../modules/hotel/models/HotelWallet.js';
import DeliveryWallet from '../modules/delivery/models/DeliveryWallet.js';
import UserWallet from '../modules/user/models/UserWallet.js';
import AdminWallet from '../modules/admin/models/AdminWallet.js';
import { isWithdrawAllowedNow } from '../shared/utils/withdrawSchedule.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  console.log('--- 🧪 Testing addTransaction Returned Values ---');

  // 1. RestaurantWallet
  const restWallet = new RestaurantWallet({ restaurantId: new mongoose.Types.ObjectId() });
  const restTx = restWallet.addTransaction({
    amount: 100,
    type: 'payment',
    status: 'Completed',
    description: 'Test transaction'
  });
  console.log(`RestaurantWallet Transaction ID exists: ${!!restTx._id} (ID: ${restTx._id})`);

  // 2. HotelWallet
  const hotelWallet = new HotelWallet({ hotelId: new mongoose.Types.ObjectId() });
  const hotelTx = hotelWallet.addTransaction({
    amount: 100,
    type: 'commission',
    status: 'Completed',
    description: 'Test transaction'
  });
  console.log(`HotelWallet Transaction ID exists: ${!!hotelTx._id} (ID: ${hotelTx._id})`);

  // 3. DeliveryWallet
  const deliveryWallet = new DeliveryWallet({ deliveryId: new mongoose.Types.ObjectId() });
  const deliveryTx = deliveryWallet.addTransaction({
    amount: 100,
    type: 'payment',
    status: 'Completed',
    description: 'Test transaction'
  });
  console.log(`DeliveryWallet Transaction ID exists: ${!!deliveryTx._id} (ID: ${deliveryTx._id})`);

  // 4. UserWallet
  const userWallet = new UserWallet({ userId: new mongoose.Types.ObjectId() });
  const userTx = userWallet.addTransaction({
    amount: 100,
    type: 'addition',
    status: 'Completed',
    description: 'Test transaction'
  });
  console.log(`UserWallet Transaction ID exists: ${!!userTx._id} (ID: ${userTx._id})`);

  // 5. AdminWallet
  const adminWallet = new AdminWallet();
  const adminTx = adminWallet.addTransaction({
    amount: 100,
    type: 'commission',
    status: 'Completed',
    description: 'Test transaction'
  });
  console.log(`AdminWallet Transaction ID exists: ${!!adminTx._id} (ID: ${adminTx._id})`);

  console.log('\n--- 🧪 Testing isWithdrawAllowedNow Schedule ---');
  const allowedResult = await isWithdrawAllowedNow();
  console.log('Schedule check result:', allowedResult);

  await mongoose.disconnect();
}

main().catch(console.error);
