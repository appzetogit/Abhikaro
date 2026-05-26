import jwtService from '../../auth/services/jwtService.js';
import Delivery from '../models/Delivery.js';
import { errorResponse } from '../../../shared/utils/response.js';

/**
 * Delivery Authentication Middleware
 * Verifies JWT access token and attaches delivery boy to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'Authentication required. Please login first.');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Ensure it's a delivery token
    if (decoded.role !== 'delivery') {
      return errorResponse(res, 403, 'Invalid token. Delivery access required.');
    }

    // Get delivery boy from database
    const delivery = await Delivery.findById(decoded.userId).select('-password -refreshToken');
    
    if (!delivery) {
      console.error('❌ Delivery boy not found in database:', {
        userId: decoded.userId,
        role: decoded.role,
        email: decoded.email,
      });
      return errorResponse(res, 401, 'Delivery boy not found');
    }

    // Check for active session ID to prevent concurrent logins
    if (!decoded.sessionId || decoded.sessionId !== delivery.activeSessionId) {
      console.warn('❌ Delivery session invalid/expired due to login on another device:', {
        userId: decoded.userId,
        tokenSessionId: decoded.sessionId,
        activeSessionId: delivery.activeSessionId
      });
      return errorResponse(res, 401, 'Your session has expired because of a new login on another device.');
    }

    // Allow blocked/pending status partners to access (they can see rejection reason or verification message)
    // Only block if account is inactive AND not blocked/pending (blocked/pending partners can login)
    if (!delivery.isActive && delivery.status !== 'blocked' && delivery.status !== 'pending') {
      console.error('❌ Delivery boy account is inactive:', {
        deliveryId: delivery._id,
        deliveryName: delivery.name,
        isActive: delivery.isActive,
        status: delivery.status,
      });
      return errorResponse(res, 401, 'Delivery boy account is inactive');
    }

    // Attach delivery boy to request
    req.delivery = delivery;
    req.token = decoded;
    
    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};

/**
 * Optional Delivery Authentication Middleware
 * Attaches delivery boy to request if token is valid, otherwise continues
 */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwtService.verifyAccessToken(token);

    if (decoded.role === 'delivery') {
      const delivery = await Delivery.findById(decoded.userId).select('-password -refreshToken');
      if (delivery && (delivery.isActive || delivery.status === 'blocked' || delivery.status === 'pending') && decoded.sessionId === delivery.activeSessionId) {
        req.delivery = delivery;
        req.token = decoded;
      }
    }
    next();
  } catch (error) {
    next();
  }
};

export default { authenticate, optionalAuthenticate };

