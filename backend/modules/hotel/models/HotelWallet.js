import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      enum: [
        "commission",
        "withdrawal",
        "refund",
        "bonus",
        "deduction",
        "cash_collection",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Completed", "Failed", "Cancelled"],
      default: "Pending",
    },
    description: {
      type: String,
      trim: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      sparse: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: Date,
  },
  {
    timestamps: true,
    _id: true,
  },
);

// Withdrawal Request Schema
const withdrawalRequestSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Processed"],
      default: "Pending",
    },
    paymentMethod: {
      type: String,
      enum: ["bank_transfer", "upi", "card"],
      required: true,
    },
    bankDetails: {
      accountNumber: String,
      ifscCode: String,
      accountHolderName: String,
      bankName: String,
    },
    upiId: String,
    cardDetails: {
      last4Digits: String,
      cardType: String,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: Date,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      sparse: true,
    },
    rejectionReason: String,
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      sparse: true,
    },
  },
  {
    timestamps: true,
    _id: true,
  },
);

// Hotel Wallet Schema
const hotelWalletSchema = new mongoose.Schema(
  {
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: true,
      unique: true,
      index: true,
    },
    // Balance fields
    totalBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Transactions array
    transactions: [transactionSchema],
    // Withdrawal requests
    withdrawalRequests: [withdrawalRequestSchema],
    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    // Last transaction date
    lastTransactionAt: Date,
  },
  {
    timestamps: true,
  },
);

// Indexes
hotelWalletSchema.index({ hotelId: 1 });
hotelWalletSchema.index({ "transactions.orderId": 1 });
hotelWalletSchema.index({ "transactions.status": 1 });
hotelWalletSchema.index({ "transactions.type": 1 });
hotelWalletSchema.index({ lastTransactionAt: -1 });

// Virtual for pending balance (earned but not withdrawn)
hotelWalletSchema.virtual("pendingBalance").get(function () {
  return this.totalEarned - this.totalWithdrawn;
});

// Method to add transaction and update balances
hotelWalletSchema.methods.addTransaction = function (transactionData) {
  const transaction = {
    ...transactionData,
    createdAt: new Date(),
  };

  this.transactions.push(transaction);

  // Update balances based on transaction type and status
  if (transaction.status === "Completed") {
    if (
      transaction.type === "commission" ||
      transaction.type === "bonus" ||
      transaction.type === "refund"
    ) {
      this.totalBalance += transaction.amount;
      this.totalEarned += transaction.amount;
    } else if (transaction.type === "cash_collection") {
      this.totalEarned += transaction.amount;
    } else if (transaction.type === "withdrawal") {
      this.totalBalance -= transaction.amount;
      this.totalWithdrawn += transaction.amount;
    } else if (transaction.type === "deduction") {
      this.totalBalance -= transaction.amount;
    }
  }

  this.lastTransactionAt = new Date();

  return transaction;
};

// Method to update transaction status
hotelWalletSchema.methods.updateTransactionStatus = function (
  transactionId,
  status,
  failureReason = null,
) {
  const transaction = this.transactions.id(transactionId);
  if (!transaction) {
    throw new Error("Transaction not found");
  }

  const oldStatus = transaction.status;
  const oldAmount = transaction.amount;

  transaction.status = status;
  transaction.processedAt = new Date();

  if (status === "Failed" && failureReason) {
    transaction.failureReason = failureReason;
  }

  // If transaction status changed from Pending to Completed, update balances
  if (oldStatus === "Pending" && status === "Completed") {
    if (
      transaction.type === "commission" ||
      transaction.type === "bonus" ||
      transaction.type === "refund"
    ) {
      this.totalBalance += oldAmount;
      this.totalEarned += oldAmount;
    } else if (transaction.type === "cash_collection") {
      this.totalEarned += oldAmount;
    } else if (transaction.type === "withdrawal") {
      this.totalBalance -= oldAmount;
      this.totalWithdrawn += oldAmount;
    } else if (transaction.type === "deduction") {
      this.totalBalance -= oldAmount;
    }
  }

  // If transaction status changed from Completed to Failed/Cancelled, reverse balances
  if (
    oldStatus === "Completed" &&
    (status === "Failed" || status === "Cancelled")
  ) {
    if (
      transaction.type === "commission" ||
      transaction.type === "bonus" ||
      transaction.type === "refund"
    ) {
      this.totalBalance = Math.max(0, this.totalBalance - oldAmount);
      this.totalEarned = Math.max(0, this.totalEarned - oldAmount);
    } else if (transaction.type === "cash_collection") {
      this.totalEarned = Math.max(0, this.totalEarned - oldAmount);
    } else if (transaction.type === "withdrawal") {
      this.totalBalance += oldAmount;
      this.totalWithdrawn = Math.max(0, this.totalWithdrawn - oldAmount);
    }
  }

  return transaction;
};

// Static method to get wallet by hotel ID or create if doesn't exist
hotelWalletSchema.statics.findOrCreateByHotelId = async function (hotelId) {
  let wallet = await this.findOne({ hotelId });

  if (!wallet) {
    wallet = await this.create({
      hotelId,
      totalBalance: 0,
      totalWithdrawn: 0,
      totalEarned: 0,
    });
  }

  return wallet;
};

export default mongoose.model("HotelWallet", hotelWalletSchema);
