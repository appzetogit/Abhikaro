/**
 * Deep diagnostic: check orders with ObjectId stored as restaurantId
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected\n');

  const db = mongoose.connection.db;
  
  // Check orders for this restaurant using raw MongoDB queries
  const restaurantMongoId = '69d0ef574222eff98f02cb92';
  const restaurantPublicId = 'REST-1775300439918-3090';
  
  // Query 1: Orders with string restaurantId = public ID
  const q1 = await db.collection('orders').countDocuments({ 
    restaurantId: restaurantPublicId, 
    status: 'delivered' 
  });
  console.log(`Orders with restaurantId="${restaurantPublicId}" AND status=delivered: ${q1}`);

  // Query 2: Orders with restaurantId as string = mongo ID
  const q2 = await db.collection('orders').countDocuments({ 
    restaurantId: restaurantMongoId, 
    status: 'delivered' 
  });
  console.log(`Orders with restaurantId="${restaurantMongoId}" (string) AND status=delivered: ${q2}`);

  // Query 3: Orders with restaurantId as ObjectId = mongo ID
  const q3 = await db.collection('orders').countDocuments({ 
    restaurantId: new mongoose.Types.ObjectId(restaurantMongoId), 
    status: 'delivered' 
  });
  console.log(`Orders with restaurantId=ObjectId(${restaurantMongoId}) AND status=delivered: ${q3}`);
  
  // Query 4: OrderSettlement count
  const q4 = await db.collection('ordersettlements').countDocuments({ 
    restaurantId: new mongoose.Types.ObjectId(restaurantMongoId)
  });
  console.log(`\nOrderSettlements with restaurantId=ObjectId(${restaurantMongoId}): ${q4}`);
  
  // Query 5: Check what settlement orders exist vs wallet orders
  const settlements = await db.collection('ordersettlements').find({ 
    restaurantId: new mongoose.Types.ObjectId(restaurantMongoId)
  }).project({ orderNumber: 1, 'restaurantEarning.netEarning': 1, 'restaurantEarning.status': 1 }).toArray();
  
  const wallet = await db.collection('restaurantwallets').findOne({ 
    restaurantId: new mongoose.Types.ObjectId(restaurantMongoId)
  });
  
  const walletOrderIds = new Set(
    (wallet?.transactions || [])
      .filter(t => t.type === 'payment')
      .map(t => t.description?.match(/ORD-[\d-]+/)?.[0])
      .filter(Boolean)
  );
  
  console.log('\n📊 Settlements NOT in wallet:');
  let missingTotal = 0;
  for (const s of settlements) {
    if (!walletOrderIds.has(s.orderNumber)) {
      const net = s.restaurantEarning?.netEarning || 0;
      missingTotal += net;
      console.log(`  MISSING: ${s.orderNumber} | netEarning: ₹${net} | status: ${s.restaurantEarning?.status}`);
    }
  }
  console.log(`  Total missing net earnings: ₹${missingTotal.toFixed(2)}`);
  
  // Current wallet balance
  console.log(`\n💰 Current Wallet totalBalance: ₹${wallet?.totalBalance || 0}`);
  console.log(`Expected totalBalance (current + missing): ₹${((wallet?.totalBalance || 0) + missingTotal).toFixed(2)}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
