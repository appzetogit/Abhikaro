import express from 'express';
import { registerToken, unregisterToken } from '../controllers/fcmController.js';
import { fcmAuth } from '../middleware/fcmAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

const registerTokenSchema = Joi.object({
  fcmToken: Joi.string().required().min(1),
  platform: Joi.string().valid('web', 'android', 'ios').default('web'),
  deviceId: Joi.string().optional().allow(null, ''),
});

const removeTokenSchema = Joi.object({
  fcmToken: Joi.string().required(),
});

// Register token - requires any valid JWT (user, restaurant, hotel, delivery)
router.post('/register-token', fcmAuth, validate(registerTokenSchema), registerToken);

// Remove token on logout - optionally require auth (for now allow unauthenticated to support logout)
router.post('/remove-token', validate(removeTokenSchema), unregisterToken);

export default router;
