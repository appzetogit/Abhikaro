import mongoose from 'mongoose';
import Order from '../../order/models/Order.js';
import Restaurant from './Restaurant.js';
import RestaurantCommission from '../../admin/models/RestaurantCommission.js';
import TableBooking from '../../dining/models/TableBooking.js';
import WithdrawalRequest from './WithdrawalRequest.js';
import OrderSettlement from '../../order/models/OrderSettlement.js';
import AdminCommission from '../../admin/models/AdminCommission.js';

const WALLET_HISTORY_CUTOFF_DATE = new Date('2026-07-05T00:40:00+05:30');


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

// Pre-save hook to force balances to 0 as requested
restaurantWalletSchema.pre('save', function(next) {
  this.totalBalance = 0;
  this.totalEarned = 0;
  this.totalWithdrawn = 0;
  next();
});

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
  
  return this.transactions[this.transactions.length - 1];
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
    const HISTORICAL_IDS_MAP = {
      '6a312d8fe277d6a8fc17ffc4': ['69f19e8f870f195b03093cd1'], // Om Restaurant & Sweets
      '6a312d8fe277d6a8fc17ffc1': ['6a0aef7f6c863eb14688a817'], // Shree shyam restaurant
      '6a312d90e277d6a8fc17ffc7': ['69d654e7c86eb9b6c8399c62', '69afec1d38ccb6b156fc5640'], // Ravi Cafe New
      '69f06de39a84943f93d89c8f': ['69f31f4fa8a970ee8e53418b'] // Always24*7
    };

    const extraIds = HISTORICAL_IDS_MAP[restaurantId.toString()] || [];

    const restaurantDoc = await Restaurant.findById(restaurantId).select('restaurantId slug');
    const restaurantPublicId = restaurantDoc?.restaurantId;
    const restaurantSlug = restaurantDoc?.slug;
    const restaurantIdVariations = [
      restaurantId.toString(),
      restaurantPublicId?.toString(),
      restaurantSlug?.toString(),
      ...extraIds
    ].filter(Boolean);

    const targetRestaurantObjectIds = [
      restaurantId,
      ...extraIds.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id.toString()) : null)
    ].filter(Boolean);


    // 1. Fetch all delivered orders since cutoff date
    const orders = await Order.find({
      restaurantId: { $in: restaurantIdVariations },
      status: 'delivered',
      createdAt: { $gte: WALLET_HISTORY_CUTOFF_DATE }
    }).lean();

    // Fetch settlements and admin commissions in parallel to resolve actual payouts
    const orderIds = (orders || []).map(o => o._id).filter(Boolean);
    const [settlements, adminComms] = orderIds.length ? await Promise.all([
      OrderSettlement.find({ orderId: { $in: orderIds } }).lean(),
      AdminCommission.find({ orderId: { $in: orderIds }, status: 'completed' }).lean()
    ]) : [[], []];

    const settlementMap = new Map();
    (settlements || []).forEach(s => {
      if (s.orderId) settlementMap.set(s.orderId.toString(), s);
    });

    const adminCommMap = new Map();
    (adminComms || []).forEach(ac => {
      if (ac.orderId) adminCommMap.set(ac.orderId.toString(), ac);
    });

    // Get hotel configurations
    let hotelConfigByKey = new Map();
    try {
      const hotelObjectIds = [];
      const hotelIdStrings = [];
      for (const o of orders) {
        if (o?.hotelId && mongoose.Types.ObjectId.isValid(o.hotelId)) {
          hotelObjectIds.push(new mongoose.Types.ObjectId(o.hotelId));
        }
        if (o?.hotelReference && typeof o.hotelReference === 'string') {
          hotelIdStrings.push(o.hotelReference);
        }
      }
      const or = [];
      if (hotelObjectIds.length) or.push({ _id: { $in: hotelObjectIds } });
      if (hotelIdStrings.length) or.push({ hotelId: { $in: hotelIdStrings } });
      if (or.length) {
        const Hotel = mongoose.model('Hotel');
        const hotels = await Hotel.find({ $or: or }).lean();
        for (const h of hotels) {
          if (h?._id) hotelConfigByKey.set(String(h._id), h);
          if (h?.hotelId) hotelConfigByKey.set(String(h.hotelId), h);
        }
      }
    } catch (_) {}

    // Get qr global commission
    let qrGlobalCommission = { hotel: 0, admin: 0 };
    try {
      const CommissionSettings = mongoose.model('CommissionSettings');
      const latest = await CommissionSettings.findOne().sort({ createdAt: -1 }).lean();
      if (latest?.qrCommission) {
        qrGlobalCommission = {
          hotel: Number(latest.qrCommission.hotel || 0),
          admin: Number(latest.qrCommission.admin || 0)
        };
      }
    } catch (_) {}

    // 2. Fetch all completed paid dining bookings since cutoff date
    const bookings = await TableBooking.find({
      restaurant: { $in: targetRestaurantObjectIds },
      status: { $in: ['completed', 'dining_completed'] },
      paymentStatus: 'paid',
      createdAt: { $gte: WALLET_HISTORY_CUTOFF_DATE }
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
      const orderAmount = Number(order.pricing?.total || 0);
      const platformFee = Number(order.pricing?.platformFee || 0);
      const deliveryFee = Number(order.pricing?.deliveryFee || 0);
      const tax = Number(order.pricing?.tax || 0);

      const settlement = settlementMap.get(orderIdStr);
      const commissionInfo = adminCommMap.get(orderIdStr) || {};

      let restaurantEarning = settlement?.restaurantEarning?.netEarning ?? commissionInfo.restaurantEarning ?? 0;
      let deliveryEarning = settlement?.deliveryPartnerEarning?.totalEarning ?? order.estimatedEarnings?.totalEarning ?? 0;
      let adminEarning = settlement?.adminEarning?.totalEarning ?? commissionInfo.commissionAmount ?? 0;

      const isHotelQrOrder = (order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId);
      let hotelCommissionAmount = settlement?.hotelEarning?.commission ?? (Number(order.commissionBreakdown?.hotel || 0) || Number(order.hotelCommission || 0) || 0);

      if (isHotelQrOrder && !restaurantEarning) {
        const commissionableFood = Math.max(0, subtotal - discount);
        const hotelCfg = hotelConfigByKey.get(String(order.hotelId || "")) || hotelConfigByKey.get(String(order.hotelReference || "")) || null;

        const pctHotel = Number(hotelCfg?.commission || 0) || Number(qrGlobalCommission?.hotel || 0) || Number(order.commissionPercentages?.hotel || 0);
        const pctAdmin = Number(hotelCfg?.adminCommission || 0) || Number(qrGlobalCommission?.admin || 0) || Number(order.commissionPercentages?.admin || 0);

        let hotelCommission = hotelCommissionAmount;
        let qrAdminCommission = Number(order.commissionBreakdown?.admin || 0) || Number(order.adminCommission || 0) || 0;

        if (!hotelCommission && pctHotel > 0 && commissionableFood > 0) {
          hotelCommission = Math.round(((commissionableFood * pctHotel) / 100) * 100) / 100;
        }
        if (!qrAdminCommission && pctAdmin > 0 && commissionableFood > 0) {
          qrAdminCommission = Math.round(((commissionableFood * pctAdmin) / 100) * 100) / 100;
        }

        const qrRestaurantNet = Math.max(0, commissionableFood - hotelCommission - qrAdminCommission);
        if (qrRestaurantNet > 0) {
          restaurantEarning = Math.round(qrRestaurantNet * 100) / 100;
        } else if (!restaurantEarning) {
          const explicitRestaurant = Number(order.restaurantShare || order.commissionBreakdown?.restaurant || 0);
          if (explicitRestaurant > 0) {
            restaurantEarning = explicitRestaurant;
          }
        }
        hotelCommissionAmount = Number(hotelCommission || 0) || hotelCommissionAmount;
      }

      if (!restaurantEarning) {
        if (order.restaurantShare !== undefined && order.restaurantShare > 0) {
          restaurantEarning = order.restaurantShare;
        } else {
          const pct = Number(order.commissionPercentages?.restaurant || 0);
          if (!isHotelQrOrder && pct > 0) {
            const derivedSubtotal = Math.max(0, orderAmount - platformFee - deliveryFee - tax);
            const derived = (derivedSubtotal * pct) / 100;
            if (derived > 0) restaurantEarning = Math.round(derived * 100) / 100;
          } else if (isHotelQrOrder && Number(orderAmount) > 0) {
            const hotelCommission = Number(order.hotelCommission || 0) || Number(order.commissionBreakdown?.hotel || 0);
            const derived = Number(orderAmount) - Number(adminEarning || 0) - Number(hotelCommission || 0) - Number(deliveryEarning || 0);
            if (derived > 0) restaurantEarning = Math.round(derived * 100) / 100;
          }
        }
      }

      if (!restaurantEarning && !deliveryEarning && !adminEarning) {
        restaurantEarning = Math.max(0, subtotal - discount);
      }

      const roundedPayout = Math.round(restaurantEarning * 100) / 100;
      const commissionAmount = Math.max(0, foodPrice - roundedPayout);

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

    // 3b. Supplement with OrderSettlement records — catches orders where the Order document
    // stores restaurantId as a Mongo ObjectId (e.g. QR/hotel orders) that may not match
    // string-based restaurantIdVariations. OrderSettlement.restaurantId is always an ObjectId ref.
    // This is the PRIMARY fix for the missing balance issue (e.g. Maa Karni Restaurant).
    try {
      if (targetRestaurantObjectIds && targetRestaurantObjectIds.length > 0) {
        const settlements = await OrderSettlement.find({
          restaurantId: { $in: targetRestaurantObjectIds },
          'restaurantEarning.netEarning': { $gt: 0 },
          createdAt: { $gte: WALLET_HISTORY_CUTOFF_DATE }
        })
          .select('orderId orderNumber restaurantEarning createdAt')
          .lean();

        // Build set of orderIds already in wallet
        const walletOrderIdSet = new Set(
          (wallet.transactions || [])
            .filter((t) => t.type === 'payment' && t.orderId)
            .map((t) => t.orderId.toString())
        );

        for (const settlement of settlements) {
          const orderIdStr = settlement.orderId?.toString();
          if (!orderIdStr) continue;
          if (walletOrderIdSet.has(orderIdStr)) continue; // already backfilled via Order query

          // Skip test/mock orders — identified by ORD-TEST prefix in orderNumber
          if (settlement.orderNumber && /^ORD-TEST/i.test(settlement.orderNumber)) continue;

          const netEarning = Number(settlement.restaurantEarning?.netEarning || 0);
          const commission = Number(settlement.restaurantEarning?.commission || 0);
          const foodPrice = Number(settlement.restaurantEarning?.foodPrice || (netEarning + commission));
          if (netEarning <= 0) continue;

          // Fetch order for date and status check
          let orderDate = settlement.createdAt || new Date();
          try {
            const orderDoc = await Order.findById(settlement.orderId)
              .select('deliveredAt createdAt status orderId')
              .lean();

            // Skip test orders by orderId pattern
            if (orderDoc?.orderId && /^ORD-TEST/i.test(orderDoc.orderId)) continue;

            // Only credit final-state orders:
            // - 'delivered'  → normal delivery, restaurant earns
            // - 'cancelled'  → restaurant may have earned compensation (netEarning > 0 means compensation was set)
            // - null (no order doc) → settlement exists without order, credit it anyway
            // Skip: 'pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', etc.
            const finalStatuses = new Set(['delivered', 'cancelled']);
            if (orderDoc && !finalStatuses.has(orderDoc.status)) continue;

            orderDate = orderDoc?.deliveredAt || orderDoc?.createdAt || orderDate;
          } catch (_) {}

          const descType = settlement.restaurantEarning?.status === 'cancelled' ? 'Cancellation Compensation' : 'Food Price';
          wallet.transactions.push({
            amount: Math.round(netEarning * 100) / 100,
            type: 'payment',
            status: 'Completed',
            description: `Order #${settlement.orderNumber || orderIdStr} - ${descType}: ₹${foodPrice.toFixed(2)}, Commission: ₹${commission.toFixed(2)}`,
            orderId: settlement.orderId,
            createdAt: orderDate,
          });
          walletOrderIdSet.add(orderIdStr);
          needsSave = true;
          console.log(`[RestaurantWallet] Backfilled via OrderSettlement: ${settlement.orderNumber} → ₹${netEarning}`);
        }
      }
    } catch (settlementBackfillErr) {
      console.warn('[RestaurantWallet] OrderSettlement backfill error:', settlementBackfillErr.message);
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
    const withdrawals = await WithdrawalRequest.find({
      restaurantId: { $in: targetRestaurantObjectIds },
      createdAt: { $gte: WALLET_HISTORY_CUTOFF_DATE }
    }).lean();
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
      
      const existingOrders = await Order.find({ 
        _id: { $in: orderIds },
        status: 'delivered'
      }).select('_id');
      const existingOrderIdsSet = new Set(existingOrders.map((o) => o._id.toString()));
      
      const existingBookings = await TableBooking.find({ 
        _id: { $in: orderIds },
        status: { $in: ['completed', 'dining_completed'] },
        paymentStatus: 'paid'
      }).select('_id');
      const existingBookingIdsSet = new Set(existingBookings.map((b) => b._id.toString()));

      // Also check OrderSettlement — orders backfilled via settlement are valid even if
      // their Order.restaurantId doesn't match the string-based idVariations query.
      let settlementOrderIdsSet = new Set();
      try {
        const settlementOrders = await OrderSettlement.find({
          restaurantId: { $in: targetRestaurantObjectIds },
          orderId: { $in: orderIds },
        }).select('orderId').lean();
        settlementOrders.forEach((s) => settlementOrderIdsSet.add(s.orderId.toString()));
      } catch (_) {}
      
      const hasGhostTransactions = paymentTxs.some((t) => 
        !existingOrderIdsSet.has(t.orderId.toString()) && 
        !existingBookingIdsSet.has(t.orderId.toString()) &&
        !settlementOrderIdsSet.has(t.orderId.toString())
      );
      
      if (hasGhostTransactions) {
        console.log(`[RestaurantWallet] Dynamic Cleanup: Removing ghost transactions for deleted orders/bookings in wallet: ${wallet._id}`);
        
        wallet.transactions = wallet.transactions.filter((t) => {
          if (t.type === 'payment' && t.orderId) {
            return existingOrderIdsSet.has(t.orderId.toString()) || 
                   existingBookingIdsSet.has(t.orderId.toString()) ||
                   settlementOrderIdsSet.has(t.orderId.toString());
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

  // Self-Healing: check if there are actual balance math discrepancies in the ledger
  let hasDiscrepancy = false;
  if (!needsSave && !hasLegacy && wallet.transactions.length > 0) {
    let testBalance = 0;
    for (const t of wallet.transactions) {
      if (t.status === 'Completed' || (t.type === 'withdrawal' && t.status === 'Pending')) {
        const isAdd = ['payment', 'bonus', 'refund'].includes(t.type);
        const amt = Number(t.amount) || 0;
        testBalance = isAdd ? testBalance + amt : testBalance - amt;
      }
    }
    testBalance = Math.max(0, testBalance);
    if (Math.abs(testBalance - (wallet.totalBalance || 0)) > 0.01) {
      console.log(`[RestaurantWallet] Discrepancy detected for wallet ${wallet._id}: totalBalance is ${wallet.totalBalance} but actual sum is ${testBalance}. Self-healing triggered.`);
      hasDiscrepancy = true;
    }
  }

  if (needsSave || (hasLegacy && wallet.transactions.length > 0) || hasDiscrepancy) {
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

