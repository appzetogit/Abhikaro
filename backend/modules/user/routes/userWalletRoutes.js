import express from 'express';
import {
  getWallet,
  getTransactions,
  createTopupOrder,
  verifyTopupPayment
} from '../controllers/userWalletController.js';
import { authenticate } from '../../auth/middleware/auth.js';

const router = express.Router();

// All routes require user authentication
router.use(authenticate);

// Wallet routes
router.get('/', getWallet); // GET /api/user/wallet
router.get('/transactions', getTransactions); // GET /api/user/wallet/transactions
router.post('/create-topup-order', createTopupOrder); // POST /api/user/wallet/create-topup-order
router.post('/verify-topup-payment', verifyTopupPayment); // POST /api/user/wallet/verify-topup-payment
// SECURITY: add-money / deduct / refund were removed from HTTP — any logged-in user could
// credit their own wallet. Wallet credits must only come from verified payments or admin.

export default router;

