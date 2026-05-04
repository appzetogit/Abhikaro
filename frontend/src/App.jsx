import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom"
import ProtectedRoute from "@/components/ProtectedRoute"
import AuthRedirect from "@/components/AuthRedirect"
import NetworkStatusBanner from "@/components/NetworkStatusBanner"
import { NetworkStatusProvider } from "@/lib/context/NetworkStatusContext.jsx"

import { Suspense, lazy, useEffect, useState, useRef } from "react"
import Loader from "@/components/Loader"
import { restoreModuleSession, isModuleAuthenticated, getModuleToken } from "@/lib/utils/auth.js"
import { registerFcmToken, registerNativeFcmToken } from "@/lib/fcmService.js"

// Lazy Loading Components
const UserRouter = lazy(() => import("@/module/user/components/UserRouter"))
const HotelMenuLanding = lazy(() => import("@/module/user/pages/HotelMenuLanding"))


// Restaurant Module
const AllOrdersPage = lazy(() => import("@/module/restaurant/pages/AllOrdersPage"))
const EditRestaurantPage = lazy(() => import("@/module/restaurant/pages/EditRestaurantPage"))
const RestaurantSettingsPage = lazy(() => import("@/module/restaurant/pages/SettingsPage"))
const FoodDetailsPage = lazy(() => import("@/module/restaurant/pages/FoodDetailsPage"))
const EditFoodPage = lazy(() => import("@/module/restaurant/pages/EditFoodPage"))
const AllFoodPage = lazy(() => import("@/module/restaurant/pages/AllFoodPage"))
const RestaurantNotifications = lazy(() => import("@/module/restaurant/pages/Notifications"))
const OrderDetails = lazy(() => import("@/module/restaurant/pages/OrderDetails"))
const OrdersMain = lazy(() => import("@/module/restaurant/pages/OrdersMain"))
const RestaurantOnboarding = lazy(() => import("@/module/restaurant/pages/Onboarding"))

const RestaurantLogin = lazy(() => import("@/module/restaurant/pages/auth/Login"))
const RestaurantSignup = lazy(() => import("@/module/restaurant/pages/auth/Signup"))
const RestaurantSignupEmail = lazy(() => import("@/module/restaurant/pages/auth/SignupEmail"))
const RestaurantForgotPassword = lazy(() => import("@/module/restaurant/pages/auth/ForgotPassword"))
const RestaurantOTP = lazy(() => import("@/module/restaurant/pages/auth/OTP"))
const RestaurantGoogleCallback = lazy(() => import("@/module/restaurant/pages/auth/GoogleCallback"))
const RestaurantWelcome = lazy(() => import("@/module/restaurant/pages/auth/Welcome"))

const AdvertisementsPage = lazy(() => import("@/module/restaurant/pages/AdvertisementsPage"))
const AdDetailsPage = lazy(() => import("@/module/restaurant/pages/AdDetailsPage"))
const NewAdvertisementPage = lazy(() => import("@/module/restaurant/pages/NewAdvertisementPage"))
const EditAdvertisementPage = lazy(() => import("@/module/restaurant/pages/EditAdvertisementPage"))
const CouponListPage = lazy(() => import("@/module/restaurant/pages/CouponListPage"))
const AddCouponPage = lazy(() => import("@/module/restaurant/pages/AddCouponPage"))
const EditCouponPage = lazy(() => import("@/module/restaurant/pages/EditCouponPage"))
const ReviewsPage = lazy(() => import("@/module/restaurant/pages/ReviewsPage"))
const UpdateReplyPage = lazy(() => import("@/module/restaurant/pages/UpdateReplyPage"))
const PrivacyPolicyPage = lazy(() => import("@/module/restaurant/pages/PrivacyPolicyPage"))
const TermsAndConditionsPage = lazy(() => import("@/module/restaurant/pages/TermsAndConditionsPage"))
const RestaurantConfigPage = lazy(() => import("@/module/restaurant/pages/RestaurantConfigPage"))
const RestaurantCategoriesPage = lazy(() => import("@/module/restaurant/pages/RestaurantCategoriesPage"))
const MenuCategoriesPage = lazy(() => import("@/module/restaurant/pages/MenuCategoriesPage"))
const BusinessPlanPage = lazy(() => import("@/module/restaurant/pages/BusinessPlanPage"))
const ConversationListPage = lazy(() => import("@/module/restaurant/pages/ConversationListPage"))
const ChatDetailPage = lazy(() => import("@/module/restaurant/pages/ChatDetailPage"))
const RestaurantStatus = lazy(() => import("@/module/restaurant/pages/RestaurantStatus"))
const ExploreMore = lazy(() => import("@/module/restaurant/pages/ExploreMore"))
const RushHour = lazy(() => import("@/module/restaurant/pages/RushHour"))
const OutletInfo = lazy(() => import("@/module/restaurant/pages/OutletInfo"))
const RatingsReviews = lazy(() => import("@/module/restaurant/pages/RatingsReviews"))
const ContactDetails = lazy(() => import("@/module/restaurant/pages/ContactDetails"))
const EditOwner = lazy(() => import("@/module/restaurant/pages/EditOwner"))
const InviteUser = lazy(() => import("@/module/restaurant/pages/InviteUser"))
const EditCuisines = lazy(() => import("@/module/restaurant/pages/EditCuisines"))
const EditRestaurantAddress = lazy(() => import("@/module/restaurant/pages/EditRestaurantAddress"))
const Inventory = lazy(() => import("@/module/restaurant/pages/Inventory"))
const Feedback = lazy(() => import("@/module/restaurant/pages/Feedback"))
const ShareFeedback = lazy(() => import("@/module/restaurant/pages/ShareFeedback"))
const HelpCentre = lazy(() => import("@/module/restaurant/pages/HelpCentre"))
const FssaiDetails = lazy(() => import("@/module/restaurant/pages/FssaiDetails"))
const FssaiUpdate = lazy(() => import("@/module/restaurant/pages/FssaiUpdate"))
const HubGrowth = lazy(() => import("@/module/restaurant/pages/HubGrowth"))
const CreateOffers = lazy(() => import("@/module/restaurant/pages/CreateOffers"))
const ChooseDiscountType = lazy(() => import("@/module/restaurant/pages/ChooseDiscountType"))
const ChooseMenuDiscountType = lazy(() => import("@/module/restaurant/pages/ChooseMenuDiscountType"))
const CreatePercentageDiscount = lazy(() => import("@/module/restaurant/pages/CreatePercentageDiscount"))
const CreateFreebies = lazy(() => import("@/module/restaurant/pages/CreateFreebies"))
const FreebiesTiming = lazy(() => import("@/module/restaurant/pages/FreebiesTiming"))
const CreatePercentageMenuDiscount = lazy(() => import("@/module/restaurant/pages/CreatePercentageMenuDiscount"))
const CreateFlatPriceMenuDiscount = lazy(() => import("@/module/restaurant/pages/CreateFlatPriceMenuDiscount"))
const CreateBOGOMenuDiscount = lazy(() => import("@/module/restaurant/pages/CreateBOGOMenuDiscount"))
const MenuDiscountTiming = lazy(() => import("@/module/restaurant/pages/MenuDiscountTiming"))
const HubMenu = lazy(() => import("@/module/restaurant/pages/HubMenu"))
const ItemDetailsPage = lazy(() => import("@/module/restaurant/pages/ItemDetailsPage"))
const HubFinance = lazy(() => import("@/module/restaurant/pages/HubFinance"))
const FinanceDetailsPage = lazy(() => import("@/module/restaurant/pages/FinanceDetailsPage"))
const WithdrawalHistoryPage = lazy(() => import("@/module/restaurant/pages/WithdrawalHistoryPage"))
const ToHub = lazy(() => import("@/module/restaurant/pages/ToHub"))
const ManageOutlets = lazy(() => import("@/module/restaurant/pages/ManageOutlets"))
const UpdateBankDetails = lazy(() => import("@/module/restaurant/pages/UpdateBankDetails"))
const ZoneSetup = lazy(() => import("@/module/restaurant/pages/ZoneSetup"))
const DiningReservations = lazy(() => import("@/module/restaurant/pages/DiningReservations"))
const DiningManagement = lazy(() => import("@/module/restaurant/pages/DiningManagement"))

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

// Hotel Module
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

function UserPathRedirect() {
  const location = useLocation()
  const newPath = location.pathname.replace(/^\/user/, "") || "/"
  return <Navigate to={newPath} replace />
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
      .catch(() => {})
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

  function UserReloadHandler({ children }) {
    const location = useLocation();
    const navigate = useNavigate();

    const hasRestored = useRef(false);

    useEffect(() => {
      if (!sessionRestored || hasRestored.current) return;

      try {
        const nav = performance.getEntriesByType?.("navigation")?.[0];
        const isReload = nav?.type === "reload" || nav?.type === "navigate";
        
        // Mark as restored regardless of whether we actually navigate, 
        // to prevent this effect from blocking future SPA navigations.
        hasRestored.current = true;
        
        if (!isReload) return;

        const currentPath = location.pathname;
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
        const isProtectedUserRoute =
          routeWithoutQuery.startsWith("/cart") ||
          routeWithoutQuery.startsWith("/orders") ||
          routeWithoutQuery.startsWith("/profile") ||
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
          setTimeout(() => {
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
    }, [sessionRestored, navigate]); // Removed location.pathname to avoid repeated runs

    return children;
  }

  return (
    <Suspense fallback={<Loader />}>
      <NetworkStatusProvider>
        <NetworkStatusBanner />
        {!sessionRestored ? (
          <Loader />
        ) : (
          <UserReloadHandler>
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


        {/* Restaurant Public Routes */}
        <Route path="/restaurant/welcome" element={<AuthRedirect module="restaurant"><RestaurantWelcome /></AuthRedirect>} />
        <Route path="/restaurant/login" element={<AuthRedirect module="restaurant"><RestaurantLogin /></AuthRedirect>} />
        <Route path="/restaurant/signup" element={<AuthRedirect module="restaurant"><RestaurantSignup /></AuthRedirect>} />
        <Route path="/restaurant/signup-email" element={<AuthRedirect module="restaurant"><RestaurantSignupEmail /></AuthRedirect>} />
        <Route path="/restaurant/forgot-password" element={<AuthRedirect module="restaurant"><RestaurantForgotPassword /></AuthRedirect>} />
        <Route path="/restaurant/otp" element={<AuthRedirect module="restaurant"><RestaurantOTP /></AuthRedirect>} />
        <Route path="/restaurant/auth/google-callback" element={<AuthRedirect module="restaurant"><RestaurantGoogleCallback /></AuthRedirect>} />

        {/* Restaurant Protected Routes */}
        <Route
          path="/restaurant/onboarding"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <RestaurantOnboarding />
            </ProtectedRoute>
          }
        />



        {/* Restaurant Protected Routes - Old Routes */}
        <Route
          path="/restaurant"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <OrdersMain />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/notifications"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <RestaurantNotifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/orders"
          element={<Navigate to="/restaurant/orders/all" replace />}
        />
        <Route
          path="/restaurant/orders/all"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <AllOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/orders/:orderId"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <OrderDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/edit"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <EditRestaurantPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/food/all"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <AllFoodPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/food/:id"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <FoodDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/food/:id/edit"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <EditFoodPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/food/new"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <EditFoodPage />
            </ProtectedRoute>
          }
        />
        {/* Restaurant Protected Routes - Continued */}
        <Route
          path="/restaurant/advertisements"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <AdvertisementsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/advertisements/new"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <NewAdvertisementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/advertisements/:id"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <AdDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/advertisements/:id/edit"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <EditAdvertisementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/coupon"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <CouponListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/coupon/new"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <AddCouponPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/coupon/:id/edit"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <EditCouponPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/reviews"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ReviewsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/reviews/:id/reply"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <UpdateReplyPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/restaurant/settings"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <RestaurantSettingsPage />
            </ProtectedRoute>
          }
        />
        {/* Delivery settings removed */}
        <Route path="/restaurant/delivery-settings" element={<Navigate to="/restaurant/to-hub" replace />} />
        <Route
          path="/restaurant/rush-hour"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <RushHour />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/privacy"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <PrivacyPolicyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/terms"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <TermsAndConditionsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/restaurant/config"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <RestaurantConfigPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/categories"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <RestaurantCategoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/menu-categories"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <MenuCategoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/business-plan"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <BusinessPlanPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/conversation"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ConversationListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/conversation/:conversationId"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ChatDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/status"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <RestaurantStatus />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/explore"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ExploreMore />
            </ProtectedRoute>
          }
        />

        <Route
          path="/restaurant/outlet-timings"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <Navigate to="/restaurant/outlet-info" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/outlet-timings/:day"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <Navigate to="/restaurant/outlet-info" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/outlet-info"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <OutletInfo />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/ratings-reviews"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <Navigate to="/restaurant/outlet-info" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/contact-details"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ContactDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/edit-owner"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <EditOwner />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/invite-user"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <InviteUser />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/edit-cuisines"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <EditCuisines />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/edit-address"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <EditRestaurantAddress />
            </ProtectedRoute>
          }
        />

        <Route
          path="/restaurant/inventory"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <Inventory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/feedback"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <Feedback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/share-feedback"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ShareFeedback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/help-centre"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <HelpCentre />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/fssai"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <FssaiDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/fssai/update"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <FssaiUpdate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <HubGrowth />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <CreateOffers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ChooseMenuDiscountType />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/freebies"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <CreateFreebies />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/freebies/timings"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <FreebiesTiming />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/percentage"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <CreatePercentageMenuDiscount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/percentage/timings"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <MenuDiscountTiming />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/flat-price"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <CreateFlatPriceMenuDiscount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/flat-price/timings"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <MenuDiscountTiming />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/bogo"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <CreateBOGOMenuDiscount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/bogo/timings"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <MenuDiscountTiming />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/:goalId/:discountType/create"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <CreatePercentageDiscount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/:goalId"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ChooseDiscountType />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-menu"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <HubMenu />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-menu/item/:id"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ItemDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-finance"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <HubFinance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/withdrawal-history"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <WithdrawalHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/finance-details"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <FinanceDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/to-hub"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ToHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/manage-outlets"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ManageOutlets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/update-bank-details"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <UpdateBankDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/dining"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <DiningManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/reservations"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <DiningReservations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/zone-setup"
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login">
              <ZoneSetup />
            </ProtectedRoute>
          }
        />
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

        {/* Hotel Public Routes */}
        <Route path="/hotel" element={<AuthRedirect module="hotel"><HotelSignup /></AuthRedirect>} />
        <Route path="/hotel/otp" element={<AuthRedirect module="hotel"><HotelOTP /></AuthRedirect>} />
        <Route
          path="/hotel/legal/terms"
          element={
            <Suspense fallback={<Loader />}>
              <HotelTermsAndConditions />
            </Suspense>
          }
        />
        <Route
          path="/hotel/view/:hotelId"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <ViewHotel />
            </ProtectedRoute>
          }
        />

        {/* Hotel Protected Routes */}
        <Route
          path="/hotel/dashboard"
          element={
            <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
              <HotelDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hotel/orders"
          element={
            <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
              <HotelOrders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hotel/profile"
          element={
            <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
              <HotelProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hotel/wallet"
          element={
            <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
              <HotelWallet />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hotel/settlement"
          element={
            <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
              <HotelSettlement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hotel/leaderboard"
          element={
            <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
              <HotelLeaderboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hotel/leaderboard/past"
          element={
            <ProtectedRoute requiredRole="hotel" loginPath="/hotel">
              <HotelPastWinners />
            </ProtectedRoute>
          }
        />

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
