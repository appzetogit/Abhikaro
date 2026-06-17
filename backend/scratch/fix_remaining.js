/**
 * TARGETED FIX: Apply wallet backfill for all remaining mismatches
 * Skips Diamond Resort (wallet > settlements — legitimate Order-based entries)
 * Run: node scratch/fix_remaining.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

// All remaining restaurants that need fixing (by mongoId)
const TO_FIX = [
  { name: 'Kirpa restaurant&cafe',       mongoId: '69ae9d787592fd06e444100c' },
  { name: 'Test Restaurant',             mongoId: '69d654e7c86eb9b6c8399c62' },
  { name: 'Be Cafe By Bharat Petroleum', mongoId: '69d33e36f6a1e085a67bcbfc' },
  { name: 'Always24*7',                  mongoId: '69f06de39a84943f93d89c8f' },
  { name: 'Kanha restaurant',            mongoId: '69c11b2e986136d667a656f0' },
  { name: 'Diamond Resort & Restaurant', mongoId: '69bbb39c4730b941918104ed' }, // audit only
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const { default: RestaurantWallet } = await import('../modules/restaurant/models/RestaurantWallet.js');
  const { default: OrderSettlement }  = await import('../modules/order/models/OrderSettlement.js');
  const { default: Order }            = await import('../modules/order/models/Order.js');

  for (const target of TO_FIX) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🏪  ${target.name}  (${target.mongoId})`);
    const rid = new mongoose.Types.ObjectId(target.mongoId);

    // ── Wallet snapshot before ─────────────────────────────────
    const before = await RestaurantWallet.findOne({ restaurantId: rid }).lean();
    console.log(`   Before: balance=₹${before?.totalBalance ?? 0}  earned=₹${before?.totalEarned ?? 0}  txns=${before?.transactions?.length ?? 0}`);

    // ── All settlements for this restaurant ───────────────────
    const settlements = await OrderSettlement.find({ restaurantId: rid })
      .select('orderId orderNumber restaurantEarning')
      .lean();

    console.log(`\n   📋 All ${settlements.length} OrderSettlements:`);
    console.log('   ' + '─'.repeat(66));
    console.log(
      '   ' +
      '#'.padEnd(4) +
      'Order'.padEnd(30) +
      'NetEarning'.padStart(12) +
      'Status'.padStart(12) +
      'In Wallet'.padStart(12)
    );
    console.log('   ' + '─'.repeat(66));

    // Build wallet orderId set
    const walletPayTxIds = new Set(
      (before?.transactions ?? [])
        .filter(t => t.type === 'payment' && t.orderId)
        .map(t => t.orderId.toString())
    );

    let totalSettlementNet = 0;
    let missingCount = 0;
    let missingAmount = 0;

    settlements.forEach((s, i) => {
      const net    = Number(s.restaurantEarning?.netEarning ?? 0);
      const status = s.restaurantEarning?.status ?? 'unknown';
      const inWallet = walletPayTxIds.has(s.orderId?.toString()) ? '✅ YES' : '❌ NO';
      totalSettlementNet += net;
      if (!walletPayTxIds.has(s.orderId?.toString())) {
        missingCount++;
        missingAmount += net;
      }
      console.log(
        '   ' +
        `${i + 1}`.padEnd(4) +
        (s.orderNumber ?? '—').padEnd(30) +
        `₹${net.toFixed(2)}`.padStart(12) +
        status.padStart(12) +
        inWallet.padStart(12)
      );
    });

    console.log('   ' + '─'.repeat(66));
    console.log(`   Total settlement netEarning : ₹${totalSettlementNet.toFixed(2)}`);
    console.log(`   Missing from wallet         : ${missingCount} orders  (₹${missingAmount.toFixed(2)})`);
    console.log(`   Wallet current earned       : ₹${before?.totalEarned ?? 0}`);

    // ── Run fix ───────────────────────────────────────────────
    console.log('\n   🔄 Running fix...');
    const wallet = await RestaurantWallet.findOrCreateByRestaurantId(rid);
    const balAfter  = wallet.totalBalance;
    const earnAfter = wallet.totalEarned;
    const txAfter   = wallet.transactions?.length ?? 0;

    const balBefore  = before?.totalBalance  ?? 0;
    const earnBefore = before?.totalEarned   ?? 0;
    const txBefore   = before?.transactions?.length ?? 0;

    const earnDiff = earnAfter - earnBefore;
    const balDiff  = balAfter  - balBefore;

    console.log(`   After : balance=₹${balAfter.toFixed(2)}  earned=₹${earnAfter.toFixed(2)}  txns=${txAfter}`);
    if (earnDiff > 0.01) {
      console.log(`   ✅ FIXED: +₹${earnDiff.toFixed(2)} earned  |  ${txAfter - txBefore} new transactions`);
    } else if (earnDiff < -0.01) {
      console.log(`   ⚠️  CLEANED: -₹${Math.abs(earnDiff).toFixed(2)} (ghost txns removed)`);
    } else {
      console.log(`   ✓  No change`);
    }
  }

  // ── Final global check ───────────────────────────────────────
  console.log(`\n${'═'.repeat(70)}`);
  console.log('📊 FINAL GLOBAL STATE — All restaurants\n');

  const allRestaurants = await db.collection('restaurants')
    .find({})
    .project({ _id: 1, name: 1, restaurantId: 1, 'onboarding.step1.restaurantName': 1 })
    .toArray();

  const allWallets = await db.collection('restaurantwallets').find({}).toArray();
  const wMap = new Map(allWallets.map(w => [w.restaurantId.toString(), w]));

  const allSettAgg = await db.collection('ordersettlements').aggregate([
    { $group: { _id: '$restaurantId', total: { $sum: 1 }, net: { $sum: '$restaurantEarning.netEarning' } } }
  ]).toArray();
  const sMap = new Map(allSettAgg.map(s => [s._id.toString(), s]));

  console.log(
    'Restaurant'.padEnd(34) +
    'WalletBal'.padStart(12) +
    'WalletEarned'.padStart(14) +
    'Withdrawn'.padStart(11) +
    'Settlements'.padStart(13) +
    'SettNet'.padStart(12) +
    '  Match?'
  );
  console.log('─'.repeat(110));

  for (const r of allRestaurants) {
    const rid = r._id.toString();
    const name = (r.onboarding?.step1?.restaurantName || r.name || 'N/A').substring(0, 32);
    const w = wMap.get(rid);
    const s = sMap.get(rid);

    const wBal    = Number(w?.totalBalance  ?? 0);
    const wEarned = Number(w?.totalEarned   ?? 0);
    const wWith   = Number(w?.totalWithdrawn ?? 0);
    const sOrders = s?.total ?? 0;
    const sNet    = Number(s?.net ?? 0);

    const gap = sNet - wEarned;
    const matchIcon = Math.abs(gap) < 2 ? '✅' : (gap > 0 ? `❌ gap +₹${gap.toFixed(0)}` : `⚠️  wallet>sett ₹${Math.abs(gap).toFixed(0)}`);

    console.log(
      name.padEnd(34) +
      `₹${wBal.toFixed(2)}`.padStart(12) +
      `₹${wEarned.toFixed(2)}`.padStart(14) +
      `₹${wWith.toFixed(2)}`.padStart(11) +
      `${sOrders}`.padStart(13) +
      `₹${sNet.toFixed(2)}`.padStart(12) +
      `  ${matchIcon}`
    );
  }

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

main().catch(e => { console.error(e); process.exit(1); });
