import express from 'express';
import {
  sendOTP,
  verifyOTP,
  getCurrentHotel,
  refreshToken,
  logout,
} from '../controllers/hotelAuthController.js';
import { authenticate } from '../middleware/hotelAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const sendOTPSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .required(),
  purpose: Joi.string()
    .valid('login', 'register')
    .default('login')
});

const verifyOTPSchema = Joi.object({
  phone: Joi.string().required(),
  otp: Joi.string().required().length(6),
  purpose: Joi.string()
    .valid('login', 'register')
    .default('login'),
  hotelName: Joi.string().when('purpose', {
    is: 'register',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  email: Joi.string().email().when('purpose', {
    is: 'register',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  address: Joi.string().when('purpose', {
    is: 'register',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  aadharCardImage: Joi.object({
    url: Joi.string().uri(),
    publicId: Joi.string()
  }).optional(),
  hotelRentProofImage: Joi.object({
    url: Joi.string().uri(),
    publicId: Joi.string()
  }).optional(),
  cancelledCheckImages: Joi.array().items(
    Joi.object({
      url: Joi.string().uri(),
      publicId: Joi.string()
    })
  ).optional()
});

// Public routes
router.post('/send-otp', validate(sendOTPSchema), sendOTP);
router.post('/verify-otp', validate(verifyOTPSchema), verifyOTP);

// Protected routes
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.get('/me', authenticate, getCurrentHotel);

export default router;
