/**
 * JWT Token Utilities
 * Decode and extract information from JWT tokens
 */

import { log } from "./logger.js";

/**
 * Decode JWT token without verification (client-side only)
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded token payload or null if invalid
 */
export function decodeToken(token) {
  if (!token) return null;

  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode base64url encoded payload
    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    
    return decoded;
  } catch (error) {
    log.error('Error decoding token:', error);
    return null;
  }
}

/**
 * Get user role from token
 * @param {string} token - JWT token
 * @returns {string|null} - User role or null if not found
 */
export function getRoleFromToken(token) {
  const decoded = decodeToken(token);
  return decoded?.role || null;
}

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} - True if expired or invalid
 */
export function isTokenExpired(token) {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  
  // exp is in seconds, Date.now() is in milliseconds
  return decoded.exp * 1000 < Date.now();
}

/**
 * Get user ID from token
 * @param {string} token - JWT token
 * @returns {string|null} - User ID or null if not found
 */
export function getUserIdFromToken(token) {
  const decoded = decodeToken(token);
  return decoded?.userId || decoded?.id || null;
}

/**
 * Check if user has access to a module based on role
 * @param {string} role - User role
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {boolean} - True if user has access
 */
export function hasModuleAccess(role, module) {
  const roleModuleMap = {
    'admin': 'admin',
    'restaurant': 'restaurant',
    'delivery': 'delivery',
    'user': 'user'
  };

  return roleModuleMap[role] === module;
}

/**
 * Get module-specific access token (checks sessionStorage first, then localStorage for "Remember Me")
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {string|null} - Access token or null
 */
export function getModuleToken(module) {
  const key = `${module}_accessToken`;
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

/**
 * Get current user's role from a specific module's token
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {string|null} - Current user role or null
 */
export function getCurrentUserRole(module = null) {
  // If module is specified, check that module's token
  if (module) {
    const token = getModuleToken(module);
    if (!token) return null;

    // NOTE:
    // Don't auto-clear expired tokens here. Access token expiry should be
    // handled by the axios refresh-token flow so that the user stays
    // logged in as long as the refresh token is valid.
    return getRoleFromToken(token);
  }
  
  // Legacy: check all modules and return the first valid role found
  // This is for backward compatibility but should be avoided
  const modules = ['user', 'restaurant', 'delivery', 'admin'];
  for (const mod of modules) {
    const token = getModuleToken(mod);
    if (token) {
      return getRoleFromToken(token);
    }
  }
  
  return null;
}

/**
 * Check if user is authenticated for a specific module
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {boolean} - True if authenticated
 */
export function isModuleAuthenticated(module) {
  const token = getModuleToken(module);
  if (!token) return false;

  // Don't auto-logout on access token expiry here. Let the axios response
  // interceptor handle 401s by calling the appropriate refresh-token API.
  // If refresh also fails, the interceptor will clear auth data and redirect.
  return true;
}

/**
 * Clear authentication data for a specific module (both session and local storage)
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 */
export function clearModuleAuth(module) {
  const prefix = `${module}_`;
  ['accessToken', 'authenticated', 'user'].forEach(suffix => {
    localStorage.removeItem(prefix + suffix);
    sessionStorage.removeItem(prefix + suffix);
  });
  sessionStorage.removeItem(`${module}AuthData`);
}

/**
 * Clear all authentication data for all modules
 */
export function clearAuthData() {
  const modules = ['admin', 'restaurant', 'delivery', 'user', 'hotel'];
  modules.forEach(module => {
    clearModuleAuth(module);
  });
  // Also clear legacy token if it exists
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
}

// Dedupe and throttle refresh attempts to avoid duplicate 401 spam
let restoreSessionInFlight = new Map();
let restoreSessionLastFailedAt = new Map();
const RESTORE_SESSION_FAILURE_COOLDOWN_MS = 60 * 1000;

/**
 * Try to restore module session using refresh token cookie.
 * - If access token already exists for the module, does nothing.
 * - If not, calls the module's refresh-token endpoint (cookie-based) and stores new token.
 * - Intended to be called once on app startup (e.g. in App.jsx).
 *
 * This keeps users logged in across app restarts as long as the refresh
 * token cookie is valid, even if the app process or WebView is killed.
 *
 * @param {string} module - Module name (admin, restaurant, delivery, user, hotel)
 * @returns {Promise<boolean>} true if session was restored, false otherwise
 */
export async function restoreModuleSession(module = 'user') {
  // If a refresh attempt is already running for this module, reuse it.
  if (restoreSessionInFlight.has(module)) {
    return restoreSessionInFlight.get(module);
  }

  // If refresh just failed recently for this module, skip repeated attempts.
  const now = Date.now();
  const lastFailed = restoreSessionLastFailedAt.get(module) || 0;
  if (now - lastFailed < RESTORE_SESSION_FAILURE_COOLDOWN_MS) {
    return false;
  }

  const promise = (async () => {
    try {
      // If module already has an access token, don't do anything.
      const existingToken = getModuleToken(module);
      if (existingToken) {
        return false;
      }

      // Lazy-load API client to avoid circular deps
      const { default: apiClient } = await import('../api/axios.js');
      const { API_ENDPOINTS } = await import('../api/config.js');

      // Determine which module's refresh endpoint to use
      let refreshEndpoint = API_ENDPOINTS.AUTH.REFRESH_TOKEN; // default to user auth

      if (module === 'admin') {
        refreshEndpoint = API_ENDPOINTS.ADMIN.AUTH?.REFRESH_TOKEN || '/admin/auth/refresh-token';
      } else if (module === 'restaurant') {
        refreshEndpoint = API_ENDPOINTS.RESTAURANT.AUTH.REFRESH_TOKEN;
      } else if (module === 'delivery') {
        refreshEndpoint = API_ENDPOINTS.DELIVERY.AUTH.REFRESH_TOKEN;
      } else if (module === 'hotel') {
        refreshEndpoint = API_ENDPOINTS.HOTEL.AUTH.REFRESH_TOKEN;
      }

      // Call refresh-token endpoint; refresh token is sent via httpOnly cookie.
      const response = await apiClient.post(
        refreshEndpoint,
        {},
        {
          withCredentials: true,
        },
      );

      const data = response?.data?.data || response?.data || {};
      const accessToken = data.accessToken;
      const user = data.user || null;

      if (!accessToken) {
        return false;
      }

      // Persist new access token so that subsequent requests are authenticated.
      // Use persistent: true so it stays in localStorage (Remember Me behavior)
      setAuthData(module, accessToken, user, { persistent: true });

      // Notify listeners that auth has changed so UI can update.
      try {
        const eventName = `${module}AuthChanged`;
        window.dispatchEvent(new Event(eventName));
        if (module === 'user') {
          window.dispatchEvent(new Event('userAuthChanged')); // Legacy compat
        }
      } catch (_) {
        // Ignore if window is not available
      }

      return true;
    } catch (error) {
      // If refresh fails (e.g. no cookie, expired token), just treat as logged out.
      restoreSessionLastFailedAt.set(module, Date.now());
      log.warn(`restoreModuleSession (${module}) failed:`, error?.message || error);
      return false;
    } finally {
      restoreSessionInFlight.delete(module);
    }
  })();

  restoreSessionInFlight.set(module, promise);
  return promise;
}

/**
 * Try to restore user session using refresh token cookie.
 * @deprecated Use restoreModuleSession('user') instead
 */
export async function restoreUserSession() {
  return restoreModuleSession('user');
}

/**
 * Set authentication data for a specific module
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @param {string} token - Access token
 * @param {Object} user - User data
 * @param {Object} options - { persistent: true } use localStorage (Remember Me); false use sessionStorage
 * @throws {Error} If storage is not available or quota exceeded
 */
export function setAuthData(module, token, user, options = {}) {
  const persistent = options.persistent !== false;
  const storage = persistent ? localStorage : sessionStorage;

  try {
    if (typeof Storage === 'undefined' || !storage) {
      throw new Error('Storage is not available');
    }

    if (!module || !token) {
      throw new Error(`Invalid parameters: module=${module}, token=${!!token}`);
    }

    const tokenKey = `${module}_accessToken`;
    const authKey = `${module}_authenticated`;
    const userKey = `${module}_user`;

    // Clear the other storage so a single source of truth (session vs local)
    const other = persistent ? sessionStorage : localStorage;
    other.removeItem(tokenKey);
    other.removeItem(authKey);
    other.removeItem(userKey);

    storage.setItem(tokenKey, token);
    storage.setItem(authKey, 'true');
    if (user) {
      try {
        storage.setItem(userKey, JSON.stringify(user));
      } catch (userError) {
        log.warn('Failed to store user data, but token was stored:', userError);
      }
    }

    const storedToken = storage.getItem(tokenKey);
    const storedAuth = storage.getItem(authKey);
    if (storedToken !== token || storedAuth !== 'true') {
      throw new Error(`Token storage verification failed for module: ${module}`);
    }
  } catch (error) {
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      try {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        storage.setItem(`${module}_accessToken`, token);
        storage.setItem(`${module}_authenticated`, 'true');
        if (user) storage.setItem(`${module}_user`, JSON.stringify(user));
      } catch (retryError) {
        log.error('Failed to store auth data after clearing space:', retryError);
        throw new Error('Unable to store authentication data. Please clear browser storage and try again.');
      }
    } else {
      log.error('[setAuthData] Error storing auth data:', error);
      throw error;
    }
  }
}

