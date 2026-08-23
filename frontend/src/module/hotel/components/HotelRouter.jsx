import { Suspense, lazy } from "react"
import { Routes, Route, Navigate, Outlet } from "react-router-dom"
import ProtectedRoute from "@/components/ProtectedRoute"
import AuthRedirect from "@/components/AuthRedirect"
import Loader from "@/components/Loader"
import HotelTermsGuard from "./HotelTermsGuard"

function HotelProtectedLayout() {
  return (
    <HotelTermsGuard>
      <Outlet />
    </HotelTermsGuard>
  )
}

// Lazy Loading Components
const HotelSignup = lazy(() => import("@/module/hotel/pages/auth/Signup"))
const HotelOTP = lazy(() => import("@/module/hotel/pages/auth/OTP"))
const HotelDashboard = lazy(() => import("@/module/hotel/pages/Dashboard"))
const HotelOrders = lazy(() => import("@/module/hotel/pages/HotelOrders"))
const HotelProfile = lazy(() => import("@/module/hotel/pages/Profile"))
const HotelWallet = lazy(() => import("@/module/hotel/pages/Wallet"))
const HotelSettlement = lazy(() => import("@/module/hotel/pages/HotelSettlement"))
const ViewHotel = lazy(() => import("@/module/hotel/pages/ViewHotel"))
const HotelLeaderboard = lazy(() => import("@/module/hotel/pages/Leaderboard"))
const HotelPastWinners = lazy(() => import("@/module/hotel/pages/PastWinners"))
const HotelTermsAndConditions = lazy(() => import("@/module/hotel/pages/TermsAndConditions"))
const HotelPrivacyPolicy = lazy(() => import("@/module/hotel/pages/PrivacyPolicy"))
const HotelSupport = lazy(() => import("@/module/hotel/pages/Support"))

export default function HotelRouter() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* Public / Auth Routes */}
        <Route path="" element={<AuthRedirect module="hotel"><HotelSignup /></AuthRedirect>} />
        <Route path="otp" element={<AuthRedirect module="hotel"><HotelOTP /></AuthRedirect>} />
        <Route path="legal/terms" element={<HotelTermsAndConditions />} />
        <Route path="legal/privacy" element={<HotelPrivacyPolicy />} />
        <Route path="view/:hotelId" element={<ViewHotel />} />
        <Route path="support" element={<HotelSupport />} />

        {/* Protected Routes */}
        <Route element={<HotelProtectedLayout />}>
          <Route
            path="dashboard"
            element={
              <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
                <HotelDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="orders"
            element={
              <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
                <HotelOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="profile"
            element={
              <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
                <HotelProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="wallet"
            element={
              <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
                <HotelWallet />
              </ProtectedRoute>
            }
          />
          <Route
            path="settlement"
            element={
              <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
                <HotelSettlement />
              </ProtectedRoute>
            }
          />
          <Route
            path="leaderboard"
            element={
              <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
                <HotelLeaderboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="leaderboard/past"
            element={
              <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
                <HotelPastWinners />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  )
}
