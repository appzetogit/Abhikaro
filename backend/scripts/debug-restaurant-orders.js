/**
 * Debug: Check restaurant wallet and order counts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const Restaurant = (await import('../modules/restaurant/models/Restaurant.js')).default;
const RestaurantWallet = (await import('../modules/restaurant/models/RestaurantWallet.js')).default;
const Order = (await import('../modules/order/models/Order.js')).default;

async function debug() {
  await mongoose.connect(process.env.MONGODB_URI);
  const restaurants = await Restaurant.find({}).select('_id name restaurantId').lean();
  for (const r of restaurants) {
    const deliveredCount = await Order.countDocuments({ status: 'delivered', restaurantId: r._id.toString() });
    const wallet = await RestaurantWallet.findOne({ restaurantId: r._id });
    if (deliveredCount > 0) {
      console.log(r.name, r.restaurantId, '- delivered:', deliveredCount, 'wallet:', wallet?.totalBalance ?? 0);
    }
  }
  await mongoose.connection.close();
}
debug().catch(console.error);
