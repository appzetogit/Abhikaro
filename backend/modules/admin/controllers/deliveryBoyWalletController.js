import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../../delivery/models/Delivery.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';
import BusinessSettings from '../models/BusinessSettings.js';
import mongoose from 'mongoose';

/**
 * List all delivery boys with wallet details
 * GET /api/admin/delivery-boy-wallet
 * Query: search, page, limit
 */
export const getDeliveryBoyWallets = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const skip = (Math.max(1, parseInt(page)) - 1) * Math.max(1, Math.min(100, parseInt(limit)));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit)));

  const query = { status: { $in: ['approved', 'active'] } };
  if (search && String(search).trim()) {
    const q = String(search).trim();
    query.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { deliveryId: { $regex: q, $options: 'i' } }
    ];
  }

  const [deliveries, total, settings] = await Promise.all([
    Delivery.find(query).select('name phone email deliveryId').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Delivery.countDocuments(query),
    BusinessSettings.getSettings().catch(() => null)
  ]);

  const availableCashLimit = Number(settings?.deliveryCashLimit) || 0;
  const rows = [];

  for (const d of deliveries) {
    const wallet = await DeliveryWallet.findOrCreateByDeliveryId(d._id);
    const bonusTx = (wallet.transactions || []).filter((t) => t.type === 'bonus');
    const bonusTotal = (wallet.joiningBonusAmount || 0) + bonusTx.reduce((s, t) => s + (t.amount || 0), 0);
    const cashCollected = Number(wallet.cashInHand) || 0;
    const remainingCashLimit = Math.max(0, availableCashLimit - cashCollected);
    const totalBalance = Number(wallet.totalBalance) || 0;
    const pocketBalance = totalBalance - cashCollected;

    rows.push({
      deliveryId: d._id,
      name: d.name || '—',
      deliveryIdString: d.deliveryId || d._id?.toString?.() || '—',
      phone: d.phone || '—',
      walletId: wallet._id,
      availableCashLimit,
      remainingCashLimit,
      pocketBalance,
      cashCollected,
      totalEarning: Number(wallet.totalEarned) || 0,
      bonus: bonusTotal,
      totalWithdrawn: Number(wallet.totalWithdrawn) || 0
    });
  }

  return successResponse(res, 200, 'Delivery boy wallets retrieved successfully', {
    wallets: rows,
    pagination: {
      page: Math.max(1, parseInt(page)),
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1
    }
  });
});

/**
 * Add wallet adjustment (bonus or deduction)
 * POST /api/admin/delivery-boy-wallet/adjustment
 * Body: { walletId?, deliveryId?, amount, type: 'bonus'|'deduction', description? }
 */
export const addWalletAdjustment = asyncHandler(async (req, res) => {
  const admin = req.admin;
  if (!admin?._id) {
    return errorResponse(res, 401, 'Admin authentication required');
  }

  const { walletId, deliveryId, amount, type, description } = req.body || {};
  if (!['bonus', 'deduction'].includes(type)) {
    return errorResponse(res, 400, 'type must be "bonus" or "deduction"');
  }
  const amt = parseFloat(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return errorResponse(res, 400, 'amount must be a positive number');
  }

  let wallet = null;
  if (walletId) {
    wallet = await DeliveryWallet.findById(walletId);
  }
  if (!wallet && deliveryId) {
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }
    wallet = await DeliveryWallet.findOrCreateByDeliveryId(deliveryId);
  }
  if (!wallet) {
    return errorResponse(res, 400, 'Provide walletId or deliveryId');
  }

  const desc = type === 'bonus'
    ? (description ? `Admin Bonus: ${String(description).trim()}` : 'Admin Bonus')
    : (description ? `Admin Deduction: ${String(description).trim()}` : 'Admin Deduction');

  wallet.addTransaction({
    amount: amt,
    type,
    status: 'Completed',
    description: desc,
    processedAt: new Date(),
    processedBy: admin._id,
    metadata: { adjustment: true, description: String(description || '').trim() || undefined }
  });

  wallet.markModified('transactions');
  await wallet.save();

  return successResponse(res, 200, `${type === 'bonus' ? 'Bonus' : 'Deduction'} applied successfully`, {
    walletId: wallet._id,
    type,
    amount: amt,
    newPocketBalance: Number(wallet.totalBalance) || 0,
    newCashCollected: Number(wallet.cashInHand) || 0
  });
});

/**
 * Directly edit delivery boy wallet balances (admin only)
 * PUT /api/admin/delivery-boy-wallet/:id
 * Body: { pocketBalance?, cashInHand? }
 */
export const updateWalletBalances = asyncHandler(async (req, res) => {
  const admin = req.admin;
  if (!admin?._id) {
    return errorResponse(res, 401, 'Admin authentication required');
  }

  const { id } = req.params;
  const { pocketBalance, cashInHand } = req.body || {};

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return errorResponse(res, 400, 'Valid wallet ID is required');
  }

  const wallet = await DeliveryWallet.findById(id);
  if (!wallet) {
    return errorResponse(res, 404, 'Wallet not found');
  }

  // Validate and normalize numbers
  const hasPocket = pocketBalance !== undefined && pocketBalance !== null && pocketBalance !== '';
  const hasCash = cashInHand !== undefined && cashInHand !== null && cashInHand !== '';

  if (!hasPocket && !hasCash) {
    return errorResponse(res, 400, 'At least one of pocketBalance or cashInHand is required');
  }

  // Current values
  const currentCash = Number(wallet.cashInHand) || 0;
  const currentTotal = Number(wallet.totalBalance) || 0;
  const currentPocket = currentTotal - currentCash;

  let newPocket = currentPocket;
  let newCash = currentCash;

  if (hasPocket) {
    const pb = Number(pocketBalance);
    if (!Number.isFinite(pb) || pb < 0) {
      return errorResponse(res, 400, 'pocketBalance must be a non‑negative number');
    }
    newPocket = pb;
  }

  if (hasCash) {
    const ch = Number(cashInHand);
    if (!Number.isFinite(ch) || ch < 0) {
      return errorResponse(res, 400, 'cashInHand must be a non‑negative number');
    }
    newCash = ch;
  }

  // totalBalance = pocketBalance + cashInHand
  wallet.cashInHand = newCash;
  wallet.totalBalance = newPocket + newCash;

  await wallet.save();

  return successResponse(res, 200, 'Wallet balances updated successfully', {
    walletId: wallet._id,
    pocketBalance: Number(wallet.totalBalance) - Number(wallet.cashInHand || 0),
    cashInHand: Number(wallet.cashInHand) || 0,
    totalWithdrawn: Number(wallet.totalWithdrawn) || 0,
    totalEarned: Number(wallet.totalEarned) || 0
  });
});