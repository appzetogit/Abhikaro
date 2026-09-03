import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/food_delivery';

async function cleanupDuplicates() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');
  const db = mongoose.connection.db;
  const wallets = await db.collection('deliverywallets').find({}).toArray();

  let cleanedWalletsCount = 0;
  let totalDuplicatesRemoved = 0;

  for (const w of wallets) {
    const txs = w.transactions || [];
    const seenOrders = new Set();
    const cleanTxs = [];
    let duplicateAmount = 0;
    let duplicateCount = 0;

    for (const t of txs) {
      if (t.type === 'payment' && t.orderId) {
        const oid = String(t.orderId);
        if (seenOrders.has(oid)) {
          duplicateCount++;
          duplicateAmount += (t.amount || 0);
          continue; // skip duplicate
        }
        seenOrders.add(oid);
      }
      cleanTxs.push(t);
    }

    if (duplicateCount > 0) {
      cleanedWalletsCount++;
      totalDuplicatesRemoved += duplicateCount;

      const newTotalBalance = Math.max(0, Math.round(((w.totalBalance || 0) - duplicateAmount) * 100) / 100);
      const newTotalEarned = Math.max(0, Math.round(((w.totalEarned || 0) - duplicateAmount) * 100) / 100);

      const delivery = await db.collection('deliveries').findOne({ _id: w.deliveryId });
      console.log('Cleaning wallet for:', delivery?.name, delivery?.deliveryId);
      console.log('  Removed duplicates:', duplicateCount, 'Total amount reduced: ₹' + duplicateAmount.toFixed(2));
      console.log('  Balance: ₹' + w.totalBalance + ' -> ₹' + newTotalBalance);
      console.log('  Earned: ₹' + w.totalEarned + ' -> ₹' + newTotalEarned);

      await db.collection('deliverywallets').updateOne(
        { _id: w._id },
        {
          $set: {
            transactions: cleanTxs,
            totalBalance: newTotalBalance,
            totalEarned: newTotalEarned
          }
        }
      );
    }
  }

  console.log('\n========================================');
  console.log('Cleanup complete!');
  console.log('Wallets cleaned:', cleanedWalletsCount);
  console.log('Total duplicate transactions removed:', totalDuplicatesRemoved);

  await mongoose.disconnect();
}

cleanupDuplicates().catch(console.error);
