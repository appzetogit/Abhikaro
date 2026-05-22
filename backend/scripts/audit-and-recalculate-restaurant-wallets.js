import mongoose from 'mongoose';
import dotenv from 'dotenv';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

dotenv.config();

async function runAudit() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('Error: MONGODB_URI is not defined in environment variables');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully.\n');

    console.log('Fetching all restaurant wallets...');
    const wallets = await RestaurantWallet.find({});
    console.log(`Found ${wallets.length} wallets in the database.\n`);

    let totalDiscrepancies = 0;

    for (const wallet of wallets) {
      const restaurant = await Restaurant.findById(wallet.restaurantId).select('name restaurantId').lean();
      const name = restaurant?.name || 'Unknown Restaurant';
      const publicId = restaurant?.restaurantId || wallet.restaurantId.toString();

      console.log(`Auditing: ${name} (${publicId})`);

      const originalBalance = wallet.totalBalance || 0;
      const originalEarned = wallet.totalEarned || 0;
      const originalWithdrawn = wallet.totalWithdrawn || 0;

      let runningBalance = 0;
      let totalEarned = 0;
      let totalWithdrawn = 0;

      // Chronological sort: Map transactions with original index to ensure stable sorting
      const indexed = wallet.transactions.map((t, idx) => ({ t, idx }));
      indexed.sort((a, b) => {
        const dateA = new Date(a.t.createdAt || a.t.processedAt || 0);
        const dateB = new Date(b.t.createdAt || b.t.processedAt || 0);
        if (dateA.getTime() !== dateB.getTime()) {
          return dateA - dateB;
        }
        return a.idx - b.idx; // Stable fallback: database insertion order
      });

      // Recalculate balances
      indexed.forEach(({ t }) => {
        if (t.status === 'Completed' || (t.type === 'withdrawal' && t.status === 'Pending')) {
          const isAdd = ['payment', 'bonus', 'refund'].includes(t.type);
          const amt = Number(t.amount) || 0;
          runningBalance = isAdd ? runningBalance + amt : runningBalance - amt;

          if (t.type === 'payment' || t.type === 'bonus' || t.type === 'refund') {
            totalEarned += amt;
          } else if (t.type === 'withdrawal') {
            totalWithdrawn += amt;
          }
        }
        t.balanceAfter = Math.max(0, runningBalance);
      });

      const calculatedBalance = Math.max(0, runningBalance);

      const diffBalance = Math.abs(originalBalance - calculatedBalance);
      const diffEarned = Math.abs(originalEarned - totalEarned);
      const diffWithdrawn = Math.abs(originalWithdrawn - totalWithdrawn);

      const hasDiscrepancy = diffBalance > 0.01 || diffEarned > 0.01 || diffWithdrawn > 0.01;

      if (hasDiscrepancy) {
        totalDiscrepancies++;
        console.log(`  ⚠️  Discrepancy detected!`);
        console.log(`    Balance: Document = ${originalBalance.toFixed(2)}, Calculated = ${calculatedBalance.toFixed(2)} (diff = ${diffBalance.toFixed(2)})`);
        console.log(`    Earned:  Document = ${originalEarned.toFixed(2)}, Calculated = ${totalEarned.toFixed(2)} (diff = ${diffEarned.toFixed(2)})`);
        console.log(`    Withdrawn: Document = ${originalWithdrawn.toFixed(2)}, Calculated = ${totalWithdrawn.toFixed(2)} (diff = ${diffWithdrawn.toFixed(2)})`);

        // Update document fields
        wallet.transactions = indexed.map(({ t }) => t);
        wallet.totalBalance = calculatedBalance;
        wallet.totalEarned = totalEarned;
        wallet.totalWithdrawn = totalWithdrawn;
        wallet.markModified('transactions');

        await wallet.save();
        console.log(`  ✅  Wallet corrected and saved successfully.\n`);
      } else {
        console.log(`  🟢  No discrepancies. Balance is correct: ₹${calculatedBalance.toFixed(2)}\n`);
      }
    }

    console.log('=== AUDIT SUMMARY ===');
    console.log(`Total Wallets Checked: ${wallets.length}`);
    console.log(`Total Wallets with Discrepancies Corrected: ${totalDiscrepancies}`);
    console.log('=====================');

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB. Audit complete.');
  } catch (error) {
    console.error('Audit Error:', error);
    try {
      await mongoose.disconnect();
    } catch (e) {}
  }
}

runAudit();
