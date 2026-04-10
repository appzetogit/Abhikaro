import express from 'express';
import { registerToken, unregisterToken, testHotelPush } from '../controllers/fcmController.js';
import { fcmAuth } from '../middleware/fcmAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

const registerTokenSchema = Joi.object({
  fcmToken: Joi.string().required().min(1),
  platform: Joi.string().valid('web', 'android', 'ios').default('web'),
  deviceId: Joi.string().optional().allow(null, ''),
  sendWelcome: Joi.boolean().optional(),
  sendLoginAlert: Joi.boolean().optional(),
});

const removeTokenSchema = Joi.object({
  fcmToken: Joi.string().required(),
});

const testHotelPushSchema = Joi.object({
  phone: Joi.string().optional().allow('', null).min(6),
  title: Joi.string().optional().allow(''),
  body: Joi.string().optional().allow(''),
});

// Register token - requires any valid JWT (user, restaurant, hotel, delivery)
router.post('/register-token', fcmAuth, validate(registerTokenSchema), registerToken);

// Remove token on logout - optionally require auth (for now allow unauthenticated to support logout)
router.post('/remove-token', validate(removeTokenSchema), unregisterToken);

// Admin-only test push to a hotel by phone (for support/debug)
router.post('/test/hotel', fcmAuth, validate(testHotelPushSchema), testHotelPush);

export default router;
