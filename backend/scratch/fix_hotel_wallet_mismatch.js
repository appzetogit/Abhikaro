import mongoose from 'mongoose';
import Hotel from '../modules/hotel/models/Hotel.js';
import HotelWallet from '../modules/hotel/models/HotelWallet.js';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import dotenv from 'dotenv';
dotenv.config();

const runFix = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const wallets = await HotelWallet.find();
    console.log(`Processing ${wallets.length} hotel wallets...`);

    let ordersLinked = 0;
    let transactionsRemoved = 0;
    let walletsUpdated = 0;

    for (const wallet of wallets) {
      const hotel = await Hotel.findById(wallet.hotelId);
      if (!hotel) {
        console.log(`⚠️ Hotel not found for wallet: ${wallet.hotelId}`);
        continue;
      }

      let walletNeedsSave = false;
      const originalTxCount = wallet.transactions.length;
      const cleanTransactions = [];

      for (const tx of wallet.transactions) {
        if (tx.type === 'commission' && tx.orderId) {
          const order = await Order.findById(tx.orderId);

          if (order) {
            // 1. Link mismatched orders back to their hotel if references are missing
            const matchesHotelId = order.hotelId && order.hotelId.toString() === hotel._id.toString();
            const matchesHotelRef = order.hotelReference && (
              order.hotelReference === hotel.hotelId || 
              order.hotelReference === hotel._id.toString()
            );

            if (!matchesHotelId || !matchesHotelRef) {
              console.log(`🔗 Linking Order ${order.orderId} to Hotel: ${hotel.hotelName}`);
              await Order.updateOne(
                { _id: order._id },
                {
                  $set: {
                    hotelId: hotel._id,
                    hotelReference: hotel.hotelId,
                    hotelName: hotel.hotelName
                  }
                }
              );
              ordersLinked++;
            }

            // 2. Filter out cancelled orders
            if (order.status === 'cancelled') {
              console.log(`❌ Removing cancelled order commission: Order ${order.orderId}, Amt: ₹${tx.amount}`);
              transactionsRemoved++;
              walletNeedsSave = true;
              continue; // Skip adding to cleanTransactions
            }
          } else {
            // Order document is deleted/missing
            // Check if there is an OrderSettlement to determine its final status
            const settlement = await OrderSettlement.findOne({ orderId: tx.orderId });
            if (settlement && (settlement.settlementStatus === 'cancelled' || settlement.status === 'Cancelled')) {
              console.log(`❌ Removing cancelled order commission (Deleted Order): Order ID ${tx.orderId}, Amt: ₹${tx.amount}`);
              transactionsRemoved++;
              walletNeedsSave = true;
              continue; // Skip adding to cleanTransactions
            } else if (!settlement) {
              console.log(`❌ Removing commission for deleted order with NO settlement: Order ID ${tx.orderId}, Amt: ₹${tx.amount}`);
              transactionsRemoved++;
              walletNeedsSave = true;
              continue; // Skip adding to cleanTransactions
            } else {
              console.log(`ℹ️ Keeping deleted order commission as settlement status is ${settlement.settlementStatus || 'N/A'}`);
            }
          }
        }

        cleanTransactions.push(tx);
      }

      // If we removed transactions, update wallet.transactions
      if (walletNeedsSave) {
        wallet.transactions = cleanTransactions;
      }

      // 3. Recalculate wallet balances if transactions count changed or we want to verify totals
      if (walletNeedsSave || originalTxCount > 0) {
        let runningBalance = 0;
        let totalEarned = 0;
        let totalWithdrawn = 0;

        // Sort transactions chronologically to ensure withdrawal/deduction balance is correct
        wallet.transactions.sort((a, b) => {
          const dateA = new Date(a.createdAt || a.processedAt || 0);
          const dateB = new Date(b.createdAt || b.processedAt || 0);
          return dateA - dateB;
        });

        wallet.transactions.forEach((t) => {
          if (t.status === 'Completed') {
            if (t.type === 'commission' || t.type === 'bonus' || t.type === 'refund') {
              runningBalance += t.amount;
              totalEarned += t.amount;
            } else if (t.type === 'cash_collection') {
              totalEarned += t.amount;
            } else if (t.type === 'withdrawal') {
              runningBalance -= t.amount;
              totalWithdrawn += t.amount;
            } else if (t.type === 'deduction') {
              runningBalance -= t.amount;
              totalEarned = Math.max(0, totalEarned - t.amount);
            }
          }
        });

        // Check if values actually changed before marking modified/saving
        const totalBalanceRounded = Math.round(runningBalance * 100) / 100;
        const totalEarnedRounded = Math.round(totalEarned * 100) / 100;
        const totalWithdrawnRounded = Math.round(totalWithdrawn * 100) / 100;

        const diffBalance = Math.abs(wallet.totalBalance - totalBalanceRounded) > 0.01;
        const diffEarned = Math.abs(wallet.totalEarned - totalEarnedRounded) > 0.01;
        const diffWithdrawn = Math.abs(wallet.totalWithdrawn - totalWithdrawnRounded) > 0.01;

        if (walletNeedsSave || diffBalance || diffEarned || diffWithdrawn) {
          console.log(`💾 Updating Wallet for ${hotel.hotelName}:`);
          console.log(`  Balance: ₹${wallet.totalBalance.toFixed(2)} -> ₹${totalBalanceRounded.toFixed(2)}`);
          console.log(`  Earned: ₹${wallet.totalEarned.toFixed(2)} -> ₹${totalEarnedRounded.toFixed(2)}`);
          console.log(`  Withdrawn: ₹${wallet.totalWithdrawn.toFixed(2)} -> ₹${totalWithdrawnRounded.toFixed(2)}`);
          
          wallet.totalBalance = totalBalanceRounded;
          wallet.totalEarned = totalEarnedRounded;
          wallet.totalWithdrawn = totalWithdrawnRounded;
          wallet.markModified('transactions');
          
          await wallet.save();
          walletsUpdated++;
        }
      }
    }

    console.log(`\n🎉 Fix Completed!`);
    console.log(`  Mismatched orders linked: ${ordersLinked}`);
    console.log(`  Cancelled transactions removed: ${transactionsRemoved}`);
    console.log(`  Wallets updated in DB: ${walletsUpdated}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

runFix();
