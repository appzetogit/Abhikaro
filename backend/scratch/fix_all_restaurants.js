/**
 * Fix all restaurants: Run OrderSettlement-based backfill for every restaurant
 * Run: node scratch/fix_all_restaurants.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

const TARGET_RESTAURANTS = [
  { name: 'Always24*7',                  id: 'REST-RESTORED-69f06de39a84943f93d89c8f', mongoId: '69f06de39a84943f93d89c8f' },
  { name: 'Ravi Cafe New',               id: 'REST-1775654119641-6129' },
  { name: 'Om Restaurant & Sweets',      id: 'REST-1777442447531-4747' },
  { name: 'Shree shyam restaurant',      id: 'REST-1779101567693-2213' },
  { name: 'Test Restaurant',             id: 'REST-RESTORED-69d654e7c86eb9b6c8399c62', mongoId: '69d654e7c86eb9b6c8399c62' },
  { name: 'Kirpa restaurant&cafe',       id: 'REST-1773051256895-8708' },
  { name: 'Be Cafe By Bharat Petroleum', id: 'REST-1775451702498-3994' },
  { name: 'Kanha restaurant',            id: 'REST-1774263086335-7655' },
  { name: 'Diamond Resort & Restaurant', id: 'REST-1773908892693-60' },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const { default: Restaurant }       = await import('../modules/restaurant/models/Restaurant.js');
  const { default: RestaurantWallet } = await import('../modules/restaurant/models/RestaurantWallet.js');
  const { default: OrderSettlement }  = await import('../modules/order/models/OrderSettlement.js');

  const results = [];

  for (const target of TARGET_RESTAURANTS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🏪 ${target.name} (${target.id})`);

    // ── 1. Find restaurant ────────────────────────────────────────
    const orClauses = [{ restaurantId: target.id }];
    if (target.mongoId && mongoose.Types.ObjectId.isValid(target.mongoId)) {
      orClauses.push({ _id: new mongoose.Types.ObjectId(target.mongoId) });
    }
    const restaurant = await Restaurant.findOne({ $or: orClauses }).lean();

    if (!restaurant) {
      console.log('   ⚠️  Restaurant NOT FOUND in DB — skipping');
      results.push({ name: target.name, id: target.id, status: 'NOT_FOUND' });
      continue;
    }

    const rid = restaurant._id;
    console.log(`   _id: ${rid}`);

    // ── 2. Snapshot before ────────────────────────────────────────
    const walletBefore = await RestaurantWallet.findOne({ restaurantId: rid }).lean();
    const balBefore  = walletBefore?.totalBalance  ?? 0;
    const earnBefore = walletBefore?.totalEarned   ?? 0;
    const txBefore   = walletBefore?.transactions?.length ?? 0;

    // ── 3. Check settlements ──────────────────────────────────────
    const settlementCount = await OrderSettlement.countDocuments({
      restaurantId: new mongoose.Types.ObjectId(rid.toString()),
    });
    const settlementTotal = await OrderSettlement.aggregate([
      { $match: { restaurantId: new mongoose.Types.ObjectId(rid.toString()) } },
      { $group: { _id: null, total: { $sum: '$restaurantEarning.netEarning' } } },
    ]);
    const expectedFromSettlements = settlementTotal[0]?.total ?? 0;

    console.log(`   Before  → balance: ₹${balBefore}  earned: ₹${earnBefore}  txns: ${txBefore}`);
    console.log(`   Settlements in DB: ${settlementCount}  (total netEarning: ₹${expectedFromSettlements.toFixed(2)})`);

    // ── 4. Run fix ────────────────────────────────────────────────
    try {
      const wallet = await RestaurantWallet.findOrCreateByRestaurantId(rid);
      const balAfter  = wallet.totalBalance;
      const earnAfter = wallet.totalEarned;
      const txAfter   = wallet.transactions?.length ?? 0;
      const diff      = balAfter - balBefore;

      console.log(`   After   → balance: ₹${balAfter}  earned: ₹${earnAfter}  txns: ${txAfter}`);
      if (diff > 0.01) {
        console.log(`   ✅ FIXED  +₹${diff.toFixed(2)} added  (${txAfter - txBefore} new transactions)`);
      } else if (Math.abs(diff) < 0.01) {
        console.log(`   ✓  No change needed — wallet already correct`);
      } else {
        console.log(`   ⚠️  Balance DECREASED by ₹${Math.abs(diff).toFixed(2)} (cleanup removed ghost txns)`);
      }

      results.push({
        name: target.name,
        id: target.id,
        before: balBefore,
        after: balAfter,
        diff,
        txBefore,
        txAfter,
        settlementCount,
        expectedFromSettlements,
        status: 'OK',
      });
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      results.push({ name: target.name, id: target.id, status: 'ERROR', error: err.message });
    }
  }

  // ── Summary table ────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(90)}`);
  console.log('📊 SUMMARY');
  console.log('═'.repeat(90));
  console.log(
    'Restaurant'.padEnd(32) +
    'Before'.padStart(12) +
    'After'.padStart(14) +
    'Change'.padStart(12) +
    'Txns'.padStart(8) +
    '  Status'
  );
  console.log('─'.repeat(90));
  for (const r of results) {
    if (r.status === 'NOT_FOUND') {
      console.log(r.name.padEnd(32) + '  NOT FOUND IN DATABASE');
    } else if (r.status === 'ERROR') {
      console.log(r.name.padEnd(32) + `  ERROR: ${r.error}`);
    } else {
      const changeStr = r.diff > 0.01 ? `+₹${r.diff.toFixed(2)}` : r.diff < -0.01 ? `-₹${Math.abs(r.diff).toFixed(2)}` : 'no change';
      console.log(
        r.name.padEnd(32) +
        `₹${r.before.toFixed(2)}`.padStart(12) +
        `₹${r.after.toFixed(2)}`.padStart(14) +
        changeStr.padStart(12) +
        `${r.txBefore}→${r.txAfter}`.padStart(8) +
        `  ${r.diff > 0.01 ? '✅ FIXED' : '✓ OK'}`
      );
    }
  }
  console.log('═'.repeat(90));

  await mongoose.disconnect();
  console.log('\n✅ All done');
}

main().catch(e => { console.error(e); process.exit(1); });
