import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AdminWallet from '../modules/admin/models/AdminWallet.js';

dotenv.config();

async function inspectAdminWallet() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const orderMongoId = new mongoose.Types.ObjectId('6a2a621b84d35ff1dfcb7b29');

    // Check Admin Wallet
    const adminWallet = await AdminWallet.findOne({
      'transactions.orderId': orderMongoId
    }).lean();

    console.log('\n=== Admin Wallet Transactions ===');
    if (adminWallet) {
      console.log('Wallet ID:', adminWallet._id);
      console.log('Total Balance:', adminWallet.totalBalance);
      const txs = adminWallet.transactions.filter(t => t.orderId?.toString() === orderMongoId.toString());
      console.log('Transactions:', JSON.stringify(txs, null, 2));
    } else {
      console.log('No transaction found in Admin Wallet.');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

inspectAdminWallet();