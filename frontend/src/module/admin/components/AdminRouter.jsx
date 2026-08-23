import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import AdminLayout from "./AdminLayout";
import Loader from "@/components/Loader";

const AdminHome = lazy(() => import("../pages/AdminHome"));


const AdminProfile = lazy(() => import("../pages/AdminProfile"));
const AdminSettings = lazy(() => import("../pages/AdminSettings"));
const FoodApproval = lazy(() => import("../pages/restaurant/FoodApproval"));
const OrdersPage = lazy(() => import("../pages/orders/OrdersPage"));
const OrderDetectDelivery = lazy(() => import("../pages/OrderDetectDelivery"));
const PaymentHistory = lazy(() => import("../pages/orders/PaymentHistory"));
const Category = lazy(() => import("../pages/categories/Category"));
const FeeSettings = lazy(() => import("../pages/fee-settings/FeeSettings"));
// Restaurant Management
const ZoneSetup = lazy(() => import("../pages/restaurant/ZoneSetup"));
const AddZone = lazy(() => import("../pages/restaurant/AddZone"));
const ViewZone = lazy(() => import("../pages/restaurant/ViewZone"));
const AllZonesMap = lazy(() => import("../pages/restaurant/AllZonesMap"));
const DeliveryBoyViewMap = lazy(() => import("../pages/restaurant/DeliveryBoyViewMap"));
const RestaurantsList = lazy(() => import("../pages/restaurant/RestaurantsList"));
const AddRestaurant = lazy(() => import("../pages/restaurant/AddRestaurant"));
const RestaurantEdit = lazy(() => import("../pages/restaurant/RestaurantEdit"));
const JoiningRequest = lazy(() => import("../pages/restaurant/JoiningRequest"));
const RestaurantCommission = lazy(() => import("../pages/restaurant/RestaurantCommission"));
const RestaurantComplaints = lazy(() => import("../pages/restaurant/RestaurantComplaints"));
const RestaurantFinance = lazy(() => import("../pages/restaurant/RestaurantFinance"));
const RestaurantHistory = lazy(() => import("../pages/restaurant/RestaurantHistory"));
const MenuAdd = lazy(() => import("../pages/restaurant/MenuAdd"));
// Hotel Management
const HotelsList = lazy(() => import("../pages/hotels/HotelsList"));
const HotelRequests = lazy(() => import("../pages/hotels/HotelRequests"));
const HotelStandRequests = lazy(() => import("../pages/hotels/HotelStandRequests"));
const HotelCommission = lazy(() => import("../pages/hotels/HotelCommission"));
const HotelWalletAdmin = lazy(() => import("../pages/hotels/HotelWalletAdmin"));
const HotelWithdrawal = lazy(() => import("../pages/HotelWithdrawal"));
const HotelLeaderboard = lazy(() => import("../pages/hotels/HotelLeaderboard"));
const HotelTermsAndCondition = lazy(() => import("../pages/hotels/HotelTermsAndCondition"));
const HotelPrivacyPolicy = lazy(() => import("../pages/hotels/HotelPrivacyPolicy"));
// Food Management
const FoodsList = lazy(() => import("../pages/foods/FoodsList"));
const AddonsList = lazy(() => import("../pages/addons/AddonsList"));
// Promotions Management
const Coupons = lazy(() => import("../pages/Coupons"));
const NewAdvertisement = lazy(() => import("../pages/advertisement/NewAdvertisement"));
const PushNotification = lazy(() => import("../pages/PushNotification"));
const AdvertiseBanner = lazy(() => import("../pages/AdvertiseBanner"));
const AdminPromoCodes = lazy(() => import("../pages/promotions/AdminPromoCodes"));
// Help & Support
const CustomerContactUs = lazy(() => import("../pages/CustomerContactUs"));
const ContactMessages = lazy(() => import("../pages/ContactMessages"));
const SafetyEmergencyReports = lazy(() => import("../pages/SafetyEmergencyReports"));
const ImproveFeedback = lazy(() => import("../pages/ImproveFeedback"));
const RestaurantTermsAndCondition = lazy(() =>
  import("../pages/help-support/RestaurantTermsAndCondition"),
);
const RestaurantPrivacyPolicy = lazy(() =>
  import("../pages/help-support/RestaurantPrivacyPolicy"),
);
// Customer Management
const Customers = lazy(() => import("../pages/Customers"));
// Deliveryman Management
const DeliveryBoyCommission = lazy(() => import("../pages/DeliveryBoyCommission"));
const DeliveryCashLimit = lazy(() => import("../pages/DeliveryCashLimit"));
const CashLimitSettlement = lazy(() => import("../pages/CashLimitSettlement"));
const DeliveryWithdrawal = lazy(() => import("../pages/DeliveryWithdrawal"));
const DeliveryBoyWallet = lazy(() => import("../pages/DeliveryBoyWallet"));
const DeliveryEmergencyHelp = lazy(() => import("../pages/DeliveryEmergencyHelp"));
const DeliverySupportTickets = lazy(() => import("../pages/DeliverySupportTickets"));
const JoinRequest = lazy(() => import("../pages/delivery-partners/JoinRequest"));
const AddDeliveryman = lazy(() => import("../pages/delivery-partners/AddDeliveryman"));
const DeliverymanList = lazy(() => import("../pages/delivery-partners/DeliverymanList"));
const DeliverymanReviews = lazy(() => import("../pages/delivery-partners/DeliverymanReviews"));
const DeliverymanBonus = lazy(() => import("../pages/delivery-partners/DeliverymanBonus"));
const EarningAddon = lazy(() => import("../pages/delivery-partners/EarningAddon"));
const EarningAddonHistory = lazy(() => import("../pages/delivery-partners/EarningAddonHistory"));
const DeliveryEarnings = lazy(() => import("../pages/delivery-partners/DeliveryEarnings"));
const DeliveryHistory = lazy(() => import("../pages/delivery-partners/DeliveryHistory"));
const DeliveryTermsAndCondition = lazy(() =>
  import("../pages/delivery-partners/DeliveryTermsAndCondition"),
);
const DeliveryPrivacyPolicy = lazy(() =>
  import("../pages/delivery-partners/DeliveryPrivacyPolicy"),
);
// Report Management
const TransactionReport = lazy(() => import("../pages/reports/TransactionReport"));
const RegularOrderReport = lazy(() => import("../pages/reports/RegularOrderReport"));
const RestaurantReport = lazy(() => import("../pages/reports/RestaurantReport"));
const FeedbackExperienceReport = lazy(() => import("../pages/reports/FeedbackExperienceReport"));
// Transaction Management
const RestaurantWithdraws = lazy(() => import("../pages/transactions/RestaurantWithdraws"));
// Business Settings
const BusinessSetup = lazy(() => import("../pages/settings/BusinessSetup"));
const TermsAndCondition = lazy(() => import("../pages/settings/TermsAndCondition"));
const PrivacyPolicy = lazy(() => import("../pages/settings/PrivacyPolicy"));
const AboutUs = lazy(() => import("../pages/settings/AboutUs"));
const RefundPolicy = lazy(() => import("../pages/settings/RefundPolicy"));
const ShippingPolicy = lazy(() => import("../pages/settings/ShippingPolicy"));
const CancellationPolicy = lazy(() => import("../pages/settings/CancellationPolicy"));
const LandingPageManagement = lazy(() => import("../pages/system/LandingPageManagement"));
const DiningManagement = lazy(() => import("../pages/system/DiningManagement"));
const DiningList = lazy(() => import("../pages/system/DiningList"));
const DiningCoupons = lazy(() => import("../pages/dining/DiningCoupons"));
const DiningEarnings = lazy(() => import("../pages/dining/DiningEarnings"));

export default function AdminRouter() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* Protected Routes - With Layout */}
        <Route
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard */}
          <Route
            path="/"
            element={
              <ProtectedRoute requiredPermission="menu.dashboard">
                <AdminHome />
              </ProtectedRoute>
            }
          />

          {/* Profile */}
          <Route path="/profile" element={<AdminProfile />} />

          {/* Settings */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute requiredPermission="page.business_setup">
                <AdminSettings />
              </ProtectedRoute>
            }
          />

          {/* ORDER MANAGEMENT */}
          <Route path="orders/all" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="all" /></ProtectedRoute>} />
          <Route path="orders/scheduled" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="scheduled" /></ProtectedRoute>} />
          <Route path="orders/pending" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="pending" /></ProtectedRoute>} />
          <Route path="orders/accepted" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="accepted" /></ProtectedRoute>} />
          <Route path="orders/processing" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="processing" /></ProtectedRoute>} />
          <Route path="orders/food-on-the-way" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="food-on-the-way" /></ProtectedRoute>} />
          <Route path="orders/delivered" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="delivered" /></ProtectedRoute>} />
          <Route path="orders/canceled" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="canceled" /></ProtectedRoute>} />
          <Route path="orders/restaurant-cancelled" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="restaurant-cancelled" /></ProtectedRoute>} />
          <Route path="orders/payment-failed" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="payment-failed" /></ProtectedRoute>} />
          <Route path="orders/refunded" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="refunded" /></ProtectedRoute>} />
          <Route path="orders/offline-payments" element={<ProtectedRoute requiredPermission="page.orders_list"><OrdersPage statusKey="offline-payments" /></ProtectedRoute>} />
          <Route path="order-detect-delivery" element={<ProtectedRoute requiredPermission="page.order_detect_delivery"><OrderDetectDelivery /></ProtectedRoute>} />
          <Route path="payment-history" element={<ProtectedRoute requiredPermission="page.payment_history"><PaymentHistory /></ProtectedRoute>} />

          {/* RESTAURANT MANAGEMENT */}
          <Route path="zone-setup" element={<ProtectedRoute requiredPermission="page.zone_setup"><ZoneSetup /></ProtectedRoute>} />
          <Route path="zone-setup/map" element={<ProtectedRoute requiredPermission="page.zone_setup"><AllZonesMap /></ProtectedRoute>} />
          <Route path="zone-setup/delivery-boy-view" element={<ProtectedRoute requiredPermission="page.zone_setup"><DeliveryBoyViewMap /></ProtectedRoute>} />
          <Route path="zone-setup/add" element={<ProtectedRoute requiredPermission="page.zone_setup"><AddZone /></ProtectedRoute>} />
          <Route path="zone-setup/edit/:id" element={<ProtectedRoute requiredPermission="page.zone_setup"><AddZone /></ProtectedRoute>} />
          <Route path="zone-setup/view/:id" element={<ProtectedRoute requiredPermission="page.zone_setup"><ViewZone /></ProtectedRoute>} />
          <Route path="food-approval" element={<ProtectedRoute requiredPermission="page.food_approval"><FoodApproval /></ProtectedRoute>} />
          <Route path="restaurants" element={<ProtectedRoute requiredPermission="page.restaurants_list"><RestaurantsList /></ProtectedRoute>} />
          <Route path="restaurants/add" element={<ProtectedRoute requiredPermission="page.restaurants_list"><AddRestaurant /></ProtectedRoute>} />
          <Route path="restaurants/:id/edit" element={<ProtectedRoute requiredPermission="page.restaurants_list"><RestaurantEdit /></ProtectedRoute>} />
          <Route path="restaurants/joining-request" element={<ProtectedRoute requiredPermission="page.restaurant_joining_request"><JoiningRequest /></ProtectedRoute>} />
          <Route path="restaurants/commission" element={<ProtectedRoute requiredPermission="page.restaurant_commission"><RestaurantCommission /></ProtectedRoute>} />
          <Route path="restaurants/complaints" element={<ProtectedRoute requiredPermission="page.restaurant_complaints"><RestaurantComplaints /></ProtectedRoute>} />
          <Route path="restaurants/finance" element={<ProtectedRoute requiredPermission="page.restaurant_finance"><RestaurantFinance /></ProtectedRoute>} />
          <Route path="restaurants/history" element={<ProtectedRoute requiredPermission="page.restaurant_history"><RestaurantHistory /></ProtectedRoute>} />
          <Route path="restaurants/menu-add" element={<ProtectedRoute requiredPermission="page.restaurant_menu_add"><MenuAdd /></ProtectedRoute>} />

          {/* HOTEL MANAGEMENT */}
          <Route path="hotels" element={<ProtectedRoute requiredPermission="page.hotels_list"><HotelsList /></ProtectedRoute>} />
          <Route path="hotel-requests" element={<ProtectedRoute requiredPermission="page.hotel_requests"><HotelRequests /></ProtectedRoute>} />
          <Route path="hotel-stand-requests" element={<ProtectedRoute requiredPermission="page.hotel_stand_requests"><HotelStandRequests /></ProtectedRoute>} />
          <Route path="hotels/commission" element={<ProtectedRoute requiredPermission="page.hotel_commission"><HotelCommission /></ProtectedRoute>} />
          <Route path="hotel-wallet" element={<ProtectedRoute requiredPermission="page.hotel_wallet"><HotelWalletAdmin /></ProtectedRoute>} />
          <Route path="hotel-withdrawal" element={<ProtectedRoute requiredPermission="page.hotel_withdrawal"><HotelWithdrawal /></ProtectedRoute>} />
          <Route path="hotel-terms" element={<ProtectedRoute requiredPermission="page.hotel_terms"><HotelTermsAndCondition /></ProtectedRoute>} />
          <Route path="hotel-privacy" element={<ProtectedRoute requiredPermission="page.hotel_privacy"><HotelPrivacyPolicy /></ProtectedRoute>} />
          <Route path="hotel-leaderboard" element={<ProtectedRoute requiredPermission="page.hotel_leaderboard"><HotelLeaderboard /></ProtectedRoute>} />

          {/* FOOD MANAGEMENT */}
          <Route path="categories" element={<ProtectedRoute requiredPermission="page.categories"><Category /></ProtectedRoute>} />
          <Route path="fee-settings" element={<ProtectedRoute requiredPermission="page.fee_settings"><FeeSettings /></ProtectedRoute>} />
          <Route path="foods" element={<ProtectedRoute requiredPermission="page.foods_list"><FoodsList /></ProtectedRoute>} />
          <Route path="addons" element={<ProtectedRoute requiredPermission="page.addons_list"><AddonsList /></ProtectedRoute>} />

          {/* PROMOTIONS MANAGEMENT */}
          <Route path="coupons" element={<ProtectedRoute requiredPermission="page.coupons"><Coupons /></ProtectedRoute>} />
          <Route path="advertisement/new" element={<ProtectedRoute requiredPermission="page.advertise_banner"><NewAdvertisement /></ProtectedRoute>} />
          <Route path="push-notification" element={<ProtectedRoute requiredPermission="page.push_notification"><PushNotification /></ProtectedRoute>} />
          <Route path="advertise-banner" element={<ProtectedRoute requiredPermission="page.advertise_banner"><AdvertiseBanner /></ProtectedRoute>} />
          <Route path="promo-codes" element={<ProtectedRoute requiredPermission="page.promo_codes"><AdminPromoCodes /></ProtectedRoute>} />

          {/* HELP & SUPPORT */}
          <Route path="customer-contact-us" element={<ProtectedRoute requiredPermission="page.customer_contact_us"><CustomerContactUs /></ProtectedRoute>} />
          <Route path="contact-messages" element={<ProtectedRoute requiredPermission="page.contact_messages"><ContactMessages /></ProtectedRoute>} />
          <Route path="safety-emergency-reports" element={<ProtectedRoute requiredPermission="page.safety_emergency_reports"><SafetyEmergencyReports /></ProtectedRoute>} />
          <Route path="improve-feedback" element={<ProtectedRoute requiredPermission="page.improve_feedback"><ImproveFeedback /></ProtectedRoute>} />
          <Route path="restaurant-terms" element={<ProtectedRoute requiredPermission="page.restaurant_terms"><RestaurantTermsAndCondition /></ProtectedRoute>} />
          <Route path="restaurant-privacy" element={<ProtectedRoute requiredPermission="page.restaurant_privacy"><RestaurantPrivacyPolicy /></ProtectedRoute>} />

          {/* CUSTOMER MANAGEMENT */}
          <Route path="customers" element={<ProtectedRoute requiredPermission="page.customers_list"><Customers /></ProtectedRoute>} />

          {/* DELIVERYMAN MANAGEMENT */}
          <Route path="delivery-boy-commission" element={<ProtectedRoute requiredPermission="page.delivery_boy_commission"><DeliveryBoyCommission /></ProtectedRoute>} />
          <Route path="delivery-cash-limit" element={<ProtectedRoute requiredPermission="page.delivery_cash_limit"><DeliveryCashLimit /></ProtectedRoute>} />
          <Route path="cash-limit-settlement" element={<ProtectedRoute requiredPermission="page.cash_limit_settlement"><CashLimitSettlement /></ProtectedRoute>} />
          <Route path="delivery-withdrawal" element={<ProtectedRoute requiredPermission="page.delivery_withdrawal"><DeliveryWithdrawal /></ProtectedRoute>} />
          <Route path="delivery-boy-wallet" element={<ProtectedRoute requiredPermission="page.delivery_boy_wallet"><DeliveryBoyWallet /></ProtectedRoute>} />
          <Route path="delivery-emergency-help" element={<ProtectedRoute requiredPermission="page.delivery_emergency_help"><DeliveryEmergencyHelp /></ProtectedRoute>} />
          <Route path="delivery-support-tickets" element={<ProtectedRoute requiredPermission="page.delivery_support_tickets"><DeliverySupportTickets /></ProtectedRoute>} />
          <Route path="delivery-partners/join-request" element={<ProtectedRoute requiredPermission="page.delivery_join_request"><JoinRequest /></ProtectedRoute>} />
          <Route path="delivery-partners/add" element={<ProtectedRoute requiredPermission="page.deliveryman_list"><AddDeliveryman /></ProtectedRoute>} />
          <Route path="delivery-partners" element={<ProtectedRoute requiredPermission="page.deliveryman_list"><DeliverymanList /></ProtectedRoute>} />
          <Route path="delivery-partners/reviews" element={<ProtectedRoute requiredPermission="page.deliveryman_reviews"><DeliverymanReviews /></ProtectedRoute>} />
          <Route path="delivery-partners/bonus" element={<ProtectedRoute requiredPermission="page.deliveryman_bonus"><DeliverymanBonus /></ProtectedRoute>} />
          <Route path="delivery-partners/earning-addon" element={<ProtectedRoute requiredPermission="page.delivery_earning_addon"><EarningAddon /></ProtectedRoute>} />
          <Route path="delivery-partners/earning-addon-history" element={<ProtectedRoute requiredPermission="page.delivery_earning_addon_history"><EarningAddonHistory /></ProtectedRoute>} />
          <Route path="delivery-partners/earnings" element={<ProtectedRoute requiredPermission="page.delivery_earnings"><DeliveryEarnings /></ProtectedRoute>} />
          <Route path="delivery-partners/history" element={<ProtectedRoute requiredPermission="page.delivery_history"><DeliveryHistory /></ProtectedRoute>} />
          <Route path="delivery-partners/terms" element={<ProtectedRoute requiredPermission="page.delivery_terms"><DeliveryTermsAndCondition /></ProtectedRoute>} />
          <Route path="delivery-partners/privacy" element={<ProtectedRoute requiredPermission="page.delivery_privacy"><DeliveryPrivacyPolicy /></ProtectedRoute>} />

          {/* REPORT MANAGEMENT */}
          <Route path="transaction-report" element={<ProtectedRoute requiredPermission="page.transaction_report"><TransactionReport /></ProtectedRoute>} />
          <Route path="order-report/regular" element={<ProtectedRoute requiredPermission="page.order_report"><RegularOrderReport /></ProtectedRoute>} />
          <Route path="restaurant-report" element={<ProtectedRoute requiredPermission="page.restaurant_report"><RestaurantReport /></ProtectedRoute>} />
          <Route path="customer-report/feedback-experience" element={<ProtectedRoute requiredPermission="page.customer_report"><FeedbackExperienceReport /></ProtectedRoute>} />

          {/* TRANSACTION MANAGEMENT */}
          <Route path="restaurant-withdraws" element={<ProtectedRoute requiredPermission="page.restaurant_withdraws"><RestaurantWithdraws /></ProtectedRoute>} />

          {/* BUSINESS SETTINGS */}
          <Route path="business-setup" element={<ProtectedRoute requiredPermission="page.business_setup"><BusinessSetup /></ProtectedRoute>} />
          <Route path="pages-social-media/terms" element={<ProtectedRoute requiredPermission="page.pages_social_media"><TermsAndCondition /></ProtectedRoute>} />
          <Route path="pages-social-media/privacy" element={<ProtectedRoute requiredPermission="page.pages_social_media"><PrivacyPolicy /></ProtectedRoute>} />
          <Route path="pages-social-media/about" element={<ProtectedRoute requiredPermission="page.pages_social_media"><AboutUs /></ProtectedRoute>} />
          <Route path="pages-social-media/refund" element={<ProtectedRoute requiredPermission="page.pages_social_media"><RefundPolicy /></ProtectedRoute>} />
          <Route path="pages-social-media/shipping" element={<ProtectedRoute requiredPermission="page.pages_social_media"><ShippingPolicy /></ProtectedRoute>} />
          <Route path="pages-social-media/cancellation" element={<ProtectedRoute requiredPermission="page.pages_social_media"><CancellationPolicy /></ProtectedRoute>} />

          {/* HERO BANNER MANAGEMENT */}
          <Route path="hero-banner-management" element={<ProtectedRoute requiredPermission="page.hero_banner_management"><LandingPageManagement /></ProtectedRoute>} />

          {/* DINING MANAGEMENT */}
          <Route path="dining-management" element={<ProtectedRoute requiredPermission="page.dining_banners"><DiningManagement /></ProtectedRoute>} />
          <Route path="dining-list" element={<ProtectedRoute requiredPermission="page.dining_list"><DiningList /></ProtectedRoute>} />
          <Route path="dining/coupons" element={<ProtectedRoute requiredPermission="page.dining_coupons"><DiningCoupons /></ProtectedRoute>} />
          <Route path="dining/earnings" element={<ProtectedRoute requiredPermission="page.dining_earnings"><DiningEarnings /></ProtectedRoute>} />
        </Route>

        {/* Redirect /admin to /admin/ */}
        <Route path="" element={<Navigate to="/admin/login" replace />} />
      </Routes >
    </Suspense>
  );
}
