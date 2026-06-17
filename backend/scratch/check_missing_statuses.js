/**
 * Check status of all missing orders in Order collection
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

const MISSING = [
  // Kirpa
  'ORD-1775324137277-626','ORD-1778417303037-81','ORD-1778417471649-501',
  'ORD-1778417740473-679','ORD-1778859810522-926','ORD-1781173878252-122',
  'ORD-1781469362078-81',
  // Test Restaurant
  'ORD-1775976534362-42','ORD-1776005709734-374','ORD-1777865996689-431',
  'ORD-1778848278560-698','ORD-1779360711696-824','ORD-1779600177785-963',
  // Be Cafe
  'ORD-1779861267050-278',
  // Always24*7
  'ORD-1777374118344-845',
  // Kanha
  'ORD-1775231560386-706','ORD-1775233411360-261','ORD-1775299847483-824',
  'ORD-1777185091204-834','ORD-1777194145753-691','ORD-1777194449793-46',
  'ORD-1777522582341-57','ORD-1777522839722-806','ORD-1777544341822-332',
  'ORD-1778906300955-377',
  // Diamond
  'ORD-1776776979794-124','ORD-1778282238601-593','ORD-1778741450047-626',
  'ORD-1781284316489-626','ORD-1781514919751-482',
];

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const orders = await db.collection('orders').find(
    { orderId: { $in: MISSING } },
    { projection: { orderId: 1, status: 1, 'pricing.subtotal': 1, restaurantId: 1 } }
  ).toArray();

  const foundIds = new Set(orders.map(o => o.orderId));
  const missing = MISSING.filter(id => !foundIds.has(id));

  console.log(`\n📋 Order statuses for missing wallet entries:\n`);
  const byStatus = {};
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || []);
    byStatus[o.status].push(o.orderId);
    console.log(`  ${o.orderId.padEnd(30)} status=${o.status.padEnd(12)} subtotal=₹${o.pricing?.subtotal}`);
  }

  console.log(`\n📊 By status:`);
  for (const [s, ids] of Object.entries(byStatus)) {
    console.log(`  ${s}: ${ids.length} orders`);
  }

  if (missing.length > 0) {
    console.log(`\n⚠️  NOT FOUND in orders collection (${missing.length}):`);
    missing.forEach(id => console.log(`  ${id}`));
  }

  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
