/**
 * DEEP AUDIT: Every restaurant — settlements vs wallet balance
 * Run: node scratch/deep_audit_all.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // ── Load all restaurants ───────────────────────────────────────
  const restaurants = await db.collection('restaurants')
    .find({})
    .project({ _id: 1, name: 1, restaurantId: 1, 'onboarding.step1.restaurantName': 1, slug: 1 })
    .toArray();

  console.log(`📦 Total restaurants in DB: ${restaurants.length}\n`);

  // ── Load all wallets ───────────────────────────────────────────
  const wallets = await db.collection('restaurantwallets').find({}).toArray();
  const walletMap = new Map();
  wallets.forEach(w => walletMap.set(w.restaurantId.toString(), w));

  // ── Load all settlement aggregates per restaurant ─────────────
  const settlementAgg = await db.collection('ordersettlements').aggregate([
    {
      $group: {
        _id: '$restaurantId',
        totalOrders: { $sum: 1 },
        totalNetEarning: { $sum: '$restaurantEarning.netEarning' },
        creditedOrders: {
          $sum: { $cond: [{ $eq: ['$restaurantEarning.status', 'credited'] }, 1, 0] }
        },
        creditedEarning: {
          $sum: {
            $cond: [
              { $eq: ['$restaurantEarning.status', 'credited'] },
              '$restaurantEarning.netEarning',
              0
            ]
          }
        },
        pendingOrders: {
          $sum: { $cond: [{ $eq: ['$restaurantEarning.status', 'pending'] }, 1, 0] }
        },
        pendingEarning: {
          $sum: {
            $cond: [
              { $eq: ['$restaurantEarning.status', 'pending'] },
              '$restaurantEarning.netEarning',
              0
            ]
          }
        },
      }
    }
  ]).toArray();
  const settlementMap = new Map();
  settlementAgg.forEach(s => settlementMap.set(s._id.toString(), s));

  // ── Load delivered orders per restaurant ──────────────────────
  const orderAgg = await db.collection('orders').aggregate([
    { $match: { status: 'delivered' } },
    {
      $group: {
        _id: '$restaurantId',
        count: { $sum: 1 },
        totalSubtotal: { $sum: '$pricing.subtotal' }
      }
    }
  ]).toArray();
  const orderMap = new Map();
  orderAgg.forEach(o => orderMap.set(o._id?.toString(), o));

  // ── Build report rows ─────────────────────────────────────────
  const rows = [];

  for (const r of restaurants) {
    const rid = r._id.toString();
    const displayName = r.onboarding?.step1?.restaurantName || r.name || 'N/A';
    const restPublicId = r.restaurantId || rid;

    const wallet = walletMap.get(rid);
    const walletBalance  = Number(wallet?.totalBalance  ?? 0);
    const walletEarned   = Number(wallet?.totalEarned   ?? 0);
    const walletWithdrawn= Number(wallet?.totalWithdrawn?? 0);
    const walletTxns     = wallet?.transactions?.length ?? 0;
    const walletPaymentTxns = wallet?.transactions?.filter(t => t.type === 'payment' && t.status === 'Completed').length ?? 0;

    const sett = settlementMap.get(rid);
    const settOrders    = sett?.totalOrders    ?? 0;
    const settNetTotal  = sett?.totalNetEarning ?? 0;
    const settCredited  = sett?.creditedEarning ?? 0;
    const settPending   = sett?.pendingEarning  ?? 0;
    const settCreditedOrders = sett?.creditedOrders ?? 0;
    const settPendingOrders  = sett?.pendingOrders  ?? 0;

    // Check delivered orders by string restaurantId (public ID)
    const ordersByPublicId = orderMap.get(restPublicId) ?? { count: 0, totalSubtotal: 0 };

    // Gap: difference between what settlements say should be earned vs what wallet has
    const gap = settNetTotal - walletEarned;
    const hasIssue = gap > 1 || walletPaymentTxns < settOrders;

    rows.push({
      name: displayName,
      publicId: restPublicId,
      mongoId: rid,
      walletBalance,
      walletEarned,
      walletWithdrawn,
      walletTxns,
      walletPaymentTxns,
      settOrders,
      settNetTotal,
      settCredited,
      settCreditedOrders,
      settPending,
      settPendingOrders,
      ordersDeliveredByPublicId: ordersByPublicId.count,
      gap,
      hasIssue,
    });
  }

  // ── Sort: issues first, then by gap descending ─────────────────
  rows.sort((a, b) => {
    if (b.hasIssue !== a.hasIssue) return b.hasIssue ? 1 : -1;
    return b.gap - a.gap;
  });

  // ── Print detailed report ─────────────────────────────────────
  console.log('═'.repeat(120));
  console.log('DEEP AUDIT — ALL RESTAURANTS vs ORDER SETTLEMENTS');
  console.log('═'.repeat(120));

  let totalGap = 0;
  let issueCount = 0;

  for (const r of rows) {
    const flag = r.hasIssue ? '❌ MISMATCH' : '✅ OK';
    const gapStr = r.gap > 1 ? `  ⚠️  GAP: +₹${r.gap.toFixed(2)}` : '';
    console.log(`\n${flag}  ${r.name}`);
    console.log(`   PublicID : ${r.publicId}`);
    console.log(`   MongoID  : ${r.mongoId}`);
    console.log(`   ── Wallet ──────────────────────────────────────────────`);
    console.log(`      Balance  : ₹${r.walletBalance.toFixed(2)}    Earned: ₹${r.walletEarned.toFixed(2)}    Withdrawn: ₹${r.walletWithdrawn.toFixed(2)}`);
    console.log(`      Txns     : ${r.walletTxns} total  |  ${r.walletPaymentTxns} payment txns`);
    console.log(`   ── OrderSettlements (by restaurantId=ObjectId) ─────────`);
    console.log(`      Orders   : ${r.settOrders} total  (${r.settCreditedOrders} credited, ${r.settPendingOrders} pending)`);
    console.log(`      NetEarn  : ₹${r.settNetTotal.toFixed(2)} total  (₹${r.settCredited.toFixed(2)} credited, ₹${r.settPending.toFixed(2)} pending)${gapStr}`);
    console.log(`   ── Orders by public restaurantId string ────────────────`);
    console.log(`      Delivered: ${r.ordersDeliveredByPublicId} orders`);

    if (r.hasIssue) {
      issueCount++;
      totalGap += r.gap;
    }
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(120)}`);
  console.log('📊 SUMMARY');
  console.log('═'.repeat(120));
  console.log(`  Total restaurants   : ${restaurants.length}`);
  console.log(`  With issues (gap>₹1): ${issueCount}`);
  console.log(`  Total gap (unearned): ₹${totalGap.toFixed(2)}`);
  console.log('─'.repeat(120));

  // Issue-only quick table
  const issues = rows.filter(r => r.hasIssue);
  if (issues.length > 0) {
    console.log('\n⚠️  RESTAURANTS NEEDING FIX:');
    console.log('  Name'.padEnd(36) + 'WalletEarned'.padStart(14) + 'SettlementTotal'.padStart(17) + 'Gap'.padStart(12) + '  WalletPmtTxns / SettOrders');
    console.log('  ' + '─'.repeat(95));
    for (const r of issues) {
      console.log(
        `  ${r.name.padEnd(34)}` +
        `₹${r.walletEarned.toFixed(2)}`.padStart(14) +
        `₹${r.settNetTotal.toFixed(2)}`.padStart(17) +
        `+₹${r.gap.toFixed(2)}`.padStart(12) +
        `  ${r.walletPaymentTxns} / ${r.settOrders}`
      );
    }
  } else {
    console.log('\n✅ All restaurant wallets match their settlements — no issues!');
  }

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

main().catch(e => { console.error(e); process.exit(1); });
