/**
 * Request Deduplication Middleware
 * Prevents duplicate GET requests within a time window
 * Uses Redis to track recent requests and return cached responses
 */

import { getRedisClient } from '../../config/redis.js';
import crypto from 'crypto';

// In-memory fallback cache if Redis is not available
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 5000; // 5 seconds for memory cache

/**
 * Generate a unique key for a request
 * @param {Object} req - Express request object
 * @returns {string} Unique request key
 */
function generateRequestKey(req) {
  const method = req.method.toUpperCase();
  const path = req.path || req.url.split('?')[0];
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  
  // Include user ID if authenticated to prevent cross-user cache hits
  const userId = req.user?.id || req.user?._id || req.auth?.userId || 'anonymous';
  
  // Create hash of query string for consistent key generation
  const queryHash = queryString 
    ? crypto.createHash('md5').update(queryString).digest('hex').substring(0, 8)
    : '';
  
  return `req:${method}:${path}:${userId}:${queryHash}`;
}

/**
 * Request deduplication middleware
 * Only applies to GET requests to prevent duplicate polling requests
 * @param {Object} options - Configuration options
 * @param {number} options.windowMs - Time window in milliseconds (default: 2000ms)
 * @param {Array} options.excludePaths - Paths to exclude from deduplication
 * @returns {Function} Express middleware
 */
export function requestDeduplication(options = {}) {
  const {
    windowMs = 2000, // 2 second window for deduplication
    excludePaths = [
      '/auth/', // Exclude auth endpoints
      '/admin/', // Exclude admin endpoints (they need fresh data)
      '/restaurant/orders', // Exclude order endpoints (they need real-time updates)
      '/order/', // Exclude order endpoints
      '/delivery/', // Exclude delivery endpoints
    ]
  } = options;

  return async (req, res, next) => {
    // Only apply to GET requests
    if (req.method.toUpperCase() !== 'GET') {
      return next();
    }

    // Check if path should be excluded
    const path = req.path || req.url.split('?')[0];
    const shouldExclude = excludePaths.some(excludePath => path.includes(excludePath));
    
    if (shouldExclude) {
      return next();
    }

    try {
      const redisClient = getRedisClient();
      const requestKey = generateRequestKey(req);
      const cacheKey = `dedup:${requestKey}`;

      // Try Redis first
      if (redisClient && redisClient.isOpen) {
        const cachedResponse = await redisClient.get(cacheKey);
        
        if (cachedResponse) {
          // Return cached response
          const parsedResponse = JSON.parse(cachedResponse);
          res.status(parsedResponse.status || 200).json(parsedResponse.data);
          return;
        }

        // Mark this request as pending
        await redisClient.setEx(
          cacheKey,
          Math.ceil(windowMs / 1000),
          JSON.stringify({ pending: true, timestamp: Date.now() })
        );

        // Store original json method
        const originalJson = res.json.bind(res);
        
        // Override json method to cache response
        res.json = function(data) {
          // Cache the response
          if (redisClient && redisClient.isOpen) {
            redisClient.setEx(
              cacheKey,
              Math.ceil(windowMs / 1000),
              JSON.stringify({
                status: res.statusCode,
                data: data,
                timestamp: Date.now()
              })
            ).catch(err => {
              console.error('Failed to cache deduplicated response:', err);
            });
          }
          
          // Call original json method
          return originalJson(data);
        };

        return next();
      }

      // Fallback to memory cache if Redis not available
      const memoryCacheKey = cacheKey;
      const cached = memoryCache.get(memoryCacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < windowMs) {
        // Return cached response
        res.status(cached.status || 200).json(cached.data);
        return;
      }

      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to cache response
      res.json = function(data) {
        // Cache the response in memory
        memoryCache.set(memoryCacheKey, {
          status: res.statusCode,
          data: data,
          timestamp: Date.now()
        });

        // Clean up old entries periodically
        if (memoryCache.size > 1000) {
          const now = Date.now();
          for (const [key, value] of memoryCache.entries()) {
            if (now - value.timestamp > MEMORY_CACHE_TTL) {
              memoryCache.delete(key);
            }
          }
        }
        
        // Call original json method
        return originalJson(data);
      };

      next();
    } catch (error) {
      // On error, allow request to proceed normally
      console.error('Request deduplication error:', error);
      next();
    }
  };
}
