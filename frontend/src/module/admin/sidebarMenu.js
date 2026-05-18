// Sidebar menu structure with all items
export const sidebarMenuData = [
  {
    type: "link",
    label: "Dashboard",
    path: "/admin",
    icon: "LayoutDashboard",
    permissionId: "menu.dashboard",
  },
  {
    type: "link",
    label: "Hotel Leaderboard",
    path: "/admin/hotel-leaderboard",
    icon: "Award",
    permissionId: "hotels.view",
  },


  {
    type: "section",
    label: "FOOD MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Food Approval",
        path: "/admin/food-approval",
        icon: "CheckCircle2",
        permissionId: "menu.food_management",
      },
      {
        type: "expandable",
        label: "Foods",
        icon: "Utensils",
        permissionId: "menu.food_management",
        subItems: [
          {
            label: "Restaurant Foods List",
            path: "/admin/foods",
            permissionId: "menu.food_management",
          },
          {
            label: "Restaurant Addons List",
            path: "/admin/addons",
            permissionId: "menu.food_management",
          },
        ],
      },
      {
        type: "expandable",
        label: "Categories",
        icon: "FolderTree",
        permissionId: "menu.food_management",
        subItems: [
          {
            label: "Category",
            path: "/admin/categories",
            permissionId: "menu.food_management",
          },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "RESTAURANT MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Zone Setup",
        path: "/admin/zone-setup",
        icon: "MapPin",
        permissionId: "menu.restaurants",
      },
      {
        type: "expandable",
        label: "Restaurants",
        icon: "UtensilsCrossed",
        permissionId: "menu.restaurants",
        subItems: [
          {
            label: "Restaurant Join Requests",
            path: "/admin/restaurants/joining-request",
            permissionId: "menu.restaurants",
          },
          {
            label: "Restaurants List",
            path: "/admin/restaurants",
            permissionId: "menu.restaurants",
          },
          {
            label: "Restaurant Commission",
            path: "/admin/restaurants/commission",
            permissionId: "menu.restaurants",
          },
          {
            label: "Restaurant Complaints",
            path: "/admin/restaurants/complaints",
            permissionId: "menu.restaurants",
          },
          {
            label: "Restaurant Finance",
            path: "/admin/restaurants/finance",
            permissionId: "menu.restaurants",
          },
          {
            label: "Restaurant History",
            path: "/admin/restaurants/history",
            permissionId: "menu.restaurants",
          },
          {
            label: "Menu Add",
            path: "/admin/restaurants/menu-add",
            permissionId: "menu.restaurants",
          },
        ],
      },
    ],
  },

  {
    type: "section",
    label: "ORDER MANAGEMENT",
    items: [
      {
        type: "expandable",
        label: "Orders",
        icon: "FileText",
        permissionId: "menu.orders",
        subItems: [
          {
            label: "All",
            path: "/admin/orders/all",
            permissionId: "orders.view",
          },
          { label: "Scheduled", path: "/admin/orders/scheduled" },
          { label: "Pending", path: "/admin/orders/pending" },
          { label: "Accepted", path: "/admin/orders/accepted" },
          { label: "Processing", path: "/admin/orders/processing" },
          { label: "Food On The Way", path: "/admin/orders/food-on-the-way" },
          { label: "Delivered", path: "/admin/orders/delivered" },
          { label: "Canceled", path: "/admin/orders/canceled" },
          {
            label: "Restaurant cancelled",
            path: "/admin/orders/restaurant-cancelled",
          },
          { label: "Payment Failed", path: "/admin/orders/payment-failed" },
          { label: "Refunded", path: "/admin/orders/refunded" },
        ],
      },
      {
        type: "link",
        label: "Order Detect Delivery",
        path: "/admin/order-detect-delivery",
        icon: "Truck",
        permissionId: "orders.view",
      },
      {
        type: "link",
        label: "Payment History",
        path: "/admin/payment-history",
        icon: "Receipt",
        permissionId: "orders.view",
      },
    ],
  },
  {
    type: "section",
    label: "HOTEL MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Hotels",
        path: "/admin/hotels",
        icon: "Building2",
        permissionId: "hotels.view",
      },
      {
        type: "link",
        label: "Hotel Requests",
        path: "/admin/hotel-requests",
        icon: "FileText",
        permissionId: "hotels.view",
      },
      {
        type: "link",
        label: "Hotel Stand Requests",
        path: "/admin/hotel-stand-requests",
        icon: "TicketCheck",
        permissionId: "hotels.view",
      },
      {
        type: "link",
        label: "Hotel Commission",
        path: "/admin/hotels/commission",
        icon: "Percent",
        permissionId: "hotels.view",
      },
      {
        type: "link",
        label: "Hotel Wallet",
        path: "/admin/hotel-wallet",
        icon: "Wallet",
        permissionId: "hotels.wallet_view",
      },
      {
        type: "link",
        label: "Hotel Withdrawal",
        path: "/admin/hotel-withdrawal",
        icon: "Wallet",
        permissionId: "hotels.withdrawal_approve",
      },
      {
        type: "link",
        label: "Hotel Terms & Condition",
        path: "/admin/hotel-terms",
        icon: "FileText",
        permissionId: "hotels.view",
      },
      {
        type: "link",
        label: "Hotel Privacy Policy",
        path: "/admin/hotel-privacy",
        icon: "FileText",
        permissionId: "hotels.view",
      },
    ],
  },
  {
    type: "section",
    label: "PROMOTIONS MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Restaurant Coupons & Offers",
        path: "/admin/coupons",
        icon: "Gift",
        permissionId: "menu.promotions",
      },

      {
        type: "link",
        label: "Push Notification",
        path: "/admin/push-notification",
        icon: "Bell",
        permissionId: "notifications.send",
      },
      {
        type: "link",
        label: "Advertise Banner",
        path: "/admin/advertise-banner",
        icon: "Megaphone",
        permissionId: "menu.promotions",
      },
    ],
  },

  {
    type: "section",
    label: "CUSTOMER MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Customers",
        path: "/admin/customers",
        icon: "Users",
        permissionId: "menu.customers",
      },
    ],
  },
  {
    type: "section",
    label: "DELIVERYMAN MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Delivery Cash Limit",
        path: "/admin/delivery-cash-limit",
        icon: "IndianRupee",
        permissionId: "menu.delivery",
      },
      {
        type: "link",
        label: "Delivery & Platform Fee",
        path: "/admin/fee-settings",
        icon: "DollarSign",
        permissionId: "settings.fee_manage",
      },
      {
        type: "link",
        label: "Cash limit settlement",
        path: "/admin/cash-limit-settlement",
        icon: "Receipt",
        permissionId: "menu.delivery",
      },
      {
        type: "link",
        label: "Delivery Withdrawal",
        path: "/admin/delivery-withdrawal",
        icon: "Wallet",
        permissionId: "menu.delivery",
      },
      {
        type: "link",
        label: "Delivery boy Wallet",
        path: "/admin/delivery-boy-wallet",
        icon: "PiggyBank",
        permissionId: "menu.delivery",
      },
      {
        type: "link",
        label: "Delivery Boy Commission",
        path: "/admin/delivery-boy-commission",
        icon: "DollarSign",
        permissionId: "menu.delivery",
      },
      {
        type: "link",
        label: "Delivery Emergency Help",
        path: "/admin/delivery-emergency-help",
        icon: "Phone",
        permissionId: "menu.delivery",
      },
      {
        type: "link",
        label: "Delivery Support Tickets",
        path: "/admin/delivery-support-tickets",
        icon: "MessageSquare",
        permissionId: "menu.delivery",
      },
      {
        type: "expandable",
        label: "Deliveryman",
        icon: "Package",
        permissionId: "menu.delivery",
        subItems: [
          {
            label: "New Join Request",
            path: "/admin/delivery-partners/join-request",
          },
          { label: "Deliveryman List", path: "/admin/delivery-partners" },
          {
            label: "Deliveryman Reviews",
            path: "/admin/delivery-partners/reviews",
          },
          { label: "Bonus", path: "/admin/delivery-partners/bonus" },
          {
            label: "Earning Addon",
            path: "/admin/delivery-partners/earning-addon",
          },
          {
            label: "Earning Addon History",
            path: "/admin/delivery-partners/earning-addon-history",
          },
          {
            label: "Delivery Earning",
            path: "/admin/delivery-partners/earnings",
            permissionId: "menu.delivery",
          },
          {
            label: "Delivery History",
            path: "/admin/delivery-partners/history",
            permissionId: "menu.delivery",
          },
          {
            label: "Delivery Terms & Condition",
            path: "/admin/delivery-partners/terms",
            permissionId: "menu.delivery",
          },
          {
            label: "Delivery Privacy Policy",
            path: "/admin/delivery-partners/privacy",
            permissionId: "menu.delivery",
          },
        ],
      },
    ],
  },

  {
    type: "section",
    label: "HELP & SUPPORT",
    items: [
      {
        type: "link",
        label: "Customer Contact Us",
        path: "/admin/customer-contact-us",
        icon: "Mail",
        permissionId: "menu.customers",
      },
      {
        type: "link",
        label: "User Order Feedback",
        path: "/admin/contact-messages",
        icon: "Mail",
        permissionId: "menu.customers",
      },
      {
        type: "link",
        label: "Restaurant Terms & Conditions",
        path: "/admin/restaurant-terms",
        icon: "FileText",
        permissionId: "menu.customers",
      },
      {
        type: "link",
        label: "Restaurant Privacy Policy",
        path: "/admin/restaurant-privacy",
        icon: "FileText",
        permissionId: "menu.customers",
      },
      {
        type: "link",
        label: "Safety Emergency Reports",
        path: "/admin/safety-emergency-reports",
        icon: "AlertTriangle",
        permissionId: "menu.customers",
      },
      {
        type: "link",
        label: "Improve Feedback",
        path: "/admin/improve-feedback",
        icon: "MessageSquare",
        permissionId: "menu.customers",
      },
    ],
  },

  {
    type: "section",
    label: "REPORT MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Transaction Report",
        path: "/admin/transaction-report",
        icon: "FileText",
        permissionId: "menu.reports",
      },
      {
        type: "link",
        label: "Order Report",
        path: "/admin/order-report/regular",
        icon: "FileText",
        permissionId: "menu.reports",
      },
      {
        type: "expandable",
        label: "Restaurant Report",
        icon: "FileText",
        permissionId: "menu.reports",
        subItems: [
          { label: "Restaurant Report", path: "/admin/restaurant-report" },
        ],
      },
      {
        type: "expandable",
        label: "Customer Report",
        icon: "FileText",
        permissionId: "menu.reports",
        subItems: [
          {
            label: "Feedback Experience",
            path: "/admin/customer-report/feedback-experience",
          },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "TRANSACTION MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Restaurant Withdraws",
        path: "/admin/restaurant-withdraws",
        icon: "CreditCard",
        permissionId: "menu.reports",
      },
    ],
  },
  {
    type: "section",
    label: "BANNER SETTINGS",
    items: [
      {
        type: "link",
        label: "Landing Page Management",
        path: "/admin/hero-banner-management",
        icon: "Image",
        permissionId: "menu.promotions",
      },
    ],
  },
  {
    type: "section",
    label: "DINING MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Dining Banners",
        path: "/admin/dining-management",
        icon: "UtensilsCrossed",
        permissionId: "menu.promotions",
      },
      {
        type: "link",
        label: "Dining List",
        path: "/admin/dining-list",
        icon: "FileText",
        permissionId: "menu.promotions",
      },
      {
        type: "link",
        label: "Dining Coupons",
        path: "/admin/dining/coupons",
        icon: "Tag",
      },
      {
        type: "link",
        label: "Dining Earnings",
        path: "/admin/dining/earnings",
        icon: "TrendingUp",
      },
    ],
  },
  {
    type: "section",
    label: "BUSINESS SETTINGS",
    items: [
      {
        type: "link",
        label: "Business Setup",
        path: "/admin/business-setup",
        icon: "Settings",
        permissionId: "menu.settings",
      },
      {
        type: "expandable",
        label: "Pages & Social Media",
        icon: "Link",
        permissionId: "menu.settings",
        subItems: [
          {
            label: "Terms And Condition",
            path: "/admin/pages-social-media/terms",
          },
          {
            label: "Privacy Policy",
            path: "/admin/pages-social-media/privacy",
          },
          { label: "About Us", path: "/admin/pages-social-media/about" },
          { label: "Refund Policy", path: "/admin/pages-social-media/refund" },
          {
            label: "Shipping Policy",
            path: "/admin/pages-social-media/shipping",
          },
          {
            label: "Cancellation Policy",
            path: "/admin/pages-social-media/cancellation",
          },
        ],
      },
    ],
  },
];
