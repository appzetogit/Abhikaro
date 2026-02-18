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
 * Per-user rate limiter (more strict)
 * Limits based on authenticated user ID
 */
export const userRateLimit = createRedisRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 200, // Higher limit for authenticated users
  message: 'Too many requests from your account. Please try again later.',
  keyGenerator: (req) => {
    const userId = req.user?.id || req.user?._id || req.auth?.userId;
    if (!userId) {
      return `ratelimit:ip:${req.ip || req.connection.remoteAddress}`;
    }
    return `ratelimit:user:${userId}`;
  }
});

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
 * Strict rate limiter for sensitive endpoints (OTP, login, etc.)
 */
export const strictRateLimit = createRedisRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10, // Very strict
  message: 'Too many attempts. Please try again after some time.',
  keyGenerator: (req) => {
    const userId = req.user?.id || req.user?._id || req.auth?.userId;
    const identifier = req.body?.phone || req.body?.email || req.ip;
    return `ratelimit:strict:${userId || identifier}`;
  }
});
