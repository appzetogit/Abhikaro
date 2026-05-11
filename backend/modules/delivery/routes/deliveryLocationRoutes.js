import express from 'express';
import { updateLocation, getLocation, getZonesInRadius } from '../controllers/deliveryLocationController.js';
import { authenticate } from '../middleware/deliveryAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// Location routes - validation handled in controller for flexibility
router.post('/location', authenticate, updateLocation);
router.get('/location', authenticate, getLocation);

// Zones routes
router.get('/zones/in-radius', authenticate, getZonesInRadius);

export default router;

