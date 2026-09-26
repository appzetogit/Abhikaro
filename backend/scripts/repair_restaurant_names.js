import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({}, { strict: false }));
  const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
  const OrderSettlement = mongoose.model('OrderSettlement', new mongoose.Schema({}, { strict: false }));

  // 1. Repair restaurants with generic names
  const genericRestaurants = await Restaurant.find({
    name: /^Restaurant\s*\d+$/i
  });

  console.log(`Found ${genericRestaurants.length} restaurants with generic names.`);

  for (const r of genericRestaurants) {
    const step1Name = r.onboarding?.step1?.restaurantName?.trim();
    const step1Owner = r.onboarding?.step1?.ownerName?.trim();
    if (step1Name) {
      console.log(`Updating Restaurant ${r._id} (${r.name}) -> Name: "${step1Name}", Owner: "${step1Owner || r.ownerName}"`);
      const baseSlug = step1Name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const updateDoc = {
        name: step1Name,
        ...(step1Owner ? { ownerName: step1Owner } : {}),
        ...(baseSlug ? { slug: baseSlug } : {})
      };
      const res = await Restaurant.updateOne({ _id: r._id }, { $set: updateDoc });
      console.log(`Update result for ${r._id}:`, res);
    } else {
      console.log(`Restaurant ${r._id} (${r.name}) has no onboarding step1 restaurantName.`);
    }
  }

  // 2. Check orders where restaurantName is generic
  const genericOrders = await Order.find({
    restaurantName: /^Restaurant\s*\d+$/i
  });

  console.log(`Found ${genericOrders.length} orders with generic restaurant names.`);

  for (const o of genericOrders) {
    if (!o.restaurantId) continue;
    const query = {
      $or: [
        { restaurantId: o.restaurantId },
        ...(mongoose.Types.ObjectId.isValid(o.restaurantId) ? [{ _id: new mongoose.Types.ObjectId(o.restaurantId) }] : [])
      ]
    };
    const rest = await Restaurant.findOne(query).lean();
    const genuineName = rest?.onboarding?.step1?.restaurantName?.trim() || 
                       (!/^Restaurant\s*\d+$/i.test(rest?.name || "") ? rest?.name?.trim() : null);

    if (genuineName) {
      console.log(`Updating Order ${o.orderId} (${o.restaurantName}) -> "${genuineName}"`);
      await Order.updateOne({ _id: o._id }, { $set: { restaurantName: genuineName } });
      await OrderSettlement.updateMany({ orderId: o._id }, { $set: { restaurantName: genuineName } });
    } else {
      console.log(`Order ${o.orderId} (${o.restaurantName}) restaurantId ${o.restaurantId} has no genuine name.`);
    }
  }

  console.log('Done!');
  await mongoose.disconnect();
}

run().catch(console.error);
