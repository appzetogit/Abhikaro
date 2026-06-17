/**
 * Verification script: Simulate what the wallet would look like after the fix
 * Run: node scratch/verify_wallet_fix.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const restaurantMongoId = '69d0ef574222eff98f02cb92';
  
  // Simulate the fix: get all settlements for this restaurant
  const settlements = await db.collection('ordersettlements').find({ 
    restaurantId: new mongoose.Types.ObjectId(restaurantMongoId),
    'restaurantEarning.netEarning': { $gt: 0 }
  }).project({ orderId: 1, orderNumber: 1, 'restaurantEarning': 1, createdAt: 1 }).toArray();
  
  // Get all delivered orders by this restaurant (string ID)
  const deliveredOrders = await db.collection('orders').find({ 
    restaurantId: 'REST-1775300439918-3090',
    status: 'delivered'
  }).project({ _id: 1 }).toArray();
  const deliveredOrderIdSet = new Set(deliveredOrders.map(o => o._id.toString()));
  
  console.log(`📊 Settlement-based earnings for Maa Karni Restaurant:`);
  let totalFromSettlements = 0;
  let creditedFromSettlements = 0;
  
  for (const s of settlements) {
    const net = s.restaurantEarning?.netEarning || 0;
    const status = s.restaurantEarning?.status;
    totalFromSettlements += net;
    if (status === 'credited') creditedFromSettlements += net;
    const inWallet = deliveredOrderIdSet.has(s.orderId?.toString()) ? '(already in wallet)' : '(MISSING from wallet)';
    console.log(`  ${s.orderNumber} | ₹${net} | ${status} ${inWallet}`);
  }
  
  console.log(`\n💰 Summary:`);
  console.log(`  Total orders in settlements: ${settlements.length}`);
  console.log(`  Total net earnings (all): ₹${totalFromSettlements.toFixed(2)}`);
  console.log(`  Total credited earnings: ₹${creditedFromSettlements.toFixed(2)}`);
  console.log(`  Current wallet balance: ₹6104.25`);
  console.log(`  Expected wallet balance (all settlements): ₹${totalFromSettlements.toFixed(2)}`);
  console.log(`\n🔧 The fix adds ₹${(totalFromSettlements - 6104.25).toFixed(2)} to the wallet`);
  console.log(`   (₹${totalFromSettlements.toFixed(2)} - ₹6104.25 = ₹${(totalFromSettlements - 6104.25).toFixed(2)})`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
