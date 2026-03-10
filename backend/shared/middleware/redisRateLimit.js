/**
 * Per-User Rate Limiting Middleware using Redis
 * More effective than IP-based rate limiting
 * Prevents single user from overwhelming the system
 */

import { getRedisClient } from '../../config/redis.js';

/**
 * Create rate limiter middleware
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Maximum requests per window
 * @param {string} options.message - Error message
 * @param {Function} options.keyGenerator - Function to generate rate limit key (default: uses userId or IP)
 */
export function createRedisRateLimit(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    maxRequests = 100,
    message = 'Too many requests, please try again later.',
    keyGenerator = null
  } = options;

  return async (req, res, next) => {
    try {
      const redisClient = getRedisClient();
      
      // If Redis not available, skip rate limiting (fallback to express-rate-limit)
      if (!redisClient || !redisClient.isOpen) {
        return next();
      }

      // Generate rate limit key
      let rateLimitKey;
      if (keyGenerator) {
        rateLimitKey = keyGenerator(req);
      } else {
        // Default: Use userId if authenticated, otherwise use IP
        const userId = req.user?.id || req.user?._id || req.auth?.userId;
        rateLimitKey = userId 
          ? `ratelimit:user:${userId}`
          : `ratelimit:ip:${req.ip || req.connection.remoteAddress}`;
      }

      // Get current request count
      const current = await redisClient.get(rateLimitKey);
      const count = current ? parseInt(current) : 0;

      if (count >= maxRequests) {
        // Get TTL to show when limit resets
        const ttl = await redisClient.ttl(rateLimitKey);
        
        return res.status(429).json({
          success: false,
          message,
          retryAfter: Math.ceil(ttl / 1000), // seconds
          limit: maxRequests,
          window: Math.ceil(windowMs / 1000) // seconds
        });
      }

      // Increment counter
      const newCount = count + 1;
      
      if (newCount === 1) {
        // First request in window, set with TTL
        await redisClient.setEx(rateLimitKey, Math.ceil(windowMs / 1000), String(newCount));
      } else {
        // Increment existing counter
        await redisClient.incr(rateLimitKey);
      }

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': Math.max(0, maxRequests - newCount),
        'X-RateLimit-Reset': new Date(Date.now() + windowMs).toISOString()
      });

      next();
    } catch (error) {
      console.error('Rate limit error:', error);
      // On error, allow request (fail open)
      next();
    }
  };
}

/**
 * Tiered rate limits based on user role
 * Different limits for different user types
 */
const ROLE_RATE_LIMITS = {
  admin: { maxRequests: 1500, windowMs: 15 * 60 * 1000 }, // Admins get highest limit (increased from 1000)
  restaurant: { maxRequests: 800, windowMs: 15 * 60 * 1000 }, // Restaurants need higher limits (increased from 500)
  // Delivery partners send frequent location updates + order status pings,
  // so we keep this limit very high to avoid impacting normal usage.
  delivery: { maxRequests: 4000, windowMs: 15 * 60 * 1000 }, // Delivery partners (relaxed from 600)
  user: { maxRequests: 300, windowMs: 15 * 60 * 1000 }, // Regular users (increased from 200)
  default: { maxRequests: 100, windowMs: 15 * 60 * 1000 }, // Unauthenticated (kept strict)
};

/**
 * Per-user rate limiter with tiered limits based on role
 * Limits based on authenticated user ID and role
 */
export const userRateLimit = createRedisRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 200, // Default, will be overridden by role
  message: 'Too many requests from your account. Please try again later.',
  keyGenerator: (req) => {
    const userId = req.user?.id || req.user?._id || req.auth?.userId;
    const role = req.user?.role || req.auth?.role;
    
    if (!userId) {
      return `ratelimit:ip:${req.ip || req.connection.remoteAddress}`;
    }
    return `ratelimit:user:${userId}:role:${role || 'user'}`;
  }
});

/**
 * Enhanced user rate limiter with role-based limits
 */
export const tieredUserRateLimit = async (req, res, next) => {
  try {
    const redisClient = getRedisClient();
    
    // If Redis not available, skip rate limiting
    if (!redisClient || !redisClient.isOpen) {
      return next();
    }

    // Skip rate limiting for high-frequency, low-risk public endpoints
    // (reverse geocode, order price preview, public env/business settings, user passive location updates)
  const path = req.path || '';

  // Skip rate limiting for high-frequency, low-risk public endpoints
  // (reverse geocode, order price preview, public env/business settings, user passive location updates)
  if (
      path.startsWith('/location/reverse') ||
      path.startsWith('/order/calculate') ||
      path === '/order' ||
      path === '/env/public' ||
      path === '/user/location' ||
      path === '/business-settings/public'
  ) {
      return next();
  }

  // Delivery live location endpoints are high-frequency but low-risk.
  // They already include their own throttling on the client and extra
  // backend safeguards, so we avoid applying the generic per-user limiter.
  if (
    path.startsWith('/delivery/location') ||
    path.startsWith('/delivery/zones/in-radius')
  ) {
    return next();
  }

  // Auth / OTP endpoints already have their own strict rate limiting.
  // Avoid double‑limiting them here.
  if (
    path.startsWith('/auth/') ||
    path.startsWith('/restaurant/auth') ||
    path.startsWith('/delivery/auth') ||
    path.startsWith('/hotel/auth')
  ) {
    return next();
  }

  const userId = req.user?.id || req.user?._id || req.auth?.userId;

  // Normalise role string so it matches ROLE_RATE_LIMITS keys
  let role = (req.user?.role || req.auth?.role || 'default')
    .toString()
    .toLowerCase();

  // If role isn't directly mapped, infer from path so admins/restaurants/delivery
  // don't fall back to the very strict "default" bucket.
  if (!ROLE_RATE_LIMITS[role]) {
    if (path.startsWith('/admin/')) {
      role = 'admin';
    } else if (path.startsWith('/restaurant/')) {
      role = 'restaurant';
    } else if (path.startsWith('/delivery/')) {
      role = 'delivery';
    } else {
      role = 'default';
    }
  }
    
    // Get rate limit config for this role
    const limitConfig = ROLE_RATE_LIMITS[role] || ROLE_RATE_LIMITS.default;
    
    // Generate rate limit key
    const rateLimitKey = userId 
      ? `ratelimit:user:${userId}:role:${role}`
      : `ratelimit:ip:${req.ip || req.connection.remoteAddress}`;

    // Get current request count
    const current = await redisClient.get(rateLimitKey);
    const count = current ? parseInt(current) : 0;

    if (count >= limitConfig.maxRequests) {
      // Get TTL to show when limit resets
      const ttl = await redisClient.ttl(rateLimitKey);
      
      return res.status(429).json({
        success: false,
        message: 'Too many requests from your account. Please try again later.',
        retryAfter: Math.ceil(ttl),
        limit: limitConfig.maxRequests,
        window: Math.ceil(limitConfig.windowMs / 1000),
        role: role
      });
    }

    // Increment counter
    const newCount = count + 1;
    
    if (newCount === 1) {
      // First request in window, set with TTL
      await redisClient.setEx(rateLimitKey, Math.ceil(limitConfig.windowMs / 1000), String(newCount));
    } else {
      // Increment existing counter
      await redisClient.incr(rateLimitKey);
    }

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': limitConfig.maxRequests,
      'X-RateLimit-Remaining': Math.max(0, limitConfig.maxRequests - newCount),
      'X-RateLimit-Reset': new Date(Date.now() + limitConfig.windowMs).toISOString(),
      'X-RateLimit-Role': role
    });

    next();
  } catch (error) {
    console.error('Tiered rate limit error:', error);
    // On error, allow request (fail open)
    next();
  }
};

/**
 * Per-IP rate limiter (for unauthenticated requests)
 */
export const ipRateLimit = createRedisRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // Lower limit for IP-based
  message: 'Too many requests from this IP. Please try again later.',
  keyGenerator: (req) => `ratelimit:ip:${req.ip || req.connection.remoteAddress}`
});

/**
 * Normalize phone number for rate limiting
 * @param {string} phone - Phone number to normalize
 * @returns {string} - Normalized phone number
 */
function normalizePhoneForRateLimit(phone) {
  if (!phone || typeof phone !== 'string') {
    return phone;
  }
  // Remove all non-digit characters
  const digitsOnly = phone.trim().replace(/\D/g, '');
  // Handle Indian phone numbers (most common case)
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return `91${digitsOnly.substring(1)}`;
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return digitsOnly;
  }
  return digitsOnly;
}

/**
 * Strict rate limiter for sensitive endpoints (OTP, login, etc.)
 */
export const strictRateLimit = createRedisRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20, // Increased from 10 to 20 for better UX
  message: 'Too many attempts. Please try again after some time.',
  keyGenerator: (req) => {
    const userId = req.user?.id || req.user?._id || req.auth?.userId;
    if (userId) {
      return `ratelimit:strict:user:${userId}`;
    }
    // Normalize phone/email for consistent rate limiting
    let identifier = req.ip || 'unknown';
    if (req.body?.phone) {
      identifier = normalizePhoneForRateLimit(req.body.phone);
    } else if (req.body?.email) {
      identifier = req.body.email.toLowerCase().trim();
    }
    return `ratelimit:strict:${identifier}`;
  }
});
