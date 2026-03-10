/**
 * Throttle and Debounce Utilities
 * Used to limit the rate of function calls, especially for API requests
 */

/**
 * Throttle function - ensures function is called at most once per delay period
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, delay) {
  let lastCall = 0;
  let timeoutId = null;

  return function (...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    // Clear any pending timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (timeSinceLastCall >= delay) {
      // Enough time has passed, call immediately
      lastCall = now;
      func.apply(this, args);
    } else {
      // Schedule call for when delay period has passed
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func.apply(this, args);
        timeoutId = null;
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * Debounce function - delays function execution until after delay period has passed
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @param {boolean} immediate - If true, call function immediately on first call
 * @returns {Function} Debounced function
 */
export function debounce(func, delay, immediate = false) {
  let timeoutId = null;

  return function (...args) {
    const callNow = immediate && !timeoutId;

    // Clear existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Set new timeout
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (!immediate) {
        func.apply(this, args);
      }
    }, delay);

    // Call immediately if immediate flag is set and no timeout exists
    if (callNow) {
      func.apply(this, args);
    }
  };
}

/**
 * Request throttle - specifically for API requests
 * Prevents duplicate requests within a time window
 * @param {Function} requestFn - Function that makes API request
 * @param {number} delay - Minimum delay between requests in milliseconds
 * @returns {Function} Throttled request function
 */
export function throttleRequest(requestFn, delay = 1000) {
  let lastRequestTime = 0;
  let pendingRequest = null;

  return async function (...args) {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    // If enough time has passed, make request immediately
    if (timeSinceLastRequest >= delay) {
      lastRequestTime = now;
      return requestFn.apply(this, args);
    }

    // Otherwise, wait and make request after delay
    if (pendingRequest) {
      // Cancel previous pending request
      clearTimeout(pendingRequest.timeoutId);
    }

    return new Promise((resolve, reject) => {
      const waitTime = delay - timeSinceLastRequest;
      const timeoutId = setTimeout(async () => {
        lastRequestTime = Date.now();
        pendingRequest = null;
        try {
          const result = await requestFn.apply(this, args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, waitTime);

      pendingRequest = { timeoutId, resolve, reject };
    });
  };
}

/**
 * Request debounce - specifically for API requests
 * Delays request until user stops calling it
 * @param {Function} requestFn - Function that makes API request
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced request function
 */
export function debounceRequest(requestFn, delay = 300) {
  let timeoutId = null;
  let latestArgs = null;
  let latestResolve = null;
  let latestReject = null;

  return function (...args) {
    // Store latest arguments and promise handlers
    latestArgs = args;

    // Clear existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Create new promise
    return new Promise((resolve, reject) => {
      latestResolve = resolve;
      latestReject = reject;

      // Set timeout to make request
      timeoutId = setTimeout(async () => {
        timeoutId = null;
        try {
          const result = await requestFn.apply(this, latestArgs);
          if (latestResolve) {
            latestResolve(result);
          }
        } catch (error) {
          if (latestReject) {
            latestReject(error);
          }
        }
      }, delay);
    });
  };
}
