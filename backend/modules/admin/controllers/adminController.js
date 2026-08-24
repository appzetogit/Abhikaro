import Admin from "../models/Admin.js";
import Order from "../../order/models/Order.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import Offer from "../../restaurant/models/Offer.js";
import AdminCommission from "../models/AdminCommission.js";
import OrderSettlement from "../../order/models/OrderSettlement.js";
import TableBooking from "../../dining/models/TableBooking.js";
import AdminWallet from "../models/AdminWallet.js";
import emailService from "../../auth/services/emailService.js";
import User from "../../auth/models/User.js";
import UserWallet from "../../user/models/UserWallet.js";
import Delivery from "../../delivery/models/Delivery.js";
import Menu from "../../restaurant/models/Menu.js";
import Hotel from "../../hotel/models/Hotel.js";
import Zone from "../models/Zone.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { normalizePhoneNumber } from "../../../shared/utils/phoneUtils.js";
import winston from "winston";
import mongoose from "mongoose";
import { uploadToCloudinary } from "../../../shared/utils/cloudinaryService.js";
import { initializeCloudinary } from "../../../config/cloudinary.js";
import {
  ADMIN_PERMISSIONS,
  sanitizeAdminPermissions,
  getDefaultAdminPermissions,
} from "../../../shared/constants/adminPermissions.js";
import { invalidateCachePattern } from "../../../shared/utils/cache.js";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

/**
 * Get Admin Dashboard Statistics
 * GET /api/admin/dashboard/stats
 *
 * Optional query params:
 * - zone: zone name or "all"
 * - timeFilter: overall | today | week | month | year | custom
 * - startDate, endDate: ISO strings for custom range
 */
export const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    const { zone, timeFilter = "overall", startDate, endDate } = req.query;

    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Helper: parse time filter into date range
    function getTimeFilterRange() {
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

      switch (timeFilter) {
        case "today": {
          const from = startOfToday;
          const to = new Date(startOfToday);
          to.setDate(to.getDate() + 1);
          return { from, to, granularity: "hour" };
        }
        case "week": {
          const day = startOfToday.getDay(); // 0 (Sun) - 6 (Sat)
          const diffToMonday = (day + 6) % 7; // days since Monday
          const from = new Date(startOfToday);
          from.setDate(from.getDate() - diffToMonday);
          const to = new Date(from);
          to.setDate(to.getDate() + 7);
          return { from, to, granularity: "day" };
        }
        case "month": {
          const from = new Date(now.getFullYear(), now.getMonth(), 1);
          const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          return { from, to, granularity: "day" };
        }
        case "year": {
          const from = new Date(now.getFullYear(), 0, 1);
          const to = new Date(now.getFullYear() + 1, 0, 1);
          return { from, to, granularity: "month" };
        }
        case "custom": {
          if (!startDate || !endDate) {
            return { from: null, to: null, granularity: "day" };
          }
          const from = new Date(startDate);
          const to = new Date(endDate);
          to.setHours(23, 59, 59, 999);

          const diffMs = to.getTime() - from.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          let granularity = "day";
          if (diffDays <= 1) granularity = "hour";
          else if (diffDays > 60) granularity = "month";

          return { from, to, granularity };
        }
        default:
          return { from: null, to: null, granularity: "month" };
      }
    }

    // Helper: build chart data buckets from delivered orders + settlements
    function buildChartDataFromOrders(
      orders,
      settlementsByOrderId,
      from,
      to,
      granularity,
    ) {
      if (!orders || orders.length === 0) return [];

      const buckets = new Map();

      orders.forEach((order) => {
        if (order.status !== "delivered") return;

        const ts = order.deliveredAt || order.createdAt;
        if (!ts) return;

        const date = new Date(ts);
        if (from && date < from) return;
        if (to && date > to) return;

        let key;
        let label;

        if (granularity === "hour") {
          const hour = date.getHours();
          key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${hour}`;
          label = `${hour.toString().padStart(2, "0")}:00`;
        } else if (granularity === "day") {
          const dayKey = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
          );
          key = dayKey.toISOString();
          label = `${dayKey.getDate()} ${dayKey.toLocaleString("en-US", {
            month: "short",
          })}`;
        } else {
          key = `${date.getFullYear()}-${date.getMonth()}`;
          label = date.toLocaleString("en-US", { month: "short" });
        }

        const bucket =
          buckets.get(key) || {
            label,
            revenue: 0,
            commission: 0,
            orders: 0,
          };

        bucket.revenue += order.pricing?.total || 0;
        const settlement = settlementsByOrderId.get(order._id.toString());
        if (settlement?.adminEarning) {
          bucket.commission += settlement.adminEarning.commission || 0;
        }
        bucket.orders += 1;

        buckets.set(key, bucket);
      });

      const sortedKeys = Array.from(buckets.keys()).sort();
      return sortedKeys.map((k) => {
        const b = buckets.get(k);
        return {
          month: b.label,
          revenue: Math.round(b.revenue * 100) / 100,
          commission: Math.round(b.commission * 100) / 100,
          orders: b.orders,
        };
      });
    }

    async function getDiningStats({ fromDate = null, toDate = null, zoneId = null }) {
      const bookingMatch = {};

      if (fromDate || toDate) {
        bookingMatch.createdAt = {};
        if (fromDate) bookingMatch.createdAt.$gte = fromDate;
        if (toDate) bookingMatch.createdAt.$lte = toDate;
      }

      if (zoneId) {
        const restaurantsInZone = await Restaurant.find({ zoneId })
          .select("_id")
          .lean();
        const restaurantIds = restaurantsInZone.map((r) => r._id);
        bookingMatch.restaurant = { $in: restaurantIds };
      }

      const bookingStats = await TableBooking.aggregate([
        { $match: bookingMatch },
        {
          $group: {
            _id: null,
            pending: {
              $sum: {
                $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
              },
            },
            booked: {
              $sum: {
                $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0],
              },
            },
            cancelled: {
              $sum: {
                $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0],
              },
            },
            billDone: {
              $sum: {
                $cond: [{ $eq: ["$billStatus", "completed"] }, 1, 0],
              },
            },
          },
        },
      ]);

      const stats = bookingStats[0] || {};
      return {
        pending: stats.pending || 0,
        booked: stats.booked || 0,
        cancelled: stats.cancelled || 0,
        billDone: stats.billDone || 0,
      };
    }

    // Resolve zone filter (if any)
    let zoneIdFilter = null;
    if (zone && zone !== "all" && zone !== "All Zones") {
      const zoneDoc = await Zone.findOne({
        name: { $regex: zone, $options: "i" },
      })
        .select("_id name")
        .lean();

      if (zoneDoc?._id) {
        zoneIdFilter = zoneDoc._id.toString();
      }
    }

    const { from, to, granularity } = getTimeFilterRange();
    const hasFilters = !!zoneIdFilter || timeFilter !== "overall";

    // If no filters, run optimized parallel queries
    if (!hasFilters) {
      const pendingRestaurantRequestsQuery = {
        isActive: false,
        isDeleted: { $ne: true },
        approvedAt: { $in: [null, undefined] },
        "onboarding.completedSteps": 4,
        $or: [
          { rejectionReason: { $exists: false } },
          { rejectionReason: null },
        ],
      };

      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      const twelveMonthsStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const twelveMonthsEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      // Execute all primary queries in parallel
      const [
        revenueStats,
        deliveredOrderDocs,
        orderStats,
        activeRestaurants,
        activeDeliveryPartners,
        totalRestaurants,
        pendingRestaurantRequests,
        totalDeliveryBoys,
        pendingDeliveryBoyRequests,
        activeRestaurantDocs,
        totalHotels,
        activeHotels,
        allActiveMenus,
        totalCustomers,
        recentOrders,
        recentRestaurants,
        diningStats,
        yearOrders,
      ] = await Promise.all([
        Order.aggregate([
          {
            $match: {
              status: "delivered",
              "pricing.total": { $exists: true },
            },
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$pricing.total" },
              last30DaysRevenue: {
                $sum: {
                  $cond: [
                    { $gte: ["$createdAt", last30Days] },
                    "$pricing.total",
                    0,
                  ],
                },
              },
            },
          },
        ]),
        Order.find({ status: "delivered" }).select("_id").lean(),
        Order.aggregate([
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),
        Restaurant.countDocuments({
          approvedAt: { $exists: true, $ne: null },
          isActive: true,
          isDeleted: { $ne: true },
        }),
        User.countDocuments({
          role: "delivery",
          isActive: true,
        }),
        Restaurant.countDocuments({
          approvedAt: { $exists: true, $ne: null },
          isDeleted: { $ne: true },
        }),
        Restaurant.countDocuments(pendingRestaurantRequestsQuery),
        Delivery.countDocuments({
          status: { $in: ["approved", "active"] },
        }),
        Delivery.countDocuments({
          status: "pending",
        }),
        Restaurant.find({
          approvedAt: { $exists: true, $ne: null },
          isActive: true,
        }).select("_id").lean(),
        Hotel.countDocuments({}),
        Hotel.countDocuments({ isActive: true }),
        Menu.find({ isActive: true }).select("addons sections restaurant").lean(),
        User.countDocuments({
          $or: [{ role: "user" }, { role: { $exists: false } }, { role: null }],
        }),
        Order.countDocuments({
          createdAt: { $gte: last24Hours },
        }),
        Restaurant.countDocuments({
          createdAt: { $gte: last24Hours },
          approvedAt: { $exists: true, $ne: null },
          isActive: true,
        }),
        getDiningStats({}),
        Order.find({
          status: "delivered",
          deliveredAt: { $gte: twelveMonthsStart, $lte: twelveMonthsEnd },
        }).select("_id pricing deliveredAt").lean(),
      ]);

      const revenueData = revenueStats[0] || {
        totalRevenue: 0,
        last30DaysRevenue: 0,
      };

      const deliveredOrderIdArray = deliveredOrderDocs.map((o) => o._id);
      const allSettlements = deliveredOrderIdArray.length > 0
        ? await OrderSettlement.find({
            orderId: { $in: deliveredOrderIdArray },
          }).lean()
        : [];

      let totalCommission = 0;
      let totalPlatformFee = 0;
      let totalDeliveryFee = 0;
      let totalGST = 0;
      let pendingCashCommission = 0;
      let totalQRCommission = 0;
      let last30DaysCommission = 0;
      let last30DaysPlatformFee = 0;
      let last30DaysDeliveryFee = 0;
      let last30DaysGST = 0;

      const settlementsByOrderId = new Map();

      allSettlements.forEach((s) => {
        if (s.orderId) {
          settlementsByOrderId.set(s.orderId.toString(), s);
        }

        const commission = s.adminEarning?.commission || 0;
        const platformFee = s.adminEarning?.platformFee || 0;
        const deliveryFee = s.adminEarning?.deliveryFee || 0;
        const gst = s.adminEarning?.gst || 0;
        const hotelCommission = s.adminEarning?.hotelCommission || 0;

        totalCommission += commission;
        totalPlatformFee += platformFee;
        totalDeliveryFee += deliveryFee;
        totalGST += gst;
        totalQRCommission += hotelCommission;

        if (s.adminEarning?.adminCommissionStatus === "pending_settlement") {
          pendingCashCommission += commission;
        }

        const sDate = s.createdAt ? new Date(s.createdAt) : null;
        if (sDate && sDate >= last30Days && sDate <= now) {
          last30DaysCommission += commission;
          last30DaysPlatformFee += platformFee;
          last30DaysDeliveryFee += deliveryFee;
          last30DaysGST += gst;
        }
      });

      totalCommission = Math.round(totalCommission * 100) / 100;
      totalPlatformFee = Math.round(totalPlatformFee * 100) / 100;
      totalDeliveryFee = Math.round(totalDeliveryFee * 100) / 100;
      totalGST = Math.round(totalGST * 100) / 100;
      totalQRCommission = Math.round(totalQRCommission * 100) / 100;

      const orderStatusMap = {};
      orderStats.forEach((stat) => {
        orderStatusMap[stat._id] = stat.count;
      });

      const totalOrders = deliveredOrderIdArray.length;
      const activePartners = activeRestaurants + activeDeliveryPartners;

      const activeRestaurantIdSet = new Set(
        activeRestaurantDocs.map((r) => r._id.toString())
      );

      let totalFoods = 0;
      let totalAddons = 0;

      allActiveMenus.forEach((menu) => {
        if (menu.restaurant && activeRestaurantIdSet.has(menu.restaurant.toString())) {
          if (menu.sections && Array.isArray(menu.sections)) {
            menu.sections.forEach((section) => {
              if (section.items && Array.isArray(section.items)) {
                totalFoods += section.items.filter((item) => {
                  if (!item || !item.id || !item.name) return false;
                  if (item.approvalStatus === "rejected") return false;
                  if (item.isAvailable === false) return false;
                  return true;
                }).length;
              }
              if (section.subsections && Array.isArray(section.subsections)) {
                section.subsections.forEach((subsection) => {
                  if (subsection.items && Array.isArray(subsection.items)) {
                    totalFoods += subsection.items.filter((item) => {
                      if (!item || !item.id || !item.name) return false;
                      if (item.approvalStatus === "rejected") return false;
                      if (item.isAvailable === false) return false;
                      return true;
                    }).length;
                  }
                });
              }
            });
          }
        }

        if (menu.addons && Array.isArray(menu.addons)) {
          totalAddons += menu.addons.filter((addon) => {
            if (!addon || typeof addon !== "object") return false;
            if (!addon.id || typeof addon.id !== "string" || addon.id.trim() === "") return false;
            if (!addon.name || typeof addon.name !== "string" || addon.name.trim() === "") return false;
            if (addon.approvalStatus === "rejected") return false;
            return true;
          }).length;
        }
      });

      const pendingOrders = orderStatusMap.pending || 0;
      const completedOrders = orderStatusMap.delivered || 0;

      // In-memory monthly chart computation
      const monthlyData = [];
      for (let i = 11; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(
          now.getFullYear(),
          now.getMonth() - i + 1,
          0,
          23,
          59,
          59,
          999,
        );

        let monthRevenue = 0;
        let monthCommission = 0;
        let monthOrdersCount = 0;

        yearOrders.forEach((order) => {
          const d = order.deliveredAt ? new Date(order.deliveredAt) : null;
          if (d && d >= monthStart && d <= monthEnd) {
            monthRevenue += order.pricing?.total || 0;
            const settlement = settlementsByOrderId.get(order._id.toString());
            if (settlement?.adminEarning) {
              monthCommission += settlement.adminEarning.commission || 0;
            }
            monthOrdersCount += 1;
          }
        });

        monthlyData.push({
          month: monthNames[monthStart.getMonth()],
          revenue: Math.round(monthRevenue * 100) / 100,
          commission: Math.round(monthCommission * 100) / 100,
          orders: monthOrdersCount,
        });
      }

      return successResponse(
        res,
        200,
        "Dashboard stats retrieved successfully",
        {
          revenue: {
            total: revenueData.totalRevenue || 0,
            last30Days: revenueData.last30DaysRevenue || 0,
            currency: "INR",
          },
          commission: {
            total: totalCommission,
            last30Days: last30DaysCommission,
            currency: "INR",
          },
          platformFee: {
            total: totalPlatformFee,
            last30Days: last30DaysPlatformFee,
            currency: "INR",
          },
          deliveryFee: {
            total: totalDeliveryFee,
            last30Days: last30DaysDeliveryFee,
            currency: "INR",
          },
          gst: {
            total: totalGST,
            last30Days: last30DaysGST,
            currency: "INR",
          },
          pendingCashCommission: {
            total: Math.round(pendingCashCommission * 100) / 100,
            currency: "INR",
          },
          totalAdminEarnings: {
            total:
              totalCommission +
              totalPlatformFee +
              totalDeliveryFee +
              totalGST,
            last30Days:
              last30DaysCommission +
              last30DaysPlatformFee +
              last30DaysDeliveryFee +
              last30DaysGST,
            currency: "INR",
          },
          orders: {
            total: totalOrders,
            byStatus: {
              pending: orderStatusMap.pending || 0,
              confirmed: orderStatusMap.confirmed || 0,
              preparing: orderStatusMap.preparing || 0,
              ready: orderStatusMap.ready || 0,
              out_for_delivery: orderStatusMap.out_for_delivery || 0,
              delivered: orderStatusMap.delivered || 0,
              cancelled: orderStatusMap.cancelled || 0,
            },
          },
          partners: {
            total: activePartners,
            restaurants: activeRestaurants,
            delivery: activeDeliveryPartners,
          },
          recentActivity: {
            orders: recentOrders,
            restaurants: recentRestaurants,
            period: "last24Hours",
          },
          monthlyData,
          restaurants: {
            total: totalRestaurants,
            active: activeRestaurants,
            pendingRequests: pendingRestaurantRequests,
          },
          deliveryBoys: {
            total: totalDeliveryBoys,
            active: activeDeliveryPartners,
            pendingRequests: pendingDeliveryBoyRequests,
          },
          foods: {
            total: totalFoods,
          },
          addons: {
            total: totalAddons,
          },
          qrCommission: {
            total: totalQRCommission,
            currency: "INR",
          },
          customers: {
            total: totalCustomers,
          },
          hotels: {
            total: totalHotels,
            active: activeHotels,
          },
          orderStats: {
            pending: pendingOrders,
            completed: completedOrders,
          },
          diningStats,
        },
      );
    }

    // Filtered branch (zone/time)
    const orderFilter = {};
    if (zoneIdFilter) {
      orderFilter["assignmentInfo.zoneId"] = zoneIdFilter;
    }
    if (from || to) {
      orderFilter.createdAt = {};
      if (from) orderFilter.createdAt.$gte = from;
      if (to) orderFilter.createdAt.$lte = to;
    }

    const pendingRestaurantRequestsQuery = {
      isActive: false,
      isDeleted: { $ne: true },
      approvedAt: { $in: [null, undefined] },
      "onboarding.completedSteps": 4,
      $or: [
        { rejectionReason: { $exists: false } },
        { rejectionReason: null },
      ],
    };

    const [
      filteredOrders,
      totalRestaurants,
      activeRestaurants,
      pendingRestaurantRequests,
      totalDeliveryBoys,
      activeDeliveryPartners,
      pendingDeliveryBoyRequests,
      totalHotels,
      activeHotels,
      recentRestaurants,
      diningStats,
    ] = await Promise.all([
      Order.find(orderFilter)
        .select(
          "_id pricing status createdAt deliveredAt userId restaurantId assignmentInfo deliveryPartnerId",
        )
        .lean(),
      Restaurant.countDocuments(
        zoneIdFilter
          ? {
              zoneId: zoneIdFilter,
              approvedAt: { $exists: true, $ne: null },
              isDeleted: { $ne: true },
            }
          : {
              approvedAt: { $exists: true, $ne: null },
              isDeleted: { $ne: true },
            },
      ),
      Restaurant.countDocuments(
        zoneIdFilter
          ? {
              zoneId: zoneIdFilter,
              approvedAt: { $exists: true, $ne: null },
              isActive: true,
              isDeleted: { $ne: true },
            }
          : {
              approvedAt: { $exists: true, $ne: null },
              isActive: true,
              isDeleted: { $ne: true },
            },
      ),
      Restaurant.countDocuments(
        zoneIdFilter
          ? {
              ...pendingRestaurantRequestsQuery,
              zoneId: zoneIdFilter,
            }
          : pendingRestaurantRequestsQuery,
      ),
      Delivery.countDocuments(
        zoneIdFilter
          ? {
              "availability.zones": zoneIdFilter,
              status: { $in: ["approved", "active"] },
            }
          : {
              status: { $in: ["approved", "active"] },
            },
      ),
      Delivery.countDocuments(
        zoneIdFilter
          ? {
              "availability.zones": zoneIdFilter,
              status: { $in: ["approved", "active"] },
              isActive: true,
            }
          : {
              status: { $in: ["approved", "active"] },
              isActive: true,
            },
      ),
      Delivery.countDocuments(
        zoneIdFilter
          ? {
              "availability.zones": zoneIdFilter,
              status: "pending",
            }
          : {
              status: "pending",
            },
      ),
      Hotel.countDocuments({}),
      Hotel.countDocuments({ isActive: true }),
      Restaurant.countDocuments({
        createdAt: { $gte: last24Hours },
        approvedAt: { $exists: true, $ne: null },
        isActive: true,
        isDeleted: { $ne: true },
      }),
      getDiningStats({
        fromDate: from,
        toDate: to,
        zoneId: zoneIdFilter,
      }),
    ]);

    const deliveredOrders = filteredOrders.filter(
      (o) => o.status === "delivered",
    );
    const deliveredOrderIds = deliveredOrders.map((o) => o._id);

    const restaurantIdsSet = new Set();
    const customerIdsSet = new Set();
    filteredOrders.forEach((o) => {
      if (o.restaurantId) restaurantIdsSet.add(o.restaurantId.toString());
      if (o.userId) customerIdsSet.add(o.userId.toString());
    });

    const [allSettlements, totalCustomersCount, restaurantDocs] = await Promise.all([
      deliveredOrderIds.length > 0
        ? OrderSettlement.find({
            orderId: { $in: deliveredOrderIds },
          }).lean()
        : [],
      zoneIdFilter
        ? customerIdsSet.size
        : User.countDocuments({
            $or: [{ role: "user" }, { role: { $exists: false } }, { role: null }],
          }),
      restaurantIdsSet.size > 0
        ? Restaurant.find({
            restaurantId: { $in: Array.from(restaurantIdsSet) },
          }).select("_id").lean()
        : [],
    ]);

    const settlementsByOrderId = new Map();
    allSettlements.forEach((s) => {
      if (s.orderId) {
        settlementsByOrderId.set(s.orderId.toString(), s);
      }
    });

    let totalCommission = 0;
    let totalPlatformFee = 0;
    let totalDeliveryFee = 0;
    let totalGST = 0;
    let pendingCashCommission = 0;
    let totalQRCommission = 0;

    allSettlements.forEach((s) => {
      const commission = s.adminEarning?.commission || 0;
      const platformFee = s.adminEarning?.platformFee || 0;
      const deliveryFee = s.adminEarning?.deliveryFee || 0;
      const gst = s.adminEarning?.gst || 0;
      const hotelCommission = s.adminEarning?.hotelCommission || 0;

      totalCommission += commission;
      totalPlatformFee += platformFee;
      totalDeliveryFee += deliveryFee;
      totalGST += gst;
      totalQRCommission += hotelCommission;

      if (s.adminEarning?.adminCommissionStatus === "pending_settlement") {
        pendingCashCommission += commission;
      }
    });

    totalCommission = Math.round(totalCommission * 100) / 100;
    totalPlatformFee = Math.round(totalPlatformFee * 100) / 100;
    totalDeliveryFee = Math.round(totalDeliveryFee * 100) / 100;
    totalGST = Math.round(totalGST * 100) / 100;
    totalQRCommission = Math.round(totalQRCommission * 100) / 100;

    const totalRevenue = deliveredOrders.reduce(
      (sum, o) => sum + (o.pricing?.total || 0),
      0,
    );

    const last30DaysFromFilter =
      timeFilter === "overall"
        ? last30Days
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last30DaysRevenue = deliveredOrders.reduce((sum, o) => {
      const ts = o.deliveredAt || o.createdAt;
      if (ts && ts >= last30DaysFromFilter) {
        return sum + (o.pricing?.total || 0);
      }
      return sum;
    }, 0);

    const last30DaysSettlements = allSettlements.filter(
      (s) => s.createdAt && s.createdAt >= last30DaysFromFilter,
    );

    const last30DaysCommission = last30DaysSettlements.reduce(
      (sum, s) => sum + (s.adminEarning?.commission || 0),
      0,
    );
    const last30DaysPlatformFee = last30DaysSettlements.reduce(
      (sum, s) => sum + (s.adminEarning?.platformFee || 0),
      0,
    );
    const last30DaysDeliveryFee = last30DaysSettlements.reduce(
      (sum, s) => sum + (s.adminEarning?.deliveryFee || 0),
      0,
    );
    const last30DaysGST = last30DaysSettlements.reduce(
      (sum, s) => sum + (s.adminEarning?.gst || 0),
      0,
    );

    const orderStatusMap = {};
    filteredOrders.forEach((o) => {
      orderStatusMap[o.status] = (orderStatusMap[o.status] || 0) + 1;
    });

    const totalOrders = deliveredOrders.length;
    const totalCustomers = totalCustomersCount;
    const pendingOrders = orderStatusMap.pending || 0;
    const completedOrders = orderStatusMap.delivered || 0;

    const recentOrders = filteredOrders.filter((o) => {
      const ts = o.createdAt;
      if (!ts) return false;
      if (from && ts < from) return false;
      if (to && ts > to) return false;
      return ts >= last24Hours;
    }).length;

    let totalFoods = 0;
    let totalAddons = 0;
    if (restaurantDocs.length > 0) {
      const restaurantObjectIds = restaurantDocs
        .map((r) => r._id)
        .filter((id) => mongoose.Types.ObjectId.isValid(id));

      const activeMenus = restaurantObjectIds.length > 0
        ? await Menu.find({
            isActive: true,
            restaurant: { $in: restaurantObjectIds },
          }).select("sections addons").lean()
        : [];

      activeMenus.forEach((menu) => {
        if (menu.sections && Array.isArray(menu.sections)) {
          menu.sections.forEach((section) => {
            if (section.items && Array.isArray(section.items)) {
              totalFoods += section.items.length;
            }
            if (section.subsections && Array.isArray(section.subsections)) {
              section.subsections.forEach((subsection) => {
                if (subsection.items && Array.isArray(subsection.items)) {
                  totalFoods += subsection.items.length;
                }
              });
            }
          });
        }

        if (menu.addons && Array.isArray(menu.addons)) {
          totalAddons += menu.addons.length;
        }
      });
    }

    const monthlyData = buildChartDataFromOrders(
      deliveredOrders,
      settlementsByOrderId,
      from,
      to,
      granularity,
    );

    return successResponse(res, 200, "Dashboard stats retrieved successfully", {
      revenue: {
        total: totalRevenue,
        last30Days: last30DaysRevenue,
        currency: "INR",
      },
      commission: {
        total: totalCommission,
        last30Days: last30DaysCommission,
        currency: "INR",
      },
      platformFee: {
        total: totalPlatformFee,
        last30Days: last30DaysPlatformFee,
        currency: "INR",
      },
      deliveryFee: {
        total: totalDeliveryFee,
        last30Days: last30DaysDeliveryFee,
        currency: "INR",
      },
      gst: {
        total: totalGST,
        last30Days: last30DaysGST,
        currency: "INR",
      },
      pendingCashCommission: {
        total: Math.round(pendingCashCommission * 100) / 100,
        currency: "INR",
      },
      totalAdminEarnings: {
        total:
          totalCommission + totalPlatformFee + totalDeliveryFee + totalGST,
        last30Days:
          last30DaysCommission +
          last30DaysPlatformFee +
          last30DaysDeliveryFee +
          last30DaysGST,
        currency: "INR",
      },
      orders: {
        total: totalOrders,
        byStatus: {
          pending: orderStatusMap.pending || 0,
          confirmed: orderStatusMap.confirmed || 0,
          preparing: orderStatusMap.preparing || 0,
          ready: orderStatusMap.ready || 0,
          out_for_delivery: orderStatusMap.out_for_delivery || 0,
          delivered: orderStatusMap.delivered || 0,
          cancelled: orderStatusMap.cancelled || 0,
        },
      },
      partners: {
        total: totalRestaurants + totalDeliveryBoys,
        restaurants: totalRestaurants,
        delivery: totalDeliveryBoys,
      },
      recentActivity: {
        orders: recentOrders,
        restaurants: recentRestaurants,
        period: timeFilter || "custom",
      },
      monthlyData,
      restaurants: {
        total: totalRestaurants,
        active: activeRestaurants,
        pendingRequests: pendingRestaurantRequests,
      },
      deliveryBoys: {
        total: totalDeliveryBoys,
        active: activeDeliveryPartners,
        pendingRequests: pendingDeliveryBoyRequests,
      },
      foods: {
        total: totalFoods,
      },
      addons: {
        total: totalAddons,
      },
      qrCommission: {
        total: totalQRCommission,
        currency: "INR",
      },
      customers: {
        total: totalCustomers,
      },
      hotels: {
        total: totalHotels,
        active: activeHotels,
      },
      orderStats: {
        pending: pendingOrders,
        completed: completedOrders,
      },
      diningStats,
    });
  } catch (error) {
    logger.error(`Error fetching dashboard stats: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch dashboard statistics");
  }
});

/**
 * Get All Admins
 * GET /api/admin/admins
 */
export const getAdmins = asyncHandler(async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const admins = await Admin.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const total = await Admin.countDocuments(query);

    return successResponse(res, 200, "Admins retrieved successfully", {
      admins,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error(`Error fetching admins: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch admins");
  }
});

/**
 * Get Admin by ID
 * GET /api/admin/admins/:id
 */
export const getAdminById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id).select("-password").lean();

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    return successResponse(res, 200, "Admin retrieved successfully", { admin });
  } catch (error) {
    logger.error(`Error fetching admin: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch admin");
  }
});

/**
 * Create Admin (only by existing admin)
 * POST /api/admin/admins
 */
export const createAdmin = asyncHandler(async (req, res) => {
  try {
    const { name, email, password, phone, role, permissions } = req.body;

    // Validation
    if (!name || !email || !password) {
      return errorResponse(res, 400, "Name, email, and password are required");
    }

    if (password.length < 6) {
      return errorResponse(
        res,
        400,
        "Password must be at least 6 characters long",
      );
    }

    // Check if admin already exists with this email
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return errorResponse(res, 400, "Admin already exists with this email");
    }

    // Determine role for the new admin – only allow admin or moderator via API
    const allowedRoles = ["admin", "moderator"];
    const newRole = role && allowedRoles.includes(role) ? role : "admin";

    // Sanitize and default permissions
    let sanitizedPermissions = sanitizeAdminPermissions(permissions);
    if (!sanitizedPermissions || sanitizedPermissions.length === 0) {
      sanitizedPermissions = getDefaultAdminPermissions(newRole);
    }

    // Create new admin
    const adminData = {
      name,
      email: email.toLowerCase(),
      password,
      role: newRole,
      permissions: sanitizedPermissions,
      isActive: true,
      phoneVerified: false,
    };

    if (phone) {
      adminData.phone = phone;
    }

    const admin = await Admin.create(adminData);

    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin created: ${admin._id}`, {
      email,
      createdBy: req.user._id,
    });

    return successResponse(res, 201, "Admin created successfully", {
      admin: adminResponse,
    });
  } catch (error) {
    logger.error(`Error creating admin: ${error.message}`);

    if (error.code === 11000) {
      return errorResponse(res, 400, "Admin with this email already exists");
    }

    return errorResponse(res, 500, "Failed to create admin");
  }
});

/**
 * Update Admin
 * PUT /api/admin/admins/:id
 */
export const updateAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, isActive, role, permissions } = req.body;

    const admin = await Admin.findById(id);

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    const isSelfUpdate = id === req.user._id.toString();

    // Prevent updating own account's isActive status
    if (isSelfUpdate && isActive === false) {
      return errorResponse(res, 400, "You cannot deactivate your own account");
    }

    // Prevent modifying another super admin via API
    if (admin.role === "super_admin" && req.user.role !== "super_admin") {
      return errorResponse(
        res,
        403,
        "You cannot modify a super admin account via this endpoint",
      );
    }

    // Update fields
    if (name) admin.name = name;
    if (email) admin.email = email.toLowerCase();
    if (phone !== undefined) admin.phone = phone;
    if (isActive !== undefined) admin.isActive = isActive;

    // Allow changing role for non-super-admin targets (admin/moderator only)
    if (role && admin.role !== "super_admin") {
      const allowedRoles = ["admin", "moderator"];
      if (!allowedRoles.includes(role)) {
        return errorResponse(
          res,
          400,
          "Invalid role. Only 'admin' and 'moderator' are allowed via this API",
        );
      }
      admin.role = role;
    }

    // Update permissions when provided, with sanitization
    if (permissions !== undefined) {
      const sanitized = sanitizeAdminPermissions(permissions);
      admin.permissions =
        sanitized && sanitized.length > 0
          ? sanitized
          : getDefaultAdminPermissions(admin.role);
    }

    await admin.save();

    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin updated: ${id}`, { updatedBy: req.user._id });

    return successResponse(res, 200, "Admin updated successfully", {
      admin: adminResponse,
    });
  } catch (error) {
    logger.error(`Error updating admin: ${error.message}`);

    if (error.code === 11000) {
      return errorResponse(res, 400, "Admin with this email already exists");
    }

    return errorResponse(res, 500, "Failed to update admin");
  }
});

/**
 * Delete Admin
 * DELETE /api/admin/admins/:id
 */
export const deleteAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting own account
    if (id === req.user._id.toString()) {
      return errorResponse(res, 400, "You cannot delete your own account");
    }

    const admin = await Admin.findById(id);

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    // Prevent deleting super admin via API (use direct DB change instead)
    if (admin.role === "super_admin") {
      return errorResponse(
        res,
        400,
        "You cannot delete a super admin account via this endpoint",
      );
    }

    await Admin.deleteOne({ _id: id });

    logger.info(`Admin deleted: ${id}`, { deletedBy: req.user._id });

    return successResponse(res, 200, "Admin deleted successfully");
  } catch (error) {
    logger.error(`Error deleting admin: ${error.message}`);
    return errorResponse(res, 500, "Failed to delete admin");
  }
});

/**
 * Get catalog of available admin permissions
 * GET /api/admin/admin-permissions
 */
export const getAdminPermissionsCatalog = asyncHandler(async (req, res) => {
  try {
    return successResponse(res, 200, "Admin permissions retrieved successfully", {
      permissions: ADMIN_PERMISSIONS,
    });
  } catch (error) {
    logger.error(`Error fetching admin permissions: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch admin permissions");
  }
});


/**
 * Get Current Admin Profile
 * GET /api/admin/profile
 */
export const getAdminProfile = asyncHandler(async (req, res) => {
  try {
    const admin = await Admin.findById(req.user._id).select("-password").lean();

    if (!admin) {
      return errorResponse(res, 404, "Admin profile not found");
    }

    return successResponse(res, 200, "Admin profile retrieved successfully", {
      admin,
    });
  } catch (error) {
    logger.error(`Error fetching admin profile: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch admin profile");
  }
});

/**
 * Update Current Admin Profile
 * PUT /api/admin/profile
 */
export const updateAdminProfile = asyncHandler(async (req, res) => {
  try {
    const { name, phone, profileImage } = req.body;

    const admin = await Admin.findById(req.user._id);

    if (!admin) {
      return errorResponse(res, 404, "Admin profile not found");
    }

    // Update fields (email cannot be changed via profile update)
    if (name !== undefined && name !== null) {
      admin.name = name.trim();
    }

    if (phone !== undefined) {
      // Allow empty string to clear phone number
      admin.phone = phone ? phone.trim() : null;
    }

    if (profileImage !== undefined) {
      // Allow empty string to clear profile image
      admin.profileImage = profileImage || null;
    }

    // Save to database
    await admin.save();

    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin profile updated: ${admin._id}`, {
      updatedFields: {
        name,
        phone,
        profileImage: profileImage ? "updated" : "not changed",
      },
    });

    return successResponse(res, 200, "Profile updated successfully", {
      admin: adminResponse,
    });
  } catch (error) {
    logger.error(`Error updating admin profile: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update profile");
  }
});

/**
 * Change Admin Password
 * PUT /api/admin/settings/change-password
 */
export const changeAdminPassword = asyncHandler(async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return errorResponse(
        res,
        400,
        "Current password and new password are required",
      );
    }

    if (newPassword.length < 6) {
      return errorResponse(
        res,
        400,
        "New password must be at least 6 characters long",
      );
    }

    // Get admin with password field
    const admin = await Admin.findById(req.user._id).select("+password");

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    // Verify current password
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      return errorResponse(res, 401, "Current password is incorrect");
    }

    // Check if new password is same as current
    const isSamePassword = await admin.comparePassword(newPassword);
    if (isSamePassword) {
      return errorResponse(
        res,
        400,
        "New password must be different from current password",
      );
    }

    // Update password (pre-save hook will hash it)
    admin.password = newPassword;
    await admin.save();

    logger.info(`Admin password changed: ${admin._id}`);

    return successResponse(res, 200, "Password changed successfully");
  } catch (error) {
    logger.error(`Error changing admin password: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to change password");
  }
});

/**
 * Get All Users (Customers) with Order Statistics
 * GET /api/admin/users
 */
export const getUsers = asyncHandler(async (req, res) => {
  try {
    // Admin list should never be served from cache (prevents stale totals via 304/ETag)
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    const {
      limit = 100,
      offset = 0,
      search,
      status,
      sortBy,
      orderDate,
      joiningDate,
    } = req.query;

    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000000) : 1000000;
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    // Build query - include users with role="user" or without role set
    const query = {
      $or: [{ role: "user" }, { role: { $exists: false } }, { role: null }],
    };

    // Search filter
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      query.$and = [
        {
          $or: [{ role: "user" }, { role: { $exists: false } }, { role: null }],
        },
        {
          $or: [
            { name: searchRegex },
            { email: searchRegex },
            { phone: searchRegex },
          ],
        },
      ];
      delete query.$or;
    }

    // Status filter
    if (status === "active") {
      query.isActive = true;
    } else if (status === "inactive") {
      query.isActive = false;
    }

    // Joining date filter
    if (joiningDate) {
      const startDate = new Date(joiningDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(joiningDate);
      endDate.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    const isFetchingAll = parsedLimit >= 1000;

    // Fetch users, total count, wallets, and order statistics in parallel
    const [users, total, allWallets, allOrderStats] = await Promise.all([
      User.find(query)
        .select("_id name email phone isActive createdAt wallet.balance")
        .sort({ createdAt: -1 })
        .limit(parsedLimit)
        .skip(parsedOffset)
        .lean(),
      User.countDocuments(query),
      isFetchingAll
        ? UserWallet.find({}).select("userId balance").lean()
        : null,
      isFetchingAll
        ? Order.aggregate([
            {
              $match: {
                status: "delivered",
              },
            },
            {
              $group: {
                _id: "$userId",
                totalOrders: { $sum: 1 },
                totalAmount: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ["$payment.status", "completed"] },
                          { $in: ["$payment.method", ["cash", "pay_at_hotel"]] },
                        ],
                      },
                      "$pricing.total",
                      0,
                    ],
                  },
                },
              },
            },
          ])
        : null,
    ]);

    let wallets = allWallets;
    let orderStats = allOrderStats;

    if (!isFetchingAll) {
      const userIds = users.map((user) => user._id);
      const [w, o] = await Promise.all([
        userIds.length > 0
          ? UserWallet.find({ userId: { $in: userIds } })
              .select("userId balance")
              .lean()
          : [],
        userIds.length > 0
          ? Order.aggregate([
              {
                $match: {
                  userId: { $in: userIds },
                  status: "delivered",
                },
              },
              {
                $group: {
                  _id: "$userId",
                  totalOrders: { $sum: 1 },
                  totalAmount: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ["$payment.status", "completed"] },
                            { $in: ["$payment.method", ["cash", "pay_at_hotel"]] },
                          ],
                        },
                        "$pricing.total",
                        0,
                      ],
                    },
                  },
                },
              },
            ])
          : [],
      ]);
      wallets = w;
      orderStats = o;
    }

    const walletBalanceMap = new Map();
    if (Array.isArray(wallets)) {
      wallets.forEach((w) => {
        if (w?.userId) {
          walletBalanceMap.set(String(w.userId), Number(w.balance) || 0);
        }
      });
    }

    const statsMap = new Map();
    if (Array.isArray(orderStats)) {
      orderStats.forEach((stat) => {
        if (stat?._id) {
          statsMap.set(String(stat._id), {
            totalOrder: Number(stat.totalOrders) || 0,
            totalOrderAmount: Number(stat.totalAmount) || 0,
          });
        }
      });
    }

    const formattedUsers = users.map((user, index) => {
      const stats = statsMap.get(String(user._id)) || {
        totalOrder: 0,
        totalOrderAmount: 0,
      };

      const joiningDate = new Date(user.createdAt);
      const formattedDate = joiningDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      const walletBalance =
        walletBalanceMap.get(String(user._id)) ??
        Number(user?.wallet?.balance) ??
        0;

      return {
        sl: parsedOffset + index + 1,
        id: user._id.toString(),
        name: user.name || "N/A",
        email: user.email || "N/A",
        phone: user.phone || "N/A",
        totalOrder: Number(stats.totalOrder) || 0,
        totalOrderAmount: Math.round((Number(stats.totalOrderAmount) || 0) * 100) / 100,
        walletBalance: Number(walletBalance) || 0,
        joiningDate: formattedDate,
        status: user.isActive !== false,
        createdAt: user.createdAt,
      };
    });

    // Apply sorting
    if (sortBy) {
      if (sortBy === "name-asc") {
        formattedUsers.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === "name-desc") {
        formattedUsers.sort((a, b) => b.name.localeCompare(a.name));
      } else if (sortBy === "orders-asc") {
        formattedUsers.sort((a, b) => a.totalOrder - b.totalOrder);
      } else if (sortBy === "orders-desc") {
        formattedUsers.sort((a, b) => b.totalOrder - a.totalOrder);
      }
    }

    return successResponse(res, 200, "Users retrieved successfully", {
      users: formattedUsers,
      total,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch users");
  }
});

/**
 * Get User by ID with Full Details
 * GET /api/admin/users/:id
 */
export const getUserById = asyncHandler(async (req, res) => {
  try {
    // User details should never be served from cache (prevents stale totals via 304/ETag)
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    const { id } = req.params;
    const ordersLimitRaw = req.query?.ordersLimit;
    const ordersLimitParsed = Number(ordersLimitRaw);
    const ordersLimit =
      Number.isFinite(ordersLimitParsed) && ordersLimitParsed > 0
        ? Math.min(2000, Math.floor(ordersLimitParsed))
        : 500;
    const User = (await import("../../auth/models/User.js")).default;

    const user = await User.findById(id).select("-password -__v").lean();

    if (!user) {
      return errorResponse(res, 404, "User not found");
    }

    // Get order statistics:
    // - totals:
    //   - totalAllOrders: COUNT all orders (all statuses)
    //   - totalOrders: COUNT delivered + paid/collected orders only
    //   - totalAmount: SUM delivered + paid/collected orders' totals only
    // - recent orders: latest N orders (all statuses) for the modal list
    const orderAgg = await Order.aggregate([
      { $match: { userId: user._id } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalAllOrders: { $sum: 1 },
                totalOrders: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", "delivered"] },
                          {
                            $or: [
                              { $eq: ["$payment.status", "completed"] },
                              {
                                $and: [
                                  { $in: ["$payment.method", ["cash", "pay_at_hotel"]] },
                                  { $eq: ["$cashCollected", true] },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                totalAmount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", "delivered"] },
                          {
                            $or: [
                              { $eq: ["$payment.status", "completed"] },
                              {
                                $and: [
                                  { $in: ["$payment.method", ["cash", "pay_at_hotel"]] },
                                  { $eq: ["$cashCollected", true] },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                      "$pricing.total",
                      0,
                    ],
                  },
                },
              },
            },
          ],
          recentOrders: [
            { $sort: { createdAt: -1 } },
            { $limit: ordersLimit },
            {
              $project: {
                _id: 0,
                orderId: 1,
                status: 1,
                total: "$pricing.total",
                createdAt: 1,
                restaurantName: 1,
              },
            },
          ],
        },
      },
    ]);

    const totals = orderAgg?.[0]?.totals?.[0] || {
      totalAllOrders: 0,
      totalOrders: 0,
      totalAmount: 0,
    };
    const recentOrders = orderAgg?.[0]?.recentOrders || [];

    // Format joining date
    const joiningDate = new Date(user.createdAt);
    const formattedDate = joiningDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return successResponse(res, 200, "User retrieved successfully", {
      user: {
        id: user._id.toString(),
        name: user.name || "N/A",
        email: user.email || "N/A",
        phone: user.phone || "N/A",
        phoneVerified: user.phoneVerified || false,
        profileImage: user.profileImage || null,
        role: user.role,
        signupMethod: user.signupMethod,
        isActive: user.isActive !== false,
        addresses: user.addresses || [],
        preferences: user.preferences || {},
        wallet: user.wallet || {},
        dateOfBirth: user.dateOfBirth || null,
        anniversary: user.anniversary || null,
        gender: user.gender || null,
        joiningDate: formattedDate,
        createdAt: user.createdAt,
        totalAllOrders: totals.totalAllOrders,
        totalOrders: totals.totalOrders,
        totalOrderAmount: totals.totalAmount,
        orders: recentOrders, // Latest N orders (all statuses)
      },
    });
  } catch (error) {
    logger.error(`Error fetching user: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch user");
  }
});

/**
 * Update User Status (Active/Inactive)
 * PUT /api/admin/users/:id/status
 */
export const updateUserStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const User = (await import("../../auth/models/User.js")).default;

    if (typeof isActive !== "boolean") {
      return errorResponse(res, 400, "isActive must be a boolean value");
    }

    const user = await User.findById(id);

    if (!user) {
      return errorResponse(res, 404, "User not found");
    }

    user.isActive = isActive;
    await user.save();

    logger.info(`User status updated: ${id}`, {
      isActive,
      updatedBy: req.user._id,
    });

    return successResponse(res, 200, "User status updated successfully", {
      user: {
        id: user._id.toString(),
        name: user.name,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error updating user status: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update user status");
  }
});

/**
 * Update User Details (Admin)
 * PUT /api/admin/users/:id
 */
export const updateUser = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const User = (await import("../../auth/models/User.js")).default;

    const user = await User.findById(id);
    if (!user || user.role !== "user") {
      return errorResponse(res, 404, "User not found");
    }

    // Whitelist fields allowed to update by admin
    const allowedFields = [
      "name",
      "email",
      "phone",
      "gender",
      "dateOfBirth",
      "anniversary",
      "profileImage",
    ];

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        user[field] = req.body[field];
      }
    });

    await user.save();

    logger.info(`User updated: ${id}`, { updatedBy: req.user?._id });

    return successResponse(res, 200, "User updated successfully", {
      user: {
        id: user._id.toString(),
        name: user.name || "N/A",
        email: user.email || "N/A",
        phone: user.phone || "N/A",
        gender: user.gender || null,
        dateOfBirth: user.dateOfBirth || null,
        anniversary: user.anniversary || null,
        profileImage: user.profileImage || null,
        isActive: user.isActive !== false,
      },
    });
  } catch (error) {
    logger.error(`Error updating user: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, error.message || "Failed to update user");
  }
});

/**
 * Delete User (Admin) - Hard delete
 * DELETE /api/admin/users/:id
 *
 * Safety: Do NOT delete users that have orders to avoid orphaned references.
 */
export const deleteUser = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const User = (await import("../../auth/models/User.js")).default;
    const UserWallet = (await import("../../user/models/UserWallet.js")).default;

    const user = await User.findById(id);
    if (!user || user.role !== "user") {
      return errorResponse(res, 404, "User not found");
    }

    const orderCount = await Order.countDocuments({ userId: user._id });
    if (orderCount > 0) {
      return errorResponse(
        res,
        400,
        "Cannot delete user with existing orders; deactivate instead.",
      );
    }

    await UserWallet.deleteOne({ userId: user._id });
    await User.deleteOne({ _id: user._id });

    logger.info(`User deleted: ${id}`, {
      deletedBy: req.user?._id,
    });

    return successResponse(res, 200, "User deleted successfully");
  } catch (error) {
    logger.error(`Error deleting user: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, error.message || "Failed to delete user");
  }
});

/**
 * Get All Restaurants
 * GET /api/admin/restaurants
 * Query params: page, limit, search, status, cuisine, zone
 */
export const getRestaurants = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, cuisine, zone } = req.query;

    // Build query
    const query = { isDeleted: { $ne: true } };

    // Only show approved restaurants in main list (approvedAt set)
    // This keeps "New Joining Requests" separate from approved-but-inactive restaurants.
    query.approvedAt = { $exists: true, $ne: null };

    // Status filter:
    // - status=active   -> only active restaurants
    // - status=inactive -> only inactive restaurants
    // - default (no status) -> show BOTH active + inactive in the main list
    if (status === "active") {
      query.isActive = true;
    } else if (status === "inactive") {
      query.isActive = false;
    }

    console.log("🔍 Admin Restaurants List Query:", {
      status,
      isActive: query.isActive,
      query: JSON.stringify(query, null, 2),
    });

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { ownerName: { $regex: search, $options: "i" } },
        { ownerPhone: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Cuisine filter
    if (cuisine) {
      query.cuisines = { $in: [new RegExp(cuisine, "i")] };
    }

    // Zone filter
    if (zone && zone !== "All over the World") {
      query.$or = [
        { "location.area": { $regex: zone, $options: "i" } },
        { "location.city": { $regex: zone, $options: "i" } },
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch restaurants
    const restaurants = await Restaurant.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Fix restaurant names: Prefer onboarding.step1.restaurantName if available
    restaurants.forEach(restaurant => {
      if (restaurant.onboarding?.step1?.restaurantName) {
        restaurant.name = restaurant.onboarding.step1.restaurantName;
      }
      if (restaurant.onboarding?.step1?.ownerName) {
        restaurant.ownerName = restaurant.onboarding.step1.ownerName;
      }
    });

    // Aggregate live rating and review counts from delivered orders
    if (restaurants.length > 0) {
      const allRatingKeys = new Set();
      const restaurantKeyMap = new Map(); // key -> array of restaurant array indices

      restaurants.forEach((restaurant, index) => {
        const keys = [
          restaurant._id ? String(restaurant._id) : null,
          restaurant.restaurantId ? String(restaurant.restaurantId) : null,
        ].filter(Boolean);

        keys.forEach((key) => {
          allRatingKeys.add(key);
          if (!restaurantKeyMap.has(key)) {
            restaurantKeyMap.set(key, []);
          }
          restaurantKeyMap.get(key).push(index);
        });
      });

      if (allRatingKeys.size > 0) {
        const ratingRows = await Order.aggregate([
          {
            $match: {
              restaurantId: { $in: Array.from(allRatingKeys) },
              isDeleted: { $ne: true },
              status: "delivered",
            },
          },
          {
            $group: {
              _id: "$restaurantId",
              totalRatings: { $sum: 1 },
              ratingSum: {
                $sum: {
                  $cond: [{ $gt: ["$review.rating", 0] }, "$review.rating", 5],
                },
              },
            },
          },
        ]);

        const mergedStatsByIndex = new Map();
        for (const row of ratingRows) {
          const key = String(row?._id || "");
          const indices = restaurantKeyMap.get(key) || [];
          indices.forEach((idx) => {
            const prev = mergedStatsByIndex.get(idx) || { totalRatings: 0, ratingSum: 0 };
            mergedStatsByIndex.set(idx, {
              totalRatings: prev.totalRatings + Number(row.totalRatings || 0),
              ratingSum: prev.ratingSum + Number(row.ratingSum || 0),
            });
          });
        }

        mergedStatsByIndex.forEach((stats, idx) => {
          if (!restaurants[idx]) return;
          if (stats.totalRatings > 0) {
            const avg = stats.ratingSum / stats.totalRatings;
            restaurants[idx].rating = Number(avg.toFixed(1));
            restaurants[idx].averageRating = restaurants[idx].rating;
            restaurants[idx].totalRatings = stats.totalRatings;
            restaurants[idx].userRatings = stats.totalRatings;
            restaurants[idx].reviews = stats.totalRatings;
            restaurants[idx].reviewCount = stats.totalRatings;
            if (!restaurants[idx].ratings) {
              restaurants[idx].ratings = {};
            }
            restaurants[idx].ratings.average = restaurants[idx].rating;
            restaurants[idx].ratings.count = stats.totalRatings;
          }
        });
      }
    }

    // Get total count
    const total = await Restaurant.countDocuments(query);

    return successResponse(res, 200, "Restaurants retrieved successfully", {
      restaurants: restaurants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error fetching restaurants: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurants");
  }
});

/**
 * Get Restaurant by ID (full details for admin — includes inactive)
 * GET /api/admin/restaurants/:id
 */
export const getRestaurantById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return errorResponse(res, 400, "Restaurant ID is required");
    }

    const query = mongoose.Types.ObjectId.isValid(id) && id.length === 24
      ? { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { restaurantId: id }] }
      : { restaurantId: id };

    const restaurant = await Restaurant.findOne(query)
      .select("-password")
      .lean();

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    return successResponse(res, 200, "Restaurant retrieved successfully", {
      restaurant,
    });
  } catch (error) {
    logger.error(`Error fetching restaurant by ID: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant");
  }
});

/**
 * Update restaurant core details from admin panel
 * PUT /api/admin/restaurants/:id
 */
export const updateRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const {
      name,
      isActive,
      ownerName,
      ownerPhone,
      ownerEmail,
      cuisines,
      location,
      deliveryTimings,
      onboarding,
      menuImages,
    } = req.body || {};

    if (name !== undefined) {
      restaurant.name = name;
    }

    if (typeof isActive === "boolean") {
      restaurant.isActive = isActive;
    }

    if (ownerName !== undefined) restaurant.ownerName = ownerName;
    if (ownerPhone !== undefined) restaurant.ownerPhone = ownerPhone;
    if (ownerEmail !== undefined) restaurant.ownerEmail = ownerEmail;

    if (Array.isArray(cuisines)) {
      restaurant.cuisines = cuisines;
    }

    // Allow admin to update/clear menu images
    if (menuImages !== undefined) {
      restaurant.menuImages = Array.isArray(menuImages) ? menuImages : [];
      restaurant.markModified("menuImages");
    }

    if (location && typeof location === "object") {
      const existingLoc = restaurant.location?.toObject
        ? restaurant.location.toObject()
        : (restaurant.location || {});
      restaurant.location = {
        ...existingLoc,
        ...location,
      };

      if (
        restaurant.location.latitude &&
        restaurant.location.longitude &&
        !restaurant.location.coordinates
      ) {
        restaurant.location.coordinates = [
          restaurant.location.longitude,
          restaurant.location.latitude,
        ];
      }

      restaurant.markModified("location");
    }

    if (deliveryTimings && typeof deliveryTimings === "object") {
      const existingTimings = restaurant.deliveryTimings?.toObject
        ? restaurant.deliveryTimings.toObject()
        : (restaurant.deliveryTimings || {});
      restaurant.deliveryTimings = {
        ...existingTimings,
        ...deliveryTimings,
      };
      restaurant.markModified("deliveryTimings");
    }

    if (onboarding && typeof onboarding === "object") {
      const existingOnboarding = restaurant.onboarding?.toObject
        ? restaurant.onboarding.toObject()
        : (restaurant.onboarding || {});

      const updatedOnboarding = { ...existingOnboarding };

      Object.keys(onboarding).forEach((key) => {
        const value = onboarding[key];
        if (value !== undefined) {
          if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
          ) {
            const cleanSubObj = {};
            Object.keys(value).forEach((subKey) => {
              if (value[subKey] !== undefined) {
                cleanSubObj[subKey] = value[subKey];
              }
            });
            updatedOnboarding[key] = {
              ...(existingOnboarding[key] || {}),
              ...cleanSubObj,
            };
          } else {
            updatedOnboarding[key] = value;
          }
        }
      });

      restaurant.onboarding = updatedOnboarding;
      restaurant.markModified("onboarding");
    }

    await restaurant.save();

    // Emit socket event to notify all connected devices/tabs in real-time
    try {
      const serverModule = await import('../../../server.js');
      const io = serverModule.getIO ? serverModule.getIO() : null;
      if (io) {
        const restaurantNamespace = io.of('/restaurant');
        const rooms = [
          `restaurant:${restaurant._id.toString()}`,
          `restaurant:${restaurant.restaurantId}`
        ];
        
        const payload = {
          restaurantId: restaurant.restaurantId,
          restaurantMongoId: restaurant._id.toString(),
          isAcceptingOrders: restaurant.isAcceptingOrders,
          isActive: restaurant.isActive
        };
        
        rooms.forEach(room => {
          restaurantNamespace.to(room).emit('restaurant_status_update', payload);
        });
        console.log(`[Socket] Admin profile update broadcasted to ${rooms.join(', ')}: isActive=${restaurant.isActive}, isAcceptingOrders=${restaurant.isAcceptingOrders}`);
      }
    } catch (socketErr) {
      console.error('Error emitting status update from admin profile update:', socketErr);
    }

    logger.info("Restaurant updated from admin panel", {
      restaurantId: restaurant._id.toString(),
      updatedBy: req.user?._id,
    });

    return successResponse(res, 200, "Restaurant updated successfully", {
      restaurant,
    });
  } catch (error) {
    logger.error(`Error updating restaurant from admin: ${error.message}`, {
      error: error.stack,
    });
    try {
      import('fs').then(fs => {
        fs.appendFileSync('error_debug.txt', `\n\n--- ERROR AT ${new Date().toISOString()} ---\n${error.stack}\n`);
      });
    } catch (e) {}
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return errorResponse(res, 400, `Another restaurant already exists with this ${field}`);
    }
    return errorResponse(res, 500, error.message || "Failed to update restaurant");
  }
});

/**
 * Update Restaurant Status (Active/Inactive/Ban)
 * PUT /api/admin/restaurants/:id/status
 */
export const updateRestaurantStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return errorResponse(res, 400, "isActive must be a boolean value");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    restaurant.isActive = isActive;

    // Keep approval metadata consistent:
    // - Approved restaurants (shown in main list) are identified by approvedAt != null
    // - Join requests are unapproved (approvedAt null) and inactive
    // If an admin activates a restaurant via status toggle, ensure we stamp approval fields
    // so it doesn't disappear from both lists (isActive=true + approvedAt=null).
    if (isActive === true) {
      if (!restaurant.approvedAt) restaurant.approvedAt = new Date();
      if (!restaurant.approvedBy && req.user?._id) restaurant.approvedBy = req.user._id;
      // If it was previously rejected, keep rejectionReason as-is unless you want to clear it.
      // We intentionally do NOT clear rejectionReason here.
    }
    await restaurant.save();

    // Invalidate user-side restaurant discovery caches so status changes reflect immediately
    // - List caches: restaurants:*
    // - Details caches: restaurant:*
    await invalidateCachePattern("restaurants:*");
    await invalidateCachePattern("restaurant:*");

    // Emit socket event to notify all connected devices/tabs in real-time
    try {
      const serverModule = await import('../../../server.js');
      const io = serverModule.getIO ? serverModule.getIO() : null;
      if (io) {
        const restaurantNamespace = io.of('/restaurant');
        const rooms = [
          `restaurant:${restaurant._id.toString()}`,
          `restaurant:${restaurant.restaurantId}`
        ];
        
        const payload = {
          restaurantId: restaurant.restaurantId,
          restaurantMongoId: restaurant._id.toString(),
          isAcceptingOrders: restaurant.isAcceptingOrders,
          isActive: restaurant.isActive
        };
        
        rooms.forEach(room => {
          restaurantNamespace.to(room).emit('restaurant_status_update', payload);
        });
        console.log(`[Socket] Admin status update broadcasted to ${rooms.join(', ')}: isActive=${restaurant.isActive}`);
      }
    } catch (socketErr) {
      console.error('Error emitting status update from admin:', socketErr);
    }

    logger.info(`Restaurant status updated: ${id}`, {
      isActive,
      updatedBy: req.user._id,
    });

    return successResponse(res, 200, "Restaurant status updated successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error updating restaurant status: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update restaurant status");
  }
});

/**
 * Update Restaurant Location/Zone
 * PUT /api/admin/restaurants/:id/location
 */
export const updateRestaurantLocation = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { location } = req.body;

    if (!location) {
      return errorResponse(res, 400, "Location data is required");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Update location
    if (location.area !== undefined) {
      if (!restaurant.location) {
        restaurant.location = {};
      }
      restaurant.location.area = location.area;
    }

    if (location.city !== undefined) {
      if (!restaurant.location) {
        restaurant.location = {};
      }
      restaurant.location.city = location.city;
    }

    if (location.addressLine1 !== undefined) {
      if (!restaurant.location) {
        restaurant.location = {};
      }
      restaurant.location.addressLine1 = location.addressLine1;
    }

    if (location.addressLine2 !== undefined) {
      if (!restaurant.location) {
        restaurant.location = {};
      }
      restaurant.location.addressLine2 = location.addressLine2;
    }

    if (location.latitude !== undefined && location.longitude !== undefined) {
      if (!restaurant.location) {
        restaurant.location = {};
      }
      restaurant.location.latitude = location.latitude;
      restaurant.location.longitude = location.longitude;
      restaurant.location.coordinates = [location.longitude, location.latitude]; // GeoJSON format
    }

    if (location.formattedAddress !== undefined) {
      if (!restaurant.location) {
        restaurant.location = {};
      }
      restaurant.location.formattedAddress = location.formattedAddress;
    }

    restaurant.markModified('location');
    await restaurant.save();

    logger.info(`Restaurant location updated: ${id}`, {
      area: restaurant.location?.area,
      updatedBy: req.user._id,
    });

    return successResponse(res, 200, "Restaurant location updated successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        location: restaurant.location,
      },
    });
  } catch (error) {
    logger.error(`Error updating restaurant location: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update restaurant location");
  }
});

/**
 * Send Email to Restaurant Owner
 * POST /api/admin/restaurants/:id/send-email
 * Body: { subject: string, message: string }
 */
export const sendRestaurantEmail = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { subject, message } = req.body || {};

  if (!id) return errorResponse(res, 400, "Restaurant ID is required");
  if (!subject || typeof subject !== "string" || !subject.trim()) {
    return errorResponse(res, 400, "Subject is required");
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return errorResponse(res, 400, "Message is required");
  }

  const restaurant = await Restaurant.findById(id).select("-password").lean();
  if (!restaurant) return errorResponse(res, 404, "Restaurant not found");

  const isRealEmail = (email) => {
    if (!email || typeof email !== "string") return false;
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
    if (e.endsWith(".local")) return false;
    return true;
  };

  const candidates = [
    restaurant.onboarding?.step1?.ownerEmail,
    restaurant.ownerEmail,
    restaurant.email,
  ];

  let to = "";
  for (const c of candidates) {
    if (isRealEmail(c)) {
      to = c.trim();
      break;
    }
  }

  if (!to) {
    return errorResponse(
      res,
      400,
      "Email address not available for this restaurant",
    );
  }

  const safeSubject = subject.trim().slice(0, 200);
  const safeMessage = message.trim().slice(0, 10000);

  // Escape HTML special chars + keep line breaks
  const escaped = safeMessage
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <p>${escaped}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
      <p style="font-size: 12px; color: #6b7280;">
        Sent from Abhikaro Admin Panel
      </p>
    </div>
  `;

  const ok = await emailService.sendEmail({ to, subject: safeSubject, html });
  if (!ok) return errorResponse(res, 500, "Failed to send email");

  logger.info("Restaurant email sent", {
    restaurantId: id,
    to,
    subject: safeSubject,
    sentBy: req.user?._id,
  });

  return successResponse(res, 200, "Email sent successfully");
});

/**
 * Get Restaurant Join Requests
 * GET /api/admin/restaurants/requests
 * Query params: status (pending, rejected), page, limit, search
 */
export const getRestaurantJoinRequests = asyncHandler(async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 50, search } = req.query;

    // Build query
    let query = { isDeleted: { $ne: true } };

    // Status filter
    // Pending = all inactive restaurants without rejection reason (regardless of onboarding completion)
    // Rejected = restaurants that have rejectionReason
    if (status === "pending") {
      // Only show inactive, unapproved restaurants that have completed onboarding
      query.isActive = false;
      query.approvedAt = { $in: [null, undefined] };
      query["onboarding.completedSteps"] = 4;
      query.$or = [
        { rejectionReason: { $exists: false } },
        { rejectionReason: null },
      ];
    } else if (status === "rejected") {
      query["rejectionReason"] = { $exists: true, $ne: null };
      // Rejected join requests are also not approved
      query.approvedAt = { $in: [null, undefined] };
      // For rejected, also check if onboarding is complete
      query.$or = [
        { "onboarding.completedSteps": 4 },
        {
          $and: [
            { name: { $exists: true, $ne: null, $ne: "" } },
            { estimatedDeliveryTime: { $exists: true, $ne: null, $ne: "" } },
          ],
        },
      ];
    }

    // Search filter - combine with $and if search is provided
    if (search && search.trim()) {
      const searchConditions = {
        $or: [
          { name: { $regex: search.trim(), $options: "i" } },
          { "onboarding.step1.restaurantName": { $regex: search.trim(), $options: "i" } },
          { ownerName: { $regex: search.trim(), $options: "i" } },
          { "onboarding.step1.ownerName": { $regex: search.trim(), $options: "i" } },
          { ownerPhone: { $regex: search.trim(), $options: "i" } },
          { phone: { $regex: search.trim(), $options: "i" } },
          { email: { $regex: search.trim(), $options: "i" } },
        ],
      };

      // If query already has $and, add search to it; otherwise create new $and
      if (query.$and) {
        query.$and.push(searchConditions);
      } else {
        // Convert existing query conditions to $and format
        const baseConditions = { ...query };
        query = {
          $and: [baseConditions, searchConditions],
        };
      }
    }

    console.log(
      "🔍 Restaurant Join Requests Query:",
      JSON.stringify(query, null, 2),
    );

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch restaurants
    const restaurants = await Restaurant.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Debug: Log found restaurants with detailed info
    console.log(`📊 Found ${restaurants.length} restaurants matching query:`, {
      status,
      queryStructure: Object.keys(query).length,
      restaurantsFound: restaurants.length,
      sampleRestaurants: restaurants.slice(0, 5).map((r) => ({
        _id: r._id.toString().substring(0, 10) + "...",
        name: r.name,
        isActive: r.isActive,
        completedSteps: r.onboarding?.completedSteps,
        hasRejectionReason: !!r.rejectionReason,
        hasName: !!r.name,
        hasCuisines: !!r.cuisines && r.cuisines.length > 0,
        hasOpenDays: !!r.openDays && r.openDays.length > 0,
        hasEstimatedDeliveryTime: !!r.estimatedDeliveryTime,
        hasFeaturedDish: !!r.featuredDish,
      })),
    });

    // Get total count
    const total = await Restaurant.countDocuments(query);

    console.log(`📊 Total count: ${total} restaurants`);

    // Also log a sample of ALL inactive restaurants (for debugging)
    if (status === "pending" && restaurants.length === 0) {
      const allInactive = await Restaurant.find({
        isActive: false,
        isDeleted: { $ne: true },
        $or: [
          { rejectionReason: { $exists: false } },
          { rejectionReason: null },
        ],
      })
        .select(
          "name isActive onboarding.completedSteps cuisines openDays estimatedDeliveryTime featuredDish",
        )
        .limit(10)
        .lean();

      const totalInactive = await Restaurant.countDocuments({
        isActive: false,
        isDeleted: { $ne: true },
        $or: [
          { rejectionReason: { $exists: false } },
          { rejectionReason: null },
        ],
      });

      console.log(
        "⚠️ No restaurants found with query. Debugging inactive restaurants:",
        {
          totalInactive,
          queryUsed: JSON.stringify(query, null, 2),
          samples: allInactive.map((r) => ({
            _id: r._id.toString(),
            name: r.name,
            isActive: r.isActive,
            completedSteps: r.onboarding?.completedSteps,
            hasAllFields: {
              hasName: !!r.name && r.name !== "",
              hasCuisines:
                !!r.cuisines &&
                Array.isArray(r.cuisines) &&
                r.cuisines.length > 0,
              hasOpenDays:
                !!r.openDays &&
                Array.isArray(r.openDays) &&
                r.openDays.length > 0,
              hasEstimatedDeliveryTime:
                !!r.estimatedDeliveryTime && r.estimatedDeliveryTime !== "",
              hasFeaturedDish: !!r.featuredDish && r.featuredDish !== "",
            },
            fieldValues: {
              name: r.name || "MISSING",
              cuisinesCount: r.cuisines?.length || 0,
              openDaysCount: r.openDays?.length || 0,
              estimatedDeliveryTime: r.estimatedDeliveryTime || "MISSING",
              featuredDish: r.featuredDish || "MISSING",
            },
            shouldMatch:
              (!!r.name &&
                r.name !== "" &&
                !!r.cuisines &&
                Array.isArray(r.cuisines) &&
                r.cuisines.length > 0 &&
                !!r.openDays &&
                Array.isArray(r.openDays) &&
                r.openDays.length > 0 &&
                !!r.estimatedDeliveryTime &&
                r.estimatedDeliveryTime !== "" &&
                !!r.featuredDish &&
                r.featuredDish !== "") ||
              r.onboarding?.completedSteps === 4,
          })),
        },
      );
    }

    // Format response to match frontend expectations
    const formattedRequests = restaurants.map((restaurant, index) => {
      // Fix restaurant name: Prefer onboarding.step1.restaurantName if available
      const restaurantName = restaurant.onboarding?.step1?.restaurantName || restaurant.name || "N/A";
      
      // Get zone from location
      let zone = "All over the World";
      if (restaurant.location?.area) {
        zone = restaurant.location.area;
      } else if (restaurant.location?.city) {
        zone = restaurant.location.city;
      }

      // Get business model (could be from subscription or commission - defaulting for now)
      const businessModel = restaurant.businessModel || "Commission Base";

      // Get status
      const requestStatus = restaurant.rejectionReason ? "Rejected" : "Pending";

      return {
        _id: restaurant._id.toString(),
        sl: skip + index + 1,
        restaurantName: restaurantName,
        restaurantImage:
          restaurant.profileImage?.url ||
          restaurant.onboarding?.step2?.profileImageUrl?.url ||
          "https://via.placeholder.com/40",
        // Prefer onboarding owner name if available, fallback to legacy ownerName field
        ownerName: restaurant.onboarding?.step1?.ownerName || restaurant.ownerName || "N/A",
        ownerPhone: restaurant.ownerPhone || restaurant.phone || "N/A",
        zone: zone,
        businessModel: businessModel,
        status: requestStatus,
        rejectionReason: restaurant.rejectionReason || null,
        createdAt: restaurant.createdAt,
        // Include full data for view/details
        fullData: {
          ...restaurant,
          _id: restaurant._id.toString(),
        },
      };
    });

    return successResponse(
      res,
      200,
      "Restaurant join requests retrieved successfully",
      {
        requests: formattedRequests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    );
  } catch (error) {
    logger.error(`Error fetching restaurant join requests: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant join requests");
  }
});

/**
 * Approve Restaurant Join Request
 * POST /api/admin/restaurants/:id/approve
 */
export const approveRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    if (restaurant.isActive) {
      return errorResponse(res, 400, "Restaurant is already approved");
    }

    if (restaurant.rejectionReason) {
      return errorResponse(
        res,
        400,
        "Cannot approve a rejected restaurant. Please remove rejection reason first.",
      );
    }

    // Activate restaurant
    restaurant.isActive = true;
    restaurant.approvedAt = new Date();
    restaurant.approvedBy = adminId;
    restaurant.rejectionReason = undefined; // Clear any previous rejection

    await restaurant.save();

    logger.info(`Restaurant approved: ${id}`, {
      approvedBy: adminId,
      restaurantName: restaurant.name,
    });

    return successResponse(res, 200, "Restaurant approved successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive,
        approvedAt: restaurant.approvedAt,
      },
    });
  } catch (error) {
    logger.error(`Error approving restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to approve restaurant");
  }
});

/**
 * Update Restaurant Dining Settings
 * PUT /api/admin/restaurants/:id/dining-settings
 */
export const updateRestaurantDiningSettings = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { diningSettings } = req.body;

    if (!diningSettings) {
      return errorResponse(res, 400, "Dining settings are required");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Update dining settings
    restaurant.diningSettings = {
      ...restaurant.diningSettings,
      ...diningSettings,
    };

    // When admin enables dining, clear pending request so restaurant no longer sees "request pending"
    if (restaurant.diningSettings.isEnabled === true) {
      restaurant.diningSettings.requestStatus = "none";
      restaurant.diningSettings.lastDecisionAt = new Date();
    }

    await restaurant.save();

    logger.info(`Restaurant dining settings updated: ${id}`, {
      updatedBy: req.user._id,
      diningSettings: restaurant.diningSettings,
    });

    return successResponse(res, 200, "Dining settings updated successfully", {
      restaurant: {
        id: restaurant._id,
        diningSettings: restaurant.diningSettings,
      },
    });
  } catch (error) {
    logger.error(`Error updating dining settings: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update dining settings");
  }
});

/**
 * Reject Restaurant Join Request
 * POST /api/admin/restaurants/:id/reject
 */
export const rejectRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    // Validate reason is provided
    if (!reason || !reason.trim()) {
      return errorResponse(res, 400, "Rejection reason is required");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Set rejection details (allow updating if already rejected)
    restaurant.rejectionReason = reason.trim();
    restaurant.rejectedAt = new Date();
    restaurant.rejectedBy = adminId;
    restaurant.isActive = false; // Ensure it's inactive

    await restaurant.save();

    logger.info(`Restaurant rejected: ${id}`, {
      rejectedBy: adminId,
      reason: reason,
      restaurantName: restaurant.name,
    });

    return successResponse(res, 200, "Restaurant rejected successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        rejectionReason: restaurant.rejectionReason,
      },
    });
  } catch (error) {
    logger.error(`Error rejecting restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to reject restaurant");
  }
});

/**
 * Get Restaurant Menu (Admin)
 * GET /api/admin/restaurants/:id/menu
 */
export const getRestaurantMenu = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Validate restaurant exists
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Import Menu model
    const Menu = (await import("../../restaurant/models/Menu.js")).default;

    // Get menu for restaurant
    const menu = await Menu.findOne({ restaurant: id });

    if (!menu) {
      return successResponse(res, 200, "Menu retrieved successfully", {
        menu: { sections: [], isActive: true },
      });
    }

    return successResponse(res, 200, "Menu retrieved successfully", {
      menu: {
        sections: menu.sections || [],
        isActive: menu.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error fetching restaurant menu: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant menu");
  }
});

/**
 * Update Restaurant Menu (Admin)
 * PUT /api/admin/restaurants/:id/menu
 */
export const updateRestaurantMenu = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { sections } = req.body;
    const adminId = req.user._id;

    // Validate restaurant exists
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Import Menu model
    const Menu = (await import("../../restaurant/models/Menu.js")).default;

    // Get existing menu to preserve approval status
    const existingMenu = await Menu.findOne({ restaurant: id });

    // Normalize and validate sections (similar to restaurant menu update)
    const normalizedSections = Array.isArray(sections)
      ? sections.map((section, index) => {
          const existingSection = existingMenu?.sections?.find(
            (s) => s.id === section.id,
          );

          return {
            id: section.id || `section-${index}`,
            name: section.name || "Unnamed Section",
            items: Array.isArray(section.items)
              ? section.items.map((item) => {
                  const existingItem = existingSection?.items?.find(
                    (i) => String(i.id) === String(item.id),
                  );

                  return {
                    id: String(item.id || Date.now() + Math.random()),
                    name: item.name || "Unnamed Item",
                    nameArabic: item.nameArabic || "",
                    image: item.image || "",
                    category: item.category || section.name,
                    rating: item.rating ?? 0.0,
                    reviews: item.reviews ?? 0,
                    price: item.price || 0,
                    stock: item.stock || "Unlimited",
                    discount: item.discount || null,
                    originalPrice: item.originalPrice || null,
                    foodType: item.foodType || "Non-Veg",
                    availabilityTimeStart:
                      item.availabilityTimeStart || "12:01 AM",
                    availabilityTimeEnd: item.availabilityTimeEnd || "11:57 PM",
                    description: item.description || "",
                    discountType: item.discountType || "Percent",
                    discountAmount: item.discountAmount ?? 0.0,
                    isAvailable:
                      item.isAvailable !== undefined ? item.isAvailable : true,
                    isRecommended: item.isRecommended || false,
                    variations: Array.isArray(item.variations)
                      ? item.variations.map((v) => ({
                          id: String(v.id || Date.now() + Math.random()),
                          name: v.name || "",
                          price: v.price || 0,
                          stock: v.stock || "Unlimited",
                        }))
                      : [],
                    tags: Array.isArray(item.tags) ? item.tags : [],
                    nutrition: Array.isArray(item.nutrition)
                      ? item.nutrition
                      : [],
                    allergies: Array.isArray(item.allergies)
                      ? item.allergies
                      : [],
                    photoCount: item.photoCount ?? 1,
                    subCategory: item.subCategory || "",
                    servesInfo: item.servesInfo || "",
                    itemSize: item.itemSize || "",
                    itemSizeQuantity: item.itemSizeQuantity || "",
                    itemSizeUnit: item.itemSizeUnit || "piece",
                    gst: item.gst ?? 0,
                    preparationTime:
                      existingItem?.preparationTime ||
                      item.preparationTime ||
                      "",
                    images: Array.isArray(item.images)
                      ? item.images.filter(
                          (img) =>
                            img && typeof img === "string" && img.trim() !== "",
                        )
                      : item.image &&
                          typeof item.image === "string" &&
                          item.image.trim() !== ""
                        ? [item.image]
                        : [],
                    // Preserve approval status - admin can update but preserve existing status
                    approvalStatus:
                      existingItem?.approvalStatus ||
                      item.approvalStatus ||
                      "approved",
                    rejectionReason:
                      existingItem?.rejectionReason ||
                      item.rejectionReason ||
                      "",
                    requestedAt: existingItem?.requestedAt || item.requestedAt,
                    approvedAt:
                      existingItem?.approvedAt ||
                      item.approvedAt ||
                      (item.approvalStatus === "approved"
                        ? new Date()
                        : undefined),
                    approvedBy:
                      existingItem?.approvedBy || item.approvedBy || adminId,
                    rejectedAt: existingItem?.rejectedAt || item.rejectedAt,
                  };
                })
              : [],
            subsections: Array.isArray(section.subsections)
              ? section.subsections.map((subsection) => {
                  const existingSubsection = existingSection?.subsections?.find(
                    (s) => s.id === subsection.id,
                  );

                  return {
                    id: subsection.id || `subsection-${Date.now()}`,
                    name: subsection.name || "Unnamed Subsection",
                    items: Array.isArray(subsection.items)
                      ? subsection.items.map((item) => {
                          const existingItem = existingSubsection?.items?.find(
                            (i) => String(i.id) === String(item.id),
                          );

                          return {
                            id: String(item.id || Date.now() + Math.random()),
                            name: item.name || "Unnamed Item",
                            nameArabic: item.nameArabic || "",
                            image: item.image || "",
                            category: item.category || section.name,
                            rating: item.rating ?? 0.0,
                            reviews: item.reviews ?? 0,
                            price: item.price || 0,
                            stock: item.stock || "Unlimited",
                            discount: item.discount || null,
                            originalPrice: item.originalPrice || null,
                            foodType: item.foodType || "Non-Veg",
                            availabilityTimeStart:
                              item.availabilityTimeStart || "12:01 AM",
                            availabilityTimeEnd:
                              item.availabilityTimeEnd || "11:57 PM",
                            description: item.description || "",
                            discountType: item.discountType || "Percent",
                            discountAmount: item.discountAmount ?? 0.0,
                            isAvailable:
                              item.isAvailable !== undefined
                                ? item.isAvailable
                                : true,
                            isRecommended: item.isRecommended || false,
                            variations: Array.isArray(item.variations)
                              ? item.variations.map((v) => ({
                                  id: String(
                                    v.id || Date.now() + Math.random(),
                                  ),
                                  name: v.name || "",
                                  price: v.price || 0,
                                  stock: v.stock || "Unlimited",
                                }))
                              : [],
                            tags: Array.isArray(item.tags) ? item.tags : [],
                            nutrition: Array.isArray(item.nutrition)
                              ? item.nutrition
                              : [],
                            allergies: Array.isArray(item.allergies)
                              ? item.allergies
                              : [],
                            photoCount: item.photoCount ?? 1,
                            subCategory: item.subCategory || "",
                            servesInfo: item.servesInfo || "",
                            itemSize: item.itemSize || "",
                            itemSizeQuantity: item.itemSizeQuantity || "",
                            itemSizeUnit: item.itemSizeUnit || "piece",
                            gst: item.gst ?? 0,
                            preparationTime:
                              existingItem?.preparationTime ||
                              item.preparationTime ||
                              "",
                            images: Array.isArray(item.images)
                              ? item.images.filter(
                                  (img) =>
                                    img &&
                                    typeof img === "string" &&
                                    img.trim() !== "",
                                )
                              : item.image &&
                                  typeof item.image === "string" &&
                                  item.image.trim() !== ""
                                ? [item.image]
                                : [],
                            approvalStatus:
                              existingItem?.approvalStatus ||
                              item.approvalStatus ||
                              "approved",
                            rejectionReason:
                              existingItem?.rejectionReason ||
                              item.rejectionReason ||
                              "",
                            requestedAt:
                              existingItem?.requestedAt || item.requestedAt,
                            approvedAt:
                              existingItem?.approvedAt ||
                              item.approvedAt ||
                              (item.approvalStatus === "approved"
                                ? new Date()
                                : undefined),
                            approvedBy:
                              existingItem?.approvedBy ||
                              item.approvedBy ||
                              adminId,
                            rejectedAt:
                              existingItem?.rejectedAt || item.rejectedAt,
                          };
                        })
                      : [],
                  };
                })
              : [],
            isEnabled:
              section.isEnabled !== undefined ? section.isEnabled : true,
            order: section.order !== undefined ? section.order : index,
          };
        })
      : [];

    // Find or create menu
    let menu = await Menu.findOne({ restaurant: id });

    if (!menu) {
      menu = new Menu({
        restaurant: id,
        sections: normalizedSections,
        isActive: true,
      });
    } else {
      menu.set("sections", normalizedSections);
      menu.markModified("sections");
      menu.isNew = false;
    }

    await menu.save();

    logger.info(`Restaurant menu updated by admin: ${id}`, {
      updatedBy: adminId,
      restaurantName: restaurant.name,
      sectionsCount: normalizedSections.length,
    });

    return successResponse(res, 200, "Menu updated successfully", {
      menu: {
        sections: menu.sections,
        isActive: menu.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error updating restaurant menu: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update restaurant menu");
  }
});

/**
 * Delete a specific menu item's image (Admin)
 * DELETE /api/admin/restaurants/:id/menu/item/:itemId/image
 *
 * Clears image and images[] for the given item across all sections/subsections.
 */
export const deleteMenuItemImage = asyncHandler(async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const Menu = (await import("../../restaurant/models/Menu.js")).default;
    const menu = await Menu.findOne({ restaurant: id });
    if (!menu) {
      return errorResponse(res, 404, "Menu not found for this restaurant");
    }

    let found = false;

    const clearItemImage = (item) => {
      if (String(item.id) === String(itemId)) {
        item.image = "";
        item.images = [];
        found = true;
      }
    };

    for (const section of menu.sections || []) {
      (section.items || []).forEach(clearItemImage);
      for (const sub of section.subsections || []) {
        (sub.items || []).forEach(clearItemImage);
      }
    }

    if (!found) {
      return errorResponse(res, 404, "Menu item not found");
    }

    menu.markModified("sections");
    await menu.save();

    return successResponse(res, 200, "Menu item image removed successfully");
  } catch (error) {
    logger.error(`Error deleting menu item image: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, "Failed to delete menu item image");
  }
});

/**
 * Delete Restaurant Add-on (Admin)
 * DELETE /api/admin/restaurants/:id/menu/addon/:addonId
 *
 * Removes an addon from the restaurant's Menu.addons array.
 */
export const deleteRestaurantAddon = asyncHandler(async (req, res) => {
  try {
    const { id, addonId } = req.params;

    // Validate restaurant exists
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const Menu = (await import("../../restaurant/models/Menu.js")).default;
    const menu = await Menu.findOne({ restaurant: id });

    if (!menu) {
      return errorResponse(res, 404, "Menu not found");
    }

    if (!Array.isArray(menu.addons) || menu.addons.length === 0) {
      return errorResponse(res, 404, "Add-on not found");
    }

    const idx = menu.addons.findIndex((a) => String(a?.id) === String(addonId));
    if (idx === -1) {
      return errorResponse(res, 404, "Add-on not found");
    }

    menu.addons.splice(idx, 1);
    menu.markModified("addons");
    await menu.save();

    return successResponse(res, 200, "Add-on deleted successfully", {
      menu: {
        addons: menu.addons,
        isActive: menu.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error deleting restaurant add-on: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to delete add-on");
  }
});

/**
 * Reverify Restaurant (Resubmit for approval)
 * POST /api/admin/restaurants/:id/reverify
 */
export const reverifyRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Check if restaurant was rejected
    if (!restaurant.rejectionReason) {
      return errorResponse(
        res,
        400,
        "Restaurant is not rejected. Only rejected restaurants can be reverified.",
      );
    }

    // Clear rejection details and mark as pending again
    restaurant.rejectionReason = null;
    restaurant.rejectedAt = undefined;
    restaurant.rejectedBy = undefined;
    restaurant.isActive = false; // Keep inactive until approved

    await restaurant.save();

    logger.info(`Restaurant reverified: ${id}`, {
      reverifiedBy: adminId,
      restaurantName: restaurant.name,
    });

    return successResponse(
      res,
      200,
      "Restaurant reverified successfully. Waiting for admin approval.",
      {
        restaurant: {
          id: restaurant._id.toString(),
          name: restaurant.name,
          isActive: restaurant.isActive,
          rejectionReason: null,
        },
      },
    );
  } catch (error) {
    logger.error(`Error reverifying restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to reverify restaurant");
  }
});

/**
 * Create Restaurant by Admin
 * POST /api/admin/restaurants
 */
export const createRestaurant = asyncHandler(async (req, res) => {
  try {
    const adminId = req.user._id;
    const {
      // Step 1: Basic Info
      restaurantName,
      ownerName,
      ownerEmail,
      ownerPhone,
      primaryContactNumber,
      location,
      // Step 2: Images & Operational
      menuImages, // Array of image URLs or base64
      profileImage, // Image URL or base64
      cuisines,
      openingTime,
      closingTime,
      openDays,
      // Step 3: Documents
      panNumber,
      nameOnPan,
      panImage, // Image URL or base64
      gstRegistered,
      gstNumber,
      gstLegalName,
      gstAddress,
      gstImage, // Image URL or base64
      fssaiNumber,
      fssaiExpiry,
      fssaiImage, // Image URL or base64
      accountNumber,
      ifscCode,
      accountHolderName,
      accountType,
      // Step 4: Display Info
      estimatedDeliveryTime,
      featuredDish,
      featuredPrice,
      offer,
      // Authentication
      email,
      phone,
      password,
      signupMethod = "email",
    } = req.body;

    // Validation
    if (!restaurantName || !ownerName || !ownerEmail) {
      return errorResponse(
        res,
        400,
        "Restaurant name, owner name, and owner email are required",
      );
    }

    if (!email && !phone) {
      return errorResponse(res, 400, "Either email or phone is required");
    }

    // Normalize phone number(s) if provided
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
    if (phone && !normalizedPhone) {
      return errorResponse(res, 400, "Invalid phone number format");
    }
    const normalizedOwnerPhone = ownerPhone
      ? normalizePhoneNumber(ownerPhone) || normalizedPhone
      : normalizedPhone;
    const normalizedPrimaryContactNumber = primaryContactNumber
      ? normalizePhoneNumber(primaryContactNumber) || normalizedPhone
      : normalizedPhone;

    // If admin is setting any contact numbers, ensure they're not already used by another restaurant
    // across any of the restaurant contact fields.
    const candidateNumbers = [
      normalizedPhone,
      normalizedOwnerPhone,
      normalizedPrimaryContactNumber,
    ].filter(Boolean);

    if (candidateNumbers.length > 0) {
      const existingByNumber = await Restaurant.findOne({
        $or: [
          { phone: { $in: candidateNumbers } },
          { ownerPhone: { $in: candidateNumbers } },
          { primaryContactNumber: { $in: candidateNumbers } },
        ],
      }).select("_id phone ownerPhone primaryContactNumber");

      if (existingByNumber) {
        return errorResponse(
          res,
          409,
          "This phone/contact number is already used by another restaurant. Please use a different number.",
        );
      }
    }

    // Generate random password if email is provided but password is not
    let finalPassword = password;
    if (email && !password) {
      // Generate a random 12-character password
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
      finalPassword = Array.from(
        { length: 12 },
        () => chars[Math.floor(Math.random() * chars.length)],
      ).join("");
    }

    // Check if restaurant already exists with same email or phone
    const existingRestaurant = await Restaurant.findOne({
      $or: [
        ...(email ? [{ email: email.toLowerCase().trim() }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
      ],
    });

    if (existingRestaurant) {
      if (email && existingRestaurant.email === email.toLowerCase().trim()) {
        return errorResponse(
          res,
          400,
          "Restaurant with this email already exists",
        );
      }
      if (normalizedPhone && existingRestaurant.phone === normalizedPhone) {
        return errorResponse(
          res,
          400,
          "Restaurant with this phone number already exists. Please use a different phone number.",
        );
      }
    }

    // Initialize Cloudinary
    await initializeCloudinary();

    // Upload images if provided as base64 or files
    let profileImageData = null;
    if (profileImage) {
      if (
        typeof profileImage === "string" &&
        profileImage.startsWith("data:")
      ) {
        // Base64 image - convert to buffer and upload
        const base64Data = profileImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "restaurant/profile",
          resource_type: "image",
        });
        profileImageData = {
          url: result.secure_url,
          publicId: result.public_id,
        };
      } else if (
        typeof profileImage === "string" &&
        profileImage.startsWith("http")
      ) {
        // Already a URL
        profileImageData = { url: profileImage };
      } else if (profileImage.url) {
        // Already an object with url
        profileImageData = profileImage;
      }
    }

    let menuImagesData = [];
    if (menuImages && Array.isArray(menuImages) && menuImages.length > 0) {
      for (const img of menuImages) {
        if (typeof img === "string" && img.startsWith("data:")) {
          const base64Data = img.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const result = await uploadToCloudinary(buffer, {
            folder: "restaurant/menu",
            resource_type: "image",
          });
          menuImagesData.push({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } else if (typeof img === "string" && img.startsWith("http")) {
          menuImagesData.push({ url: img });
        } else if (img.url) {
          menuImagesData.push(img);
        }
      }
    }

    // Upload document images
    let panImageData = null;
    if (panImage) {
      if (typeof panImage === "string" && panImage.startsWith("data:")) {
        const base64Data = panImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "restaurant/pan",
          resource_type: "image",
        });
        panImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (typeof panImage === "string" && panImage.startsWith("http")) {
        panImageData = { url: panImage };
      } else if (panImage.url) {
        panImageData = panImage;
      }
    }

    let gstImageData = null;
    if (gstRegistered && gstImage) {
      if (typeof gstImage === "string" && gstImage.startsWith("data:")) {
        const base64Data = gstImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "restaurant/gst",
          resource_type: "image",
        });
        gstImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (typeof gstImage === "string" && gstImage.startsWith("http")) {
        gstImageData = { url: gstImage };
      } else if (gstImage.url) {
        gstImageData = gstImage;
      }
    }

    let fssaiImageData = null;
    if (fssaiImage) {
      if (typeof fssaiImage === "string" && fssaiImage.startsWith("data:")) {
        const base64Data = fssaiImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "restaurant/fssai",
          resource_type: "image",
        });
        fssaiImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (
        typeof fssaiImage === "string" &&
        fssaiImage.startsWith("http")
      ) {
        fssaiImageData = { url: fssaiImage };
      } else if (fssaiImage.url) {
        fssaiImageData = fssaiImage;
      }
    }

    // Create restaurant data
    const restaurantData = {
      name: restaurantName,
      ownerName,
      ownerEmail,
      ownerPhone: normalizedOwnerPhone,
      primaryContactNumber: normalizedPrimaryContactNumber,
      location: location || {},
      profileImage: profileImageData,
      menuImages: menuImagesData,
      cuisines: cuisines || [],
      deliveryTimings: {
        openingTime: openingTime || "09:00",
        closingTime: closingTime || "22:00",
      },
      openDays: openDays || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      estimatedDeliveryTime: estimatedDeliveryTime || "25-30 mins",
      featuredDish: featuredDish || "",
      featuredPrice: featuredPrice || 249,
      offer: offer || "",
      signupMethod,
      // Admin created restaurants are active by default
      isActive: true,
      isAcceptingOrders: true,
      approvedAt: new Date(),
      approvedBy: adminId,
    };

    // Add authentication fields
    if (email) {
      restaurantData.email = email.toLowerCase().trim();
      restaurantData.password = finalPassword; // Will be hashed by pre-save hook
    }
    if (normalizedPhone) {
      restaurantData.phone = normalizedPhone;
      restaurantData.phoneVerified = true; // Admin created, so verified
    }

    // Add onboarding data
    restaurantData.onboarding = {
      step1: {
        restaurantName,
        ownerName,
        ownerEmail,
        ownerPhone: normalizedOwnerPhone,
        primaryContactNumber: normalizedPrimaryContactNumber,
        location: location || {},
      },
      step2: {
        menuImageUrls: menuImagesData,
        profileImageUrl: profileImageData,
        cuisines: cuisines || [],
        deliveryTimings: {
          openingTime: openingTime || "09:00",
          closingTime: closingTime || "22:00",
        },
        openDays: openDays || [],
      },
      step3: {
        pan: {
          panNumber: panNumber || "",
          nameOnPan: nameOnPan || "",
          image: panImageData,
        },
        gst: {
          isRegistered: gstRegistered || false,
          gstNumber: gstNumber || "",
          legalName: gstLegalName || "",
          address: gstAddress || "",
          image: gstImageData,
        },
        fssai: {
          registrationNumber: fssaiNumber || "",
          expiryDate: fssaiExpiry || null,
          image: fssaiImageData,
        },
        bank: {
          accountNumber: accountNumber || "",
          ifscCode: ifscCode || "",
          accountHolderName: accountHolderName || "",
          accountType: accountType || "",
        },
      },
      step4: {
        estimatedDeliveryTime: estimatedDeliveryTime || "25-30 mins",
        featuredDish: featuredDish || "",
        featuredPrice: featuredPrice || 249,
        offer: offer || "",
      },
      completedSteps: 4,
    };

    // Create restaurant
    const restaurant = await Restaurant.create(restaurantData);

    logger.info(`Restaurant created by admin: ${restaurant._id}`, {
      createdBy: adminId,
      restaurantName: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone,
    });

    // Prepare response data
    const responseData = {
      restaurant: {
        id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        name: restaurant.name,
        email: restaurant.email,
        phone: restaurant.phone,
        isActive: restaurant.isActive,
        slug: restaurant.slug,
      },
    };

    // Include generated password in response if email was provided and password was auto-generated
    // This allows admin to share the password with the restaurant
    if (email && !password && finalPassword) {
      responseData.generatedPassword = finalPassword;
      responseData.message =
        "Restaurant created successfully. Please share the generated password with the restaurant.";
    }

    return successResponse(
      res,
      201,
      "Restaurant created successfully",
      responseData,
    );
  } catch (error) {
    logger.error(`Error creating restaurant: ${error.message}`, {
      error: error.stack,
    });

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return errorResponse(
        res,
        400,
        `Restaurant with this ${field} already exists`,
      );
    }

    return errorResponse(
      res,
      500,
      `Failed to create restaurant: ${error.message}`,
    );
  }
});

/**
 * Delete Restaurant
 * DELETE /api/admin/restaurants/:id
 */
export const deleteRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { code } = req.query;
    const adminId = req.user._id;

    if (code !== "741474") {
      return errorResponse(res, 400, "Invalid confirmation code");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Soft delete restaurant
    restaurant.isDeleted = true;
    restaurant.isActive = false;
    await restaurant.save();

    // Delete related restaurant data (but preserve hotel and order data)
    try {
      const Menu = (await import("../../restaurant/models/Menu.js")).default;
      const Inventory = (await import("../../restaurant/models/Inventory.js")).default;
      const MenuItemSchedule = (await import("../../restaurant/models/MenuItemSchedule.js")).default;
      const Offer = (await import("../../restaurant/models/Offer.js")).default;
      const OutletTimings = (await import("../../restaurant/models/OutletTimings.js")).default;
      const RestaurantWallet = (await import("../../restaurant/models/RestaurantWallet.js")).default;
      const StaffManagement = (await import("../../restaurant/models/StaffManagement.js")).default;
      const RestaurantDiningOffer = (await import("../../restaurant/models/RestaurantDiningOffer.js")).default;

      await Promise.all([
        Menu.deleteMany({ restaurant: id }),
        Inventory.deleteMany({ restaurant: id }),
        MenuItemSchedule.deleteMany({ restaurant: id }),
        Offer.deleteMany({ restaurant: id }),
        OutletTimings.deleteMany({ restaurant: id }),
        RestaurantWallet.deleteMany({ restaurant: id }),
        StaffManagement.deleteMany({ restaurant: id }),
        RestaurantDiningOffer.deleteMany({ restaurantId: id }),
      ]);

      logger.info(`Related data deleted for restaurant: ${id}`);
    } catch (err) {
      logger.error(`Error deleting related data for restaurant ${id}: ${err.message}`);
    }

    logger.info(`Restaurant soft deleted: ${id}`, {
      deletedBy: adminId,
      restaurantName: restaurant.name,
    });

    return successResponse(res, 200, "Restaurant deleted successfully", {
      restaurant: {
        id: id,
        name: restaurant.name,
      },
    });
  } catch (error) {
    logger.error(`Error deleting restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to delete restaurant");
  }
});

/**
 * Get All Offers with Restaurant and Dish Details
 * GET /api/admin/offers
 * Query params: page, limit, search, status, restaurantId
 */
export const getAllOffers = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, restaurantId } = req.query;

    // Build query
    const query = {};

    if (status) {
      query.status = status;
    }

    if (restaurantId) {
      query.restaurant = restaurantId;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch offers with restaurant details
    const offers = await Offer.find(query)
      .populate("restaurant", "name restaurantId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Offer.countDocuments(query);

    // Flatten offers to show each item separately
    const offerItems = [];
    offers.forEach((offer, offerIndex) => {
      if (offer.items && offer.items.length > 0) {
        offer.items.forEach((item, itemIndex) => {
          // Apply search filter if provided
          if (search) {
            const searchLower = search.toLowerCase();
            const matchesSearch =
              offer.restaurant?.name?.toLowerCase().includes(searchLower) ||
              item.itemName?.toLowerCase().includes(searchLower) ||
              item.couponCode?.toLowerCase().includes(searchLower);

            if (!matchesSearch) {
              return; // Skip this item if it doesn't match search
            }
          }

          offerItems.push({
            sl: skip + offerItems.length + 1,
            offerId: offer._id.toString(),
            restaurantName: offer.restaurant?.name || "Unknown Restaurant",
            restaurantId:
              offer.restaurant?.restaurantId ||
              offer.restaurant?._id?.toString() ||
              "N/A",
            dishName: item.itemName || "Unknown Dish",
            dishId: item.itemId || "N/A",
            couponCode: item.couponCode || "N/A",
            discountType: offer.discountType || "percentage",
            discountPercentage: item.discountPercentage || 0,
            originalPrice: item.originalPrice || 0,
            discountedPrice: item.discountedPrice || 0,
            status: offer.status || "active",
            startDate: offer.startDate || null,
            endDate: offer.endDate || null,
            createdAt: offer.createdAt || new Date(),
          });
        });
      }
    });

    // If search was applied, we need to recalculate total
    let filteredTotal = offerItems.length;
    if (!search) {
      // Count all items across all offers
      const allOffers = await Offer.find(query).lean();
      filteredTotal = allOffers.reduce(
        (sum, offer) => sum + (offer.items?.length || 0),
        0,
      );
    }

    return successResponse(res, 200, "Offers retrieved successfully", {
      offers: offerItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredTotal,
        pages: Math.ceil(filteredTotal / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error fetching offers: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch offers");
  }
});

/**
 * Get Restaurant Analytics for POS
 * GET /api/admin/restaurant-analytics/:restaurantId
 */
export const getRestaurantAnalytics = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;

    logger.info(`Fetching restaurant analytics for: ${restaurantId}`);

    if (!restaurantId) {
      return errorResponse(res, 400, "Restaurant ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      logger.warn(`Invalid restaurant ID format: ${restaurantId}`);
      return errorResponse(res, 400, "Invalid restaurant ID format");
    }

    // Get restaurant details
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      logger.warn(`Restaurant not found: ${restaurantId}`);
      return errorResponse(res, 404, "Restaurant not found");
    }

    logger.info(
      `Restaurant found: ${restaurant.name} (${restaurant.restaurantId})`,
    );

    // Calculate date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    // Get order statistics - restaurantId can be _id or restaurantId field (both as String in Order model)
    // Match by both restaurant._id and restaurant.restaurantId
    const restaurantIdString = restaurantId.toString();
    const restaurantIdField = restaurant?.restaurantId || restaurantIdString;
    const restaurantObjectIdString = restaurant._id.toString();

    logger.info(`📊 Fetching order statistics for restaurant:`, {
      restaurantId: restaurantId,
      restaurantIdString: restaurantIdString,
      restaurantIdField: restaurantIdField,
      restaurantObjectIdString: restaurantObjectIdString,
      restaurantName: restaurant.name,
    });

    // Build query to match restaurantId in multiple formats
    const orderMatchQuery = {
      $or: [
        { restaurantId: restaurantIdString },
        { restaurantId: restaurantIdField },
        { restaurantId: restaurantObjectIdString },
      ],
    };

    logger.info(`🔍 Order query:`, orderMatchQuery);

    const orderStats = await Order.aggregate([
      {
        $match: orderMatchQuery,
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "delivered"] },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    logger.info(`📊 Order stats found:`, orderStats);

    const orderStatusMap = {};
    let totalRevenue = 0;
    orderStats.forEach((stat) => {
      orderStatusMap[stat._id] = stat.count;
      if (stat._id === "delivered") {
        totalRevenue += stat.totalRevenue || 0;
      }
    });

    const totalOrders =
      (orderStatusMap.delivered || 0) +
      (orderStatusMap.cancelled || 0) +
      (orderStatusMap.pending || 0) +
      (orderStatusMap.confirmed || 0) +
      (orderStatusMap.preparing || 0) +
      (orderStatusMap.ready || 0) +
      (orderStatusMap.out_for_delivery || 0);
    const completedOrders = orderStatusMap.delivered || 0;
    const cancelledOrders = orderStatusMap.cancelled || 0;

    logger.info(`📊 Calculated order statistics:`, {
      totalOrders,
      completedOrders,
      cancelledOrders,
      orderStatusMap,
    });

    // Get monthly orders and revenue
    const monthlyStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField },
          ],
          status: "delivered",
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]);

    const monthlyOrders = monthlyStats[0]?.count || 0;
    const monthlyRevenue = monthlyStats[0]?.revenue || 0;

    // Get yearly orders and revenue
    const yearlyStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField },
          ],
          status: "delivered",
          createdAt: { $gte: startOfYear },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]);

    const yearlyOrders = yearlyStats[0]?.count || 0;
    const yearlyRevenue = yearlyStats[0]?.revenue || 0;

    // Get commission and earnings data from OrderSettlement (more accurate)
    // Match settlements by restaurantId (ObjectId in OrderSettlement)
    const restaurantIdForSettlement =
      restaurant._id instanceof mongoose.Types.ObjectId
        ? restaurant._id
        : new mongoose.Types.ObjectId(restaurant._id);

    // Get all settlements for this restaurant
    const allSettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
    }).lean();

    // Calculate totals from settlements
    let totalCommission = 0;
    let totalRestaurantEarning = 0;
    let totalFoodPrice = 0;
    let totalRevenueFromSettlements = 0;

    allSettlements.forEach((s) => {
      totalCommission += s.restaurantEarning?.commission || 0;
      totalRestaurantEarning += s.restaurantEarning?.netEarning || 0;
      totalFoodPrice += s.restaurantEarning?.foodPrice || 0;
      // Total revenue = commission + restaurant earning (net earning)
      // This ensures revenue matches the actual settled amounts
      totalRevenueFromSettlements += (s.restaurantEarning?.commission || 0) + (s.restaurantEarning?.netEarning || 0);
    });

    totalCommission = Math.round(totalCommission * 100) / 100;
    totalRestaurantEarning = Math.round(totalRestaurantEarning * 100) / 100;
    totalFoodPrice = Math.round(totalFoodPrice * 100) / 100;
    totalRevenueFromSettlements = Math.round(totalRevenueFromSettlements * 100) / 100;
    
    // Use revenue from settlements if available, otherwise use revenue from orders
    // This ensures consistency: Revenue = Commission + Restaurant Earning
    const finalTotalRevenue = totalRevenueFromSettlements > 0 ? totalRevenueFromSettlements : totalRevenue;

    // Get monthly settlements
    const monthlySettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: startOfMonth },
    }).lean();

    let monthlyCommission = 0;
    let monthlyRestaurantEarning = 0;
    monthlySettlements.forEach((s) => {
      monthlyCommission += s.restaurantEarning?.commission || 0;
      monthlyRestaurantEarning += s.restaurantEarning?.netEarning || 0;
    });

    monthlyCommission = Math.round(monthlyCommission * 100) / 100;
    monthlyRestaurantEarning = Math.round(monthlyRestaurantEarning * 100) / 100;
    const monthlyProfit = monthlyRestaurantEarning; // Restaurant profit = net earning

    // Get yearly settlements
    const yearlySettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: startOfYear },
    }).lean();

    let yearlyCommission = 0;
    let yearlyRestaurantEarning = 0;
    yearlySettlements.forEach((s) => {
      yearlyCommission += s.restaurantEarning?.commission || 0;
      yearlyRestaurantEarning += s.restaurantEarning?.netEarning || 0;
    });

    yearlyCommission = Math.round(yearlyCommission * 100) / 100;
    yearlyRestaurantEarning = Math.round(yearlyRestaurantEarning * 100) / 100;
    const yearlyProfit = yearlyRestaurantEarning; // Restaurant profit = net earning

    // Get average monthly profit (last 12 months)
    const last12MonthsStart = new Date(
      now.getFullYear(),
      now.getMonth() - 12,
      1,
    );
    const last12MonthsSettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: last12MonthsStart },
    }).lean();

    // Group by month
    const monthlyEarningsMap = new Map();
    last12MonthsSettlements.forEach((s) => {
      const monthKey = `${new Date(s.createdAt).getFullYear()}-${new Date(s.createdAt).getMonth()}`;
      const current = monthlyEarningsMap.get(monthKey) || 0;
      monthlyEarningsMap.set(
        monthKey,
        current + (s.restaurantEarning?.netEarning || 0),
      );
    });

    const avgMonthlyProfit =
      monthlyEarningsMap.size > 0
        ? Array.from(monthlyEarningsMap.values()).reduce(
            (sum, val) => sum + val,
            0,
          ) / monthlyEarningsMap.size
        : 0;

    // Get commission percentage from RestaurantCommission
    const RestaurantCommission = (
      await import("../models/RestaurantCommission.js")
    ).default;

    // Use restaurant._id directly - ensure it's an ObjectId
    const restaurantIdForQuery =
      restaurant._id instanceof mongoose.Types.ObjectId
        ? restaurant._id
        : new mongoose.Types.ObjectId(restaurant._id);

    logger.info(`🔍 Looking for commission config:`, {
      restaurantId: restaurantId,
      restaurantObjectId: restaurantIdForQuery.toString(),
      restaurantName: restaurant.name,
      restaurantIdString: restaurant.restaurantId,
    });

    // Try using the static method first
    let commissionConfig =
      await RestaurantCommission.getCommissionForRestaurant(
        restaurantIdForQuery,
      );

    if (commissionConfig) {
      // Convert to plain object if needed
      commissionConfig = commissionConfig.toObject
        ? commissionConfig.toObject()
        : commissionConfig;
      logger.info(`✅ Found commission using static method`);
    }

    // If not found, try direct query
    if (!commissionConfig) {
      logger.info(
        `⚠️ Static method didn't find commission, trying direct query`,
      );
      commissionConfig = await RestaurantCommission.findOne({
        restaurant: restaurantIdForQuery,
        status: true,
      });

      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject
          ? commissionConfig.toObject()
          : commissionConfig;
      }
    }

    // If still not found, try without status filter
    if (!commissionConfig) {
      logger.info(`⚠️ Trying without status filter`);
      commissionConfig = await RestaurantCommission.findOne({
        restaurant: restaurantIdForQuery,
      });

      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject
          ? commissionConfig.toObject()
          : commissionConfig;
      }
    }

    // Also try by restaurantId string field
    if (!commissionConfig && restaurant?.restaurantId) {
      logger.info(
        `🔄 Trying by restaurantId string: ${restaurant.restaurantId}`,
      );
      commissionConfig = await RestaurantCommission.findOne({
        restaurantId: restaurant.restaurantId,
      });

      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject
          ? commissionConfig.toObject()
          : commissionConfig;
      }
    }

    // Final debug: List all commissions to see what's in DB
    if (!commissionConfig) {
      const allCommissions = await RestaurantCommission.find({}).lean();
      logger.warn(
        `❌ No commission found. Total commissions in DB: ${allCommissions.length}`,
      );
      logger.info(
        `📋 All commissions:`,
        allCommissions.map((c) => ({
          _id: c._id,
          restaurant: c.restaurant?.toString
            ? c.restaurant.toString()
            : String(c.restaurant),
          restaurantId: c.restaurantId,
          restaurantName: c.restaurantName,
          status: c.status,
          defaultCommission: c.defaultCommission,
        })),
      );

      // Check if restaurant ObjectId matches any commission
      const matching = allCommissions.filter((c) => {
        const cRestaurantId = c.restaurant?.toString
          ? c.restaurant.toString()
          : String(c.restaurant);
        return cRestaurantId === restaurantIdForQuery.toString();
      });
      logger.info(`🔍 Matching commissions: ${matching.length}`, matching);
    }

    let commissionPercentage = 0;
    if (commissionConfig) {
      logger.info(`✅ Commission config found for restaurant ${restaurantId}`);
      logger.info(`Commission config details:`, {
        _id: commissionConfig._id,
        restaurant: commissionConfig.restaurant?.toString
          ? commissionConfig.restaurant.toString()
          : String(commissionConfig.restaurant),
        restaurantId: commissionConfig.restaurantId,
        restaurantName: commissionConfig.restaurantName,
        status: commissionConfig.status,
        hasDefaultCommission: !!commissionConfig.defaultCommission,
        defaultCommissionType: commissionConfig.defaultCommission?.type,
        defaultCommissionValue: commissionConfig.defaultCommission?.value,
      });

      if (commissionConfig.defaultCommission) {
        // Get default commission value - if type is percentage, show the percentage value
        logger.info(`📊 Processing defaultCommission:`, {
          type: commissionConfig.defaultCommission.type,
          value: commissionConfig.defaultCommission.value,
          valueType: typeof commissionConfig.defaultCommission.value,
        });

        if (commissionConfig.defaultCommission.type === "percentage") {
          const rawValue = commissionConfig.defaultCommission.value;
          commissionPercentage =
            typeof rawValue === "number" ? rawValue : parseFloat(rawValue) || 0;
          logger.info(
            `✅ Found commission percentage: ${commissionPercentage}% for restaurant ${restaurantId} (raw value: ${rawValue})`,
          );
        } else if (commissionConfig.defaultCommission.type === "amount") {
          // For amount type, we can't show a percentage, so keep it as 0
          commissionPercentage = 0;
          logger.info(
            `⚠️ Commission type is 'amount', not 'percentage' for restaurant ${restaurantId}`,
          );
        }
      } else {
        logger.warn(
          `⚠️ Commission config found but no defaultCommission for restaurant ${restaurantId}`,
        );
      }
    } else {
      logger.warn(
        `❌ No commission config found for restaurant ${restaurantId} (restaurant._id: ${restaurantIdForQuery.toString()})`,
      );
      logger.warn(
        `⚠️ This restaurant may not have a commission configuration set up.`,
      );
      logger.warn(
        `💡 To set up commission, go to Restaurant Commission page and add commission for this restaurant.`,
      );
    }

    // Log the final commission percentage being returned
    logger.info(
      `📊 Final commission percentage being returned: ${commissionPercentage}%`,
    );
    logger.info(
      `📤 Sending response with commissionPercentage: ${commissionPercentage}`,
    );

    // Get ratings from FeedbackExperience (restaurantId is ObjectId in FeedbackExperience)
    const FeedbackExperience = (await import("../models/FeedbackExperience.js"))
      .default;

    const restaurantIdForRating =
      restaurant._id instanceof mongoose.Types.ObjectId
        ? restaurant._id
        : new mongoose.Types.ObjectId(restaurant._id);

    logger.info(`⭐ Fetching ratings for restaurant:`, {
      restaurantId: restaurantId,
      restaurantObjectId: restaurantIdForRating.toString(),
    });

    const ratingStats = await FeedbackExperience.aggregate([
      {
        $match: {
          restaurantId: restaurantIdForRating,
          rating: { $exists: true, $ne: null, $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    logger.info(`⭐ Rating stats found:`, ratingStats);

    const averageRating = ratingStats[0]?.averageRating || 0;
    const totalRatings = ratingStats[0]?.totalRatings || 0;

    logger.info(`⭐ Calculated ratings:`, {
      averageRating,
      totalRatings,
    });

    // Get unique customers
    const customerStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField },
          ],
          status: "delivered",
        },
      },
      {
        $group: {
          _id: "$userId",
          orderCount: { $sum: 1 },
        },
      },
    ]);

    const totalCustomers = customerStats.length;
    const repeatCustomers = customerStats.filter(
      (c) => c.orderCount > 1,
    ).length;

    // Calculate average order value
    // Use finalTotalRevenue (from settlements) for consistency
    const averageOrderValue =
      completedOrders > 0 ? finalTotalRevenue / completedOrders : 0;

    // Calculate rates
    const cancellationRate =
      totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;
    const completionRate =
      totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

    // Calculate average yearly profit (if restaurant has been active for multiple years)
    const restaurantCreatedAt = restaurant.createdAt || new Date();
    const yearsActive = Math.max(
      1,
      (now - restaurantCreatedAt) / (365 * 24 * 60 * 60 * 1000),
    );
    const averageYearlyProfit =
      yearsActive > 0
        ? yearlyRestaurantEarning / yearsActive
        : yearlyRestaurantEarning;

    return successResponse(
      res,
      200,
      "Restaurant analytics retrieved successfully",
      {
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          restaurantId: restaurant.restaurantId,
          isActive: restaurant.isActive,
          createdAt: restaurant.createdAt,
        },
        analytics: {
          totalOrders: Number(totalOrders) || 0,
          cancelledOrders: Number(cancelledOrders) || 0,
          completedOrders: Number(completedOrders) || 0,
          averageRating: averageRating
            ? parseFloat(averageRating.toFixed(1))
            : 0,
          totalRatings: Number(totalRatings) || 0,
          commissionPercentage: Number(commissionPercentage) || 0,
          monthlyProfit: parseFloat(monthlyRestaurantEarning.toFixed(2)),
          yearlyProfit: parseFloat(yearlyRestaurantEarning.toFixed(2)),
          averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
          totalRevenue: parseFloat(finalTotalRevenue.toFixed(2)),
          totalCommission: parseFloat(totalCommission.toFixed(2)),
          restaurantEarning: parseFloat(totalRestaurantEarning.toFixed(2)),
          monthlyOrders,
          yearlyOrders,
          averageMonthlyProfit: parseFloat(avgMonthlyProfit.toFixed(2)),
          averageYearlyProfit: parseFloat(averageYearlyProfit.toFixed(2)),
          status: restaurant.isActive ? "active" : "inactive",
          joinDate: restaurant.createdAt,
          totalCustomers,
          repeatCustomers,
          cancellationRate: parseFloat(cancellationRate.toFixed(2)),
          completionRate: parseFloat(completionRate.toFixed(2)),
        },
      },
    );
  } catch (error) {
    logger.error(`Error fetching restaurant analytics: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant analytics");
  }
});

/**
 * Get Customer Wallet Report
 * GET /api/admin/customer-wallet-report
 * Query params: fromDate, toDate, all (Credit/Debit), customer, search
 */
export const getCustomerWalletReport = asyncHandler(async (req, res) => {
  try {
    console.log("🔍 Fetching customer wallet report...");
    const { fromDate, toDate, all, customer, search } = req.query;

    console.log("📋 Query params:", {
      fromDate,
      toDate,
      all,
      customer,
      search,
    });

    const UserWallet = (await import("../../user/models/UserWallet.js"))
      .default;
    const User = (await import("../../auth/models/User.js")).default;

    // Build date filter
    let dateFilter = {};
    if (fromDate || toDate) {
      dateFilter["transactions.createdAt"] = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        dateFilter["transactions.createdAt"].$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        dateFilter["transactions.createdAt"].$lte = endDate;
      }
    }

    // Get all wallets with transactions
    const wallets = await UserWallet.find({
      ...dateFilter,
      "transactions.0": { $exists: true }, // Only wallets with transactions
    })
      .populate("userId", "name email phone")
      .lean();

    // Flatten transactions with user info
    let allTransactions = [];
    wallets.forEach((wallet) => {
      if (!wallet.userId) return;

      // Sort transactions by date (oldest first for balance calculation)
      const sortedTransactions = [...wallet.transactions].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );

      let runningBalance = 0;

      sortedTransactions.forEach((transaction) => {
        // Update running balance if transaction is completed (before date filter)
        let balance = runningBalance;
        if (transaction.status === "Completed") {
          if (
            transaction.type === "addition" ||
            transaction.type === "refund"
          ) {
            runningBalance += transaction.amount;
            balance = runningBalance;
          } else if (transaction.type === "deduction") {
            runningBalance -= transaction.amount;
            balance = runningBalance;
          }
        }

        // Apply date filter if provided
        if (fromDate || toDate) {
          const transDate = new Date(transaction.createdAt);
          if (fromDate && transDate < new Date(fromDate)) return;
          if (toDate) {
            const toDateObj = new Date(toDate);
            toDateObj.setHours(23, 59, 59, 999);
            if (transDate > toDateObj) return;
          }
        }

        // Map transaction type to frontend format
        let transactionType = "CashBack";
        if (transaction.type === "addition") {
          if (
            transaction.description?.includes("Admin") ||
            transaction.description?.includes("admin")
          ) {
            transactionType = "Add Fund By Admin";
          } else {
            transactionType = "Add Fund";
          }
        } else if (transaction.type === "deduction") {
          transactionType = "Order Payment";
        } else if (transaction.type === "refund") {
          transactionType = "Refund";
        }

        // Get reference
        let reference = "N/A";
        if (transaction.orderId) {
          reference = transaction.orderId.toString();
        } else if (transaction.paymentGateway) {
          reference = transaction.paymentGateway;
        } else if (transaction.description) {
          reference = transaction.description;
        }

        allTransactions.push({
          _id: transaction._id,
          transactionId: transaction._id.toString(),
          customer: wallet.userId.name || "Unknown",
          customerId: wallet.userId._id.toString(),
          credit:
            transaction.type === "addition" || transaction.type === "refund"
              ? transaction.amount
              : 0,
          debit: transaction.type === "deduction" ? transaction.amount : 0,
          balance: balance,
          transactionType: transactionType,
          reference: reference,
          createdAt: transaction.createdAt,
          status: transaction.status,
          type: transaction.type,
        });
      });
    });

    // Filter by transaction type (Credit/Debit)
    if (all && all !== "All") {
      if (all === "Credit") {
        allTransactions = allTransactions.filter((t) => t.credit > 0);
      } else if (all === "Debit") {
        allTransactions = allTransactions.filter((t) => t.debit > 0);
      }
    }

    // Filter by customer
    if (customer && customer !== "Select Customer") {
      allTransactions = allTransactions.filter((t) =>
        t.customer.toLowerCase().includes(customer.toLowerCase()),
      );
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      allTransactions = allTransactions.filter(
        (t) =>
          t.transactionId.toLowerCase().includes(searchLower) ||
          t.customer.toLowerCase().includes(searchLower) ||
          t.reference.toLowerCase().includes(searchLower),
      );
    }

    // Sort by date (newest first)
    allTransactions.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );

    // Format currency
    const formatCurrency = (amount) => {
      return `₹${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Format date
    const formatDate = (date) => {
      const d = new Date(date);
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const day = d.getDate();
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "pm" : "am";
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${day} ${month} ${year} ${hours}:${minutes} ${ampm}`;
    };

    // Transform transactions for frontend
    const transformedTransactions = allTransactions.map(
      (transaction, index) => ({
        sl: index + 1,
        transactionId: transaction.transactionId,
        customer: transaction.customer,
        credit: formatCurrency(transaction.credit),
        debit: formatCurrency(transaction.debit),
        balance: formatCurrency(transaction.balance),
        transactionType: transaction.transactionType,
        reference: transaction.reference,
        createdAt: formatDate(transaction.createdAt),
      }),
    );

    // Calculate summary statistics
    const totalDebit = allTransactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = allTransactions.reduce((sum, t) => sum + t.credit, 0);
    const totalBalance = totalCredit - totalDebit;

    // Get unique customers for dropdown
    const uniqueCustomers = [
      ...new Set(allTransactions.map((t) => t.customer)),
    ].sort();

    return successResponse(
      res,
      200,
      "Customer wallet report retrieved successfully",
      {
        transactions: transformedTransactions,
        stats: {
          debit: formatCurrency(totalDebit),
          credit: formatCurrency(totalCredit),
          balance: formatCurrency(totalBalance),
        },
        customers: uniqueCustomers,
        pagination: {
          page: 1,
          limit: 10000,
          total: transformedTransactions.length,
          pages: 1,
        },
      },
    );
  } catch (error) {
    console.error("❌ Error fetching customer wallet report:", error);
    console.error("Error stack:", error.stack);
    return errorResponse(
      res,
      500,
      error.message || "Failed to fetch customer wallet report",
    );
  }
});
