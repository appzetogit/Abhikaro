/**
 * JWT Token Utilities
 * Decode and extract information from JWT tokens
 */

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
    console.error('Error decoding token:', error);
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
    
    if (isTokenExpired(token)) {
      // Token expired, clear it
      clearModuleAuth(module);
      return null;
    }
    
    return getRoleFromToken(token);
  }
  
  // Legacy: check all modules and return the first valid role found
  // This is for backward compatibility but should be avoided
  const modules = ['user', 'restaurant', 'delivery', 'admin'];
  for (const mod of modules) {
    const token = getModuleToken(mod);
    if (token && !isTokenExpired(token)) {
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
  
  if (isTokenExpired(token)) {
    clearModuleAuth(module);
    return false;
  }
  
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
  const modules = ['admin', 'restaurant', 'delivery', 'user'];
  modules.forEach(module => {
    clearModuleAuth(module);
  });
  // Also clear legacy token if it exists
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
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
        console.warn('Failed to store user data, but token was stored:', userError);
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
        console.error('Failed to store auth data after clearing space:', retryError);
        throw new Error('Unable to store authentication data. Please clear browser storage and try again.');
      }
    } else {
      console.error('[setAuthData] Error storing auth data:', error);
      throw error;
    }
  }
}

