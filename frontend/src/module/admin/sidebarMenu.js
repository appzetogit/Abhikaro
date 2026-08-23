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
    permissionId: "page.hotel_leaderboard",
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
        permissionId: "page.food_approval",
      },
      {
        type: "expandable",
        label: "Foods",
        icon: "Utensils",
        subItems: [
          {
            label: "Restaurant Foods List",
            path: "/admin/foods",
            permissionId: "page.foods_list",
          },
          {
            label: "Restaurant Addons List",
            path: "/admin/addons",
            permissionId: "page.addons_list",
          },
        ],
      },
      {
        type: "expandable",
        label: "Categories",
        icon: "FolderTree",
        subItems: [
          {
            label: "Category",
            path: "/admin/categories",
            permissionId: "page.categories",
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
        permissionId: "page.zone_setup",
      },
      {
        type: "expandable",
        label: "Restaurants",
        icon: "UtensilsCrossed",
        subItems: [
          {
            label: "Restaurant Join Requests",
            path: "/admin/restaurants/joining-request",
            permissionId: "page.restaurant_joining_request",
          },
          {
            label: "Restaurants List",
            path: "/admin/restaurants",
            permissionId: "page.restaurants_list",
          },
          {
            label: "Restaurant Commission",
            path: "/admin/restaurants/commission",
            permissionId: "page.restaurant_commission",
          },
          {
            label: "Restaurant Complaints",
            path: "/admin/restaurants/complaints",
            permissionId: "page.restaurant_complaints",
          },
          {
            label: "Restaurant Finance",
            path: "/admin/restaurants/finance",
            permissionId: "page.restaurant_finance",
          },
          {
            label: "Restaurant History",
            path: "/admin/restaurants/history",
            permissionId: "page.restaurant_history",
          },
          {
            label: "Menu Add",
            path: "/admin/restaurants/menu-add",
            permissionId: "page.restaurant_menu_add",
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
        permissionId: "page.orders_list",
        subItems: [
          {
            label: "All",
            path: "/admin/orders/all",
            permissionId: "page.orders_list",
          },
          { label: "Scheduled", path: "/admin/orders/scheduled", permissionId: "page.orders_list" },
          { label: "Pending", path: "/admin/orders/pending", permissionId: "page.orders_list" },
          { label: "Accepted", path: "/admin/orders/accepted", permissionId: "page.orders_list" },
          { label: "Processing", path: "/admin/orders/processing", permissionId: "page.orders_list" },
          { label: "Food On The Way", path: "/admin/orders/food-on-the-way", permissionId: "page.orders_list" },
          { label: "Delivered", path: "/admin/orders/delivered", permissionId: "page.orders_list" },
          { label: "Canceled", path: "/admin/orders/canceled", permissionId: "page.orders_list" },
          {
            label: "Restaurant cancelled",
            path: "/admin/orders/restaurant-cancelled",
            permissionId: "page.orders_list",
          },
          { label: "Payment Failed", path: "/admin/orders/payment-failed", permissionId: "page.orders_list" },
          { label: "Refunded", path: "/admin/orders/refunded", permissionId: "page.orders_list" },
        ],
      },
      {
        type: "link",
        label: "Order Detect Delivery",
        path: "/admin/order-detect-delivery",
        icon: "Truck",
        permissionId: "page.order_detect_delivery",
      },
      {
        type: "link",
        label: "Payment History",
        path: "/admin/payment-history",
        icon: "Receipt",
        permissionId: "page.payment_history",
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
        permissionId: "page.hotels_list",
      },
      {
        type: "link",
        label: "Hotel Requests",
        path: "/admin/hotel-requests",
        icon: "FileText",
        permissionId: "page.hotel_requests",
      },
      {
        type: "link",
        label: "Hotel Stand Requests",
        path: "/admin/hotel-stand-requests",
        icon: "TicketCheck",
        permissionId: "page.hotel_stand_requests",
      },
      {
        type: "link",
        label: "Hotel Commission",
        path: "/admin/hotels/commission",
        icon: "Percent",
        permissionId: "page.hotel_commission",
      },
      {
        type: "link",
        label: "Hotel Wallet",
        path: "/admin/hotel-wallet",
        icon: "Wallet",
        permissionId: "page.hotel_wallet",
      },
      {
        type: "link",
        label: "Hotel Withdrawal",
        path: "/admin/hotel-withdrawal",
        icon: "Wallet",
        permissionId: "page.hotel_withdrawal",
      },
      {
        type: "link",
        label: "Hotel Terms & Condition",
        path: "/admin/hotel-terms",
        icon: "FileText",
        permissionId: "page.hotel_terms",
      },
      {
        type: "link",
        label: "Hotel Privacy Policy",
        path: "/admin/hotel-privacy",
        icon: "FileText",
        permissionId: "page.hotel_privacy",
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
        permissionId: "page.coupons",
      },

      {
        type: "link",
        label: "Push Notification",
        path: "/admin/push-notification",
        icon: "Bell",
        permissionId: "page.push_notification",
      },
      {
        type: "link",
        label: "Advertise Banner",
        path: "/admin/advertise-banner",
        icon: "Megaphone",
        permissionId: "page.advertise_banner",
      },
      {
        type: "link",
        label: "Promo Codes",
        path: "/admin/promo-codes",
        icon: "Ticket",
        permissionId: "page.promo_codes",
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
        permissionId: "page.customers_list",
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
        permissionId: "page.delivery_cash_limit",
      },
      {
        type: "link",
        label: "Delivery & Platform Fee",
        path: "/admin/fee-settings",
        icon: "DollarSign",
        permissionId: "page.fee_settings",
      },
      {
        type: "link",
        label: "Cash limit settlement",
        path: "/admin/cash-limit-settlement",
        icon: "Receipt",
        permissionId: "page.cash_limit_settlement",
      },
      {
        type: "link",
        label: "Delivery Withdrawal",
        path: "/admin/delivery-withdrawal",
        icon: "Wallet",
        permissionId: "page.delivery_withdrawal",
      },
      {
        type: "link",
        label: "Delivery boy Wallet",
        path: "/admin/delivery-boy-wallet",
        icon: "PiggyBank",
        permissionId: "page.delivery_boy_wallet",
      },
      {
        type: "link",
        label: "Delivery Boy Commission",
        path: "/admin/delivery-boy-commission",
        icon: "DollarSign",
        permissionId: "page.delivery_boy_commission",
      },
      {
        type: "link",
        label: "Delivery Emergency Help",
        path: "/admin/delivery-emergency-help",
        icon: "Phone",
        permissionId: "page.delivery_emergency_help",
      },
      {
        type: "link",
        label: "Delivery Support Tickets",
        path: "/admin/delivery-support-tickets",
        icon: "MessageSquare",
        permissionId: "page.delivery_support_tickets",
      },
      {
        type: "expandable",
        label: "Deliveryman",
        icon: "Package",
        subItems: [
          {
            label: "New Join Request",
            path: "/admin/delivery-partners/join-request",
            permissionId: "page.delivery_join_request",
          },
          {
            label: "Deliveryman List",
            path: "/admin/delivery-partners",
            permissionId: "page.deliveryman_list",
          },
          {
            label: "Deliveryman Reviews",
            path: "/admin/delivery-partners/reviews",
            permissionId: "page.deliveryman_reviews",
          },
          {
            label: "Bonus",
            path: "/admin/delivery-partners/bonus",
            permissionId: "page.deliveryman_bonus",
          },
          {
            label: "Earning Addon",
            path: "/admin/delivery-partners/earning-addon",
            permissionId: "page.delivery_earning_addon",
          },
          {
            label: "Earning Addon History",
            path: "/admin/delivery-partners/earning-addon-history",
            permissionId: "page.delivery_earning_addon_history",
          },
          {
            label: "Delivery Earning",
            path: "/admin/delivery-partners/earnings",
            permissionId: "page.delivery_earnings",
          },
          {
            label: "Delivery History",
            path: "/admin/delivery-partners/history",
            permissionId: "page.delivery_history",
          },
          {
            label: "Delivery Terms & Condition",
            path: "/admin/delivery-partners/terms",
            permissionId: "page.delivery_terms",
          },
          {
            label: "Delivery Privacy Policy",
            path: "/admin/delivery-partners/privacy",
            permissionId: "page.delivery_privacy",
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
        permissionId: "page.customer_contact_us",
      },
      {
        type: "link",
        label: "User Order Feedback",
        path: "/admin/contact-messages",
        icon: "Mail",
        permissionId: "page.contact_messages",
      },
      {
        type: "link",
        label: "Restaurant Terms & Conditions",
        path: "/admin/restaurant-terms",
        icon: "FileText",
        permissionId: "page.restaurant_terms",
      },
      {
        type: "link",
        label: "Restaurant Privacy Policy",
        path: "/admin/restaurant-privacy",
        icon: "FileText",
        permissionId: "page.restaurant_privacy",
      },
      {
        type: "link",
        label: "Safety Emergency Reports",
        path: "/admin/safety-emergency-reports",
        icon: "AlertTriangle",
        permissionId: "page.safety_emergency_reports",
      },
      {
        type: "link",
        label: "Improve Feedback",
        path: "/admin/improve-feedback",
        icon: "MessageSquare",
        permissionId: "page.improve_feedback",
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
        permissionId: "page.transaction_report",
      },
      {
        type: "link",
        label: "Order Report",
        path: "/admin/order-report/regular",
        icon: "FileText",
        permissionId: "page.order_report",
      },
      {
        type: "expandable",
        label: "Restaurant Report",
        icon: "FileText",
        subItems: [
          {
            label: "Restaurant Report",
            path: "/admin/restaurant-report",
            permissionId: "page.restaurant_report",
          },
        ],
      },
      {
        type: "expandable",
        label: "Customer Report",
        icon: "FileText",
        subItems: [
          {
            label: "Feedback Experience",
            path: "/admin/customer-report/feedback-experience",
            permissionId: "page.customer_report",
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
        permissionId: "page.restaurant_withdraws",
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
        permissionId: "page.hero_banner_management",
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
        permissionId: "page.dining_banners",
      },
      {
        type: "link",
        label: "Dining List",
        path: "/admin/dining-list",
        icon: "FileText",
        permissionId: "page.dining_list",
      },
      {
        type: "link",
        label: "Dining Coupons",
        path: "/admin/dining/coupons",
        icon: "Tag",
        permissionId: "page.dining_coupons",
      },
      {
        type: "link",
        label: "Dining Earnings",
        path: "/admin/dining/earnings",
        icon: "TrendingUp",
        permissionId: "page.dining_earnings",
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
        permissionId: "page.business_setup",
      },
      {
        type: "expandable",
        label: "Extra Curriculum",
        icon: "Link",
        subItems: [
          {
            label: "Terms And Condition",
            path: "/admin/pages-social-media/terms",
            permissionId: "page.pages_social_media",
          },
          {
            label: "Privacy Policy",
            path: "/admin/pages-social-media/privacy",
            permissionId: "page.pages_social_media",
          },
          {
            label: "About Us",
            path: "/admin/pages-social-media/about",
            permissionId: "page.pages_social_media",
          },
          {
            label: "Refund Policy",
            path: "/admin/pages-social-media/refund",
            permissionId: "page.pages_social_media",
          },
          {
            label: "Shipping Policy",
            path: "/admin/pages-social-media/shipping",
            permissionId: "page.pages_social_media",
          },
          {
            label: "Cancellation Policy",
            path: "/admin/pages-social-media/cancellation",
            permissionId: "page.pages_social_media",
          },
        ],
      },
    ],
  },
];

