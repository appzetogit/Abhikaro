/**
 * Apply fix: Force wallet recalculation for Maa Karni Restaurant
 * Run: node scratch/apply_wallet_fix.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // Dynamically import models after mongoose connects
  const { default: RestaurantWallet } = await import('../modules/restaurant/models/RestaurantWallet.js');

  const restaurantMongoId = new mongoose.Types.ObjectId('69d0ef574222eff98f02cb92');
  
  console.log('🔄 Triggering wallet recalculation for Maa Karni Restaurant...');
  console.log('   This may take a moment as it processes all orders and settlements.\n');
  
  const wallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurantMongoId);
  
  console.log('\n✅ Wallet Recalculated Successfully!');
  console.log(`   totalBalance:   ₹${wallet.totalBalance}`);
  console.log(`   totalEarned:    ₹${wallet.totalEarned}`);
  console.log(`   totalWithdrawn: ₹${wallet.totalWithdrawn}`);
  console.log(`   Total transactions: ${wallet.transactions?.length}`);

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

main().catch(e => { console.error(e); process.exit(1); });
