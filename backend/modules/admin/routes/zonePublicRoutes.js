import express from 'express';
import { detectUserZone } from '../controllers/zoneController.js';
import { redisCache } from '../../../shared/middleware/cacheMiddleware.js';

const router = express.Router();

// Public route - Zone detection for users (cached for 1 hour as zones don't change often)
router.get('/zones/detect', redisCache({ ttl: 3600 }), detectUserZone);

export default router;
