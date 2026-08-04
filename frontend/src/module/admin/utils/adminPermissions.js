// Simple helpers to work with admin permissions on the frontend

const ADMIN_STORAGE_KEY = "admin_user";

// Mapping legacy broad permission IDs to new page-level permission IDs for backward compatibility
const LEGACY_MAP = {
  "page.dashboard": ["menu.dashboard"],
  "page.food_approval": ["menu.food_management"],
  "page.foods_list": ["menu.food_management"],
  "page.addons_list": ["menu.food_management"],
  "page.categories": ["menu.food_management"],
  "page.zone_setup": ["menu.restaurants"],
  "page.restaurant_joining_request": ["menu.restaurants"],
  "page.restaurants_list": ["menu.restaurants"],
  "page.restaurant_commission": ["menu.restaurants"],
  "page.restaurant_complaints": ["menu.restaurants"],
  "page.restaurant_finance": ["menu.restaurants"],
  "page.restaurant_history": ["menu.restaurants"],
  "page.restaurant_menu_add": ["menu.restaurants"],
  "page.orders_list": ["menu.orders", "orders.view"],
  "page.order_detect_delivery": ["menu.orders", "orders.view"],
  "page.payment_history": ["menu.orders", "orders.view"],
  "page.hotels_list": ["menu.hotels", "hotels.view"],
  "page.hotel_requests": ["menu.hotels", "hotels.view"],
  "page.hotel_stand_requests": ["menu.hotels", "hotels.view"],
  "page.hotel_commission": ["menu.hotels", "hotels.view"],
  "page.hotel_wallet": ["menu.hotels", "hotels.wallet_view"],
  "page.hotel_withdrawal": ["menu.hotels", "hotels.withdrawal_approve"],
  "page.hotel_terms": ["menu.hotels", "hotels.view"],
  "page.hotel_privacy": ["menu.hotels", "hotels.view"],
  "page.hotel_leaderboard": ["menu.hotels", "hotels.view"],
  "page.coupons": ["menu.promotions"],
  "page.push_notification": ["menu.promotions", "notifications.send"],
  "page.advertise_banner": ["menu.promotions"],
  "page.hero_banner_management": ["menu.promotions"],
  "page.dining_banners": ["menu.promotions"],
  "page.dining_list": ["menu.promotions"],
  "page.dining_coupons": ["menu.promotions"],
  "page.dining_earnings": ["menu.promotions"],
  "page.customers_list": ["menu.customers"],
  "page.customer_contact_us": ["menu.customers"],
  "page.contact_messages": ["menu.customers"],
  "page.restaurant_terms": ["menu.customers"],
  "page.restaurant_privacy": ["menu.customers"],
  "page.safety_emergency_reports": ["menu.customers"],
  "page.improve_feedback": ["menu.customers"],
  "page.delivery_cash_limit": ["menu.delivery"],
  "page.fee_settings": ["menu.delivery", "settings.fee_manage"],
  "page.cash_limit_settlement": ["menu.delivery"],
  "page.delivery_withdrawal": ["menu.delivery"],
  "page.delivery_boy_wallet": ["menu.delivery"],
  "page.delivery_boy_commission": ["menu.delivery"],
  "page.delivery_emergency_help": ["menu.delivery"],
  "page.delivery_support_tickets": ["menu.delivery"],
  "page.delivery_join_request": ["menu.delivery"],
  "page.deliveryman_list": ["menu.delivery"],
  "page.deliveryman_reviews": ["menu.delivery"],
  "page.deliveryman_bonus": ["menu.delivery"],
  "page.delivery_earning_addon": ["menu.delivery"],
  "page.delivery_earning_addon_history": ["menu.delivery"],
  "page.delivery_earnings": ["menu.delivery"],
  "page.delivery_history": ["menu.delivery"],
  "page.delivery_terms": ["menu.delivery"],
  "page.delivery_privacy": ["menu.delivery"],
  "page.transaction_report": ["menu.reports"],
  "page.order_report": ["menu.reports"],
  "page.restaurant_report": ["menu.reports"],
  "page.customer_report": ["menu.reports"],
  "page.restaurant_withdraws": ["menu.reports"],
  "page.business_setup": ["menu.settings"],
  "page.pages_social_media": ["menu.settings"],
};

export const getCurrentAdmin = () => {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to parse admin_user from localStorage:", error);
    return null;
  }
};

export const getAdminPermissions = () => {
  const admin = getCurrentAdmin();
  if (!admin) return [];
  if (admin.role === "super_admin") {
    // Super admin treated as full access on frontend – backend still enforces
    return ["*"];
  }
  return Array.isArray(admin.permissions) ? admin.permissions : [];
};

export const isSuperAdmin = () => {
  const admin = getCurrentAdmin();
  return admin?.role === "super_admin";
};

export const hasPermission = (permissionId) => {
  if (!permissionId) return true;
  const perms = getAdminPermissions();
  if (perms.includes("*")) return true;
  if (perms.includes(permissionId)) return true;

  // Check legacy fallback aliases
  const legacyAliases = LEGACY_MAP[permissionId];
  if (Array.isArray(legacyAliases)) {
    return legacyAliases.some((alias) => perms.includes(alias));
  }
  return false;
};

export const hasAnyPermission = (permissionIds = []) => {
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) return true;
  const perms = getAdminPermissions();
  if (perms.includes("*")) return true;
  return permissionIds.some((id) => hasPermission(id));
};


