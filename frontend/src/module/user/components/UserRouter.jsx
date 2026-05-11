import { Routes, Route, useLocation, Outlet } from "react-router-dom"
import ProtectedRoute from "@/components/ProtectedRoute"
import AuthRedirect from "@/components/AuthRedirect"
import UserLayout from "./UserLayout"
import UserPreventRedirect from "./UserPreventRedirect"
import { Suspense, lazy, useEffect } from "react"
import Loader from "@/components/Loader"
import { LocationProvider } from "@/lib/context/LocationContext"

// Lazy Loading Pages

// Home & Discovery
const Home = lazy(() => import("../pages/Home"))
const Dining = lazy(() => import("../pages/Dining"))
const DiningRestaurants = lazy(() => import("../pages/DiningRestaurants"))
const DiningCategory = lazy(() => import("../pages/DiningCategory"))
const Under250 = lazy(() => import("../pages/Under250"))
const CategoryPage = lazy(() => import("../pages/CategoryPage"))

const RestaurantDetails = lazy(() => import("../pages/restaurants/RestaurantDetails"))
const RestaurantInfo = lazy(() => import("../pages/restaurants/RestaurantInfo"))
const DiningRestaurantDetails = lazy(() => import("../pages/dining/DiningRestaurantDetails"))
const TableBooking = lazy(() => import("../pages/dining/TableBooking"))
const TableBookingConfirmation = lazy(() => import("../pages/dining/TableBookingConfirmation"))
const TableBookingSuccess = lazy(() => import("../pages/dining/TableBookingSuccess"))
const MyBookings = lazy(() => import("../pages/dining/MyBookings"))
const SearchResults = lazy(() => import("../pages/SearchResults"))

// Cart
const Cart = lazy(() => import("../pages/cart/Cart"))
const Checkout = lazy(() => import("../pages/cart/Checkout"))

// Orders
const Orders = lazy(() => import("../pages/orders/Orders"))
const OrderTracking = lazy(() => import("../pages/orders/OrderTracking"))
const OrderInvoice = lazy(() => import("../pages/orders/OrderInvoice"))
const UserOrderDetails = lazy(() => import("../pages/orders/UserOrderDetails"))
const OrderChat = lazy(() => import("../pages/orders/OrderChat"))

// Offers
const Offers = lazy(() => import("../pages/Offers"))

// Gourmet
const Gourmet = lazy(() => import("../pages/Gourmet"))

// Top 10
const Top10 = lazy(() => import("../pages/Top10"))

// Collections
const Collections = lazy(() => import("../pages/Collections"))
const CollectionDetail = lazy(() => import("../pages/CollectionDetail"))

// Gift Cards
const GiftCards = lazy(() => import("../pages/GiftCards"))
const GiftCardCheckout = lazy(() => import("../pages/GiftCardCheckout"))

// Profile
const Profile = lazy(() => import("../pages/profile/Profile"))
const EditProfile = lazy(() => import("../pages/profile/EditProfile"))
const Payments = lazy(() => import("../pages/profile/Payments"))
const AddPayment = lazy(() => import("../pages/profile/AddPayment"))
const EditPayment = lazy(() => import("../pages/profile/EditPayment"))
const Favorites = lazy(() => import("../pages/profile/Favorites"))
const Settings = lazy(() => import("../pages/profile/Settings"))
const Coupons = lazy(() => import("../pages/profile/Coupons"))
const About = lazy(() => import("../pages/profile/About"))
const Terms = lazy(() => import("../pages/profile/Terms"))
const Privacy = lazy(() => import("../pages/profile/Privacy"))
const Refund = lazy(() => import("../pages/profile/Refund"))
const Shipping = lazy(() => import("../pages/profile/Shipping"))
const Cancellation = lazy(() => import("../pages/profile/Cancellation"))
const SendFeedback = lazy(() => import("../pages/profile/SendFeedback"))
const ContactUs = lazy(() => import("../pages/profile/ContactUs"))
const ReportSafetyEmergency = lazy(() => import("../pages/profile/ReportSafetyEmergency"))
const Logout = lazy(() => import("../pages/profile/Logout"))

// Auth
const SignIn = lazy(() => import("../pages/auth/SignIn"))
const OTP = lazy(() => import("../pages/auth/OTP"))
const AuthCallback = lazy(() => import("../pages/auth/AuthCallback"))

// Help
const Help = lazy(() => import("../pages/help/Help"))

// Notifications
const Notifications = lazy(() => import("../pages/Notifications"))

// Wallet
const Wallet = lazy(() => import("../pages/Wallet"))

// Complaints
const SubmitComplaint = lazy(() => import("../pages/complaints/SubmitComplaint"))

function UserRouteTracker({ children }) {
  const location = useLocation()

  useEffect(() => {
    const { pathname, search, hash } = location
    const fullPath = `${pathname}${search}${hash}`
    try {
      sessionStorage.setItem("user_lastRoute", fullPath)
      sessionStorage.setItem("user_lastScrollY", String(window.scrollY || 0))
    } catch {
      // ignore storage errors
    }
  }, [location])

  return children
}

export default function UserRouter() {
  // Preload restaurant detail chunk early so first visit to /restaurants/:slug is not blocked on JS download
  useEffect(() => {
    import("../pages/restaurants/RestaurantDetails")
  }, [])

  return (
    <Suspense fallback={<Loader />}>
      <LocationProvider>
      <UserRouteTracker>
        <Routes>
          <Route element={<UserLayout />}>
          {/* Global User Protection for main app content */}
          <Route element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in"><Outlet /></ProtectedRoute>}>
            {/* Home & Discovery */}
            <Route path="/" element={<UserPreventRedirect><Home /></UserPreventRedirect>} />
            <Route path="/dining" element={<Dining />} />
            <Route path="/dining/restaurants" element={<DiningRestaurants />} />
            <Route path="/dining/:category" element={<DiningCategory />} />
            <Route path="/dining/:diningType/:slug" element={<DiningRestaurantDetails />} />
            <Route path="/dining/book/:slug" element={<TableBooking />} />
            <Route path="/dining/book-confirmation" element={<TableBookingConfirmation />} />
            <Route path="/dining/book-success" element={<TableBookingSuccess />} />
            <Route path="/bookings" element={<MyBookings />} />
            <Route path="/under-250" element={<Under250 />} />
            <Route path="/category/:category" element={<CategoryPage />} />
            <Route path="/restaurants/:slug" element={<RestaurantDetails />} />
            <Route path="/restaurants/:slug/info" element={<RestaurantInfo />} />
            <Route path="/search" element={<SearchResults />} />

            {/* Cart */}
            <Route path="/cart" element={<Cart />} />
            <Route path="/cart/checkout" element={<Checkout />} />

            {/* Orders */}
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:orderId" element={<OrderTracking />} />
            <Route path="/orders/:orderId/invoice" element={<OrderInvoice />} />
            <Route path="/orders/:orderId/details" element={<UserOrderDetails />} />
            <Route path="/orders/:orderId/chat" element={<OrderChat />} />

            {/* Offers */}
            <Route path="/offers" element={<Offers />} />

            {/* Gourmet */}
            <Route path="/gourmet" element={<Gourmet />} />

            {/* Top 10 */}
            <Route path="/top-10" element={<Top10 />} />

            {/* Collections */}
            <Route path="/collections" element={<Collections />} />
            <Route path="/collections/:id" element={<CollectionDetail />} />

            {/* Gift Cards */}
            <Route path="/gift-card" element={<GiftCards />} />
            <Route path="/gift-card/checkout" element={<GiftCardCheckout />} />

            {/* Profile */}
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/edit" element={<EditProfile />} />
            <Route path="/profile/payments" element={<Payments />} />
            <Route path="/profile/payments/new" element={<AddPayment />} />
            <Route path="/profile/payments/:id/edit" element={<EditPayment />} />
            <Route path="/profile/favorites" element={<Favorites />} />
            <Route path="/profile/settings" element={<Settings />} />
            <Route path="/profile/coupons" element={<Coupons />} />
            <Route path="/profile/send-feedback" element={<SendFeedback />} />

            <Route path="/profile/report-safety-emergency" element={<ReportSafetyEmergency />} />
            <Route path="/profile/logout" element={<Logout />} />

            {/* Notifications */}
            <Route path="/notifications" element={<Notifications />} />

            {/* Wallet */}
            <Route path="/wallet" element={<Wallet />} />

            {/* Complaints */}
            <Route path="/complaints/submit/:orderId" element={<SubmitComplaint />} />
          </Route>

          {/* Public routes (accessible without login) */}
          {/* Auth */}
          <Route path="/auth/sign-in" element={<AuthRedirect module="user"><SignIn /></AuthRedirect>} />
          <Route path="/auth/otp" element={<AuthRedirect module="user"><OTP /></AuthRedirect>} />
          <Route path="/auth/callback" element={<AuthRedirect module="user"><AuthCallback /></AuthRedirect>} />

          {/* Public Legal and Info */}
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/help" element={<Help />} />

          {/* Public Profile Routes (Required for iOS verification) */}
          <Route path="/profile/contact-us" element={<ContactUs />} />
          <Route path="/profile/about" element={<About />} />
          <Route path="/profile/terms" element={<Terms />} />
          <Route path="/profile/privacy" element={<Privacy />} />
          <Route path="/profile/refund" element={<Refund />} />
          <Route path="/profile/shipping" element={<Shipping />} />
          <Route path="/profile/cancellation" element={<Cancellation />} />

          </Route>
        </Routes>
      </UserRouteTracker>
      </LocationProvider>
    </Suspense>
  )
}

