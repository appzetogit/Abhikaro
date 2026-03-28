// Network status utility
// Centralized detection of online / offline / slow network for the whole app

import { API_BASE_URL } from "../api/config.js";

// Possible values: 'online' | 'slow' | 'offline' | 'backend_unavailable'
let currentStatus = "online";

const listeners = new Set();

const SLOW_THRESHOLD_MS = 3000; // >3s to /health => treat as slow
const PING_TIMEOUT_MS = 5000;   // hard timeout for health request
const PING_INTERVAL_MS = 15000; // periodic health check

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(currentStatus);
    } catch (e) {
      // Ignore listener errors so one bad subscriber doesn't break others
      console.error("[networkStatus] Listener error:", e);
    }
  }
}

function setStatus(newStatus) {
  if (currentStatus === newStatus) return;
  currentStatus = newStatus;
  if (import.meta.env.DEV) {
    console.log("[networkStatus] Status changed:", newStatus);
  }
  notifyListeners();
}

async function pingBackend() {
  if (typeof window === "undefined") {
    // In non-browser environments, assume online and skip
    return;
  }

  const baseUrl = API_BASE_URL.replace("/api", "");
  const healthUrl = `${baseUrl}/health`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  const start = performance.now();

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const elapsed = performance.now() - start;

    if (navigator.onLine === false) {
      setStatus("offline");
    } else if (elapsed > SLOW_THRESHOLD_MS) {
      setStatus("slow");
    } else {
      setStatus("online");
    }
  } catch (error) {
    clearTimeout(timeoutId);
    // Only mark the app as offline when the browser itself is offline.
    // A failed health check while online means the backend is unavailable.
    setStatus(navigator.onLine === false ? "offline" : "backend_unavailable");
    if (import.meta.env.DEV) {
      console.warn("[networkStatus] Health check failed:", error?.message || error);
    }
  }
}

function initBrowserListeners() {
  if (typeof window === "undefined") return;
  if (window.__networkStatusInitialized) return;
  window.__networkStatusInitialized = true;

  // Initial state from browser
  if (navigator.onLine === false) {
    currentStatus = "offline";
  } else {
    currentStatus = "online";
  }

  window.addEventListener("online", () => {
    // When browser comes online, treat as at least slow until health check confirms
    setStatus("slow");
    pingBackend().catch(() => {});
  });

  window.addEventListener("offline", () => {
    setStatus("offline");
  });

  // Periodic backend health checks
  setTimeout(() => {
    pingBackend().catch(() => {});
  }, 2000);

  setInterval(() => {
    pingBackend().catch(() => {});
  }, PING_INTERVAL_MS);
}

// Initialize immediately in browser environments
if (typeof window !== "undefined") {
  initBrowserListeners();
}

// Public API
export function getNetworkStatus() {
  return currentStatus;
}

export function isOnline() {
  return currentStatus === "online";
}

export function isSlow() {
  return currentStatus === "slow";
}

export function isOffline() {
  return currentStatus === "offline";
}

export function isBackendUnavailable() {
  return currentStatus === "backend_unavailable";
}

export function subscribeNetworkStatus(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  // Immediately notify with current status
  try {
    listener(currentStatus);
  } catch (e) {
    console.error("[networkStatus] Listener error on subscribe:", e);
  }
  return () => {
    listeners.delete(listener);
  };
}

