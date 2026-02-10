import jwtService from '../../auth/services/jwtService.js';
import Hotel from '../models/Hotel.js';
import { errorResponse } from '../../../shared/utils/response.js';

/**
 * Hotel Authentication Middleware
 * Verifies JWT access token and attaches hotel to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'No token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Ensure it's a hotel token
    if (decoded.role !== 'hotel') {
      return errorResponse(res, 403, 'Invalid token. Hotel access required.');
    }

    // Get hotel from database
    const hotel = await Hotel.findById(decoded.userId).select('-password');
    
    if (!hotel) {
      console.error('❌ Hotel not found in database:', {
        userId: decoded.userId,
        role: decoded.role,
        email: decoded.email,
      });
      return errorResponse(res, 401, 'Hotel not found');
    }

    // Allow inactive hotels to access profile, requests, and wallet routes
    const requestPath = req.originalUrl || req.url || '';
    const reqPath = req.path || '';
    
    const isProfileRoute = requestPath.includes('/auth/me') || 
                          reqPath === '/me' ||
                          requestPath.includes('/profile');
    
    const isRequestsRoute = requestPath.includes('/requests') || 
                            reqPath.includes('/requests');

    const isWalletRoute = requestPath.includes('/wallet') ||
                          reqPath.includes('/wallet');
    
    // Allow access to profile, requests, and wallet routes even if inactive
    if (!hotel.isActive && !isProfileRoute && !isRequestsRoute && !isWalletRoute) {
      console.error('❌ Hotel account is inactive - access denied:', {
        hotelId: hotel._id,
        hotelName: hotel.hotelName,
        isActive: hotel.isActive,
        requestPath,
      });
      return errorResponse(res, 401, 'Hotel account is inactive. Please wait for admin approval.');
    }

    // Attach hotel to request
    req.hotel = hotel;
    req.token = decoded;
    
    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};

export default { authenticate };
