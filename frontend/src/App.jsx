import { Routes, Route, Navigate, useLocation, useNavigate, Outlet } from "react-router-dom"
import ProtectedRoute from "@/components/ProtectedRoute"
import AuthRedirect from "@/components/AuthRedirect"
import NetworkStatusBanner from "@/components/NetworkStatusBanner"
import { NetworkStatusProvider } from "@/lib/context/NetworkStatusContext.jsx"
import { RestaurantSocketProvider } from "@/module/restaurant/context/RestaurantSocketContext"

import { Suspense, lazy, useEffect, useState, useRef } from "react"
import Loader from "@/components/Loader"
import MetaPixel from "@/components/MetaPixel"
import { restoreModuleSession, isModuleAuthenticated, getModuleToken } from "@/lib/utils/auth.js"
import { registerFcmToken, registerNativeFcmToken } from "@/lib/fcmService.js"

function RestaurantSocketLayout() {
  return (
    <RestaurantSocketProvider>
      <Outlet />
    </RestaurantSocketProvider>
  )
}

// Lazy Loading Components
const UserRouter = lazy(() => import("@/module/user/components/UserRouter"))
const HotelMenuLanding = lazy(() => import("@/module/user/pages/HotelMenuLanding"))

// Restaurant & Hotel Routers
const RestaurantRouter = lazy(() => import("@/module/restaurant/components/RestaurantRouter"))
const HotelRouter = lazy(() => import("@/module/hotel/components/HotelRouter"))

// Admin Module
const AdminRouter = lazy(() => import("@/module/admin/components/AdminRouter"))
const AdminLogin = lazy(() => import("@/module/admin/pages/auth/AdminLogin"))
const AdminSignup = lazy(() => import("@/module/admin/pages/auth/AdminSignup"))
const AdminForgotPassword = lazy(() => import("@/module/admin/pages/auth/AdminForgotPassword"))

// Delivery Module
const DeliveryRouter = lazy(() => import("@/module/delivery/components/DeliveryRouter"))
const DeliverySignIn = lazy(() => import("@/module/delivery/pages/auth/SignIn"))
const DeliverySignup = lazy(() => import("@/module/delivery/pages/auth/Signup"))
const DeliveryOTP = lazy(() => import("@/module/delivery/pages/auth/OTP"))
const DeliverySignupStep1 = lazy(() => import("@/module/delivery/pages/auth/SignupStep1"))
const DeliverySignupStep2 = lazy(() => import("@/module/delivery/pages/auth/SignupStep2"))
const DeliveryWelcome = lazy(() => import("@/module/delivery/pages/auth/Welcome"))
const DeliveryTermsPublic = lazy(() => import("@/module/delivery/pages/TermsAndConditions"))
const DeliveryPrivacyPublic = lazy(() => import("@/module/delivery/pages/PrivacyPolicy"))
const SupportTickets = lazy(() => import("@/module/delivery/pages/SupportTickets"))
const DeliverySupport = lazy(() => import("@/module/delivery/pages/Support"))

function UserPathRedirect() {
  const location = useLocation()
  const newPath = location.pathname.replace(/^\/user/, "") || "/"
  return <Navigate to={newPath} replace />
}

function UserReloadHandler({ children, sessionRestored }) {
  const location = useLocation();
  const navigate = useNavigate();

  const hasRestored = useRef(false);
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  useEffect(() => {
    if (!sessionRestored || hasRestored.current) return;

    let timerId = null;

    try {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      const isReload = nav?.type === "reload" || nav?.type === "navigate";

      // Mark as restored regardless of whether we actually navigate, 
      // to prevent this effect from blocking future SPA navigations.
      hasRestored.current = true;

      if (!isReload) return;

      const currentPath = pathnameRef.current;
      const isUserPath =
        currentPath === "/" ||
        currentPath.startsWith("/dining") ||
        currentPath.startsWith("/cart") ||
        currentPath.startsWith("/orders") ||
        currentPath.startsWith("/profile") ||
        currentPath.startsWith("/offers") ||
        currentPath.startsWith("/wallet") ||
        currentPath.startsWith("/help") ||
        currentPath.startsWith("/notifications") ||
        currentPath.startsWith("/collections") ||
        currentPath.startsWith("/gift-card") ||
        currentPath.startsWith("/complaints");

      if (!isUserPath) return;

      const storedRoute = sessionStorage.getItem("user_lastRoute");
      const storedScroll = sessionStorage.getItem("user_lastScrollY");
      const fullCurrent =
        window.location.pathname + window.location.search + window.location.hash;

      const routeWithoutQuery = (storedRoute || "").split("?")[0];
      const isPublicProfileRoute =
        routeWithoutQuery.startsWith("/profile/contact-us") ||
        routeWithoutQuery.startsWith("/profile/about") ||
        routeWithoutQuery.startsWith("/profile/terms") ||
        routeWithoutQuery.startsWith("/profile/privacy") ||
        routeWithoutQuery.startsWith("/profile/refund") ||
        routeWithoutQuery.startsWith("/profile/shipping") ||
        routeWithoutQuery.startsWith("/profile/cancellation");

      const isProtectedUserRoute =
        (!isPublicProfileRoute && routeWithoutQuery.startsWith("/profile")) ||
        routeWithoutQuery.startsWith("/cart") ||
        routeWithoutQuery.startsWith("/orders") ||
        routeWithoutQuery.startsWith("/wallet") ||
        routeWithoutQuery.startsWith("/notifications") ||
        routeWithoutQuery.startsWith("/bookings") ||
        routeWithoutQuery.startsWith("/complaints");
      const isAuthenticatedUser = isModuleAuthenticated("user");

      // Do not restore protected routes for logged-out users on app open/reload.
      if (!isAuthenticatedUser && isProtectedUserRoute) {
        sessionStorage.removeItem("user_lastRoute");
        if (storedScroll) sessionStorage.removeItem("user_lastScrollY");
        return;
      }

      if (storedRoute && storedRoute !== fullCurrent) {
        navigate(storedRoute, { replace: true });
        timerId = setTimeout(() => {
          const scrollY = storedScroll ? Number(storedScroll) || 0 : 0;
          window.scrollTo(0, scrollY);
        }, 100);
      } else if (storedScroll) {
        const scrollY = Number(storedScroll) || 0;
        window.scrollTo(0, scrollY);
      }
    } catch {
      // ignore errors
    }

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [sessionRestored, navigate]); // Removed location.pathname to avoid repeated runs

  return children;
}

export default function App() {
  const [sessionRestored, setSessionRestored] = useState(false)

  // Flutter InAppWebView bridge: allow native wrapper to register native FCM token via web context.
  useEffect(() => {
    try {
      window.__ABHIKARO_REGISTER_NATIVE_FCM__ = async (args = {}) => {
        const {
          accessToken: providedAccessToken,
          fcmToken,
          platform = "android",
          deviceId = null,
        } = args || {}

        const accessToken =
          providedAccessToken ||
          getModuleToken("hotel") ||
          getModuleToken("restaurant") ||
          getModuleToken("delivery") ||
          getModuleToken("user") ||
          null

        return registerNativeFcmToken(accessToken, fcmToken, { platform, deviceId })
      }

      return () => {
        if (window.__ABHIKARO_REGISTER_NATIVE_FCM__) {
          delete window.__ABHIKARO_REGISTER_NATIVE_FCM__
        }
      }
    } catch {
      return undefined
    }
  }, [])

  useEffect(() => {
    // On initial app mount, try to restore session using refresh token cookie.
    const path = window.location.pathname;

    let moduleToRestore = 'user';
    if (path.startsWith('/admin')) {
      moduleToRestore = 'admin';
    } else if (path.startsWith('/restaurant') && !path.startsWith('/restaurants')) {
      moduleToRestore = 'restaurant';
    } else if (path.startsWith('/delivery')) {
      moduleToRestore = 'delivery';
    } else if (path.startsWith('/hotel')) {
      moduleToRestore = 'hotel';
    }

    restoreModuleSession(moduleToRestore)
      .catch(() => { })
      .finally(() => {
        setSessionRestored(true)
      });
  }, []);

  // Sync FCM token automatically for authenticated users on app mount
  useEffect(() => {
    if (sessionRestored) {
      const syncFcmToken = async () => {
        try {
          // Check all modules for authentication
          const modules = ['admin', 'restaurant', 'delivery', 'user', 'hotel'];
          for (const module of modules) {
            if (isModuleAuthenticated(module)) {
              const token = getModuleToken(module);
              if (token) {
                // Background registration (no welcome notification)
                registerFcmToken(token, { sendWelcome: false, sendLoginAlert: false });
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ [App] Failed to auto-sync FCM token:', error.message);
        }
      };

      // Short delay so session tokens are stable; FCM should register soon after login
      const timer = setTimeout(syncFcmToken, 600);
      return () => clearTimeout(timer);
    }
  }, [sessionRestored]);



  return (
    <Suspense fallback={<Loader />}>
      <NetworkStatusProvider>
        <NetworkStatusBanner />
        {!sessionRestored ? (
          <Loader />
        ) : (
          <UserReloadHandler sessionRestored={sessionRestored}>
            <MetaPixel />
            <Routes>
              <Route path="/user" element={<Navigate to="/" replace />} />
              <Route path="/user/*" element={<UserPathRedirect />} />

              {/* Hotel QR Menu Landing - Protected route for QR code scanning */}
              <Route
                path="/hotel-menu"
                element={
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                    <HotelMenuLanding />
                  </ProtectedRoute>
                }
              />

              {/* Removed /routes route - Home should be accessed through UserRouter */}
              {/* Restaurant Routes */}
              <Route path="/restaurant/*" element={<RestaurantRouter />} />
              {/* Delivery Public Routes */}
              <Route path="/delivery/sign-in" element={<DeliverySignIn />} />
              <Route path="/delivery/signup" element={<DeliverySignup />} />
              <Route path="/delivery/otp" element={<DeliveryOTP />} />
              <Route path="/delivery/welcome" element={<AuthRedirect module="delivery"><DeliveryWelcome /></AuthRedirect>} />
              <Route
                path="/delivery/legal/terms"
                element={
                  <Suspense fallback={<Loader />}>
                    <DeliveryTermsPublic />
                  </Suspense>
                }
              />
              <Route
                path="/delivery/legal/privacy"
                element={
                  <Suspense fallback={<Loader />}>
                    <DeliveryPrivacyPublic />
                  </Suspense>
                }
              />
              <Route
                path="/delivery/support"
                element={
                  <Suspense fallback={<Loader />}>
                    <DeliverySupport />
                  </Suspense>
                }
              />

              <Route
                path="/delivery/help/tickets"
                element={
                  <Suspense fallback={<Loader />}>
                    <SupportTickets />
                  </Suspense>
                }
              />

              {/* Hotel Routes */}
              <Route path="/hotel/*" element={<HotelRouter />} />


              {/* Delivery Signup Routes (Protected - require authentication) */}
              <Route
                path="/delivery/signup/details"
                element={
                  <ProtectedRoute requiredRole="delivery" loginPath="/delivery/sign-in">
                    <DeliverySignupStep1 />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/delivery/signup/documents"
                element={
                  <ProtectedRoute requiredRole="delivery" loginPath="/delivery/sign-in">
                    <DeliverySignupStep2 />
                  </ProtectedRoute>
                }
              />

              {/* Delivery Protected Routes */}
              <Route
                path="/delivery/*"
                element={
                  <ProtectedRoute requiredRole="delivery" loginPath="/delivery/sign-in">
                    <DeliveryRouter />
                  </ProtectedRoute>
                }
              />

              {/* Admin Public Routes */}
              <Route path="/admin/login" element={<AuthRedirect module="admin"><AdminLogin /></AuthRedirect>} />
              <Route path="/admin/signup" element={<AuthRedirect module="admin"><AdminSignup /></AuthRedirect>} />
              <Route path="/admin/forgot-password" element={<AuthRedirect module="admin"><AdminForgotPassword /></AuthRedirect>} />

              {/* Admin Protected Routes */}
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute requiredRole="admin" loginPath="/admin/login">
                    <AdminRouter />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/*"
                element={<UserRouter />}
              />
            </Routes>
          </UserReloadHandler>
        )}
      </NetworkStatusProvider>
    </Suspense>
  )
}
