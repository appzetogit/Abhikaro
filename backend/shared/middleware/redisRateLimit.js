import { getRedisClient } from '../../config/redis.js';
import { getClientIp } from '../utils/ipUtils.js';

// Simple correlation ID generator for rate-limit events
function createRateLimitCorrelationId() {
  const rand = Math.random().toString(36).substring(2, 8);
  const ts = Date.now().toString(36);
  return `rl_${ts}_${rand}`;
}

// Lua script for sliding window rate limiting
// KEYS[1] = rate limit key
// ARGV[1] = current timestamp (ms)
// ARGV[2] = window size (ms)
// ARGV[3] = max requests
const SLIDING_WINDOW_LUA = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local limit = tonumber(ARGV[3])
  
  -- Remove old requests outside the window
  redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
  
  -- Count current requests in window
  local current_count = redis.call('ZCARD', key)
  
  if current_count < limit then
    -- Add current request
    redis.call('ZADD', key, now, now)
    -- Set expiry for the whole set to window size
    redis.call('PEXPIRE', key, window)
    return {current_count + 1, 0} -- {current_count, blocked (0=no)}
  else
    -- Blocked, return current count and TTL of the oldest item
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after = 0
    if #oldest > 0 then
      retry_after = math.max(0, math.floor((tonumber(oldest[2]) + window - now) / 1000))
    end
    return {current_count, 1, retry_after} -- {current_count, blocked (1=yes), retry_after}
  end
`;

/**
 * Tiered rate limits based on user role
 * Different limits for different user types
 */
export const ROLE_RATE_LIMITS = {
  admin: { maxRequests: 3000, windowMs: 15 * 60 * 1000 },
  restaurant: { maxRequests: 2000, windowMs: 15 * 60 * 1000 },
  delivery: { maxRequests: 5000, windowMs: 15 * 60 * 1000 },
  hotel: { maxRequests: 1000, windowMs: 15 * 60 * 1000 },
  user: { maxRequests: 2500, windowMs: 15 * 60 * 1000 },
  default: { maxRequests: 1500, windowMs: 15 * 60 * 1000 }, // Anonymous traffic
};

/**
 * Enhanced user rate limiter with role-based limits and sliding window logic.
 * This is the primary entry point for all /api/ requests.
 */
export const tieredUserRateLimit = async (req, res, next) => {
  const path = req.path || '';
  const method = req.method;
  
  try {
    const redisClient = getRedisClient();
    
    // FAIL-OPEN for PUBLIC GET ENDPOINTS if Redis is down
    const isPublicGet = method === 'GET' && (
      path.startsWith('/location/reverse') ||
      path.includes('/public') ||
      path.startsWith('/restaurant/list') ||
      path.startsWith('/dining/restaurants') ||
      path.includes('/zones/detect') ||
      path.startsWith('/hero-banner')
    );

    if (!redisClient || !redisClient.isOpen) {
      return next();
    }

    // 1. SKIP LIST - CRITICAL FOR SCALING (5000+ USERS)
    // These paths bypass rate limiting entirely to reduce Redis load
    // Note: We use path.includes for some to match both /zones/detect and /api/zones/detect
    if (
      path.startsWith('/location/reverse') ||
      path.startsWith('/order/calculate') ||
      path === '/order' ||
      path === '/env/public' ||
      path === '/user/location' ||
      path.includes('/business-settings/public') ||
      path.includes('/categories/public') ||
      path.includes('/zones/detect') ||
      path.includes('/hero-banners/public') ||
      path.includes('/fee-settings/public') ||
      path.includes('/about/public') ||
      path.includes('/terms/public') ||
      path.includes('/privacy/public') ||
      path.includes('/refund/public') ||
      path.includes('/shipping/public') ||
      path.includes('/cancellation/public') ||
      path.includes('/zones/public') ||
      path.startsWith('/restaurant/list') ||
      path.startsWith('/hotel/public') ||
      path.includes('/hero-banner') ||
      path.startsWith('/dining/restaurants') ||
      path.startsWith('/delivery/location') ||
      path.startsWith('/delivery/zones/in-radius')
    ) {
      return next();
    }

    // Avoid double-limiting auth endpoints (they have their own strict logic)
    if (path.includes('/auth/')) return next();

    // 2. IDENTIFY USER & ROLE
    const userId = req.user?.id || req.user?._id || 
                   req.auth?.userId || 
                   req.restaurant?._id || req.restaurant?.id ||
                   req.admin?._id || req.admin?.id ||
                   req.deliveryPartner?._id || req.deliveryPartner?.id ||
                   req.hotel?._id || req.hotel?.id;

    const rawRole = (req.user?.role || req.auth?.role || req.restaurant?.role || req.admin?.role || req.deliveryPartner?.role || req.hotel?.role || 'default')
      .toString().toLowerCase();

    // Infer role from path if not set properly (prevents admin/hotel/etc from default bucket)
    let role = rawRole;
    if (role === 'default') {
      if (path.startsWith('/admin/')) role = 'admin';
      else if (path.startsWith('/restaurant/')) role = 'restaurant';
      else if (path.startsWith('/delivery/')) role = 'delivery';
      else if (path.startsWith('/hotel/')) role = 'hotel';
    }

    const limitConfig = ROLE_RATE_LIMITS[role] || ROLE_RATE_LIMITS.default;
    const clientIp = getClientIp(req);
    
    // 3. GENERATE RATE LIMIT KEY
    // Use user ID if authenticated for stability across networks, otherwise IP
    const rateLimitKey = userId 
      ? `rl:sw:u:${userId}:r:${role}`
      : `rl:sw:ip:${clientIp}`;

    const now = Date.now();
    
    // 4. EXECUTE SLIDING WINDOW LOGIC (LUA)
    const result = await redisClient.eval(SLIDING_WINDOW_LUA, {
      keys: [rateLimitKey],
      arguments: [now.toString(), limitConfig.windowMs.toString(), limitConfig.maxRequests.toString()]
    });

    const [currentCount, isBlocked, retryAfter] = result;

    // 5. HANDLE BLOCKED REQUESTS
    if (isBlocked === 1) {
      const correlationId = createRateLimitCorrelationId();
      
      console.warn('[RateLimit] Sliding window BLOCKED', {
        correlationId,
        path,
        method,
        role,
        userId: userId || null,
        ip: clientIp,
        limit: limitConfig.maxRequests,
        count: currentCount,
        retryAfter
      });

      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please slow down and wait a moment.',
        retryAfter: retryAfter || 30,
        limit: limitConfig.maxRequests,
        window: Math.ceil(limitConfig.windowMs / 1000),
        correlationId
      });
    }

    // 6. SUCCESS - ADD HEADERS
    res.set({
      'X-RateLimit-Limit': limitConfig.maxRequests,
      'X-RateLimit-Remaining': Math.max(0, limitConfig.maxRequests - currentCount),
      'X-RateLimit-Reset': new Date(now + limitConfig.windowMs).toISOString(),
      'X-RateLimit-Role': role
    });

    next();
  } catch (error) {
    console.error('Rate Limiter Critical Error:', error);
    next(); // FAIL-OPEN
  }
};

/**
 * Strict rate limiter for sensitive endpoints (OTP, login, etc.)
 */
export const strictRateLimit = async (req, res, next) => {
  const clientIp = getClientIp(req);
  const path = req.path || '';
  
  try {
    const redisClient = getRedisClient();
    if (!redisClient || !redisClient.isOpen) return next();

    const rateLimitKey = `rl:strict:${clientIp}:${path}`;
    const result = await redisClient.eval(SLIDING_WINDOW_LUA, {
      keys: [rateLimitKey],
      arguments: [Date.now().toString(), '3600000', '20'] // 20 attempts per hour
    });

    if (result[1] === 1) {
      return res.status(429).json({
        success: false,
        message: 'Security limit reached. Please wait an hour.'
      });
    }
    next();
  } catch (err) {
    next();
  }
};

// Legacy exports for compatibility during refactoring
export const userRateLimit = tieredUserRateLimit;
export const ipRateLimit = tieredUserRateLimit;
