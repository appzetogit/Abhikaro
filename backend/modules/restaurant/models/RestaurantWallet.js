import mongoose from 'mongoose';
import Order from '../../order/models/Order.js';

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
  } else {
    let needsSave = false;

    // 1. Ghost Transaction Cleanup: Check if any payment transaction has an orderId that no longer exists in the Order collection
    const paymentTxs = wallet.transactions.filter((t) => t.type === 'payment' && t.orderId);
    if (paymentTxs.length > 0) {
      const orderIds = paymentTxs.map((t) => t.orderId);
      const existingOrders = await Order.find({ _id: { $in: orderIds } }).select('_id');
      const existingOrderIdsSet = new Set(existingOrders.map((o) => o._id.toString()));
      
      const hasGhostTransactions = paymentTxs.some((t) => !existingOrderIdsSet.has(t.orderId.toString()));
      if (hasGhostTransactions) {
        console.log(`[RestaurantWallet] Dynamic Cleanup: Removing ghost transactions for deleted orders in wallet: ${wallet._id}`);
        
        // Filter out payment transactions that refer to non-existent orders
        wallet.transactions = wallet.transactions.filter((t) => {
          if (t.type === 'payment' && t.orderId) {
            return existingOrderIdsSet.has(t.orderId.toString());
          }
          return true;
        });
        
        needsSave = true;
      }
    }

    // 2. Legacy Backfill or Recalculate: check if legacy balanceAfter is missing, or if we cleaned up ghost transactions
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
        if (t.status === 'Completed') {
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
  }
  
  return wallet;
};

export default mongoose.model('RestaurantWallet', restaurantWalletSchema);

