import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';
import HotelWallet from './modules/hotel/models/HotelWallet.js';

dotenv.config();

async function runCheck() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const order = await Order.findOne({ orderId: 'ORD-1777523996776-436' });
    console.log('Order:');
    console.log({
      orderId: order.orderId,
      hotelId: order.hotelId,
      hotelReference: order.hotelReference,
      hotelCommission: order.hotelCommission,
      commissionDistributed: order.commissionDistributed
    });

    // Check hotel wallets that might reference this orderId
    const wallets = await HotelWallet.find({ 'transactions.orderId': order._id });
    console.log(`Found ${wallets.length} wallets referencing this order.`);
    for (const w of wallets) {
      console.log('Wallet ID:', w._id);
      console.log('Hotel ID:', w.hotelId);
      const txs = w.transactions.filter(t => t.orderId?.toString() === order._id.toString());
      console.log('Transactions for this order:', JSON.stringify(txs, null, 2));
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

runCheck();
