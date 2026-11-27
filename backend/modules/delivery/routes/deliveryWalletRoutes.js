import express from 'express';
import {
  getWallet,
  getTransactions,
  createWithdrawalRequest,
  claimJoiningBonus,
  getWalletStats,
  createDepositOrder,
  verifyDepositPayment
} from '../controllers/deliveryWalletController.js';
import { authenticate } from '../middleware/deliveryAuth.js';

const router = express.Router();

// Wallet routes
router.get('/', authenticate, getWallet); // GET /api/delivery/wallet
router.get('/transactions', authenticate, getTransactions); // GET /api/delivery/wallet/transactions
router.get('/stats', authenticate, getWalletStats); // GET /api/delivery/wallet/stats
router.post('/withdraw', authenticate, createWithdrawalRequest); // POST /api/delivery/wallet/withdraw
// SECURITY: /earnings and /collect-payment removed: the partner sent the amount himself.
// Earnings are credited by the server on delivery; cash is tracked by the order flow.
router.post('/claim-joining-bonus', authenticate, claimJoiningBonus); // POST /api/delivery/wallet/claim-joining-bonus
router.post('/deposit/create-order', authenticate, createDepositOrder); // POST /api/delivery/wallet/deposit/create-order
router.post('/deposit/verify', authenticate, verifyDepositPayment); // POST /api/delivery/wallet/deposit/verify

export default router;

