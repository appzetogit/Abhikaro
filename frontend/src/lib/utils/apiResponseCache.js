/**
 * Lightweight API response cache (memory + sessionStorage).
 *
 * Use this for read-heavy public endpoints (home page banners/categories etc.)
 * to avoid re-fetching on app refresh or quick back/forward navigations.
 */
import { log } from "./logger.js";

const PREFIX = "abhikaro_api_cache:";
const memory = new Map();

function now() {
  return Date.now();
}

function buildKey(key) {
  return `${PREFIX}${key}`;
}

function safeJsonParse(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeSessionGet(storageKey) {
  try {
    return sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function safeSessionSet(storageKey, value) {
  try {
    sessionStorage.setItem(storageKey, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get cached value if not expired.
 * @param {string} key cache key (recommend: method:url)
 * @param {number} ttlMs time-to-live in ms
 */
export function getCachedResponse(key, ttlMs) {
  if (!key || !Number.isFinite(ttlMs) || ttlMs <= 0) return null;

  const k = buildKey(key);
  const entry = memory.get(k);
  if (entry && now() - entry.ts <= ttlMs) {
    return entry.data ?? null;
  }

  const raw = safeSessionGet(k);
  const parsed = safeJsonParse(raw);
  if (parsed && typeof parsed === "object" && Number.isFinite(parsed.ts)) {
    if (now() - parsed.ts <= ttlMs) {
      memory.set(k, parsed);
      return parsed.data ?? null;
    }
  }

  // Expired or invalid → cleanup
  memory.delete(k);
  try {
    sessionStorage.removeItem(k);
  } catch {
    // ignore
  }
  return null;
}

/**
 * Set cached value (also writes to sessionStorage).
 * @param {string} key cache key (recommend: method:url)
 * @param {any} data JSON-serializable payload
 */
export function setCachedResponse(key, data) {
  if (!key) return;
  const k = buildKey(key);
  const entry = { ts: now(), data };
  memory.set(k, entry);

  const ok = safeSessionSet(k, JSON.stringify(entry));
  if (!ok && import.meta.env.DEV) {
    log.debug("[apiResponseCache] Failed to persist cache (sessionStorage).");
  }
}

export function clearCachedResponseByPrefix(prefix) {
  const fullPrefix = buildKey(prefix || "");

  for (const k of Array.from(memory.keys())) {
    if (k.startsWith(fullPrefix)) memory.delete(k);
  }

  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const storageKey = sessionStorage.key(i);
      if (storageKey && storageKey.startsWith(fullPrefix)) {
        sessionStorage.removeItem(storageKey);
      }
    }
  } catch {
    // ignore
  }
}

