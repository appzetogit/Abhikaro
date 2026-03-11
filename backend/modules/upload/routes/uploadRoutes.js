import express from 'express';
import multer from 'multer';
import { uploadMiddleware } from '../../../shared/utils/cloudinaryService.js';
import { uploadSingleMedia, uploadBase64Media } from '../controllers/uploadController.js';
import jwtService from '../../auth/services/jwtService.js';
import User from '../../auth/models/User.js';
import Admin from '../../admin/models/Admin.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Hotel from '../../hotel/models/Hotel.js';
import { errorResponse } from '../../../shared/utils/response.js';
import { ipRateLimit } from '../../../shared/middleware/redisRateLimit.js';

const router = express.Router();

/**
 * Flexible authentication middleware
 * Accepts admin, user, restaurant, delivery, and hotel tokens
 * Also allows uploads without authentication for registration purposes
 */
const authenticateFlexible = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Allow uploads without authentication for registration purposes
    // This is needed for first-time registration when user/hotel doesn't exist yet
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Allow upload without token for registration flows
      console.log('📤 Upload request without authentication (registration flow)');
      return next();
    }

    const token = authHeader.substring(7);
    
    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Check if token is for admin
    if (decoded.role === 'admin') {
      const admin = await Admin.findById(decoded.userId).select('-password');
      
      if (!admin) {
        return errorResponse(res, 401, 'Admin not found');
      }

      if (!admin.isActive) {
        return errorResponse(res, 401, 'Admin account is inactive');
      }

      req.user = admin;
      req.token = decoded;
      return next();
    }

    // Check if token is for restaurant
    if (decoded.role === 'restaurant') {
      const restaurant = await Restaurant.findById(decoded.userId).select('-password');
      
      if (!restaurant) {
        return errorResponse(res, 401, 'Restaurant not found');
      }

      // Allow inactive restaurants to access upload routes - they need to upload images during onboarding
      // Similar to delivery partners, inactive restaurants can access upload during onboarding/verification
      // The middleware in restaurant routes will handle blocking inactive restaurants from other restricted routes
      // if (!restaurant.isActive) {
      //   return errorResponse(res, 401, 'Restaurant account is inactive');
      // }

      req.user = restaurant; // Use req.user for consistency with other modules
      req.restaurant = restaurant; // Also attach as req.restaurant for clarity
      req.token = decoded;
      return next();
    }

    // Check if token is for hotel
    if (decoded.role === 'hotel') {
      const hotel = await Hotel.findById(decoded.userId).select('-password');
      
      // Allow upload even if hotel doesn't exist yet (for registration flow)
      // The hotel will be created after OTP verification with the uploaded images
      if (!hotel) {
        console.log('📤 Hotel not found in DB, but allowing upload for registration flow');
        // Still allow the upload - hotel will be created later
        req.token = decoded;
        return next();
      }

      // Allow inactive hotels to access upload routes - they need to upload images during onboarding/profile updates
      // Similar to restaurants, inactive hotels can access upload during onboarding/verification
      // The middleware in hotel routes will handle blocking inactive hotels from other restricted routes

      req.user = hotel; // Use req.user for consistency with other modules
      req.hotel = hotel; // Also attach as req.hotel for clarity
      req.token = decoded;
      return next();
    }

    // Check if token is for delivery
    if (decoded.role === 'delivery') {
      try {
        const Delivery = (await import('../../delivery/models/Delivery.js')).default;
        const delivery = await Delivery.findById(decoded.userId).select('-password');
        
        if (!delivery) {
          return errorResponse(res, 401, 'Delivery partner not found');
        }

        // Allow blocked/pending status partners to access (they can see rejection reason or verification message)
        // Only block if account is inactive AND not blocked/pending (blocked/pending partners can login)
        if (!delivery.isActive && delivery.status !== 'blocked' && delivery.status !== 'pending') {
          return errorResponse(res, 401, 'Delivery partner account is inactive');
        }

        req.user = delivery;
        req.token = decoded;
        return next();
      } catch (importError) {
        // If Delivery model doesn't exist, skip delivery authentication
        console.warn('Delivery model not found, skipping delivery authentication');
      }
    }

    // Otherwise, try regular user authentication
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return errorResponse(res, 401, 'User not found');
    }

    if (!user.isActive) {
      return errorResponse(res, 401, 'User account is inactive');
    }

    req.user = user;
    req.token = decoded;
    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};

// POST /api/upload/media - Accepts admin, user, restaurant, delivery, and hotel tokens
// Apply IP-based rate limiting for unauthenticated uploads to prevent abuse
// Handle multer errors before controller
router.post(
  '/media',
  // Rate limit unauthenticated uploads more strictly to prevent abuse
  (req, res, next) => {
    // Only apply strict rate limiting if no auth token is provided
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
      // Apply IP-based rate limiting for unauthenticated uploads
      return ipRateLimit(req, res, next);
    }
    // Authenticated requests use standard rate limiting (handled by other middleware)
    next();
  },
  authenticateFlexible,
  (req, res, next) => {
    uploadMiddleware.single('file')(req, res, (err) => {
      if (err) {
        console.error('❌ Multer upload error:', err);
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return errorResponse(res, 400, 'File size exceeds 20MB limit');
          }
          return errorResponse(res, 400, `Upload error: ${err.message}`);
        }
        // For non-multer errors (e.g., fileFilter errors)
        if (err.message) {
          return errorResponse(res, 400, err.message);
        }
        return errorResponse(res, 400, 'File upload error');
      }
      next();
    });
  },
  uploadSingleMedia
);

// POST /api/upload/base64 - Upload image from base64 string (for Flutter app)
// Accepts JSON body with base64, mimeType, fileName, and optional folder
// Apply IP-based rate limiting for unauthenticated uploads to prevent abuse
router.post(
  '/base64',
  // Rate limit unauthenticated uploads more strictly to prevent abuse
  (req, res, next) => {
    // Only apply strict rate limiting if no auth token is provided
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
      // Apply IP-based rate limiting for unauthenticated uploads
      return ipRateLimit(req, res, next);
    }
    // Authenticated requests use standard rate limiting (handled by other middleware)
    next();
  },
  authenticateFlexible,
  uploadBase64Media
);

export default router;


