import axios from "axios";
import { toast } from "sonner";
import { API_BASE_URL } from "./config.js";
import { getRoleFromToken, clearModuleAuth, getModuleToken } from "../utils/auth.js";
import { getNetworkStatus } from "../utils/networkStatus.js";
import { deduplicateRequest, clearRequestCache } from "../utils/requestDeduplication.js";

// Network error tracking to prevent spam
const networkErrorState = {
  lastErrorTime: 0,
  lastToastTime: 0,
  errorCount: 0,
  toastShown: false,
  COOLDOWN_PERIOD: 30000, // 30 seconds cooldown for console errors
  TOAST_COOLDOWN_PERIOD: 60000, // 60 seconds cooldown for toast notifications
};

// Validate API base URL on import
if (import.meta.env.DEV) {
  const backendUrl = API_BASE_URL.replace("/api", "");
  const frontendUrl = window.location.origin;

  if (API_BASE_URL.includes("5173") || backendUrl.includes("5173")) {
    console.error(
      "❌ CRITICAL: API_BASE_URL is pointing to FRONTEND port (5173) instead of BACKEND port (5000)",
    );
    console.error("💡 Current API_BASE_URL:", API_BASE_URL);
    console.error("💡 Frontend URL:", frontendUrl);
    console.error("💡 Backend should be at: http://localhost:5000");
    console.error(
      "💡 Fix: Check .env file - VITE_API_BASE_URL should be /api (recommended for mobile via Vite proxy) or http://<your-pc-ip>:5000/api",
    );
  } else {
    console.log("✅ API_BASE_URL correctly points to backend:", API_BASE_URL);
    console.log("✅ Backend URL:", backendUrl);
    console.log("✅ Frontend URL:", frontendUrl);
  }
}

/**
 * Create axios instance with default configuration
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 120 seconds (increased from 30s for large camera uploads)
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Include cookies for refresh token
});

/**
 * Get the appropriate module token based on the current route
 * @returns {string|null} - Access token for the current module or null
 */
function getTokenForCurrentRoute() {
  const path = window.location.pathname;

  if (path.startsWith("/admin")) {
    return localStorage.getItem("admin_accessToken");
  } else if (
    path.startsWith("/restaurant") &&
    !path.startsWith("/restaurants") &&
    !path.startsWith("/restaurant/list") &&
    !path.startsWith("/restaurant/under-250")
  ) {
    // /restaurant/* is for restaurant module, /restaurants/* is for user module viewing restaurants
    // Exclude public routes like /restaurant/list and /restaurant/under-250
    return localStorage.getItem("restaurant_accessToken");
  } else if (path.startsWith("/delivery")) {
    return localStorage.getItem("delivery_accessToken");
  } else if (path.startsWith("/hotel")) {
    return localStorage.getItem("hotel_accessToken");
  } else if (
    path.startsWith("/user") ||
    path === "/" ||
    (!path.startsWith("/admin") &&
      !(path.startsWith("/restaurant") && !path.startsWith("/restaurants")) &&
      !path.startsWith("/delivery") &&
      !path.startsWith("/hotel"))
  ) {
    // User module: use getModuleToken so Remember Me uses sessionStorage vs localStorage
    return getModuleToken("user") || localStorage.getItem("accessToken");
  }

  // Fallback to legacy token for backward compatibility
  return localStorage.getItem("accessToken");
}

/**
 * Request Interceptor
 * Adds authentication token to requests based on current route
 */
apiClient.interceptors.request.use(
  (config) => {
    // Get access token for the current module based on route
    let accessToken = getTokenForCurrentRoute();

    // Fallback to legacy token if module-specific token not found
    if (!accessToken || accessToken.trim() === "") {
      accessToken = localStorage.getItem("accessToken");
    }

    // Ensure headers object exists
    if (!config.headers) {
      config.headers = {};
    }

    // Debug logging for FormData requests
    if (import.meta.env.DEV && config.data instanceof FormData) {
      console.log("[API Interceptor] FormData request detected:", {
        url: config.url,
        method: config.method,
        hasAuthHeader: !!config.headers.Authorization,
        authHeaderPrefix: config.headers.Authorization?.substring(0, 30),
        hasAccessToken: !!accessToken,
      });
    }

    // Determine if this is an authenticated route
    const path = window.location.pathname;
    const requestUrl = config.url || "";

    // Check if this is a public restaurant route (should not require authentication)
    const isPublicRestaurantRoute =
      requestUrl.includes("/restaurant/list") ||
      requestUrl.includes("/restaurant/under-250") ||
      (requestUrl.includes("/restaurant/") &&
        !requestUrl.includes("/restaurant/orders") &&
        !requestUrl.includes("/restaurant/auth") &&
        !requestUrl.includes("/restaurant/menu") &&
        !requestUrl.includes("/restaurant/profile") &&
        !requestUrl.includes("/restaurant/staff") &&
        !requestUrl.includes("/restaurant/offers") &&
        !requestUrl.includes("/restaurant/inventory") &&
        !requestUrl.includes("/restaurant/categories") &&
        !requestUrl.includes("/dining/") &&
        !requestUrl.includes("/restaurant/onboarding") &&
        !requestUrl.includes("/restaurant/delivery-status") &&
        !requestUrl.includes("/restaurant/finance") &&
        !requestUrl.includes("/restaurant/wallet") &&
        !requestUrl.includes("/restaurant/analytics") &&
        !requestUrl.includes("/restaurant/complaints") &&
        // Commission and dining management are protected restaurant routes (need auth)
        !requestUrl.includes("/restaurant/commission") &&
        !requestUrl.includes("/restaurant/dining-config") &&
        !requestUrl.includes("/restaurant/dining-offers") &&
        !requestUrl.includes("/restaurant/dining-menu") &&
        (requestUrl.match(/\/restaurant\/[^/]+$/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/menu/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/addons/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/inventory/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/offers/)));

    const isAuthenticatedRoute =
      (path.startsWith("/admin") ||
        (path.startsWith("/restaurant") &&
          !path.startsWith("/restaurants") &&
          !isPublicRestaurantRoute) ||
        path.startsWith("/delivery") ||
        path.startsWith("/hotel")) &&
      !isPublicRestaurantRoute;

    // For authenticated routes, ALWAYS ensure Authorization header is set if we have a token
    // This ensures FormData requests and other requests always have the token
    if (isAuthenticatedRoute) {
      // If no Authorization header or invalid format, set it
      if (
        !config.headers.Authorization ||
        (typeof config.headers.Authorization === "string" &&
          !config.headers.Authorization.startsWith("Bearer "))
      ) {
        if (
          accessToken &&
          accessToken.trim() !== "" &&
          accessToken !== "null" &&
          accessToken !== "undefined"
        ) {
          config.headers.Authorization = `Bearer ${accessToken.trim()}`;
          if (import.meta.env.DEV && config.data instanceof FormData) {
            console.log(
              "[API Interceptor] Added Authorization header for authenticated FormData request",
            );
          }
        } else {
          // Log warning in development if token is missing for authenticated routes
          if (import.meta.env.DEV) {
            console.warn(
              `[API Interceptor] No access token found for authenticated route: ${path}. Request may fail with 401.`,
            );
            console.warn(`[API Interceptor] Available tokens:`, {
              admin: localStorage.getItem("admin_accessToken")
                ? "exists"
                : "missing",
              restaurant: localStorage.getItem("restaurant_accessToken")
                ? "exists"
                : "missing",
              delivery: localStorage.getItem("delivery_accessToken")
                ? "exists"
                : "missing",
              hotel: localStorage.getItem("hotel_accessToken")
                ? "exists"
                : "missing",
              user: localStorage.getItem("user_accessToken")
                ? "exists"
                : "missing",
              legacy: localStorage.getItem("accessToken")
                ? "exists"
                : "missing",
            });
          }
        }
      } else {
        // Authorization header already set (from getAuthConfig), log in dev mode for FormData
        if (import.meta.env.DEV && config.data instanceof FormData) {
          console.log(
            "[API Interceptor] Authorization header already set, preserving it for FormData request",
          );
        }
      }
    } else {
      // For non-authenticated routes (including public restaurant routes), don't add token
      // Public routes like /restaurant/list should work without authentication
      if (isPublicRestaurantRoute) {
        // Remove any existing Authorization header for public routes
        delete config.headers.Authorization;
      } else if (
        !config.headers.Authorization &&
        accessToken &&
        accessToken.trim() !== "" &&
        accessToken !== "null" &&
        accessToken !== "undefined"
      ) {
        // For other non-authenticated routes, add token if available (for optional auth)
        config.headers.Authorization = `Bearer ${accessToken.trim()}`;
      }
    }

    // If data is FormData, remove Content-Type header to let axios set it with boundary
    // BUT: Make sure Authorization header is preserved
    if (config.data instanceof FormData) {
      // Preserve Authorization header before removing Content-Type
      const authHeader = config.headers.Authorization;
      // Remove Content-Type to let axios set it with proper boundary
      delete config.headers["Content-Type"];
      // Always restore Authorization header if it was set (critical for authentication)
      if (authHeader) {
        config.headers.Authorization = authHeader;
        if (import.meta.env.DEV) {
          console.log(
            "[API Interceptor] Preserved Authorization header for FormData request",
          );
        }
      } else if (
        accessToken &&
        accessToken.trim() !== "" &&
        accessToken !== "null" &&
        accessToken !== "undefined"
      ) {
        // If no auth header but we have a token, add it
        config.headers.Authorization = `Bearer ${accessToken.trim()}`;
        if (import.meta.env.DEV) {
          console.log(
            "[API Interceptor] Added Authorization header for FormData request",
          );
        }
      }
    }

    // Block write requests when network is slow or offline so that
    // we never \"fake save\" anything in the frontend or localStorage.
    const method = (config.method || "get").toLowerCase();
    const isWriteMethod = ["post", "put", "patch", "delete"].includes(method);
    const requestPath = String(config.url || "");
    // Push token registration must not be blocked on "slow" — otherwise devices never get FCM tokens
    const isFcmOrPushRoute =
      requestPath.includes("/fcm/") ||
      requestPath.includes("fcm/register-token") ||
      requestPath.includes("fcm/remove-token");

    if (isWriteMethod && !isFcmOrPushRoute) {
      const status = getNetworkStatus();
      if (status === "offline" || status === "slow") {
        const message =
          status === "offline"
            ? "Network is offline. Data is NOT saved to the server. Please check your connection and try again."
            : "Network is very slow. Data is NOT saved to the server. Please try again on a stable connection.";

        const error = new Error(message);
        error.code = status === "offline" ? "NETWORK_OFFLINE" : "NETWORK_SLOW";
        return Promise.reject(error);
      }
    }

    // Enable client-side request deduplication by default to prevent redundant parallel calls
    // especially for idempotent GETs and double-clicks on POST/PUT buttons.
    config.deduplicate = true;

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

/**
 * Response Interceptor
 * Handles token refresh and error responses
 */
apiClient.interceptors.response.use(
  (response) => {
    // Reset network error state on successful response (backend is back online)
    if (networkErrorState.errorCount > 0) {
      networkErrorState.errorCount = 0;
      networkErrorState.lastErrorTime = 0;
      networkErrorState.toastShown = false;
      if (import.meta.env.DEV) {
        console.log("✅ Backend connection restored");
      }
    }

    // If response contains new access token, store it for the current module
    if (response.data?.accessToken) {
      const currentPath = window.location.pathname;
      let tokenKey = "accessToken"; // fallback
      let expectedRole = "user";

      if (currentPath.startsWith("/admin")) {
        tokenKey = "admin_accessToken";
        expectedRole = "admin";
      } else if (
        currentPath.startsWith("/restaurant") &&
        !currentPath.startsWith("/restaurants")
      ) {
        // /restaurant/* is for restaurant module, /restaurants/* is for user module viewing restaurants
        tokenKey = "restaurant_accessToken";
        expectedRole = "restaurant";
      } else if (currentPath.startsWith("/delivery")) {
        tokenKey = "delivery_accessToken";
        expectedRole = "delivery";
      } else if (currentPath.startsWith("/hotel")) {
        tokenKey = "hotel_accessToken";
        expectedRole = "hotel";
      } else if (
        currentPath.startsWith("/user") ||
        currentPath === "/" ||
        currentPath.startsWith("/restaurants")
      ) {
        // User module includes /restaurants/* paths
        tokenKey = "user_accessToken";
        expectedRole = "user";
      }

      const token = response.data.accessToken;
      const role = getRoleFromToken(token);

      // Only store the token if the role matches the current module
      if (!role || role !== expectedRole) {
        clearModuleAuth(tokenKey.replace("_accessToken", ""));
      } else {
        localStorage.setItem(tokenKey, token);
      }
    }
    return response;
  },
  async (error) => {
    // Axios request cancellation / AbortController should be silent.
    // Otherwise dev mode shows a noisy toast: "canceled".
    const isCanceled =
      axios.isCancel?.(error) ||
      error?.code === "ERR_CANCELED" ||
      error?.name === "CanceledError" ||
      error?.name === "AbortError" ||
      error?.message === "canceled" ||
      error?.message === "Request aborted";

    if (isCanceled) {
      return Promise.reject(error);
    }

    const originalRequest = error.config || {};
    const requestUrl = String(originalRequest.url || "");
    const currentPath = window.location.pathname;
    const authHeader =
      originalRequest.headers?.Authorization ||
      originalRequest.headers?.authorization ||
      "";
    const hasAuthHeader =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ");
    const hasModuleToken = !!getTokenForCurrentRoute();
    const isRefreshRequest = requestUrl.includes("/auth/refresh-token");
    const isProtectedPath =
      currentPath.startsWith("/admin") ||
      (currentPath.startsWith("/restaurant") &&
        !currentPath.startsWith("/restaurants")) ||
      currentPath.startsWith("/delivery") ||
      currentPath.startsWith("/hotel") ||
      currentPath.startsWith("/cart") ||
      currentPath.startsWith("/orders") ||
      currentPath.startsWith("/profile") ||
      currentPath.startsWith("/wallet") ||
      currentPath.startsWith("/notifications") ||
      currentPath.startsWith("/bookings") ||
      currentPath.startsWith("/complaints") ||
      currentPath.startsWith("/user/cart") ||
      currentPath.startsWith("/user/orders") ||
      currentPath.startsWith("/user/profile") ||
      currentPath.startsWith("/user/wallet") ||
      currentPath.startsWith("/user/notifications") ||
      currentPath.startsWith("/user/bookings") ||
      currentPath.startsWith("/user/complaints");

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't attempt refresh for refresh endpoint itself, or for public unauthenticated requests.
      if (isRefreshRequest || (!hasAuthHeader && !hasModuleToken && !isProtectedPath)) {
        return Promise.reject(error);
      }
      originalRequest._retry = true;

      try {
        // Determine which module's refresh endpoint to use based on current route
        let refreshEndpoint = "/auth/refresh-token"; // default to user auth

        if (currentPath.startsWith("/admin")) {
          refreshEndpoint = "/admin/auth/refresh-token";
        } else if (
          currentPath.startsWith("/restaurant") &&
          !currentPath.startsWith("/restaurants")
        ) {
          // /restaurant/* is for restaurant module, /restaurants/* is for user module viewing restaurants
          refreshEndpoint = "/restaurant/auth/refresh-token";
        } else if (currentPath.startsWith("/delivery")) {
          refreshEndpoint = "/delivery/auth/refresh-token";
        } else if (currentPath.startsWith("/hotel")) {
          refreshEndpoint = "/hotel/auth/refresh-token";
        }

        // Try to refresh the token
        // The refresh token is sent via httpOnly cookie automatically
        const response = await axios.post(
          `${API_BASE_URL}${refreshEndpoint}`,
          {},
          {
            withCredentials: true,
          },
        );

        const { accessToken } = response.data.data || response.data;

        if (accessToken) {
          // Determine which module's token to update based on current route
          const currentPath = window.location.pathname;
          let tokenKey = "accessToken"; // fallback
          let expectedRole = "user";

          if (currentPath.startsWith("/admin")) {
            tokenKey = "admin_accessToken";
            expectedRole = "admin";
          } else if (
            currentPath.startsWith("/restaurant") &&
            !currentPath.startsWith("/restaurants")
          ) {
            // /restaurant/* is for restaurant module, /restaurants/* is for user module viewing restaurants
            tokenKey = "restaurant_accessToken";
            expectedRole = "restaurant";
          } else if (currentPath.startsWith("/delivery")) {
            tokenKey = "delivery_accessToken";
            expectedRole = "delivery";
          } else if (currentPath.startsWith("/hotel")) {
            tokenKey = "hotel_accessToken";
            expectedRole = "hotel";
          } else if (
            currentPath.startsWith("/user") ||
            currentPath === "/" ||
            currentPath.startsWith("/restaurants")
          ) {
            // User module includes /restaurants/* paths
            tokenKey = "user_accessToken";
            expectedRole = "user";
          }

          const role = getRoleFromToken(accessToken);

          // Only store token if role matches expected module; otherwise treat as invalid for this module
          if (!role || role !== expectedRole) {
            clearModuleAuth(tokenKey.replace("_accessToken", ""));
            throw new Error("Role mismatch on refreshed token");
          }

          // Store new access token for the current module
          localStorage.setItem(tokenKey, accessToken);

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Show error toast in development mode for refresh errors
        if (import.meta.env.DEV) {
          const refreshErrorMessage =
            refreshError.response?.data?.message ||
            refreshError.response?.data?.error ||
            refreshError.message ||
            "Token refresh failed";

          toast.error(refreshErrorMessage, {
            duration: 3000,
            style: {
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "#ffffff",
              border: "1px solid #b91c1c",
              borderRadius: "12px",
              padding: "16px",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow:
                "0 10px 25px -5px rgba(239, 68, 68, 0.3), 0 8px 10px -6px rgba(239, 68, 68, 0.2)",
            },
            className: "error-toast",
          });
        }

        // Refresh failed, clear module-specific token and redirect to login
        // only when user is currently on a protected route.
        // Public pages (/, /restaurants/*, etc.) should not force-login.
        const currentPath = window.location.pathname;
        const isOnboardingPage = currentPath.includes("/onboarding");
        const isLandingPageManagement =
          currentPath.includes("/hero-banner-management") ||
          currentPath.includes("/landing-page");
        const isProtectedUserPath =
          currentPath.startsWith("/cart") ||
          currentPath.startsWith("/orders") ||
          currentPath.startsWith("/profile") ||
          currentPath.startsWith("/wallet") ||
          currentPath.startsWith("/notifications") ||
          currentPath.startsWith("/bookings") ||
          currentPath.startsWith("/complaints") ||
          currentPath.startsWith("/user/cart") ||
          currentPath.startsWith("/user/orders") ||
          currentPath.startsWith("/user/profile") ||
          currentPath.startsWith("/user/wallet") ||
          currentPath.startsWith("/user/notifications") ||
          currentPath.startsWith("/user/bookings") ||
          currentPath.startsWith("/user/complaints");

        // For landing page management, don't auto-logout on 401 - let component handle it
        // Only auto-logout for other pages after token refresh fails
        if (!isOnboardingPage && !isLandingPageManagement) {
          if (currentPath.startsWith("/admin")) {
            clearModuleAuth("admin");
            window.location.href = "/admin/login";
          } else if (
            currentPath.startsWith("/restaurant") &&
            !currentPath.startsWith("/restaurants")
          ) {
            // /restaurant/* is for restaurant module, /restaurants/* is for user module viewing restaurants
            clearModuleAuth("restaurant");
            window.location.href = "/restaurant/login";
          } else if (currentPath.startsWith("/delivery")) {
            clearModuleAuth("delivery");
            window.location.href = "/delivery/sign-in";
          } else if (currentPath.startsWith("/hotel")) {
            clearModuleAuth("hotel");
            window.location.href = "/hotel";
          } else {
            // User module includes /restaurants/* paths
            clearModuleAuth("user");
            if (isProtectedUserPath) {
              window.location.href = "/user/auth/sign-in";
            }
          }
        }

        // For onboarding page, reject the promise so component can handle it
        return Promise.reject(refreshError);

        return Promise.reject(refreshError);
      }
    }

    // ===== Handle 429 Too Many Requests with exponential backoff =====
    if (error.response?.status === 429) {
      const originalRequest = error.config || {};
      const method = (originalRequest.method || "get").toLowerCase();
      const url = originalRequest.url || "";

      // Never auto‑retry auth / OTP / login style endpoints – these already have strict backend limits
      const isSensitiveEndpoint =
        url.includes("/auth/") ||
        url.includes("/send-otp") ||
        url.includes("/verify-otp") ||
        url.includes("/login") ||
        url.includes("/register") ||
        url.includes("/create-order") ||
        url.includes("/place-order");

      // Only allow auto‑retry for idempotent GET requests that are not sensitive
      const isIdempotent = ["get", "head", "options"].includes(method);
      const isSafeToRetry = isIdempotent && !isSensitiveEndpoint;

      const retryCount = originalRequest._retryCount || 0;
      const maxRetries = isSafeToRetry ? 2 : 0;

      // Determine wait time: Prefer server-provided retryAfter (seconds), then exponential backoff
      const serverRetryAfter = error.response.data?.retryAfter || error.response.headers?.["retry-after"];
      let backoffMs;
      
      if (typeof serverRetryAfter === 'number' && !isNaN(serverRetryAfter)) {
        backoffMs = Math.max(1000, serverRetryAfter * 1000);
      } else if (typeof serverRetryAfter === 'string' && !isNaN(parseInt(serverRetryAfter))) {
        backoffMs = Math.max(1000, parseInt(serverRetryAfter) * 1000);
      } else {
        // Fallback: exponential backoff limited to 15s
        backoffMs = Math.min(1000 * Math.pow(2, retryCount), 15000);
      }

      const retryAfterSec = Math.ceil(backoffMs / 1000);

      if (isSafeToRetry && retryCount < maxRetries) {
        originalRequest._retryCount = retryCount + 1;
        
        if (import.meta.env.DEV) {
          console.warn(
            `⏳ Rate limited (429) for ${method.toUpperCase()} ${url}. Retrying in ${retryAfterSec}s (attempt ${retryCount + 1}/${maxRetries})`
          );
        }

        // Show a non-intrusive warning for the first retry
        if (retryCount === 0) {
          toast.warning(`Server is busy. Retrying in ${retryAfterSec}s...`, {
            id: `retry-${url}`,
            duration: backoffMs,
          });
        }

        return new Promise((resolve) => {
          setTimeout(() => resolve(apiClient(originalRequest)), backoffMs);
        });
      }

      // If we cannot retry or max retries exceeded, show error toast with cooldown
      const now = Date.now();
      if (now - networkErrorState.lastToastTime >= networkErrorState.TOAST_COOLDOWN_PERIOD) {
        networkErrorState.lastToastTime = now;
        
        const baseMessage = error.response.data?.message || "Too many requests. Please wait a moment and try again.";
        
        toast.error(`${baseMessage} (Wait ${retryAfterSec}s)`, {
          duration: 5000,
          id: "rate-limit-toast",
        });
      }

      return Promise.reject(error);
    }

    // Handle network errors specifically (backend not running)
    if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
      if (import.meta.env.DEV) {
        const now = Date.now();
        const timeSinceLastError = now - networkErrorState.lastErrorTime;
        const timeSinceLastToast = now - networkErrorState.lastToastTime;

        // Only log console errors if cooldown period has passed
        if (timeSinceLastError >= networkErrorState.COOLDOWN_PERIOD) {
          networkErrorState.errorCount++;
          networkErrorState.lastErrorTime = now;

          // Log error details (only once per cooldown period)
          if (networkErrorState.errorCount === 1) {
            // Network error logging removed - errors handled via toast notifications
          } else {
            // For subsequent errors, show a brief message
            console.warn(
              `⚠️ Network Error (${networkErrorState.errorCount}x) - Backend still not connected`,
            );
          }
        }

        // Only show toast if cooldown period has passed
        if (timeSinceLastToast >= networkErrorState.TOAST_COOLDOWN_PERIOD) {
          networkErrorState.lastToastTime = now;
          networkErrorState.toastShown = true;

          // Show helpful error message (only once per minute)
          toast.error(
            `Backend server is unavailable at ${API_BASE_URL}. Start the backend or check the API port.`,
            {
              duration: 10000,
              id: "network-error-toast", // Use ID to prevent duplicate toasts
              style: {
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                color: "#ffffff",
                border: "1px solid #b45309",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "14px",
                fontWeight: "500",
                boxShadow:
                  "0 10px 25px -5px rgba(245, 158, 11, 0.3), 0 8px 10px -6px rgba(245, 158, 11, 0.2)",
              },
              className: "network-error-toast",
            },
          );
        }
      }
      return Promise.reject(error);
    }

    // Handle timeout errors (ECONNABORTED)
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      // Timeout errors are usually due to slow backend or network issues
      // Don't spam console with timeout errors, but handle them gracefully
      if (import.meta.env.DEV) {
        const now = Date.now();
        const timeSinceLastError = now - networkErrorState.lastErrorTime;
        const timeSinceLastToast = now - networkErrorState.lastToastTime;

        // Only log console errors if cooldown period has passed
        if (timeSinceLastError >= networkErrorState.COOLDOWN_PERIOD) {
          networkErrorState.errorCount++;
          networkErrorState.lastErrorTime = now;
        }

        // Only show toast if cooldown period has passed
        if (timeSinceLastToast >= networkErrorState.TOAST_COOLDOWN_PERIOD) {
          networkErrorState.lastToastTime = now;

          // Show helpful error message (only once per minute)
          toast.error(
            `Request timeout - Backend may be slow or not responding. Check server status.`,
            {
              duration: 8000,
              id: "timeout-error-toast", // Use ID to prevent duplicate toasts
              style: {
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                color: "#ffffff",
                border: "1px solid #b45309",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "14px",
                fontWeight: "500",
                boxShadow:
                  "0 10px 25px -5px rgba(245, 158, 11, 0.3), 0 8px 10px -6px rgba(245, 158, 11, 0.2)",
              },
              className: "timeout-error-toast",
            },
          );
        }
      }
      return Promise.reject(error);
    }


    // Handle 404 errors (route not found)
    if (error.response?.status === 404) {
      if (import.meta.env.DEV) {
        const url = error.config?.url || "unknown";
        const fullUrl = error.config?.baseURL
          ? `${error.config.baseURL}${url}`
          : url;
        // 404 error logging removed - errors handled via toast notifications

        // Show toast for auth routes (important)
        if (
          url.includes("/auth/") ||
          url.includes("/send-otp") ||
          url.includes("/verify-otp")
        ) {
          toast.error(
            "Auth API endpoint not found. Make sure backend is running on port 5000.",
            {
              duration: 8000,
              style: {
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                color: "#ffffff",
                border: "1px solid #b91c1c",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "14px",
                fontWeight: "500",
              },
            },
          );
        }
        // Show toast for restaurant routes (but not for getRestaurantById which can legitimately return 404)
        else if (url.includes("/restaurant/")) {
          // Only show error for critical restaurant endpoints like /restaurant/list
          // Individual restaurant lookups (like /restaurant/:id) can legitimately return 404 if restaurant doesn't exist
          // So we silently handle those 404s
          const isIndividualRestaurantLookup =
            /\/restaurant\/[a-f0-9]{24}$/i.test(url) ||
            (url.match(/\/restaurant\/[^/]+$/) &&
              !url.includes("/restaurant/list"));

          if (
            !isIndividualRestaurantLookup &&
            url.includes("/restaurant/list")
          ) {
            toast.error(
              "Restaurant API endpoint not found. Check backend routes.",
              {
                duration: 5000,
                style: {
                  background:
                    "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  color: "#ffffff",
                  border: "1px solid #b91c1c",
                  borderRadius: "12px",
                  padding: "16px",
                  fontSize: "14px",
                  fontWeight: "500",
                },
              },
            );
          }
          // Silently handle 404 for individual restaurant lookups (getRestaurantById)
          // These are expected to fail if restaurant doesn't exist in DB
        }
      }
      return Promise.reject(error);
    }

    // Show error toast in development mode only
    if (import.meta.env.DEV) {
      // Extract error messages from various possible locations
      const errorData = error.response?.data;

      // Handle array of error messages (common in validation errors)
      let errorMessages = [];

      if (Array.isArray(errorData?.message)) {
        errorMessages = errorData.message;
      } else if (Array.isArray(errorData?.errors)) {
        errorMessages = errorData.errors.map((err) => err.message || err);
      } else if (errorData?.message) {
        errorMessages = [errorData.message];
      } else if (errorData?.error) {
        errorMessages = [errorData.error];
      } else if (errorData?.data?.message) {
        errorMessages = Array.isArray(errorData.data.message)
          ? errorData.data.message
          : [errorData.data.message];
      } else if (error.message) {
        errorMessages = [error.message];
      } else {
        errorMessages = ["An error occurred"];
      }

      // Filter out noisy auth messages that we handle via redirects
      errorMessages = errorMessages.filter((msg) => msg && msg !== "No token provided");

      if (errorMessages.length === 0) {
        return Promise.reject(error);
      }

      // Show beautiful error toast for each remaining error message
      errorMessages.forEach((errorMessage, index) => {
        // Add slight delay for multiple toasts to appear sequentially
        setTimeout(() => {
          toast.error(errorMessage, {
            duration: 5000,
            style: {
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "#ffffff",
              border: "1px solid #b91c1c",
              borderRadius: "12px",
              padding: "16px",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow:
                "0 10px 25px -5px rgba(239, 68, 68, 0.3), 0 8px 10px -6px rgba(239, 68, 68, 0.2)",
            },
            className: "error-toast",
          });
        }, index * 100); // Stagger multiple toasts by 100ms
      });
    }

    // Handle other errors
    return Promise.reject(error);
  },
);

/**
 * Wrap apiClient.request with lightweight client-side deduplication for
 * idempotent requests (where config.deduplicate was set in the interceptor).
 * This preserves the exact same response shape and errors while avoiding
 * duplicate in-flight calls to the same endpoint.
 */
const rawRequest = apiClient.request.bind(apiClient);

apiClient.request = function dedupAwareRequest(config) {
  const finalConfig = config || {};
  if (finalConfig.deduplicate) {
    return deduplicateRequest(rawRequest, finalConfig, 800);
  }
  return rawRequest(finalConfig);
};

export default apiClient;
