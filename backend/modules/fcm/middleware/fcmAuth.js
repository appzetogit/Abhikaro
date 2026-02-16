import jwtService from '../../auth/services/jwtService.js';
import { errorResponse } from '../../../shared/utils/response.js';

/**
 * Lightweight auth for FCM - only verifies JWT and extracts userId + role
 * Works with user, restaurant, hotel, delivery tokens
 */
export const fcmAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'No token provided');
    }
    const token = authHeader.substring(7);
    const decoded = jwtService.verifyAccessToken(token);
    req.user = { userId: decoded.userId, role: decoded.role || 'user' };
    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};
