import { getRedisClient } from '../../config/redis.js';

/**
 * Advanced Redis Caching Middleware
 * Supports cache invalidation, custom TTL, and conditional caching.
 */
export const redisCache = (options = {}) => {
  const {
    ttl = 600, // 10 minutes default
    keyPrefix = 'cache:',
    condition = (req) => req.method === 'GET' // Only cache GETs by default
  } = options;

  return async (req, res, next) => {
    // Skip if condition not met
    if (!condition(req)) {
      return next();
    }

    const redisClient = getRedisClient();
    if (!redisClient || !redisClient.isOpen) {
      return next();
    }

    // Generate unique cache key based on URL and query params
    const cacheKey = `${keyPrefix}${req.originalUrl || req.url}`;

    try {
      // Try to get from cache
      const cachedResponse = await redisClient.get(cacheKey);

      if (cachedResponse) {
        const { body, headers, status } = JSON.parse(cachedResponse);
        
        // Re-apply headers
        Object.entries(headers).forEach(([name, value]) => {
          res.set(name, value);
        });
        
        res.set('X-Cache', 'HIT');
        return res.status(status).send(body);
      }

      // If not in cache, hook into res.send to capture response
      const originalSend = res.send;
      res.send = function(body) {
        // Only cache successful JSON responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const responseData = {
            body,
            status: res.statusCode,
            headers: res.getHeaders(),
            timestamp: Date.now()
          };

          // Background task to save to Redis (don't await to keep response fast)
          redisClient.setEx(cacheKey, ttl, JSON.stringify(responseData))
            .catch(err => console.error('Redis Cache Set Error:', err));
        }

        res.set('X-Cache', 'MISS');
        return originalSend.call(this, body);
      };

      next();
    } catch (error) {
      console.error('Redis Cache Middleware Error:', error);
      next();
    }
  };
};

/**
 * Utility to clear cache for a specific prefix (e.g., after update)
 */
export const clearCache = async (pattern) => {
  const redisClient = getRedisClient();
  if (!redisClient || !redisClient.isOpen) return;

  try {
    const keys = await redisClient.keys(`cache:${pattern}*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`🧹 Cleared ${keys.length} cache keys for pattern: ${pattern}`);
    }
  } catch (error) {
    console.error('Clear Cache Error:', error);
  }
};
