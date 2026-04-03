// Central definition of all admin permissions used across the system
// Keep IDs stable – they are stored on Admin documents and used by frontend.

export const ADMIN_PERMISSIONS = [
  // Sidebar / menu level permissions
  {
    id: "menu.dashboard",
    label: "Dashboard",
    group: "Sidebar",
    routePath: "/admin",
  },
  {
    id: "menu.point_of_sale",
    label: "Point of Sale",
    group: "Sidebar",
    routePath: "/admin/point-of-sale",
  },
  {
    id: "menu.food_management",
    label: "Food Management",
    group: "Sidebar",
  },
  {
    id: "menu.orders",
    label: "Orders",
    group: "Sidebar",
  },
  {
    id: "menu.hotels",
    label: "Hotels",
    group: "Sidebar",
  },
  {
    id: "menu.restaurants",
    label: "Restaurants",
    group: "Sidebar",
  },
  {
    id: "menu.customers",
    label: "Customers",
    group: "Sidebar",
  },
  {
    id: "menu.delivery",
    label: "Delivery",
    group: "Sidebar",
  },
  {
    id: "menu.promotions",
    label: "Promotions",
    group: "Sidebar",
  },
  {
    id: "menu.reports",
    label: "Reports & Transactions",
    group: "Sidebar",
  },
  {
    id: "menu.settings",
    label: "Settings",
    group: "Sidebar",
  },

  // Action level – orders
  {
    id: "orders.view",
    label: "View orders & order details",
    group: "Orders",
  },
  {
    id: "orders.update_status",
    label: "Update order status",
    group: "Orders",
  },
  {
    id: "orders.assign_delivery",
    label: "Assign / reassign delivery partner",
    group: "Orders",
  },
  {
    id: "orders.refund",
    label: "Process refunds",
    group: "Orders",
  },
  {
    id: "orders.approve_offline_payment",
    label: "Approve offline payments",
    group: "Orders",
  },
  {
    id: "orders.delete",
    label: "Delete orders (bulk / permanent)",
    group: "Orders",
  },

  // Action level – hotels
  {
    id: "hotels.view",
    label: "View hotels & requests",
    group: "Hotels",
  },
  {
    id: "hotels.edit",
    label: "Create / edit / delete hotels",
    group: "Hotels",
  },
  {
    id: "hotels.wallet_view",
    label: "View hotel wallet & earnings",
    group: "Hotels",
  },
  {
    id: "hotels.wallet_update",
    label: "Adjust hotel wallet / cash collected",
    group: "Hotels",
  },
  {
    id: "hotels.withdrawal_approve",
    label: "Approve / reject hotel withdrawals",
    group: "Hotels",
  },

  // Action level – settings / system configuration
  {
    id: "settings.business_manage",
    label: "Update business settings (logo, company info)",
    group: "Settings",
  },
  {
    id: "settings.commission_manage",
    label: "Manage commission settings",
    group: "Settings",
  },
  {
    id: "settings.fee_manage",
    label: "Manage delivery & platform fee settings",
    group: "Settings",
  },
  {
    id: "settings.env_manage",
    label: "Manage environment variables",
    group: "Settings",
  },

  // Notifications
  {
    id: "notifications.send",
    label: "Send notifications (user / restaurant / delivery / broadcast)",
    group: "Notifications",
  },
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

  // Sensible default for regular admin / moderator
  const base = [
    "menu.dashboard",
    "menu.orders",
    "menu.hotels",
    "orders.view",
    "hotels.view",
  ];

  return base.filter((id) => ADMIN_PERMISSION_IDS.has(id));
};

