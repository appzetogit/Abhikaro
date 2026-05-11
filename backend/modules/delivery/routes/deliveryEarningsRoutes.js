import express from 'express';
import { getEarnings, getActiveEarningAddons } from '../controllers/deliveryEarningsController.js';
import { authenticate } from '../middleware/deliveryAuth.js';

const router = express.Router();

// Earnings routes
// IMPORTANT: More specific routes must come before less specific ones
router.get('/earnings/active-offers', authenticate, getActiveEarningAddons);
router.get('/earnings', authenticate, getEarnings);

export default router;

