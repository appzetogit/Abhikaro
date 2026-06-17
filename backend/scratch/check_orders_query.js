import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import Order from '../modules/order/models/Order.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // Find Maa Karni Restaurant
  const restaurant = await Restaurant.findOne({
    $or: [
      { restaurantId: 'REST-1775300439918-3090' },
      { 'onboarding.step1.restaurantName': /maa karni/i },
      { name: /maa karni/i }
    ]
  }).lean();

  if (!restaurant) {
    console.error('❌ Restaurant not found');
    process.exit(1);
  }

  const restaurantMongoId = restaurant._id.toString();
  const restaurantPublicId = restaurant.restaurantId;
  const restaurantSlug = restaurant.slug;
  const idVariations = [restaurantMongoId, restaurantPublicId, restaurantSlug].filter(Boolean);

  console.log('Restaurant ID variations:', idVariations);

  const allOrdersCount = await Order.countDocuments({
    restaurantId: { $in: idVariations }
  });
  console.log('Total orders in Order collection (any status):', allOrdersCount);

  const deliveredOrdersCount = await Order.countDocuments({
    restaurantId: { $in: idVariations },
    status: 'delivered'
  });
  console.log('Delivered orders in Order collection:', deliveredOrdersCount);

  const cancelledOrdersCount = await Order.countDocuments({
    restaurantId: { $in: idVariations },
    status: 'cancelled'
  });
  console.log('Cancelled orders in Order collection:', cancelledOrdersCount);

  const settlementsCount = await OrderSettlement.countDocuments({
    restaurantId: restaurant._id
  });
  console.log('Total settlements in OrderSettlement collection:', settlementsCount);

  // Let's check the restaurantName stored on the orders
  const sampleOrders = await Order.find({
    restaurantId: { $in: idVariations }
  }).limit(5).select('orderId restaurantId restaurantName status').lean();
  console.log('Sample orders in Order collection:', sampleOrders);

  await mongoose.disconnect();
}

main().catch(console.error);
