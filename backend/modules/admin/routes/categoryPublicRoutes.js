import express from 'express';
import { getPublicCategories } from '../controllers/categoryController.js';
import { redisCache } from '../../../shared/middleware/cacheMiddleware.js';

const router = express.Router();

// Public route - cached for 5 minutes (reduced from default 10 for better data freshness)
router.get('/categories/public', redisCache({ ttl: 300 }), getPublicCategories);

export default router;

