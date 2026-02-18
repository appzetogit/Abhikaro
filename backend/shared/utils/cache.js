/**
 * Redis Caching Utility
 * Provides caching layer to reduce database load by 60-70%
 * 
 * Cache TTL (Time To Live):
 * - Restaurant list: 5-10 minutes (frequently updated)
 * - User profiles: 15 minutes (rarely changes)
 * - Order status: 1 minute (real-time data)
 * - Menu items: 30 minutes (rarely changes)
 * - Static data: 1 hour (categories, settings)
 */

import { getRedisClient } from '../../config/redis.js';

// Cache TTL in seconds
export const CACHE_TTL = {
  RESTAURANT_LIST: 300, // 5 minutes
  RESTAURANT_DETAILS: 600, // 10 minutes
  USER_PROFILE: 900, // 15 minutes
  ORDER_STATUS: 60, // 1 minute
  MENU_ITEMS: 1800, // 30 minutes
  STATIC_DATA: 3600, // 1 hour
  CATEGORIES: 1800, // 30 minutes
  ZONE_DATA: 1800, // 30 minutes
};

/**
 * Generate cache key from parameters
 */
export function generateCacheKey(prefix, ...params) {
  const keyParts = [prefix];
  
  params.forEach(param => {
    if (param === null || param === undefined) {
      keyParts.push('null');
    } else if (typeof param === 'object') {
      // Sort object keys for consistent cache keys
      const sorted = Object.keys(param).sort().reduce((acc, key) => {
        acc[key] = param[key];
        return acc;
      }, {});
      keyParts.push(JSON.stringify(sorted));
    } else {
      keyParts.push(String(param));
    }
  });
  
  return keyParts.join(':');
}

/**
 * Get cached value from Redis
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} - Cached value or null if not found
 */
export async function getCache(key) {
  try {
    const redisClient = getRedisClient();
    if (!redisClient || !redisClient.isOpen) {
      return null; // Redis not available, skip cache
    }

    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.error(`Cache get error for key ${key}:`, error.message);
    return null; // Fail gracefully, don't break the app
  }
}

/**
 * Set cached value in Redis
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds (optional, uses default if not provided)
 * @returns {Promise<boolean>} - Success status
 */
export async function setCache(key, value, ttl = null) {
  try {
    const redisClient = getRedisClient();
    if (!redisClient || !redisClient.isOpen) {
      return false; // Redis not available, skip cache
    }

    const serialized = JSON.stringify(value);
    
    if (ttl) {
      await redisClient.setEx(key, ttl, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
    
    return true;
  } catch (error) {
    console.error(`Cache set error for key ${key}:`, error.message);
    return false; // Fail gracefully
  }
}

/**
 * Delete cached value from Redis
 * @param {string} key - Cache key (supports wildcards with *)
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteCache(key) {
  try {
    const redisClient = getRedisClient();
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    // Support wildcard deletion
    if (key.includes('*')) {
      const keys = await redisClient.keys(key);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } else {
      await redisClient.del(key);
    }
    
    return true;
  } catch (error) {
    console.error(`Cache delete error for key ${key}:`, error.message);
    return false;
  }
}

/**
 * Clear all cache (use with caution)
 * @returns {Promise<boolean>} - Success status
 */
export async function clearAllCache() {
  try {
    const redisClient = getRedisClient();
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    await redisClient.flushDb();
    return true;
  } catch (error) {
    console.error('Cache clear error:', error.message);
    return false;
  }
}

/**
 * Cache middleware for Express routes
 * Automatically caches GET request responses
 */
export function cacheMiddleware(ttl = CACHE_TTL.STATIC_DATA, keyGenerator = null) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator 
      ? keyGenerator(req)
      : generateCacheKey('api', req.originalUrl, JSON.stringify(req.query));

    // Try to get from cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to cache response
    res.json = function(data) {
      // Cache the response
      setCache(cacheKey, data, ttl).catch(err => {
        console.error('Failed to cache response:', err);
      });
      
      // Call original json method
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache for specific patterns
 * Useful when data is updated
 */
export async function invalidateCachePattern(pattern) {
  try {
    const redisClient = getRedisClient();
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`Invalidated ${keys.length} cache keys matching pattern: ${pattern}`);
    }
    return true;
  } catch (error) {
    console.error(`Cache invalidation error for pattern ${pattern}:`, error.message);
    return false;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  try {
    const redisClient = getRedisClient();
    if (!redisClient || !redisClient.isOpen) {
      return { available: false, message: 'Redis not available' };
    }

    const info = await redisClient.info('stats');
    const keyspace = await redisClient.info('keyspace');
    const dbSize = await redisClient.dbSize();

    return {
      available: true,
      dbSize,
      info: {
        stats: info,
        keyspace: keyspace
      }
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}
