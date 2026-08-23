// Central definition of all admin permissions used across the system
// Keep IDs stable – they are stored on Admin documents and used by frontend.

export const ADMIN_PERMISSIONS = [
  // 1. DASHBOARD
  {
    id: "menu.dashboard",
    label: "Dashboard",
    group: "DASHBOARD",
    routePath: "/admin",
  },
  {
    id: "page.hotel_leaderboard",
    label: "Hotel Leaderboard",
    group: "DASHBOARD",
    routePath: "/admin/hotel-leaderboard",
  },

  // 2. FOOD MANAGEMENT
  {
    id: "page.food_approval",
    label: "Food Approval",
    group: "FOOD MANAGEMENT",
  },
  {
    id: "page.foods_list",
    label: "Restaurant Foods List",
    group: "FOOD MANAGEMENT",
  },
  {
    id: "page.addons_list",
    label: "Restaurant Addons List",
    group: "FOOD MANAGEMENT",
  },
  {
    id: "page.categories",
    label: "Category",
    group: "FOOD MANAGEMENT",
  },

  // 3. RESTAURANT MANAGEMENT
  {
    id: "page.zone_setup",
    label: "Zone Setup",
    group: "RESTAURANT MANAGEMENT",
  },
  {
    id: "page.restaurant_joining_request",
    label: "Restaurant Join Requests",
    group: "RESTAURANT MANAGEMENT",
  },
  {
    id: "page.restaurants_list",
    label: "Restaurants List",
    group: "RESTAURANT MANAGEMENT",
  },
  {
    id: "page.restaurant_commission",
    label: "Restaurant Commission",
    group: "RESTAURANT MANAGEMENT",
  },
  {
    id: "page.restaurant_complaints",
    label: "Restaurant Complaints",
    group: "RESTAURANT MANAGEMENT",
  },
  {
    id: "page.restaurant_finance",
    label: "Restaurant Finance",
    group: "RESTAURANT MANAGEMENT",
  },
  {
    id: "page.restaurant_history",
    label: "Restaurant History",
    group: "RESTAURANT MANAGEMENT",
  },
  {
    id: "page.restaurant_menu_add",
    label: "Menu Add",
    group: "RESTAURANT MANAGEMENT",
  },

  // 4. ORDER MANAGEMENT
  {
    id: "page.orders_list",
    label: "Orders List",
    group: "ORDER MANAGEMENT",
  },
  {
    id: "page.order_detect_delivery",
    label: "Order Detect Delivery",
    group: "ORDER MANAGEMENT",
  },
  {
    id: "page.payment_history",
    label: "Payment History",
    group: "ORDER MANAGEMENT",
  },

  // 5. HOTEL MANAGEMENT
  {
    id: "page.hotels_list",
    label: "Hotels List",
    group: "HOTEL MANAGEMENT",
  },
  {
    id: "page.hotel_requests",
    label: "Hotel Requests",
    group: "HOTEL MANAGEMENT",
  },
  {
    id: "page.hotel_stand_requests",
    label: "Hotel Stand Requests",
    group: "HOTEL MANAGEMENT",
  },
  {
    id: "page.hotel_commission",
    label: "Hotel Commission",
    group: "HOTEL MANAGEMENT",
  },
  {
    id: "page.hotel_wallet",
    label: "Hotel Wallet",
    group: "HOTEL MANAGEMENT",
  },
  {
    id: "page.hotel_withdrawal",
    label: "Hotel Withdrawal",
    group: "HOTEL MANAGEMENT",
  },
  {
    id: "page.hotel_terms",
    label: "Hotel Terms & Condition",
    group: "HOTEL MANAGEMENT",
  },
  {
    id: "page.hotel_privacy",
    label: "Hotel Privacy Policy",
    group: "HOTEL MANAGEMENT",
  },

  // 6. PROMOTIONS MANAGEMENT
  {
    id: "page.coupons",
    label: "Restaurant Coupons & Offers",
    group: "PROMOTIONS MANAGEMENT",
  },
  {
    id: "page.push_notification",
    label: "Push Notification",
    group: "PROMOTIONS MANAGEMENT",
  },
  {
    id: "page.advertise_banner",
    label: "Advertise Banner",
    group: "PROMOTIONS MANAGEMENT",
  },
  {
    id: "page.promo_codes",
    label: "Promo Codes",
    group: "PROMOTIONS MANAGEMENT",
  },

  // 7. CUSTOMER MANAGEMENT
  {
    id: "page.customers_list",
    label: "Customers List",
    group: "CUSTOMER MANAGEMENT",
  },

  // 8. DELIVERYMAN MANAGEMENT
  {
    id: "page.delivery_cash_limit",
    label: "Delivery Cash Limit",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.fee_settings",
    label: "Delivery & Platform Fee",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.cash_limit_settlement",
    label: "Cash Limit Settlement",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_withdrawal",
    label: "Delivery Withdrawal",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_boy_wallet",
    label: "Delivery Boy Wallet",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_boy_commission",
    label: "Delivery Boy Commission",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_emergency_help",
    label: "Delivery Emergency Help",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_support_tickets",
    label: "Delivery Support Tickets",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_join_request",
    label: "Deliveryman Join Request",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.deliveryman_list",
    label: "Deliveryman List",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.deliveryman_reviews",
    label: "Deliveryman Reviews",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.deliveryman_bonus",
    label: "Deliveryman Bonus",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_earning_addon",
    label: "Earning Addon",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_earning_addon_history",
    label: "Earning Addon History",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_earnings",
    label: "Delivery Earning",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_history",
    label: "Delivery History",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_terms",
    label: "Delivery Terms & Condition",
    group: "DELIVERYMAN MANAGEMENT",
  },
  {
    id: "page.delivery_privacy",
    label: "Delivery Privacy Policy",
    group: "DELIVERYMAN MANAGEMENT",
  },

  // 9. HELP & SUPPORT
  {
    id: "page.customer_contact_us",
    label: "Customer Contact Us",
    group: "HELP & SUPPORT",
  },
  {
    id: "page.contact_messages",
    label: "User Order Feedback",
    group: "HELP & SUPPORT",
  },
  {
    id: "page.restaurant_terms",
    label: "Restaurant Terms & Conditions",
    group: "HELP & SUPPORT",
  },
  {
    id: "page.restaurant_privacy",
    label: "Restaurant Privacy Policy",
    group: "HELP & SUPPORT",
  },
  {
    id: "page.safety_emergency_reports",
    label: "Safety Emergency Reports",
    group: "HELP & SUPPORT",
  },
  {
    id: "page.improve_feedback",
    label: "Improve Feedback",
    group: "HELP & SUPPORT",
  },

  // 10. REPORT MANAGEMENT
  {
    id: "page.transaction_report",
    label: "Transaction Report",
    group: "REPORT MANAGEMENT",
  },
  {
    id: "page.order_report",
    label: "Order Report",
    group: "REPORT MANAGEMENT",
  },
  {
    id: "page.restaurant_report",
    label: "Restaurant Report",
    group: "REPORT MANAGEMENT",
  },
  {
    id: "page.customer_report",
    label: "Customer Feedback Report",
    group: "REPORT MANAGEMENT",
  },

  // 11. TRANSACTION MANAGEMENT
  {
    id: "page.restaurant_withdraws",
    label: "Restaurant Withdraws",
    group: "TRANSACTION MANAGEMENT",
  },

  // 12. BANNER SETTINGS
  {
    id: "page.hero_banner_management",
    label: "Landing Page Management",
    group: "BANNER SETTINGS",
  },

  // 13. DINING MANAGEMENT
  {
    id: "page.dining_banners",
    label: "Dining Banners",
    group: "DINING MANAGEMENT",
  },
  {
    id: "page.dining_list",
    label: "Dining List",
    group: "DINING MANAGEMENT",
  },
  {
    id: "page.dining_coupons",
    label: "Dining Coupons",
    group: "DINING MANAGEMENT",
  },
  {
    id: "page.dining_earnings",
    label: "Dining Earnings",
    group: "DINING MANAGEMENT",
  },

  // 14. BUSINESS SETTINGS
  {
    id: "page.business_setup",
    label: "Business Setup",
    group: "BUSINESS SETTINGS",
  },
  {
    id: "page.pages_social_media",
    label: "Pages & Social Media",
    group: "BUSINESS SETTINGS",
  },

  // Legacy & action permissions for backward compatibility
  { id: "menu.point_of_sale", label: "Point of Sale", group: "ACTIONS & LEGACY" },
  { id: "menu.history", label: "History", group: "ACTIONS & LEGACY" },
  { id: "menu.food_management", label: "Food Management (All)", group: "ACTIONS & LEGACY" },
  { id: "menu.orders", label: "Orders (All)", group: "ACTIONS & LEGACY" },
  { id: "menu.hotels", label: "Hotels (All)", group: "ACTIONS & LEGACY" },
  { id: "menu.restaurants", label: "Restaurants (All)", group: "ACTIONS & LEGACY" },
  { id: "menu.customers", label: "Customers (All)", group: "ACTIONS & LEGACY" },
  { id: "menu.delivery", label: "Delivery (All)", group: "ACTIONS & LEGACY" },
  { id: "menu.promotions", label: "Promotions (All)", group: "ACTIONS & LEGACY" },
  { id: "menu.reports", label: "Reports & Transactions (All)", group: "ACTIONS & LEGACY" },
  { id: "menu.settings", label: "Settings (All)", group: "ACTIONS & LEGACY" },
  { id: "orders.view", label: "View orders & order details", group: "ACTIONS & LEGACY" },
  { id: "orders.update_status", label: "Update order status", group: "ACTIONS & LEGACY" },
  { id: "orders.assign_delivery", label: "Assign / reassign delivery partner", group: "ACTIONS & LEGACY" },
  { id: "orders.refund", label: "Process refunds", group: "ACTIONS & LEGACY" },
  { id: "orders.approve_offline_payment", label: "Approve offline payments", group: "ACTIONS & LEGACY" },
  { id: "orders.delete", label: "Delete orders (bulk / permanent)", group: "ACTIONS & LEGACY" },
  { id: "hotels.view", label: "View hotels & requests", group: "ACTIONS & LEGACY" },
  { id: "hotels.edit", label: "Create / edit / delete hotels", group: "ACTIONS & LEGACY" },
  { id: "hotels.wallet_view", label: "View hotel wallet & earnings", group: "ACTIONS & LEGACY" },
  { id: "hotels.wallet_update", label: "Adjust hotel wallet / cash collected", group: "ACTIONS & LEGACY" },
  { id: "hotels.withdrawal_approve", label: "Approve / reject hotel withdrawals", group: "ACTIONS & LEGACY" },
  { id: "settings.business_manage", label: "Update business settings", group: "ACTIONS & LEGACY" },
  { id: "settings.commission_manage", label: "Manage commission settings", group: "ACTIONS & LEGACY" },
  { id: "settings.fee_manage", label: "Manage delivery & platform fee settings", group: "ACTIONS & LEGACY" },
  { id: "settings.env_manage", label: "Manage environment variables", group: "ACTIONS & LEGACY" },
  { id: "notifications.send", label: "Send notifications", group: "ACTIONS & LEGACY" },
];

// Convenience: Set of IDs for fast membership checks
export const ADMIN_PERMISSION_IDS = new Set(
  ADMIN_PERMISSIONS.map((p) => p.id),
);

// Validate an incoming permission list, returning only known IDs (deduplicated)
export const sanitizeAdminPermissions = (permissions = []) => {
  if (!Array.isArray(permissions)) return [];
  const unique = new Set();
  permissions.forEach((p) => {
    if (typeof p === "string" && ADMIN_PERMISSION_IDS.has(p)) {
      unique.add(p);
    }
  });
  return Array.from(unique);
};

// Default permissions per role – can be tuned over time
export const getDefaultAdminPermissions = (role = "admin") => {
  if (role === "super_admin") {
    // Full access for super admin
    return ADMIN_PERMISSIONS.map((p) => p.id);
  }

  // Default permissions for sub admin: grant basic dashboard and order view
  const base = [
    "menu.dashboard",
    "page.orders_list",
    "orders.view",
  ];

  return base.filter((id) => ADMIN_PERMISSION_IDS.has(id));
};

// Equivalence mapping for permissions (Legacy IDs <-> New Page IDs)
export const PERMISSIONS_ALIASES = {
  "orders.view": ["page.orders_list", "menu.orders"],
  "page.orders_list": ["orders.view", "menu.orders"],
  "menu.orders": ["orders.view", "page.orders_list", "page.order_detect_delivery", "page.payment_history"],
  "page.order_detect_delivery": ["menu.orders", "orders.view"],
  "page.payment_history": ["menu.orders", "orders.view"],

  "menu.food_management": ["page.food_approval", "page.foods_list", "page.addons_list", "page.categories"],
  "page.food_approval": ["menu.food_management"],
  "page.foods_list": ["menu.food_management"],
  "page.addons_list": ["menu.food_management"],
  "page.categories": ["menu.food_management"],

  "menu.restaurants": [
    "page.zone_setup",
    "page.restaurant_joining_request",
    "page.restaurants_list",
    "page.restaurant_commission",
    "page.restaurant_complaints",
    "page.restaurant_finance",
    "page.restaurant_history",
    "page.restaurant_menu_add",
  ],
  "page.zone_setup": ["menu.restaurants"],
  "page.restaurant_joining_request": ["menu.restaurants"],
  "page.restaurants_list": ["menu.restaurants"],
  "page.restaurant_commission": ["menu.restaurants"],
  "page.restaurant_complaints": ["menu.restaurants"],
  "page.restaurant_finance": ["menu.restaurants"],
  "page.restaurant_history": ["menu.restaurants"],
  "page.restaurant_menu_add": ["menu.restaurants"],

  "menu.hotels": [
    "page.hotels_list",
    "page.hotel_requests",
    "page.hotel_stand_requests",
    "page.hotel_commission",
    "page.hotel_wallet",
    "page.hotel_withdrawal",
    "page.hotel_terms",
    "page.hotel_privacy",
    "page.hotel_leaderboard",
    "hotels.view",
  ],
  "hotels.view": [
    "page.hotels_list",
    "page.hotel_requests",
    "page.hotel_stand_requests",
    "page.hotel_commission",
    "page.hotel_terms",
    "page.hotel_privacy",
    "page.hotel_leaderboard",
    "menu.hotels",
  ],
  "page.hotels_list": ["hotels.view", "menu.hotels"],
  "page.hotel_requests": ["hotels.view", "menu.hotels"],
  "page.hotel_stand_requests": ["hotels.view", "menu.hotels"],
  "page.hotel_commission": ["hotels.view", "menu.hotels"],
  "page.hotel_wallet": ["hotels.wallet_view", "menu.hotels"],
  "hotels.wallet_view": ["page.hotel_wallet", "menu.hotels"],
  "page.hotel_withdrawal": ["hotels.withdrawal_approve", "menu.hotels"],
  "hotels.withdrawal_approve": ["page.hotel_withdrawal", "menu.hotels"],
  "page.hotel_terms": ["hotels.view", "menu.hotels"],
  "page.hotel_privacy": ["hotels.view", "menu.hotels"],
  "page.hotel_leaderboard": ["hotels.view", "menu.hotels"],

  "menu.promotions": [
    "page.coupons",
    "page.push_notification",
    "page.advertise_banner",
    "page.promo_codes",
    "page.hero_banner_management",
    "page.dining_banners",
    "page.dining_list",
    "page.dining_coupons",
    "page.dining_earnings",
  ],
  "page.coupons": ["menu.promotions"],
  "page.push_notification": ["menu.promotions", "notifications.send"],
  "notifications.send": ["page.push_notification", "menu.promotions"],
  "page.advertise_banner": ["menu.promotions"],
  "page.promo_codes": ["menu.promotions"],
  "page.hero_banner_management": ["menu.promotions"],
  "page.dining_banners": ["menu.promotions"],
  "page.dining_list": ["menu.promotions"],
  "page.dining_coupons": ["menu.promotions"],
  "page.dining_earnings": ["menu.promotions"],

  "menu.customers": [
    "page.customers_list",
    "page.customer_contact_us",
    "page.contact_messages",
    "page.restaurant_terms",
    "page.restaurant_privacy",
    "page.safety_emergency_reports",
    "page.improve_feedback",
  ],
  "page.customers_list": ["menu.customers"],
  "page.customer_contact_us": ["menu.customers"],
  "page.contact_messages": ["menu.customers"],
  "page.restaurant_terms": ["menu.customers"],
  "page.restaurant_privacy": ["menu.customers"],
  "page.safety_emergency_reports": ["menu.customers"],
  "page.improve_feedback": ["menu.customers"],

  "menu.delivery": [
    "page.delivery_cash_limit",
    "page.fee_settings",
    "page.cash_limit_settlement",
    "page.delivery_withdrawal",
    "page.delivery_boy_wallet",
    "page.delivery_boy_commission",
    "page.delivery_emergency_help",
    "page.delivery_support_tickets",
    "page.delivery_join_request",
    "page.deliveryman_list",
    "page.deliveryman_reviews",
    "page.deliveryman_bonus",
    "page.delivery_earning_addon",
    "page.delivery_earning_addon_history",
    "page.delivery_earnings",
    "page.delivery_history",
    "page.delivery_terms",
    "page.delivery_privacy",
  ],
  "page.delivery_cash_limit": ["menu.delivery"],
  "page.fee_settings": ["menu.delivery", "settings.fee_manage"],
  "settings.fee_manage": ["page.fee_settings", "menu.delivery"],
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

  "menu.reports": [
    "page.transaction_report",
    "page.order_report",
    "page.restaurant_report",
    "page.customer_report",
    "page.restaurant_withdraws",
  ],
  "page.transaction_report": ["menu.reports"],
  "page.order_report": ["menu.reports"],
  "page.restaurant_report": ["menu.reports"],
  "page.customer_report": ["menu.reports"],
  "page.restaurant_withdraws": ["menu.reports"],

  "menu.settings": ["page.business_setup", "page.pages_social_media"],
  "page.business_setup": ["menu.settings"],
  "page.pages_social_media": ["menu.settings"],

  "menu.dashboard": ["page.dashboard"],
  "page.dashboard": ["menu.dashboard"],
};

export const userHasAdminPermission = (userPerms = [], requiredPerm) => {
  if (!requiredPerm) return true;
  if (!Array.isArray(userPerms)) return false;
  if (userPerms.includes("*") || userPerms.includes(requiredPerm)) return true;
  const aliases = PERMISSIONS_ALIASES[requiredPerm];
  if (Array.isArray(aliases)) {
    return aliases.some((alias) => userPerms.includes(alias));
  }
  return false;
};




