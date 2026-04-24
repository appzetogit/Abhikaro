import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import AdminLayout from "./AdminLayout";
import Loader from "@/components/Loader";

const AdminHome = lazy(() => import("../pages/AdminHome"));
const PointOfSale = lazy(() => import("../pages/PointOfSale"));
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
// Food Management
const FoodsList = lazy(() => import("../pages/foods/FoodsList"));
const AddonsList = lazy(() => import("../pages/addons/AddonsList"));
// Promotions Management
const Coupons = lazy(() => import("../pages/Coupons"));
const NewAdvertisement = lazy(() => import("../pages/advertisement/NewAdvertisement"));
const PushNotification = lazy(() => import("../pages/PushNotification"));
const AdvertiseBanner = lazy(() => import("../pages/AdvertiseBanner"));
// Help & Support
const CustomerContactUs = lazy(() => import("../pages/CustomerContactUs"));
const ContactMessages = lazy(() => import("../pages/ContactMessages"));
const SafetyEmergencyReports = lazy(() => import("../pages/SafetyEmergencyReports"));
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


          <Route
            path="/point-of-sale"
            element={
              <ProtectedRoute requiredPermission="menu.point_of_sale">
                <PointOfSale />
              </ProtectedRoute>
            }
          />

          {/* Profile */}
          <Route path="/profile" element={<AdminProfile />} />

          {/* Settings */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute requiredPermission="menu.settings">
                <AdminSettings />
              </ProtectedRoute>
            }
          />

          {/* ORDER MANAGEMENT */}
          {/* Orders */}
          <Route
            path="orders/all"
            element={
              <ProtectedRoute requiredPermission="orders.view">
                <OrdersPage statusKey="all" />
              </ProtectedRoute>
            }
          />
          <Route path="orders/scheduled" element={<OrdersPage statusKey="scheduled" />} />
          <Route path="orders/pending" element={<OrdersPage statusKey="pending" />} />
          <Route path="orders/accepted" element={<OrdersPage statusKey="accepted" />} />
          <Route path="orders/processing" element={<OrdersPage statusKey="processing" />} />
          <Route path="orders/food-on-the-way" element={<OrdersPage statusKey="food-on-the-way" />} />
          <Route path="orders/delivered" element={<OrdersPage statusKey="delivered" />} />
          <Route path="orders/canceled" element={<OrdersPage statusKey="canceled" />} />
          <Route path="orders/restaurant-cancelled" element={<OrdersPage statusKey="restaurant-cancelled" />} />
          <Route path="orders/payment-failed" element={<OrdersPage statusKey="payment-failed" />} />
          <Route path="orders/refunded" element={<OrdersPage statusKey="refunded" />} />
          <Route path="orders/offline-payments" element={<OrdersPage statusKey="offline-payments" />} />
          <Route path="order-detect-delivery" element={<OrderDetectDelivery />} />
          <Route
            path="payment-history"
            element={
              <ProtectedRoute requiredPermission="orders.view">
                <PaymentHistory />
              </ProtectedRoute>
            }
          />

          {/* RESTAURANT MANAGEMENT */}
          <Route path="zone-setup" element={<ZoneSetup />} />
          <Route path="zone-setup/map" element={<AllZonesMap />} />
          <Route path="zone-setup/delivery-boy-view" element={<DeliveryBoyViewMap />} />
          <Route path="zone-setup/add" element={<AddZone />} />
          <Route path="zone-setup/edit/:id" element={<AddZone />} />
          <Route path="zone-setup/view/:id" element={<ViewZone />} />
          <Route path="food-approval" element={<FoodApproval />} />
          {/* Restaurants */}
          <Route path="restaurants" element={<RestaurantsList />} />
          <Route path="restaurants/add" element={<AddRestaurant />} />
          <Route path="restaurants/:id/edit" element={<RestaurantEdit />} />
          <Route path="restaurants/joining-request" element={<JoiningRequest />} />
          <Route path="restaurants/commission" element={<RestaurantCommission />} />
          <Route path="restaurants/complaints" element={<RestaurantComplaints />} />
          <Route path="restaurants/finance" element={<RestaurantFinance />} />
          <Route path="restaurants/history" element={<RestaurantHistory />} />
          <Route path="restaurants/menu-add" element={<MenuAdd />} />

          {/* HOTEL MANAGEMENT */}
          <Route
            path="hotels"
            element={
              <ProtectedRoute requiredPermission="menu.hotels">
                <HotelsList />
              </ProtectedRoute>
            }
          />
          <Route path="hotel-requests" element={<HotelRequests />} />
          <Route path="hotel-stand-requests" element={<HotelStandRequests />} />
          <Route path="hotels/commission" element={<HotelCommission />} />
          <Route path="hotel-wallet" element={<HotelWalletAdmin />} />
          <Route path="hotel-withdrawal" element={<HotelWithdrawal />} />
          <Route
            path="hotel-leaderboard"
            element={
              <ProtectedRoute requiredPermission="hotels.view">
                <HotelLeaderboard />
              </ProtectedRoute>
            }
          />

          {/* FOOD MANAGEMENT */}
          {/* Categories */}
          <Route path="categories" element={<Category />} />
          {/* Fee Settings */}
          <Route path="fee-settings" element={<FeeSettings />} />
          {/* Foods */}
          <Route path="foods" element={<FoodsList />} />
          {/* Addons */}
          <Route path="addons" element={<AddonsList />} />

          {/* PROMOTIONS MANAGEMENT */}
          <Route path="coupons" element={<Coupons />} />
          {/* Advertisement */}
          <Route path="advertisement/new" element={<NewAdvertisement />} />
          <Route path="push-notification" element={<PushNotification />} />
          <Route path="advertise-banner" element={<AdvertiseBanner />} />

          {/* HELP & SUPPORT */}
          <Route path="customer-contact-us" element={<CustomerContactUs />} />
          <Route path="contact-messages" element={<ContactMessages />} />
          <Route path="safety-emergency-reports" element={<SafetyEmergencyReports />} />
          <Route path="restaurant-terms" element={<RestaurantTermsAndCondition />} />
          <Route path="restaurant-privacy" element={<RestaurantPrivacyPolicy />} />

          {/* CUSTOMER MANAGEMENT */}
          <Route path="customers" element={<Customers />} />

          {/* DELIVERYMAN MANAGEMENT */}
          <Route path="delivery-boy-commission" element={<DeliveryBoyCommission />} />
          <Route path="delivery-cash-limit" element={<DeliveryCashLimit />} />
          <Route path="cash-limit-settlement" element={<CashLimitSettlement />} />
          <Route path="delivery-withdrawal" element={<DeliveryWithdrawal />} />
          <Route path="delivery-boy-wallet" element={<DeliveryBoyWallet />} />
          <Route path="delivery-emergency-help" element={<DeliveryEmergencyHelp />} />
          <Route path="delivery-support-tickets" element={<DeliverySupportTickets />} />
          {/* Delivery Partners */}
          <Route path="delivery-partners/join-request" element={<JoinRequest />} />
          <Route path="delivery-partners/add" element={<AddDeliveryman />} />
          <Route path="delivery-partners" element={<DeliverymanList />} />
          <Route path="delivery-partners/reviews" element={<DeliverymanReviews />} />
          <Route path="delivery-partners/bonus" element={<DeliverymanBonus />} />
          <Route path="delivery-partners/earning-addon" element={<EarningAddon />} />
          <Route path="delivery-partners/earning-addon-history" element={<EarningAddonHistory />} />
          <Route path="delivery-partners/earnings" element={<DeliveryEarnings />} />
          <Route path="delivery-partners/history" element={<DeliveryHistory />} />
          <Route path="delivery-partners/terms" element={<DeliveryTermsAndCondition />} />
          <Route path="delivery-partners/privacy" element={<DeliveryPrivacyPolicy />} />


          {/* REPORT MANAGEMENT */}
          <Route path="transaction-report" element={<TransactionReport />} />
          {/* Order Report */}
          <Route path="order-report/regular" element={<RegularOrderReport />} />
          {/* Restaurant Report */}
          <Route path="restaurant-report" element={<RestaurantReport />} />
          {/* Customer Report */}
          <Route path="customer-report/feedback-experience" element={<FeedbackExperienceReport />} />

          {/* TRANSACTION MANAGEMENT */}
          <Route path="restaurant-withdraws" element={<RestaurantWithdraws />} />


          {/* BUSINESS SETTINGS */}
          <Route path="business-setup" element={<BusinessSetup />} />
          {/* Pages & Social Media */}
          <Route path="pages-social-media/terms" element={<TermsAndCondition />} />
          <Route path="pages-social-media/privacy" element={<PrivacyPolicy />} />
          <Route path="pages-social-media/about" element={<AboutUs />} />
          <Route path="pages-social-media/refund" element={<RefundPolicy />} />
          <Route path="pages-social-media/shipping" element={<ShippingPolicy />} />
          <Route path="pages-social-media/cancellation" element={<CancellationPolicy />} />

          {/* SYSTEM SETTINGS */}

          {/* HERO BANNER MANAGEMENT */}
          <Route path="hero-banner-management" element={<LandingPageManagement />} />
          {/* DINING MANAGEMENT */}
          <Route path="dining-management" element={<DiningManagement />} />
          <Route path="dining-list" element={<DiningList />} />
          <Route path="dining/coupons" element={<DiningCoupons />} />
          <Route path="dining/earnings" element={<DiningEarnings />} />
        </Route>

        {/* Redirect /admin to /admin/ */}
        <Route path="" element={<Navigate to="/admin/login" replace />} />
      </Routes >
    </Suspense>
  );
}
