import express from 'express';
import {
  getWallet,
  getTransactions,
  createWithdrawalRequest,
  addEarning,
  collectPayment,
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
router.post('/earnings', authenticate, addEarning); // POST /api/delivery/wallet/earnings
router.post('/collect-payment', authenticate, collectPayment); // POST /api/delivery/wallet/collect-payment
router.post('/claim-joining-bonus', authenticate, claimJoiningBonus); // POST /api/delivery/wallet/claim-joining-bonus
router.post('/deposit/create-order', authenticate, createDepositOrder); // POST /api/delivery/wallet/deposit/create-order
router.post('/deposit/verify', authenticate, verifyDepositPayment); // POST /api/delivery/wallet/deposit/verify

export default router;

