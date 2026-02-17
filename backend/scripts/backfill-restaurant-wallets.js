/**
 * Backfill restaurant wallets for delivered orders that were never credited.
 * Run: node scripts/backfill-restaurant-wallets.js
 *
 * Use --dry-run to preview without making changes.
 * Use --restaurant-id=REST005320 to limit to one restaurant.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const Order = (await import('../modules/order/models/Order.js')).default;
const Restaurant = (await import('../modules/restaurant/models/Restaurant.js')).default;
const RestaurantWallet = (await import('../modules/restaurant/models/RestaurantWallet.js')).default;
const RestaurantCommission = (await import('../modules/admin/models/RestaurantCommission.js')).default;

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.argv.includes('--dry-run');
const RESTAURANT_FILTER = process.argv.find((a) => a.startsWith('--restaurant-id='))?.split('=')[1];

async function backfill() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    if (DRY_RUN) console.log('🔍 DRY RUN - no changes will be made\n');

    const query = { status: 'delivered' };
    if (RESTAURANT_FILTER) {
      // Orders may store restaurantId as "REST005320" or as MongoDB ObjectId string
      const restaurantDoc = await Restaurant.findOne({
        $or: [
          { restaurantId: RESTAURANT_FILTER },
          { slug: RESTAURANT_FILTER },
          ...(mongoose.Types.ObjectId.isValid(RESTAURANT_FILTER) && RESTAURANT_FILTER.length === 24
            ? [{ _id: new mongoose.Types.ObjectId(RESTAURANT_FILTER) }]
            : []),
        ],
      })
        .select('_id restaurantId')
        .lean();
      if (restaurantDoc) {
        const ids = [RESTAURANT_FILTER, restaurantDoc._id.toString()].filter(Boolean);
        query.restaurantId = { $in: [...new Set(ids)] };
        console.log(`Filtering by restaurant: ${RESTAURANT_FILTER} (ids: ${ids.join(', ')})\n`);
      } else {
        query.restaurantId = RESTAURANT_FILTER;
        console.log(`Filtering by restaurantId: ${RESTAURANT_FILTER}\n`);
      }
    }

    const orders = await Order.find(query)
      .select('_id orderId restaurantId restaurantName pricing status')
      .lean();

    console.log(`Found ${orders.length} delivered orders\n`);

    let credited = 0;
    let skipped = 0;
    let errors = 0;

    for (const order of orders) {
      const orderIdForLog = order.orderId || order._id?.toString();
      const orderIdForTx = order._id?.toString?.() || order._id;

      let restaurant = null;
      if (mongoose.Types.ObjectId.isValid(order.restaurantId) && order.restaurantId?.length === 24) {
        restaurant = await Restaurant.findById(order.restaurantId).select('_id restaurantId name').lean();
      }
      if (!restaurant) {
        restaurant = await Restaurant.findOne({
          $or: [{ restaurantId: order.restaurantId }, { slug: order.restaurantId }],
        })
          .select('_id restaurantId name')
          .lean();
      }

      if (!restaurant) {
        console.warn(`⚠️ Restaurant not found for order ${orderIdForLog}, skipping`);
        skipped++;
        continue;
      }

      const wallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurant._id);
      const existingTx = wallet.transactions?.find(
        (t) => t.orderId?.toString() === orderIdForTx && t.type === 'payment'
      );

      if (existingTx) {
        skipped++;
        continue;
      }

      const orderTotal = order.pricing?.subtotal || order.pricing?.total || 0;
      if (orderTotal <= 0) {
        skipped++;
        continue;
      }

      const commissionResult = await RestaurantCommission.calculateCommissionForOrder(
        restaurant._id,
        orderTotal
      );
      const commissionAmount = commissionResult.commission || 0;
      const restaurantEarning = orderTotal - commissionAmount;

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would credit ₹${restaurantEarning.toFixed(2)} to ${restaurant.name || restaurant.restaurantId} for order ${orderIdForLog}`);
        credited++;
        continue;
      }

      try {
        wallet.addTransaction({
          amount: restaurantEarning,
          type: 'payment',
          status: 'Completed',
          description: `Backfill: Order #${orderIdForLog} - Amount: ₹${orderTotal.toFixed(2)}, Commission: ₹${commissionAmount.toFixed(2)}`,
          orderId: order._id,
        });
        await wallet.save();
        console.log(`✅ Credited ₹${restaurantEarning.toFixed(2)} to ${restaurant.name || restaurant.restaurantId} for order ${orderIdForLog}`);
        credited++;
      } catch (err) {
        console.error(`❌ Error crediting order ${orderIdForLog}:`, err.message);
        errors++;
      }
    }

    console.log(`\nDone. Credited: ${credited}, Skipped: ${skipped}, Errors: ${errors}`);
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

backfill();
