// In-memory and localStorage + sessionStorage SWR cache manager for Admin and Restaurant orders
const memoryCache = new Map()

const DEFAULT_TTL_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Retrieve cached orders data synchronously (0ms)
 * @param {string} key Cache key
 * @returns {any|null} Cached data or null
 */
export function getOrdersCache(key) {
  if (!key) return null

  // 1. Check ultra-fast in-memory cache first (0ms)
  const memEntry = memoryCache.get(key)
  if (memEntry) {
    if (Date.now() < memEntry.expiry) {
      return memEntry.data
    }
    memoryCache.delete(key)
  }

  // 2. Fallback to localStorage (<1ms) and then sessionStorage
  try {
    const raw = localStorage.getItem(`cache_${key}`) || sessionStorage.getItem(`cache_${key}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && (!parsed.expiry || Date.now() < parsed.expiry)) {
        // Hydrate in-memory cache for subsequent instant access
        memoryCache.set(key, { data: parsed.data, expiry: parsed.expiry || Date.now() + DEFAULT_TTL_MS })
        return parsed.data
      }
      try {
        localStorage.removeItem(`cache_${key}`)
        sessionStorage.removeItem(`cache_${key}`)
      } catch {}
    }
  } catch (err) {
    // Storage access error or quota issue, non-critical
  }

  return null
}

/**
 * Save data into memory, localStorage and sessionStorage
 * @param {string} key Cache key
 * @param {any} data Data to cache
 * @param {number} [ttlMs] Time to live in ms (default 15 mins)
 */
export function setOrdersCache(key, data, ttlMs = DEFAULT_TTL_MS) {
  if (!key || data === undefined) return

  const expiry = Date.now() + ttlMs

  // Save to in-memory cache
  memoryCache.set(key, { data, expiry })

  // Store full orders dataset (up to 5000 orders)
  const trimmedData = Array.isArray(data) ? data.slice(0, 5000) : data
  const payload = JSON.stringify({ data: trimmedData, expiry })

  // Save to localStorage for cross-session/instant mount persistence
  try {
    localStorage.setItem(`cache_${key}`, payload)
  } catch (err) {
    // If localStorage quota exceeded, clear older cache keys
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith("cache_") && k !== `cache_${key}`) {
          localStorage.removeItem(k)
          break
        }
      }
      localStorage.setItem(`cache_${key}`, payload)
    } catch {}
  }

  // Also save to sessionStorage
  try {
    sessionStorage.setItem(`cache_${key}`, payload)
  } catch {}
}

/**
 * Invalidate cached items by key or prefix
 * @param {string} [prefix] Optional prefix or exact key
 */
export function clearOrdersCache(prefix = "") {
  if (!prefix) {
    memoryCache.clear()
    try {
      const storageSources = [localStorage, sessionStorage]
      storageSources.forEach(storage => {
        const keysToRemove = []
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i)
          if (k && k.startsWith("cache_")) {
            keysToRemove.push(k)
          }
        }
        keysToRemove.forEach(k => storage.removeItem(k))
      })
    } catch {}
    return
  }

  // Remove specific key or matching prefix
  for (const k of memoryCache.keys()) {
    if (k === prefix || k.startsWith(prefix)) {
      memoryCache.delete(k)
    }
  }

  try {
    const storageSources = [localStorage, sessionStorage]
    storageSources.forEach(storage => {
      const keysToRemove = []
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i)
        if (k && (k === `cache_${prefix}` || k.startsWith(`cache_${prefix}`))) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach(k => storage.removeItem(k))
    })
  } catch {}
}
