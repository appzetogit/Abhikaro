import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const restaurant = await Restaurant.findOne({
    $or: [
      { restaurantId: 'REST-1775300439918-3090' },
      { 'onboarding.step1.restaurantName': /maa karni/i },
      { name: /maa karni/i }
    ]
  }).lean();

  const settlements = await OrderSettlement.find({
    restaurantId: restaurant._id
  }).select('orderId orderNumber restaurantEarning').lean();

  console.log(`📋 Total settlements for Maa Karni: ${settlements.length}`);

  let foundInOrders = 0;
  let missingInOrders = 0;

  for (const s of settlements) {
    const orderExists = await Order.exists({ _id: s.orderId });
    const orderIdStr = s.orderId?.toString();
    if (orderExists) {
      foundInOrders++;
      // console.log(`  ✅ Order ${s.orderNumber} (ID: ${orderIdStr}) exists in Order collection`);
    } else {
      missingInOrders++;
      console.log(`  ❌ Order ${s.orderNumber} (ID: ${orderIdStr}) is MISSING from Order collection!`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Found in Order collection   : ${foundInOrders}`);
  console.log(`  Missing in Order collection : ${missingInOrders}`);

  await mongoose.disconnect();
}

main().catch(console.error);
