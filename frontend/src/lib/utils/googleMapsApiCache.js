/**
 * Google Maps API Cache Utility
 * Reduces API calls and billing by caching responses
 */

// Cache storage (in-memory + localStorage for persistence)
const cache = {
  geocoding: new Map(),
  directions: new Map(),
  places: new Map()
};

// Cache TTL (Time To Live) in milliseconds
const CACHE_TTL = {
  geocoding: 24 * 60 * 60 * 1000, // 24 hours (addresses don't change often)
  directions: 10 * 60 * 1000, // 10 minutes (routes can change)
  places: 24 * 60 * 60 * 1000 // 24 hours (places don't change often)
};

// Rate limiting: Max API calls per minute
const RATE_LIMITS = {
  geocoding: 10, // Max 10 geocoding calls per minute
  directions: 5, // Max 5 directions calls per minute
  places: 5 // Max 5 places calls per minute
};

// Track API call timestamps for rate limiting
const rateLimitTracker = {
  geocoding: [],
  directions: [],
  places: []
};

/**
 * Generate cache key from coordinates
 */
function generateCacheKey(type, ...args) {
  if (type === 'geocoding') {
    const [lat, lng] = args;
    // Round to 4 decimal places (~11 meters) for cache key
    return `geocoding_${Math.round(lat * 10000) / 10000}_${Math.round(lng * 10000) / 10000}`;
  } else if (type === 'directions') {
    const [origin, destination] = args;
    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    return `directions_${roundCoord(origin.lat)}_${roundCoord(origin.lng)}_${roundCoord(destination.lat)}_${roundCoord(destination.lng)}`;
  } else if (type === 'places') {
    const [lat, lng, radius] = args;
    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    return `places_${roundCoord(lat)}_${roundCoord(lng)}_${radius || 50}`;
  }
  return null;
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid(entry, ttl) {
  if (!entry) return false;
  const now = Date.now();
  return (now - entry.timestamp) < ttl;
}

/**
 * Check rate limit
 */
function checkRateLimit(type) {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  // Remove old entries
  rateLimitTracker[type] = rateLimitTracker[type].filter(timestamp => timestamp > oneMinuteAgo);
  
  // Check if limit exceeded
  if (rateLimitTracker[type].length >= RATE_LIMITS[type]) {
    return false; // Rate limit exceeded
  }
  
  // Add current timestamp
  rateLimitTracker[type].push(now);
  return true; // Within rate limit
}

/**
 * Get cached value
 */
export function getCached(type, ...args) {
  const key = generateCacheKey(type, ...args);
  if (!key) return null;
  
  const cacheMap = cache[type];
  const entry = cacheMap.get(key);
  
  if (isCacheValid(entry, CACHE_TTL[type])) {
    console.log(`✅ Using cached ${type} result for key: ${key.substring(0, 50)}...`);
    return entry.data;
  }
  
  // Remove expired entry
  if (entry) {
    cacheMap.delete(key);
  }
  
  return null;
}

/**
 * Set cached value
 */
export function setCached(type, data, ...args) {
  const key = generateCacheKey(type, ...args);
  if (!key) return;
  
  const cacheMap = cache[type];
  cacheMap.set(key, {
    data,
    timestamp: Date.now()
  });
  
  // Limit cache size (keep last 100 entries)
  if (cacheMap.size > 100) {
    const firstKey = cacheMap.keys().next().value;
    cacheMap.delete(firstKey);
  }
  
  // Also save to localStorage for persistence (only for geocoding and places)
  if (type === 'geocoding' || type === 'places') {
    try {
      const storageKey = `gm_cache_${type}_${key}`;
      localStorage.setItem(storageKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
      
      // Clean old localStorage entries (keep last 200)
      const keys = Object.keys(localStorage).filter(k => k.startsWith(`gm_cache_${type}_`));
      if (keys.length > 200) {
        // Sort by timestamp and remove oldest
        const entries = keys.map(k => ({
          key: k,
          timestamp: JSON.parse(localStorage.getItem(k) || '{}').timestamp || 0
        })).sort((a, b) => a.timestamp - b.timestamp);
        
        entries.slice(0, entries.length - 200).forEach(e => {
          localStorage.removeItem(e.key);
        });
      }
    } catch (error) {
      // localStorage might be full or disabled
      console.warn('Failed to save to localStorage:', error);
    }
  }
}

/**
 * Load from localStorage on init
 */
export function loadFromLocalStorage() {
  try {
    ['geocoding', 'places'].forEach(type => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(`gm_cache_${type}_`));
      keys.forEach(storageKey => {
        try {
          const entry = JSON.parse(localStorage.getItem(storageKey));
          if (isCacheValid(entry, CACHE_TTL[type])) {
            const key = storageKey.replace(`gm_cache_${type}_`, '');
            cache[type].set(key, entry);
          } else {
            localStorage.removeItem(storageKey);
          }
        } catch (error) {
          localStorage.removeItem(storageKey);
        }
      });
    });
    console.log('✅ Loaded Google Maps API cache from localStorage');
  } catch (error) {
    console.warn('Failed to load from localStorage:', error);
  }
}

/**
 * Check if API call should be made (rate limit check)
 */
export function shouldMakeApiCall(type) {
  return checkRateLimit(type);
}

/**
 * Clear cache
 */
export function clearCache(type = null) {
  if (type) {
    cache[type].clear();
    if (type === 'geocoding' || type === 'places') {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(`gm_cache_${type}_`));
      keys.forEach(k => localStorage.removeItem(k));
    }
  } else {
    Object.keys(cache).forEach(t => {
      cache[t].clear();
      const keys = Object.keys(localStorage).filter(k => k.startsWith(`gm_cache_${t}_`));
      keys.forEach(k => localStorage.removeItem(k));
    });
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    geocoding: cache.geocoding.size,
    directions: cache.directions.size,
    places: cache.places.size,
    total: cache.geocoding.size + cache.directions.size + cache.places.size
  };
}

// Load from localStorage on module load
if (typeof window !== 'undefined') {
  loadFromLocalStorage();
}
