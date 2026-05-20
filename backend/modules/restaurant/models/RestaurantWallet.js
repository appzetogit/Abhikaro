import mongoose from 'mongoose';
import Order from '../../order/models/Order.js';
import Restaurant from './Restaurant.js';
import RestaurantCommission from '../../admin/models/RestaurantCommission.js';
import TableBooking from '../../dining/models/TableBooking.js';
import WithdrawalRequest from './WithdrawalRequest.js';


const transactionSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    enum: ['payment', 'withdrawal', 'refund', 'bonus', 'deduction'],
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Cancelled'],
    default: 'Pending'
  },
  description: {
    type: String,
    trim: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    sparse: true
  },
  balanceAfter: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  processedAt: Date
  ,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    sparse: true
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  _id: true
});

// Withdrawal Request Schema
const withdrawalRequestSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Processed'],
    default: 'Pending'
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'card'],
    required: true
  },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    bankName: String
  },
  upiId: String,
  cardDetails: {
    last4Digits: String,
    cardType: String
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  processedAt: Date,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    sparse: true
  },
  rejectionReason: String,
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    sparse: true
  }
}, {
  timestamps: true,
  _id: true
});

// Restaurant Wallet Schema
const restaurantWalletSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    unique: true
  },
  // Balance fields
  totalBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  totalWithdrawn: {
    type: Number,
    default: 0,
    min: 0
  },
  totalEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  // Transactions array
  transactions: [transactionSchema],
  // Withdrawal requests
  withdrawalRequests: [withdrawalRequestSchema],
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  // Last transaction date
  lastTransactionAt: Date
}, {
  timestamps: true
});

// Indexes
restaurantWalletSchema.index({ 'transactions.orderId': 1 });
restaurantWalletSchema.index({ 'transactions.status': 1 });
restaurantWalletSchema.index({ 'transactions.type': 1 });
restaurantWalletSchema.index({ lastTransactionAt: -1 });

// Virtual for pending balance (earned but not withdrawn)
restaurantWalletSchema.virtual('pendingBalance').get(function() {
  return this.totalEarned - this.totalWithdrawn;
});

// Method to add transaction and update balances
restaurantWalletSchema.methods.addTransaction = function(transactionData) {
  // Update balances based on transaction type and status
  if (transactionData.status === 'Completed') {
    if (transactionData.type === 'payment' || transactionData.type === 'bonus' || transactionData.type === 'refund') {
      this.totalBalance += transactionData.amount;
      this.totalEarned += transactionData.amount;
    } else if (transactionData.type === 'withdrawal') {
      this.totalBalance -= transactionData.amount;
      this.totalWithdrawn += transactionData.amount;
    } else if (transactionData.type === 'deduction') {
      this.totalBalance -= transactionData.amount;
    }
  }

  const transaction = {
    ...transactionData,
    balanceAfter: this.totalBalance,
    createdAt: new Date()
  };
  
  this.transactions.push(transaction);
  this.lastTransactionAt = new Date();
  
  return transaction;
};

// Method to update transaction status
restaurantWalletSchema.methods.updateTransactionStatus = function(transactionId, status, failureReason = null) {
  const transaction = this.transactions.id(transactionId);
  if (!transaction) {
    throw new Error('Transaction not found');
  }
  
  const oldStatus = transaction.status;
  const oldAmount = transaction.amount;
  
  transaction.status = status;
  transaction.processedAt = new Date();
  
  if (status === 'Failed' && failureReason) {
    transaction.failureReason = failureReason;
  }
  
  // If transaction status changed from Pending to Completed, update balances
  if (oldStatus === 'Pending' && status === 'Completed') {
    if (transaction.type === 'payment' || transaction.type === 'bonus' || transaction.type === 'refund') {
      this.totalBalance += oldAmount;
      this.totalEarned += oldAmount;
    } else if (transaction.type === 'withdrawal') {
      this.totalBalance -= oldAmount;
      this.totalWithdrawn += oldAmount;
    } else if (transaction.type === 'deduction') {
      this.totalBalance -= oldAmount;
    }
    transaction.balanceAfter = this.totalBalance;
  }
  
  // If transaction status changed from Completed to Failed/Cancelled, reverse balances
  if (oldStatus === 'Completed' && (status === 'Failed' || status === 'Cancelled')) {
    if (transaction.type === 'payment' || transaction.type === 'bonus' || transaction.type === 'refund') {
      this.totalBalance = Math.max(0, this.totalBalance - oldAmount);
      this.totalEarned = Math.max(0, this.totalEarned - oldAmount);
    } else if (transaction.type === 'withdrawal') {
      this.totalBalance += oldAmount;
      this.totalWithdrawn = Math.max(0, this.totalWithdrawn - oldAmount);
    }
    transaction.balanceAfter = this.totalBalance;
  }
  
  return transaction;
};

// Static method to get wallet by restaurant ID or create if doesn't exist
restaurantWalletSchema.statics.findOrCreateByRestaurantId = async function(restaurantId) {
  let wallet = await this.findOne({ restaurantId });
  
  if (!wallet) {
    wallet = await this.create({
      restaurantId,
      totalBalance: 0,
      totalWithdrawn: 0,
      totalEarned: 0
    });
  }

  let needsSave = false;

  // --- Dynamic Auto-Backfill of Completed/Delivered Orders and Bookings ---
  try {
    const restaurantDoc = await Restaurant.findById(restaurantId).select('restaurantId slug');
    const restaurantPublicId = restaurantDoc?.restaurantId;
    const restaurantSlug = restaurantDoc?.slug;
    const restaurantIdVariations = [
      restaurantId.toString(),
      restaurantPublicId?.toString(),
      restaurantSlug?.toString()
    ].filter(Boolean);


    // 1. Fetch all delivered orders
    const orders = await Order.find({
      restaurantId: { $in: restaurantIdVariations },
      status: 'delivered'
    }).lean();

    // 2. Fetch all completed paid dining bookings
    const bookings = await TableBooking.find({
      restaurant: restaurantId,
      status: { $in: ['completed', 'dining_completed'] },
      paymentStatus: 'paid'
    }).lean();

    // 3. Check and add payment transactions for orders (also fix wrong amounts)
    for (const order of orders) {
      const orderIdStr = order._id.toString();
      const existingTx = wallet.transactions?.find(
        (t) => t?.type === 'payment' && t?.orderId?.toString?.() === orderIdStr
      );

      const subtotal = Number(order.pricing?.subtotal || 0);
      const discount = Number(order.pricing?.discount || 0);
      const foodPrice = Math.max(0, subtotal - discount);
      
      const commissionResult = await RestaurantCommission.calculateCommissionForOrder(
        restaurantId,
        foodPrice
      );
      const commissionAmount = commissionResult.commission || 0;
      const payout = Math.max(0, foodPrice - commissionAmount);
      const roundedPayout = Math.round(payout * 100) / 100;

      if (!existingTx) {
        // Not yet credited: add it
        wallet.transactions.push({
          amount: roundedPayout,
          type: 'payment',
          status: 'Completed',
          description: `Order #${order.orderId || order._id} - Food Price: ₹${foodPrice.toFixed(2)}, Commission: ₹${commissionAmount.toFixed(2)}`,
          orderId: order._id,
          createdAt: order.deliveredAt || order.createdAt || new Date()
        });
        needsSave = true;
      } else if (Math.abs((existingTx.amount || 0) - roundedPayout) > 0.01) {
        // Already credited but with wrong amount — correct it
        console.log(`[RestaurantWallet] Correcting tx amount for order ${order.orderId}: ${existingTx.amount} → ${roundedPayout}`);
        existingTx.amount = roundedPayout;
        existingTx.description = `Order #${order.orderId || order._id} - Food Price: ₹${foodPrice.toFixed(2)}, Commission: ₹${commissionAmount.toFixed(2)}`;
        needsSave = true;
      }
    }

    // 4. Check and add payment transactions for dining bookings
    for (const booking of bookings) {
      const bookingIdStr = booking._id.toString();
      const alreadyCredited = wallet.transactions?.some(
        (t) => t?.type === 'payment' && t?.orderId?.toString?.() === bookingIdStr
      );
      if (!alreadyCredited) {
        const finalAmount = booking.finalAmount || booking.billAmount || 0;
        const payout = booking.restaurantEarning || 0;
        const commissionAmount = booking.commissionAmount || booking.adminEarning || 0;
        const roundedPayout = Math.round(payout * 100) / 100;

        wallet.transactions.push({
          amount: roundedPayout,
          type: 'payment',
          status: 'Completed',
          description: `Dining Booking #${booking.bookingId || booking._id} - Bill Amount: ₹${finalAmount.toFixed(2)}, Commission: ₹${commissionAmount.toFixed(2)}`,
          orderId: booking._id,
          createdAt: booking.paidAt || booking.checkOutTime || booking.createdAt || new Date()
        });
        needsSave = true;
      }
    }

    // 5. Fetch and backfill all withdrawal requests
    const withdrawals = await WithdrawalRequest.find({ restaurantId }).lean();
    for (const w of withdrawals) {
      const wIdStr = w._id.toString();
      const alreadyAdded = wallet.transactions?.some(
        (t) => t?.type === 'withdrawal' && t?.description?.includes(wIdStr)
      );
      if (!alreadyAdded) {
        let tStatus = 'Pending';
        if (w.status === 'Approved' || w.status === 'Processed') {
          tStatus = 'Completed';
        } else if (w.status === 'Rejected') {
          tStatus = 'Cancelled';
        }

        wallet.transactions.push({
          amount: Number(w.amount) || 0,
          type: 'withdrawal',
          status: tStatus,
          description: `Withdrawal request created - Request ID: ${wIdStr}`,
          createdAt: w.requestedAt || w.createdAt || new Date(),
          processedAt: w.processedAt
        });
        needsSave = true;
      } else {
        const existingTx = wallet.transactions.find(
          (t) => t?.type === 'withdrawal' && t?.description?.includes(wIdStr)
        );
        let expectedStatus = 'Pending';
        if (w.status === 'Approved' || w.status === 'Processed') {
          expectedStatus = 'Completed';
        } else if (w.status === 'Rejected') {
          expectedStatus = 'Cancelled';
        }
        if (existingTx && existingTx.status !== expectedStatus) {
          existingTx.status = expectedStatus;
          existingTx.processedAt = w.processedAt || new Date();
          needsSave = true;
        }
      }
    }

  } catch (backfillErr) {
    console.error('[RestaurantWallet] Error backfilling orders/bookings:', backfillErr);
  }

  // 1. Ghost Transaction Cleanup: Check if any payment transaction has an orderId that no longer exists in Order/TableBooking collection
  const paymentTxs = wallet.transactions.filter((t) => t.type === 'payment' && t.orderId);
  if (paymentTxs.length > 0) {
    try {
      const orderIds = paymentTxs.map((t) => t.orderId);
      
      const existingOrders = await Order.find({ _id: { $in: orderIds } }).select('_id');
      const existingOrderIdsSet = new Set(existingOrders.map((o) => o._id.toString()));
      
      const existingBookings = await TableBooking.find({ _id: { $in: orderIds } }).select('_id');
      const existingBookingIdsSet = new Set(existingBookings.map((b) => b._id.toString()));
      
      const hasGhostTransactions = paymentTxs.some((t) => 
        !existingOrderIdsSet.has(t.orderId.toString()) && 
        !existingBookingIdsSet.has(t.orderId.toString())
      );
      
      if (hasGhostTransactions) {
        console.log(`[RestaurantWallet] Dynamic Cleanup: Removing ghost transactions for deleted orders/bookings in wallet: ${wallet._id}`);
        
        wallet.transactions = wallet.transactions.filter((t) => {
          if (t.type === 'payment' && t.orderId) {
            return existingOrderIdsSet.has(t.orderId.toString()) || existingBookingIdsSet.has(t.orderId.toString());
          }
          return true;
        });
        
        needsSave = true;
      }
    } catch (cleanupErr) {
      console.error('[RestaurantWallet] Error running ghost transaction cleanup:', cleanupErr);
    }
  }

  // 1.2. Deduplication Cleanup: Ensure no duplicate payment transactions exist for the same order/booking
  const seenOrderIds = new Set();
  const uniqueTransactions = [];
  let hasDuplicates = false;
  for (const t of wallet.transactions) {
    if (t.type === 'payment' && t.orderId) {
      const key = t.orderId.toString();
      if (seenOrderIds.has(key)) {
        hasDuplicates = true;
        continue;
      }
      seenOrderIds.add(key);
    }
    uniqueTransactions.push(t);
  }
  if (hasDuplicates) {
    console.log(`[RestaurantWallet] Deduplication Cleanup: Removing duplicate payment transactions in wallet: ${wallet._id}`);
    wallet.transactions = uniqueTransactions;
    needsSave = true;
  }

  // 1.5. Clean up mock/test legacy transactions
  const hasMockTx = wallet.transactions.some(
    (t) => t.description && (
      t.description.toLowerCase().includes('mock') || 
      t.description.toLowerCase().includes('test') ||
      t.description === 'Manual deduction'
    )
  );
  if (hasMockTx) {
    console.log(`[RestaurantWallet] Cleanup: Removing mock/test transactions in wallet: ${wallet._id}`);
    wallet.transactions = wallet.transactions.filter(
      (t) => !t.description || (
        !t.description.toLowerCase().includes('mock') && 
        !t.description.toLowerCase().includes('test') &&
        t.description !== 'Manual deduction'
      )
    );
    needsSave = true;
  }

  // 2. Ledger Recalculate: check if legacy balanceAfter is missing, or if we cleaned up or backfilled transactions
  const hasLegacy = wallet.transactions.some((t) => t.balanceAfter === 0 && t.amount > 0);
  if (needsSave || (hasLegacy && wallet.transactions.length > 0)) {
    console.log(`[RestaurantWallet] Recalculating ledger and running balance for wallet: ${wallet._id}`);
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
      return a.idx - b.idx; // Stable fallback: maintain original database push order
    });

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

    // Update array and save the wallet
    wallet.transactions = indexed.map(({ t }) => t);
    wallet.totalBalance = Math.max(0, runningBalance);
    wallet.totalEarned = Math.max(0, totalEarned);
    wallet.totalWithdrawn = Math.max(0, totalWithdrawn);
    wallet.markModified('transactions');
    needsSave = true;
  }

  if (needsSave) {
    await wallet.save();
    console.log(`[RestaurantWallet] Wallet synced successfully. New balance: ${wallet.totalBalance}`);
  }
  
  return wallet;
};

export default mongoose.model('RestaurantWallet', restaurantWalletSchema);

