import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const restaurant = await Restaurant.findOne({ name: /kirpa/i });
    const restaurantIdVariations = [
      restaurant._id.toString(),
      restaurant.restaurantId?.toString(),
    ].filter(Boolean);

    const orders = await Order.find({ restaurantId: { $in: restaurantIdVariations }, status: 'delivered' }).lean();
    const wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });

    console.log(`Delivered orders: ${orders.length}`);
    console.log(`Wallet transactions of type payment: ${wallet.transactions.filter(t => t.type === 'payment').length}`);

    // Find the unmatched orders
    for (const order of orders) {
      const tx = wallet.transactions.find(t => t.type === 'payment' && t.orderId?.toString() === order._id.toString());
      if (!tx) {
        console.log('\nFound UNMATCHED order:');
        console.log({
          _id: order._id,
          orderId: order.orderId,
          status: order.status,
          createdAt: order.createdAt,
          total: order.pricing?.total,
          restaurantId: order.restaurantId
        });
        
        // Check if there is an OrderSettlement
        const settlement = await OrderSettlement.findOne({ orderId: order._id }).lean();
        console.log('Settlement for this order:', settlement);
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
