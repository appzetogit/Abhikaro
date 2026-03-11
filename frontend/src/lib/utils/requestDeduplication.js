/**
 * Request Deduplication Utility
 * Prevents duplicate API calls within a time window
 * Useful for polling endpoints and preventing race conditions
 */

// Store pending requests by their unique key
const pendingRequests = new Map();

// Store completed requests for deduplication window
const completedRequests = new Map();

// Avoid noisy logging in production; keep full logs only in dev
const isDev =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  import.meta.env.DEV === true;

/**
 * Generate a unique key for a request
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {any} data - Request data/params
 * @returns {string} Unique request key
 */
function generateRequestKey(method, url, data = null) {
  const methodUpper = method.toUpperCase();
  const urlNormalized = url.split('?')[0]; // Remove query params for GET requests
  
  if (methodUpper === 'GET' || methodUpper === 'DELETE') {
    // For GET/DELETE, include query params in key
    const queryString = url.includes('?') ? url.split('?')[1] : '';
    return `${methodUpper}:${urlNormalized}${queryString ? `?${queryString}` : ''}`;
  } else {
    // For POST/PUT/PATCH, include data hash
    const dataStr = data ? JSON.stringify(data) : '';
    return `${methodUpper}:${urlNormalized}:${dataStr}`;
  }
}

/**
 * Request deduplication wrapper
 * @param {Function} requestFn - The axios request function
 * @param {Object} config - Request configuration
 * @param {number} deduplicationWindow - Time window in ms (default: 1000ms)
 * @returns {Promise} Request promise
 */
export function deduplicateRequest(requestFn, config, deduplicationWindow = 1000) {
  const method = config.method || 'GET';
  const url = config.url || config;
  const data = config.data || config.params || null;
  const key = generateRequestKey(method, url, data);

  // Check if same request is already pending
  if (pendingRequests.has(key)) {
    if (isDev) {
      console.log(`🔄 Deduplicating request: ${key}`);
    }
    return pendingRequests.get(key);
  }

  // Check if same request was completed recently
  const completedRequest = completedRequests.get(key);
  if (completedRequest && (Date.now() - completedRequest.timestamp) < deduplicationWindow) {
    if (isDev) {
      console.log(`✅ Returning cached response for: ${key}`);
    }
    return Promise.resolve(completedRequest.response);
  }

  // Create new request
  const requestPromise = requestFn(config)
    .then((response) => {
      // Store completed request
      completedRequests.set(key, {
        response,
        timestamp: Date.now(),
      });

      // Clean up old completed requests (older than deduplication window)
      setTimeout(() => {
        completedRequests.delete(key);
      }, deduplicationWindow);

      return response;
    })
    .catch((error) => {
      // Don't cache errors
      throw error;
    })
    .finally(() => {
      // Remove from pending requests
      pendingRequests.delete(key);
    });

  // Store pending request
  pendingRequests.set(key, requestPromise);

  return requestPromise;
}

/**
 * Clear all cached requests (useful for logout or cache invalidation)
 */
export function clearRequestCache() {
  pendingRequests.clear();
  completedRequests.clear();
}

/**
 * Clear cached requests for a specific URL pattern
 * @param {string} urlPattern - URL pattern to match
 */
export function clearRequestCacheForPattern(urlPattern) {
  for (const key of completedRequests.keys()) {
    if (key.includes(urlPattern)) {
      completedRequests.delete(key);
    }
  }
  for (const key of pendingRequests.keys()) {
    if (key.includes(urlPattern)) {
      pendingRequests.delete(key);
    }
  }
}
