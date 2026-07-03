import Order from '../../order/models/Order.js';
import Payment from '../../payment/models/Payment.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import mongoose from 'mongoose';
import Restaurant from '../../restaurant/models/Restaurant.js';
import { findNearestDeliveryBoys } from '../../order/services/deliveryAssignmentService.js';
import { notifyMultipleDeliveryBoys } from '../../order/services/deliveryNotificationService.js';
import {
  notifyRestaurantNewOrder,
  notifyRestaurantOrderUpdate,
} from '../../order/services/restaurantNotificationService.js';
import {
  calculateOrderSettlement,
  updateSettlementOnStatusChange,
} from '../../order/services/orderSettlementService.js';
import { releaseEscrow } from '../../order/services/escrowWalletService.js';

/**
 * Get all orders for admin
 * GET /api/admin/orders
 * Query params: status, page, limit, search, fromDate, toDate, restaurant, paymentStatus
 */
export const getOrders = asyncHandler(async (req, res) => {
  try {
    const { 
      status, 
      page = 1, 
      limit = 50,
      search,
      fromDate,
      toDate,
      restaurant,
      paymentStatus,
      zone,
      customer,
      cancelledBy,
      deliveryPartnerId,
      userId
    } = req.query;

    // Build query
    const query = {
      orderId: { $not: /^ORD-TEST/i }
    };

    // Delivery partner filter
    // Supports ObjectId and legacy string values
    if (deliveryPartnerId && deliveryPartnerId !== "all") {
      if (mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        query.deliveryPartnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
      } else {
        query.deliveryPartnerId = deliveryPartnerId;
      }
    }

    // Status filter
    if (status && status !== 'all') {
      // Map frontend status keys to backend status values
      const statusMap = {
        'scheduled': 'scheduled',
        'pending': 'pending',
        'accepted': 'confirmed',
        'processing': 'preparing',
        'food-on-the-way': 'out_for_delivery',
        'delivered': 'delivered',
        'canceled': 'cancelled',
        'restaurant-cancelled': 'cancelled', // Restaurant cancelled orders
        'payment-failed': 'pending', // Payment failed orders have pending status
        'refunded': 'cancelled', // Refunded orders might be cancelled
        'dine-in': 'dine_in',
        'offline-payments': 'pending' // Offline payment orders
      };
      
      const mappedStatus = statusMap[status] || status;
      query.status = mappedStatus;
      
      // If restaurant-cancelled, filter by cancelledBy or cancellation reason (covers new and old orders)
      if (status === 'restaurant-cancelled') {
        query.$or = [
          { cancelledBy: 'restaurant' },
          { cancellationReason: { $regex: /rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue/i } }
        ];
      }
    }
    
    // Also handle cancelledBy query parameter (if passed separately)
    if (cancelledBy === 'restaurant' && !query.$or) {
      query.status = 'cancelled';
      query.$or = [
        { cancelledBy: 'restaurant' },
        { cancellationReason: { $regex: /rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue/i } }
      ];
    }

    // Payment status filter
    if (paymentStatus) {
      query['payment.status'] = paymentStatus.toLowerCase();
    }

    // Date range filter
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        query.createdAt.$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    // Restaurant filter
    if (restaurant && restaurant !== 'All restaurants') {
      // Try to find restaurant by name or ID
      const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
      const restaurantDoc = await Restaurant.findOne({
        $or: [
          { name: { $regex: restaurant, $options: 'i' } },
          { _id: mongoose.Types.ObjectId.isValid(restaurant) ? restaurant : null },
          { restaurantId: restaurant }
        ]
      }).select('_id restaurantId').lean();

      if (restaurantDoc) {
        // Order.restaurantId can be stored as ObjectId or string depending on legacy data.
        // Match both forms to ensure filters work end-to-end.
        const restaurantIdCandidates = [
          restaurantDoc._id,
          restaurantDoc._id?.toString?.(),
          restaurantDoc.restaurantId
        ].filter(Boolean);
        query.restaurantId = { $in: restaurantIdCandidates };
      }
    }

    // Zone filter
    if (zone && zone !== 'All Zones') {
      // Find zone by name
      const Zone = (await import('../models/Zone.js')).default;
      const zoneDoc = await Zone.findOne({
        name: { $regex: zone, $options: 'i' }
      }).select('_id name').lean();

      if (zoneDoc) {
        query['assignmentInfo.zoneId'] = zoneDoc._id?.toString();
      }
    }

    // Customer filter
    if (customer && customer !== 'All customers') {
      const User = (await import('../../auth/models/User.js')).default;
      const userDoc = await User.findOne({
        name: { $regex: customer, $options: 'i' }
      }).select('_id').lean();

      if (userDoc) {
        query.userId = userDoc._id;
      }
    }

    // Direct userId filter (for precise history lookups)
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.userId = new mongoose.Types.ObjectId(userId);
    }

    // Search filter (orderId, customer name, customer phone) - optimized with batch query
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } }
      ];

      // Batch all user searches into a single query for better performance
      const User = (await import('../../auth/models/User.js')).default;
      const userSearchConditions = [];
      
      // If search looks like a phone number, search in customer data
      const phoneRegex = /[\d\s\+\-()]+/;
      if (phoneRegex.test(search)) {
        const cleanSearch = search.replace(/\D/g, '');
        userSearchConditions.push({ phone: { $regex: cleanSearch, $options: 'i' } });
        if (mongoose.Types.ObjectId.isValid(search)) {
          userSearchConditions.push({ _id: new mongoose.Types.ObjectId(search) });
        }
      }

      // Also search by customer name
      userSearchConditions.push({ name: { $regex: search, $options: 'i' } });

      // Execute single batch query instead of multiple queries
      if (userSearchConditions.length > 0) {
        const users = await User.find({
          $or: userSearchConditions
        }).select('_id').lean();
        const userIds = users.map(u => u._id);
        if (userIds.length > 0) {
          query.$or.push({ userId: { $in: userIds } });
        }
      }

      // Ensure $or array is not empty
      if (query.$or && query.$or.length === 0) {
        delete query.$or;
      }
    }

    // Calculate pagination - enforce max limit for performance
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(10000, Math.max(1, parseInt(limit))); // Max 10000 items per page
    const skip = (pageNum - 1) * limitNum;

    // Fetch orders with population - using lean() for better performance
    const orders = await Order.find(query)
      .populate('userId', 'name email phone')
      // Include basic restaurant location/address details so invoices and admin UIs
      // can show the full restaurant address.
      .populate('restaurantId', 'name slug location.formattedAddress location.address location.city location.state location.zipCode location.pincode')
      .populate('deliveryPartnerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Get total count
    const total = await Order.countDocuments(query);

    // Batch fetch settlements for platform fee, refund status, and accurate earnings (more efficient than individual queries)
    let settlementPlatformFeeMap = new Map();
    let refundStatusMap = new Map();
    let settlementEarningsMap = new Map();
    let settlementDeliveryPartnerMap = new Map();
    let settlementHotelNameMap = new Map();
    let settlementHotelIdMap = new Map();
    try {
      const OrderSettlement = (await import('../../order/models/OrderSettlement.js')).default;
      const orderIds = orders.map(o => o._id);
      const settlements = await OrderSettlement.find({ orderId: { $in: orderIds } })
        .select('orderId deliveryPartnerId userPayment.platformFee cancellationDetails.refundStatus adminEarning.totalEarning restaurantEarning.netEarning deliveryPartnerEarning.totalEarning hotelEarning.commission hotelEarning.hotelName hotelEarning.hotelId')
        .lean();
      
      // Create maps for quick lookup
      settlements.forEach(s => {
        if (s.orderId) {
          if (s.userPayment?.platformFee !== undefined) {
            settlementPlatformFeeMap.set(s.orderId.toString(), s.userPayment.platformFee);
          }
          if (s.cancellationDetails?.refundStatus) {
            refundStatusMap.set(s.orderId.toString(), s.cancellationDetails.refundStatus);
          }
          if (s.deliveryPartnerId) {
            settlementDeliveryPartnerMap.set(s.orderId.toString(), s.deliveryPartnerId.toString());
          }
          if (s.hotelEarning?.hotelName) {
            settlementHotelNameMap.set(s.orderId.toString(), s.hotelEarning.hotelName);
          }
          if (s.hotelEarning?.hotelId) {
            settlementHotelIdMap.set(s.orderId.toString(), s.hotelEarning.hotelId.toString());
          }
          settlementEarningsMap.set(s.orderId.toString(), {
            adminEarning: Number(s.adminEarning?.totalEarning || 0),
            restaurantEarning: Number(s.restaurantEarning?.netEarning || 0),
            deliveryEarning: Number(s.deliveryPartnerEarning?.totalEarning || 0),
            hotelEarning: Number(s.hotelEarning?.commission || 0)
          });
        }
      });
    } catch (err) {
      console.warn('Could not batch fetch settlements:', err.message);
    }

    // Dynamically resolve genuine restaurant names for generic/fallback ones
    const restaurantIds = [...new Set(orders.map(o => o.restaurantId?.toString()).filter(Boolean))];
    let resolvedRestaurantNamesMap = new Map();
    if (restaurantIds.length > 0) {
      try {
        const nameAggregation = await Order.aggregate([
          { $match: { restaurantId: { $in: restaurantIds } } },
          { $group: {
              _id: "$restaurantId",
              names: { $addToSet: "$restaurantName" }
            }
          }
        ]);
        
        let settlementAggregation = [];
        try {
          const OrderSettlement = (await import('../../order/models/OrderSettlement.js')).default;
          settlementAggregation = await OrderSettlement.aggregate([
            { $match: { restaurantId: { $in: restaurantIds.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id) } } },
            { $group: {
                _id: "$restaurantId",
                names: { $addToSet: "$restaurantName" }
              }
            }
          ]);
        } catch (_) {}

        const mergeMap = new Map();
        nameAggregation.forEach(item => {
          if (item._id) mergeMap.set(item._id.toString(), new Set(item.names));
        });
        settlementAggregation.forEach(item => {
          if (item._id) {
            const idStr = item._id.toString();
            if (!mergeMap.has(idStr)) {
              mergeMap.set(idStr, new Set());
            }
            item.names.forEach(n => mergeMap.get(idStr).add(n));
          }
        });

        mergeMap.forEach((namesSet, idStr) => {
          const names = Array.from(namesSet).filter(Boolean);
          const genuineName = names.find(n => !/^Restaurant\s*\d+$/i.test(String(n).trim()) && !/^Unknown Restaurant$/i.test(String(n).trim()));
          if (genuineName) {
            resolvedRestaurantNamesMap.set(idStr, genuineName);
          }
        });
      } catch (err) {
        console.warn('Could not dynamically resolve restaurant names:', err.message);
      }
    }

    // Batch fetch delivery partners from both orders and settlements
    const deliveryPartnerIds = new Set();
    orders.forEach(o => {
      if (o.deliveryPartnerId) {
        deliveryPartnerIds.add(o.deliveryPartnerId.toString());
      }
    });
    settlementDeliveryPartnerMap.forEach(dpId => {
      if (dpId) {
        deliveryPartnerIds.add(dpId);
      }
    });

    let deliveryPartnersMap = new Map();
    if (deliveryPartnerIds.size > 0) {
      try {
        const Delivery = (await import('../../delivery/models/Delivery.js')).default;
        const dps = await Delivery.find({ _id: { $in: Array.from(deliveryPartnerIds).map(id => new mongoose.Types.ObjectId(id)) } })
          .select('name phone')
          .lean();
        dps.forEach(dp => {
          deliveryPartnersMap.set(dp._id.toString(), dp);
        });
      } catch (err) {
        console.warn('Could not batch fetch delivery partners:', err.message);
      }
    }


    // Batch fetch Payment collection for payment status (source of truth - COD/Razorpay)
    let paymentStatusMapById = new Map();
    try {
      const payments = await Payment.find({ orderId: { $in: orders.map(o => o._id) } })
        .select('orderId status')
        .lean();
      payments.forEach(p => {
        if (p.orderId) paymentStatusMapById.set(p.orderId.toString(), p.status);
      });
    } catch (err) {
      console.warn('Could not batch fetch payment status:', err.message);
    }

    // Batch fetch AdminCommission for per‑order earnings breakdown
    let commissionMapByOrderId = new Map();
    try {
      const AdminCommission = (await import('../models/AdminCommission.js')).default;
      const commissions = await AdminCommission.find({
        orderId: { $in: orders.map(o => o._id) },
        status: 'completed'
      })
        .select('orderId commissionAmount restaurantEarning')
        .lean();

      commissions.forEach(c => {
        if (c.orderId) {
          commissionMapByOrderId.set(c.orderId.toString(), {
            adminEarning: c.commissionAmount || 0,
            restaurantEarning: c.restaurantEarning || 0
          });
        }
      });
    } catch (err) {
      console.warn('Could not batch fetch admin commissions for earnings breakdown:', err.message);
    }

    // Batch fetch Hotel commission config for QR/Hotel orders (prevents ₹300/₹71 fallback)
    let hotelConfigByKey = new Map();
    let qrGlobalCommission = { hotel: 0, admin: 0 };
    try {
      const CommissionSettings = (await import('../models/CommissionSettings.js')).default;
      const latest = await CommissionSettings.findOne().sort({ createdAt: -1 }).lean();
      const hotelPct = Number(latest?.qrCommission?.hotel || 0);
      const adminPct = Number(latest?.qrCommission?.admin || 0);
      qrGlobalCommission = { hotel: hotelPct, admin: adminPct };
    } catch (err) {
      // Non-blocking; we'll fall back to stored fields if config missing
      console.warn('Could not load CommissionSettings for QR split:', err.message);
    }

    try {
      const Hotel = (await import('../../hotel/models/Hotel.js')).default;
      const hotelObjectIds = [];
      const hotelIdStrings = [];
      for (const o of orders) {
        if (o?.hotelId && mongoose.Types.ObjectId.isValid(o.hotelId)) {
          hotelObjectIds.push(new mongoose.Types.ObjectId(o.hotelId));
        }
        if (o?.hotelReference && typeof o.hotelReference === 'string') {
          hotelIdStrings.push(o.hotelReference);
        }
      }
      const or = [];
      if (hotelObjectIds.length) or.push({ _id: { $in: hotelObjectIds } });
      if (hotelIdStrings.length) or.push({ hotelId: { $in: hotelIdStrings } });
      if (or.length) {
        const hotels = await Hotel.find({ $or: or })
          .select('_id hotelId commission adminCommission hotelName')
          .lean();
        for (const h of hotels || []) {
          if (h?._id) hotelConfigByKey.set(String(h._id), h);
          if (h?.hotelId) hotelConfigByKey.set(String(h.hotelId), h);
        }
      }
    } catch (err) {
      console.warn('Could not batch load Hotel config for QR split:', err.message);
    }

    // Transform orders to match frontend format
    const transformedOrders = orders.map((order, index) => {
      const orderDate = new Date(order.createdAt);
      const dateStr = orderDate.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }).toUpperCase();
      const timeStr = orderDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }).toUpperCase();

      // Get customer phone (unmasked - show full number for admin)
      const customerPhone = order.userId?.phone || '';

      // Map payment status - use Payment collection as source of truth (like restaurant order controller)
      const paymentStatusMap = {
        'completed': 'Paid',
        'pending': 'Pending',
        'failed': 'Failed',
        'refunded': 'Refunded',
        'processing': 'Processing'
      };
      const paymentRecordStatus = paymentStatusMapById.get(order._id.toString());
      const orderPaymentStatus = order.payment?.status;
      let effectivePaymentStatus = paymentRecordStatus || orderPaymentStatus;

      // If the order is delivered, payment is implicitly completed (Paid/Collected)
      if (order.status === 'delivered') {
        effectivePaymentStatus = 'completed';
      }

      const paymentStatusDisplay = paymentStatusMap[effectivePaymentStatus] || 'Pending';

      // Map order status for display
      // IMPORTANT: Treat cancellation fields as source-of-truth.
      // Legacy/edge-case data can have status='delivered' but also cancelledAt/cancelledBy/cancellationReason set.
      const isEffectivelyCancelled =
        order.status === 'cancelled' ||
        !!order.cancelledAt ||
        !!order.cancelledBy ||
        !!order.cancellationReason;

      // Check if cancelled and determine who cancelled it
      let orderStatusDisplay;
      if (isEffectivelyCancelled) {
        // Check cancelledBy field to determine who cancelled
        if (order.cancelledBy === 'restaurant') {
          orderStatusDisplay = 'Cancelled by Restaurant';
        } else if (order.cancelledBy === 'user') {
          orderStatusDisplay = 'Cancelled by User';
        } else if (order.cancelledBy === 'admin') {
          orderStatusDisplay = 'Cancelled by System';
        } else {
          // Fallback: check cancellation reason pattern for old orders
          const cancellationReason = order.cancellationReason || '';
          const isRestaurantCancelled = /rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue/i.test(cancellationReason);
          orderStatusDisplay = isRestaurantCancelled ? 'Cancelled by Restaurant' : 'Cancelled by User';
        }
      } else {
        const statusMap = {
          'pending': 'Pending',
          // 'confirmed' means payment verified, NOT restaurant acceptance.
          // Show as 'Pending' until restaurant actually accepts and moves to 'preparing'.
          'confirmed': 'Pending',
          'preparing': 'Processing',
          'ready': 'Ready',
          'out_for_delivery': 'Food On The Way',
          'delivered': 'Delivered',
          'scheduled': 'Scheduled',
          'dine_in': 'Dine In'
        };
        orderStatusDisplay = statusMap[order.status] || order.status;
      }

      // Determine delivery type
      const deliveryType = order.deliveryFleet === 'standard' ? 
        'Home Delivery' : 
        (order.deliveryFleet === 'fast' ? 'Fast Delivery' : 'Home Delivery');

      // Calculate report-specific fields
      const subtotal = order.pricing?.subtotal || 0;
      const discount = order.pricing?.discount || 0;
      const deliveryFee = order.pricing?.deliveryFee || 0;
      const tax = order.pricing?.tax || 0;
      const couponCode = order.pricing?.couponCode || null;
      const adminOfferDiscount = order.pricing?.adminOfferDiscount || 0;
      const adminOfferName = order.pricing?.adminOfferName || null;
      
      // Get platform fee - check if it exists in pricing, otherwise get from settlement map
      let platformFee = order.pricing?.platformFee;
      if (platformFee === undefined || platformFee === null) {
        // Get from settlement map (batch fetched above)
        platformFee = settlementPlatformFeeMap.get(order._id.toString());
        
        // If still not found, calculate from total (fallback for old orders)
        if (platformFee === undefined || platformFee === null) {
          const calculatedTotal = (order.pricing?.subtotal || 0) - (order.pricing?.discount || 0) + (order.pricing?.deliveryFee || 0) + (order.pricing?.tax || 0);
          const actualTotal = order.pricing?.total || 0;
          const difference = actualTotal - calculatedTotal;
          // If difference is positive and reasonable (between 0 and 50), assume it's platform fee
          platformFee = (difference > 0 && difference <= 50) ? difference : 0;
        }
      }
      
      // For report: itemDiscount is the total discount applied to items
      const itemDiscount = discount;
      // Discounted amount is subtotal after discount
      const discountedAmount = Math.max(0, subtotal - discount);
      // Coupon discount (if coupon was applied, it's part of discount)
      const couponDiscount = couponCode ? discount : 0;
      // Referral discount (not currently in model, default to 0)
      const referralDiscount = 0;
      // VAT/Tax
      const vatTax = tax;
      // Delivery charge
      const deliveryCharge = deliveryFee;
      // Total item amount (subtotal before discounts)
      const totalItemAmount = subtotal;
      // Order amount (final total)
      const orderAmount = order.pricing?.total || 0;

      // Earnings breakdown (per order) for admin views.
      // Prefer OrderSettlement (source of truth). Fallback to AdminCommission, then to a safe approximation.
      const settlementEarnings = settlementEarningsMap.get(order._id.toString());
      const commissionInfo = commissionMapByOrderId.get(order._id.toString()) || {};

      let restaurantEarning =
        settlementEarnings?.restaurantEarning ?? commissionInfo.restaurantEarning ?? 0;
      let deliveryEarning =
        settlementEarnings?.deliveryEarning ?? order.estimatedEarnings?.totalEarning ?? 0;
      let adminEarning =
        settlementEarnings?.adminEarning ?? commissionInfo.adminEarning ?? 0;

      const isHotelQrOrder = (order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId);
      // Keep a stable hotel commission amount for UI display (avoid scope issues).
      let hotelCommissionAmount =
        settlementEarnings?.hotelEarning !== undefined
          ? settlementEarnings.hotelEarning
          : (Number(order.commissionBreakdown?.hotel || 0) || Number(order.hotelCommission || 0) || 0);

      // QR / Hotel (Online) earnings (commission + fees):
      // Many QR orders don't have OrderSettlement populated, so we compute from stored breakdown + pricing.
      if (isHotelQrOrder && !restaurantEarning) {
        const commissionableFood = Math.max(0, Number(subtotal || 0) - Number(discount || 0));
        // Prefer explicit stored amounts. If missing/zero, derive from:
        // 1) Hotel-specific commission config (hotel.commission, hotel.adminCommission)
        // 2) Global CommissionSettings.qrCommission (hotel/admin)
        // 3) order.commissionPercentages (legacy)
        const hotelCfg =
          hotelConfigByKey.get(String(order.hotelId || "")) ||
          hotelConfigByKey.get(String(order.hotelReference || "")) ||
          null;

        const pctHotel =
          Number(hotelCfg?.commission || 0) ||
          Number(qrGlobalCommission?.hotel || 0) ||
          Number(order.commissionPercentages?.hotel || 0);
        const pctAdmin =
          Number(hotelCfg?.adminCommission || 0) ||
          Number(qrGlobalCommission?.admin || 0) ||
          Number(order.commissionPercentages?.admin || 0);

        let hotelCommission = hotelCommissionAmount;
        let qrAdminCommission =
          Number(order.commissionBreakdown?.admin || 0) ||
          Number(order.adminCommission || 0) ||
          0;

        if (!hotelCommission && pctHotel > 0 && commissionableFood > 0) {
          hotelCommission = Math.round(((commissionableFood * pctHotel) / 100) * 100) / 100;
        }
        if (!qrAdminCommission && pctAdmin > 0 && commissionableFood > 0) {
          qrAdminCommission = Math.round(((commissionableFood * pctAdmin) / 100) * 100) / 100;
        }

        // Restaurant net (commissionableFood - hotel - admin commission)
        const qrRestaurantNet =
          Math.max(0, commissionableFood - hotelCommission - qrAdminCommission);

        // IMPORTANT: For QR/Hotel online flows, some legacy fields store "food subtotal" (e.g. 300)
        // under restaurantShare/commissionBreakdown.restaurant, which is NOT the net earning.
        // So we override restaurant earning using the computed net.
        if (qrRestaurantNet > 0) {
          restaurantEarning = Math.round(qrRestaurantNet * 100) / 100;
        } else if (!restaurantEarning) {
          // If we truly cannot compute, fall back to any explicit value
          const explicitRestaurant =
            Number(order.restaurantShare || 0) ||
            Number(order.commissionBreakdown?.restaurant || 0);
          if (explicitRestaurant > 0) {
            restaurantEarning = explicitRestaurant;
          }
        }

        // Admin total = admin commission + platformFee + deliveryFee + tax (GST)
        const adminFeesTotal =
          Number(platformFee || 0) +
          Number(deliveryFee || 0) +
          Number(tax || 0);
        const qrAdminTotal = Math.max(0, qrAdminCommission + adminFeesTotal);

        // If adminEarning is missing OR looks like only fees, replace with computed total
        if (
          !adminEarning ||
          (adminFeesTotal > 0 && Math.abs(Number(adminEarning) - adminFeesTotal) < 0.01)
        ) {
          adminEarning = Math.round(qrAdminTotal * 100) / 100;
        }

        // Also ensure hotel commission is excluded when we later derive restaurant (if needed)
        hotelCommissionAmount = Number(hotelCommission || 0) || hotelCommissionAmount;
      }

      // If restaurant earning is still missing/zero:
      // - For DIRECT orders: derive from restaurant % on derived subtotal
      // - For QR/Hotel orders: derive as total - admin - hotelCommission - delivery
      if (!restaurantEarning) {
        if (order.restaurantShare !== undefined && order.restaurantShare > 0) {
          restaurantEarning = order.restaurantShare;
        } else {
          const pct = Number(order.commissionPercentages?.restaurant || 0);
          if (!isHotelQrOrder && pct > 0) {
            const feePlatform = Number(platformFee || 0);
            const feeDelivery = Number(deliveryFee || 0);
            const feeTax = Number(tax || 0);
            const derivedSubtotal = Math.max(0, orderAmount - feePlatform - feeDelivery - feeTax);
            const derived = (derivedSubtotal * pct) / 100;
            if (derived > 0) restaurantEarning = Math.round(derived * 100) / 100;
          } else if (isHotelQrOrder && Number(orderAmount) > 0) {
            const hotelCommission =
              Number(order.hotelCommission || 0) ||
              Number(order.commissionBreakdown?.hotel || 0);
            const derived =
              Number(orderAmount) -
              Number(adminEarning || 0) -
              Number(hotelCommission || 0) -
              Number(deliveryEarning || 0);
            if (derived > 0) restaurantEarning = Math.round(derived * 100) / 100;
          }
        }
      }

      // Last-resort fallback for older orders where settlement/commission weren't stored
      if (!restaurantEarning && !deliveryEarning && !adminEarning) {
        const subtotal = order.pricing?.subtotal || 0;
        const discount = order.pricing?.discount || 0;
        const deliveryFee = order.pricing?.deliveryFee || 0;

        restaurantEarning = Math.max(0, subtotal - discount);
        deliveryEarning = deliveryFee ? Number((deliveryFee * 0.8).toFixed(2)) : 0;
        adminEarning = Math.max(0, orderAmount - restaurantEarning - deliveryEarning);
      }

      // Build a human‑readable restaurant address if available
      const rawRestaurant = order.restaurantId || {};
      // restaurantId may be populated document or string; only build address when it's an object
      const restaurantLocation = typeof rawRestaurant === 'object' && rawRestaurant !== null
        ? rawRestaurant.location || {}
        : {};

      const restaurantAddressParts = [];
      if (restaurantLocation.formattedAddress) {
        restaurantAddressParts.push(restaurantLocation.formattedAddress);
      } else {
        if (restaurantLocation.address) restaurantAddressParts.push(restaurantLocation.address);
        const cityState = [restaurantLocation.city, restaurantLocation.state].filter(Boolean).join(', ');
        const pin = restaurantLocation.zipCode || restaurantLocation.pincode;
        const cityStatePin = [cityState, pin].filter(Boolean).join(' - ');
        if (cityStatePin) restaurantAddressParts.push(cityStatePin);
      }
      const restaurantAddress = restaurantAddressParts.join(', ');

      const dpId = (order.deliveryPartnerId?._id || order.deliveryPartnerId)?.toString() || settlementDeliveryPartnerMap.get(order._id.toString());
      const dpDoc = dpId ? deliveryPartnersMap.get(dpId) : null;

      return {
        sl: skip + index + 1,
        orderId: order.orderId,
        id: order._id.toString(),
        date: dateStr,
        time: timeStr,
        customerName: order.userId?.name || order.userName || 'Unknown',
        customerPhone: order.userId?.phone || order.userPhone || 'N/A',
        customerEmail: order.userId?.email || order.userEmail || '',
        restaurant: resolvedRestaurantNamesMap.get(order.restaurantId?.toString()) || order.restaurantName || order.restaurantId?.name || 'Unknown Restaurant',
        restaurantId: order.restaurantId?.toString?.() || order.restaurantId || '',
        restaurantAddress: restaurantAddress || null,
        // Hotel/QR context (used by admin UI for QR-origin orders)
        orderType: order.orderType || null,
        hotelName:
          order.hotelName ||
          (order.hotelId && typeof order.hotelId === "object"
            ? order.hotelId.hotelName || null
            : null) ||
          hotelConfigByKey.get(String(order.hotelId || ""))?.hotelName ||
          hotelConfigByKey.get(String(order.hotelReference || ""))?.hotelName ||
          settlementHotelNameMap.get(order._id.toString()) ||
          null,
        hotelReference:
          order.hotelReference ||
          (order.hotelId && typeof order.hotelId === "object"
            ? order.hotelId.hotelId || null
            : null) ||
          null,
        hotelId:
          (order.hotelId && typeof order.hotelId === "object"
            ? (order.hotelId._id?.toString?.() || order.hotelId._id || null)
            : (order.hotelId?.toString?.() || order.hotelId || null)) ||
          settlementHotelIdMap.get(order._id.toString()) ||
          null,
        // Report-specific fields
        totalItemAmount: totalItemAmount,
        itemDiscount: itemDiscount,
        discountedAmount: discountedAmount,
        couponDiscount: couponDiscount,
        adminOfferDiscount,
        adminOfferName,
        referralDiscount: referralDiscount,
        vatTax: vatTax,
        deliveryCharge: deliveryCharge,
        platformFee: platformFee,
        totalAmount: orderAmount,
        // Original fields
        paymentStatus: paymentStatusDisplay,
        paymentType: (() => {
          const paymentMethod = order.payment?.method;

          if (paymentMethod === 'cash' || paymentMethod === 'cod') {
            return 'Cash on Delivery';
          }

          if (paymentMethod === 'wallet') {
            return 'Wallet';
          }

          if (paymentMethod === 'pay_at_hotel') {
            // Distinguish between pure cash-at-hotel vs Razorpay-at-hotel using Razorpay IDs
            if (order.payment?.razorpayOrderId || order.payment?.razorpayPaymentId) {
              return 'Pay at Hotel (Razorpay)';
            }
            // Explicitly label as Cash when no Razorpay IDs are present
            return 'Pay at Hotel (Cash)';
          }

          // For online gateway payments, distinguish QR/hotel-origin orders
          const isHotelOrigin =
            (typeof order.orderType === 'string' && order.orderType.toUpperCase() === 'QR') ||
            Boolean(order.hotelReference || order.hotelId || order.qrReferenceId || order.hotelName || order.roomNumber);
          if (isHotelOrigin) {
            return 'Hotel (Online)';
          }
          return 'Online';
        })(),
        paymentCollectionStatus: (() => {
          const method = order.payment?.method;
          const paymentCompleted = order.payment?.status === 'completed' || order.status === 'delivered';
          const cashCollected = order.cashCollected === true;

          // For cash-like methods, only mark as collected when explicitly completed/collected
          if (method === 'cash' || method === 'cod' || method === 'pay_at_hotel') {
            return (paymentCompleted || cashCollected) ? 'Collected' : 'Not Collected';
          }

          // For online/wallet, consider collected only when gateway reports completed
          return paymentCompleted ? 'Collected' : 'Not Collected';
        })(),
        orderStatus: orderStatusDisplay,
        status: order.status, // Backend status
        deliveryType: deliveryType,
        items: order.items || [],
        address: order.address || {},
        deliveryPartnerName: dpDoc?.name || order.deliveryPartnerId?.name || null,
        deliveryPartnerPhone: dpDoc?.phone || order.deliveryPartnerId?.phone || null,
        estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
        deliveredAt: order.deliveredAt,
        cancellationReason: order.cancellationReason || null,
        cancelledAt: order.cancelledAt || null,
        cancelledBy: order.cancelledBy || null,
        tracking: order.tracking || {},
        deliveryState: order.deliveryState || {},
        billImageUrl: order.billImageUrl || null, // Bill image captured by delivery boy
        note: order.note || null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        // Zone info from assignmentInfo
        zoneId: order.assignmentInfo?.zoneId || null,
        zoneName: order.assignmentInfo?.zoneName || null,
        // Refund status from settlement
        refundStatus: refundStatusMap.get(order._id.toString()) || null,
        // Earnings breakdown (for detailed order views like Order Detect Delivery)
        earnings: {
          orderTotal: orderAmount,
          restaurantEarning,
          deliveryEarning,
          adminEarning,
          // Include hotel earning for QR / hotel-origin orders so admin UI can display it
          hotelEarning: Math.round(Number(hotelCommissionAmount || 0) * 100) / 100,
        }
      };
    });

    return successResponse(res, 200, 'Orders retrieved successfully', {
      orders: transformedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    return errorResponse(res, 500, 'Failed to fetch orders');
  }
});

/**
 * Payment history (admin)
 * GET /api/admin/payments/history
 *
 * Query params:
 * - page, limit
 * - paymentStatus: pending|processing|completed|failed|refunded|cancelled
 * - paymentMethod: razorpay|wallet|cash|pay_at_hotel|upi|card
 * - orderType: all|QR|DIRECT
 * - search: orderId / razorpay ids / transaction id / user name/phone/email
 * - fromDate, toDate (createdAt)
 */
export const getPaymentHistory = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      paymentStatus,
      paymentMethod,
      orderType = "all",
      search,
      fromDate,
      toDate,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (paymentMethod && paymentMethod !== "all") {
      query["payment.method"] = String(paymentMethod).toLowerCase();
    }
    if (paymentStatus && paymentStatus !== "all") {
      query["payment.status"] = String(paymentStatus).toLowerCase();
    }

    if (orderType && orderType !== "all") {
      if (orderType === "QR") {
        query.$or = [
          { orderType: "QR" },
          { hotelReference: { $ne: null } },
          { hotelId: { $ne: null } },
        ];
      } else if (orderType === "DIRECT") {
        query.orderType = "DIRECT";
        query.hotelReference = null;
        query.hotelId = null;
      }
    }

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Search on Order (orderId) first; Payment gateway ids and user search are handled via post-filtering.
    if (search && String(search).trim()) {
      const q = String(search).trim();
      query.$or = [
        ...(Array.isArray(query.$or) ? query.$or : []),
        { orderId: { $regex: q, $options: "i" } },
        { "payment.razorpayOrderId": { $regex: q, $options: "i" } },
        { "payment.razorpayPaymentId": { $regex: q, $options: "i" } },
        { "payment.transactionId": { $regex: q, $options: "i" } },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select(
          [
            "orderId",
            "status",
            "cancelledBy",
            "cancellationReason",
            "createdAt",
            "pricing.total",
            "pricing.subtotal",
            "payment.method",
            "payment.status",
            "payment.razorpayOrderId",
            "payment.razorpayPaymentId",
            "payment.transactionId",
            "cashCollected",
            "orderType",
            "hotelReference",
            "hotelName",
            "hotelId",
            "restaurantId",
            "restaurantName",
            "userId",
          ].join(" "),
        )
        .populate("userId", "name fullName phone email")
        .populate("hotelId", "hotelName hotelId")
        .lean(),
      Order.countDocuments(query),
    ]);

    const orderIds = orders.map((o) => o._id);
    let paymentByOrderId = new Map();
    try {
      const payments = await Payment.find({ orderId: { $in: orderIds } })
        .select(
          "orderId paymentId method status amount currency transactionId razorpay.orderId razorpay.paymentId razorpay.signature createdAt completedAt failedAt failureReason",
        )
        .lean();
      payments.forEach((p) => {
        if (p?.orderId) paymentByOrderId.set(p.orderId.toString(), p);
      });
    } catch (err) {
      // Non-blocking: page can still render from Order.payment fields
      console.warn("Payment history: failed to batch load Payment docs:", err?.message || err);
    }

    const rows = orders.map((order) => {
      const paymentDoc = paymentByOrderId.get(order._id.toString()) || null;
      const effectiveStatus =
        paymentDoc?.status || order.payment?.status || "pending";
      const effectiveMethod =
        order.payment?.method || paymentDoc?.method || "unknown";

      const isHotelOrder =
        order.orderType === "QR" ||
        Boolean(order.hotelReference) ||
        Boolean(order.hotelId) ||
        effectiveMethod === "pay_at_hotel";

      const paymentFlow = (() => {
        if (effectiveMethod === "pay_at_hotel") return "HOTEL_PAY_AT_HOTEL";
        if (effectiveMethod === "cash") return isHotelOrder ? "HOTEL_CASH" : "COD";
        if (effectiveMethod === "wallet" || effectiveMethod === "razorpay") {
          return isHotelOrder ? "HOTEL_ONLINE" : "ONLINE";
        }
        return isHotelOrder ? "HOTEL_OTHER" : "OTHER";
      })();

      const user = order.userId
        ? {
            id: order.userId._id,
            name: order.userId.fullName || order.userId.name || null,
            phone: order.userId.phone || null,
            email: order.userId.email || null,
          }
        : null;

      const hotel =
        order.hotelId || order.hotelName || order.hotelReference
          ? {
              id: order.hotelId?._id || order.hotelId || null,
              hotelId: order.hotelId?.hotelId || order.hotelReference || null,
              name: order.hotelId?.hotelName || order.hotelName || null,
            }
          : null;

      return {
        orderMongoId: order._id,
        orderId: order.orderId,
        orderStatus: order.status || null,
        cancelledBy: order.cancelledBy || null,
        cancellationReason: order.cancellationReason || null,
        createdAt: order.createdAt,
        orderType: order.orderType || (isHotelOrder ? "QR" : "DIRECT"),
        amount: {
          total: Number(order.pricing?.total) || 0,
          subtotal: Number(order.pricing?.subtotal) || 0,
          paidAmount: Number(paymentDoc?.amount) || Number(order.pricing?.total) || 0,
          currency: paymentDoc?.currency || "INR",
        },
        payment: {
          method: effectiveMethod,
          status: effectiveStatus,
          flow: paymentFlow,
          cashCollected: order.cashCollected === true,
          orderRazorpayOrderId: order.payment?.razorpayOrderId || null,
          orderRazorpayPaymentId: order.payment?.razorpayPaymentId || null,
          orderTransactionId: order.payment?.transactionId || null,
          paymentId: paymentDoc?.paymentId || null,
          paymentCollection: paymentDoc
            ? {
                id: paymentDoc._id,
                method: paymentDoc.method,
                status: paymentDoc.status,
                transactionId: paymentDoc.transactionId || null,
                razorpayOrderId: paymentDoc.razorpay?.orderId || null,
                razorpayPaymentId: paymentDoc.razorpay?.paymentId || null,
                createdAt: paymentDoc.createdAt,
                completedAt: paymentDoc.completedAt,
                failedAt: paymentDoc.failedAt,
                failureReason: paymentDoc.failureReason || null,
              }
            : null,
        },
        user,
        restaurant: {
          id: order.restaurantId || null,
          name: order.restaurantName || null,
        },
        hotel,
      };
    });

    return successResponse(res, 200, "Payment history retrieved successfully", {
      rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching payment history:", error);
    return errorResponse(res, 500, "Failed to fetch payment history");
  }
});

/**
 * Get order by ID for admin
 * GET /api/admin/orders/:id
 */
export const getOrderById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    let order = null;
    
    // Try MongoDB _id first
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findById(id)
        .populate('userId', 'name email phone')
        .populate('restaurantId', 'name slug location address phone')
        .populate('deliveryPartnerId', 'name phone availability')
        .lean();
    }
    
    // If not found, try by orderId
    if (!order) {
      order = await Order.findOne({ orderId: id })
        .populate('userId', 'name email phone')
        .populate('restaurantId', 'name slug location address phone')
        .populate('deliveryPartnerId', 'name phone availability')
        .lean();
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Explicitly set customer details fallbacks
    order.customerName = order.userId?.name || order.userName || 'Unknown';
    order.customerPhone = order.userId?.phone || order.userPhone || 'N/A';
    order.customerEmail = order.userId?.email || order.userEmail || '';

    // Fetch payment record to check status
    let paymentRecordStatus = null;
    try {
      const paymentDoc = await Payment.findOne({ orderId: order._id }).select('status').lean();
      if (paymentDoc) {
        paymentRecordStatus = paymentDoc.status;
      }
    } catch (err) {
      console.warn('Could not fetch payment record in getOrderById:', err.message);
    }

    const paymentStatusMap = {
      'completed': 'Paid',
      'pending': 'Pending',
      'failed': 'Failed',
      'refunded': 'Refunded',
      'processing': 'Processing'
    };
    const orderPaymentStatus = order.payment?.status;
    let effectivePaymentStatus = paymentRecordStatus || orderPaymentStatus;
    
    // If the order is delivered, payment is implicitly completed (Paid/Collected)
    if (order.status === 'delivered') {
      effectivePaymentStatus = 'completed';
    }
    
    order.paymentStatus = paymentStatusMap[effectivePaymentStatus] || 'Pending';

    // Map payment collection status
    order.paymentCollectionStatus = (() => {
      const method = order.payment?.method;
      const paymentCompleted = order.payment?.status === 'completed' || order.status === 'delivered';
      const cashCollected = order.cashCollected === true;

      if (method === 'cash' || method === 'cod' || method === 'pay_at_hotel') {
        return (paymentCompleted || cashCollected) ? 'Collected' : 'Not Collected';
      }
      return paymentCompleted ? 'Collected' : 'Not Collected';
    })();

    // Map payment type
    order.paymentType = (() => {
      const paymentMethod = order.payment?.method;

      if (paymentMethod === 'cash' || paymentMethod === 'cod') {
        return 'Cash on Delivery';
      }
      if (paymentMethod === 'wallet') {
        return 'Wallet';
      }
      if (paymentMethod === 'pay_at_hotel') {
        if (order.payment?.razorpayOrderId || order.payment?.razorpayPaymentId) {
          return 'Pay at Hotel (Razorpay)';
        }
        return 'Pay at Hotel (Cash)';
      }
      const isHotelOrigin =
        (typeof order.orderType === 'string' && order.orderType.toUpperCase() === 'QR') ||
        Boolean(order.hotelReference || order.hotelId || order.qrReferenceId || order.hotelName || order.roomNumber);
      if (isHotelOrigin) {
        return 'Hotel (Online)';
      }
      return 'Online';
    })();

    // Attach earnings breakdown for admin order details view.
    // This keeps parity with the list endpoint which exposes `earnings`.
    try {
      const OrderSettlement = (await import('../../order/models/OrderSettlement.js')).default;
      const settlement = await OrderSettlement.findOne({ orderId: order._id })
        .select('deliveryPartnerId adminEarning.totalEarning restaurantEarning.netEarning deliveryPartnerEarning.totalEarning hotelEarning.commission hotelEarning.hotelName hotelEarning.hotelId')
        .lean();

      // Resolve hotel details if missing on the order document but exist in settlement
      if (!order.hotelName && settlement?.hotelEarning?.hotelName) {
        order.hotelName = settlement.hotelEarning.hotelName;
      }
      if (!order.hotelId && settlement?.hotelEarning?.hotelId) {
        order.hotelId = settlement.hotelEarning.hotelId.toString();
      }

      // Resolve delivery partner if missing on the order document but exists in settlement
      if (!order.deliveryPartnerId && settlement?.deliveryPartnerId) {
        try {
          const Delivery = (await import('../../delivery/models/Delivery.js')).default;
          const dp = await Delivery.findById(settlement.deliveryPartnerId).select('name phone').lean();
          if (dp) {
            order.deliveryPartnerId = dp;
          }
        } catch (err) {
          console.warn('Could not populate delivery partner from settlement:', err.message);
        }
      }

      // Add delivery partner helper fields to the order for the view dialog
      order.deliveryPartnerName = order.deliveryPartnerId?.name || null;
      order.deliveryPartnerPhone = order.deliveryPartnerId?.phone || null;

      // Resolve genuine restaurant name dynamically for this single restaurant
      if (order.restaurantId && /^Restaurant\s*\d+$/i.test(order.restaurantName || "")) {
        try {
          const otherOrder = await Order.findOne({
            restaurantId: order.restaurantId,
            restaurantName: { $not: /^Restaurant\s*\d+$/i, $ne: 'Unknown Restaurant' }
          }).select('restaurantName').lean();
          
          let genuineName = otherOrder?.restaurantName;
          if (!genuineName) {
            const otherSettlement = await OrderSettlement.findOne({
              restaurantId: mongoose.Types.ObjectId.isValid(order.restaurantId) ? new mongoose.Types.ObjectId(order.restaurantId) : order.restaurantId,
              restaurantName: { $not: /^Restaurant\s*\d+$/i, $ne: 'Unknown Restaurant' }
            }).select('restaurantName').lean();
            genuineName = otherSettlement?.restaurantName;
          }
          
          if (genuineName) {
            order.restaurantName = genuineName;
          }
        } catch (err) {
          console.warn('Could not resolve genuine restaurant name in getOrderById:', err.message);
        }
      }

      const orderAmount = Number(order?.pricing?.total || 0);
      const settlementAdmin = Number(settlement?.adminEarning?.totalEarning || 0);
      const settlementRestaurant = Number(settlement?.restaurantEarning?.netEarning || 0);
      let settlementDelivery = Number(settlement?.deliveryPartnerEarning?.totalEarning || 0);

      // Hotel earning is stored on the order for QR/hotel-origin orders (commission breakdown).
      const hotelEarning =
        Number(settlement?.hotelEarning?.commission || 0) ||
        Number(order?.commissionBreakdown?.hotel || 0) ||
        Number(order?.hotelCommission || 0) ||
        0;

      let restaurantEarning = settlementRestaurant;
      let deliveryEarning = settlementDelivery;
      let adminEarning = settlementAdmin;

      // DELIVERY SOURCE OF TRUTH:
      // Delivery app trip history uses DeliveryWallet transactions (type=payment, status=Completed)
      // and not a deliveryFee-derived approximation. Use that when available.
      try {
        const deliveryId =
          (order?.deliveryPartnerId && typeof order.deliveryPartnerId === 'object')
            ? (order.deliveryPartnerId._id || order.deliveryPartnerId.id || null)
            : (order?.deliveryPartnerId || null);
        if (deliveryId) {
          const DeliveryWallet = (await import('../../delivery/models/DeliveryWallet.js')).default;
          const wallet = await DeliveryWallet.findOne({ deliveryId })
            .select('transactions.amount transactions.type transactions.status transactions.orderId')
            .lean();
          const tx = (wallet?.transactions || []).find(
            (t) =>
              t &&
              t.type === 'payment' &&
              t.status === 'Completed' &&
              t.orderId &&
              t.orderId.toString() === order._id.toString()
          );
          if (tx && Number(tx.amount) > 0) {
            deliveryEarning = Number(tx.amount) || 0;
            settlementDelivery = deliveryEarning;
          }
        }
      } catch (_) {
        // Non-blocking
      }

      // Fallback for older orders without settlement
      if (!restaurantEarning && !deliveryEarning && !adminEarning) {
        // Prefer stored commission breakdown when present
        const cbAdmin = Number(order?.commissionBreakdown?.admin || 0);
        const cbRestaurant = Number(order?.commissionBreakdown?.restaurant || 0);
        if (cbAdmin || cbRestaurant || hotelEarning) {
          adminEarning = cbAdmin;
          restaurantEarning = cbRestaurant;
          // If wallet/settlement missing, use estimatedEarnings if present (same as delivery trip history)
          const est = order?.estimatedEarnings;
          if (est) {
            if (typeof est === 'object') {
              deliveryEarning =
                Number(est.totalEarning ?? est.basePayout ?? 0) || 0;
            } else if (typeof est === 'number') {
              deliveryEarning = Number(est) || 0;
            }
          }
        } else {
          const subtotal = Number(order?.pricing?.subtotal || 0);
          const discount = Number(order?.pricing?.discount || 0);
          const deliveryFee = Number(order?.pricing?.deliveryFee || 0);
          restaurantEarning = Math.max(0, subtotal - discount);
          const est = order?.estimatedEarnings;
          if (est) {
            if (typeof est === 'object') {
              deliveryEarning =
                Number(est.totalEarning ?? est.basePayout ?? 0) || 0;
            } else if (typeof est === 'number') {
              deliveryEarning = Number(est) || 0;
            }
          }
          adminEarning = Math.max(0, orderAmount - restaurantEarning - deliveryEarning);
        }
      }

      // QR / Hotel orders: restaurant earning should be based on food subtotal (commissionable),
      // not on platform/delivery/tax. If settlement didn't populate, derive like list endpoint:
      // restaurant = (subtotal - discount) - hotelCommission - adminCommission
      const isHotelOrder =
        order?.orderType === 'QR' ||
        Boolean(order?.hotelReference) ||
        Boolean(order?.hotelId) ||
        String(order?.payment?.method || '').toLowerCase() === 'pay_at_hotel';
      if (isHotelOrder) {
        const subtotal = Number(order?.pricing?.subtotal || 0);
        const discount = Number(order?.pricing?.discount || 0);
        const commissionableFood = Math.max(0, subtotal - discount);

        const hotelCommission = Number(hotelEarning || 0);
        const adminCommission =
          Number(order?.commissionBreakdown?.admin || 0) ||
          Number(order?.adminCommission || 0) ||
          (commissionableFood > 0
            ? Math.round(((commissionableFood * Number(order?.commissionPercentages?.admin || 0)) / 100) * 100) / 100
            : 0);

        if (commissionableFood > 0) {
          const derivedRestaurant = Math.max(0, commissionableFood - hotelCommission - adminCommission);
          // If we have no usable restaurant earning (common for hotel orders without settlement), use derived.
          if (!restaurantEarning || restaurantEarning <= 0) {
            restaurantEarning = Math.round(derivedRestaurant * 100) / 100;
          }
        }

        // Admin total (for display): commission + fees (platform + delivery + tax)
        if (!adminEarning || adminEarning <= 0) {
          const platformFee = Number(order?.pricing?.platformFee || 0);
          const deliveryFee = Number(order?.pricing?.deliveryFee || 0);
          const tax = Number(order?.pricing?.tax || 0);
          adminEarning = Math.round((adminCommission + platformFee + deliveryFee + tax) * 100) / 100;
        }
      }

      order.earnings = {
        orderTotal: orderAmount,
        restaurantEarning: Math.round(Number(restaurantEarning || 0) * 100) / 100,
        deliveryEarning: Math.round(Number(deliveryEarning || 0) * 100) / 100,
        adminEarning: Math.round(Number(adminEarning || 0) * 100) / 100,
        hotelEarning: Math.round(Number(hotelEarning || 0) * 100) / 100,
      };
    } catch (_) {
      // Non-blocking: order details can still render without earnings.
    }

    return successResponse(res, 200, 'Order retrieved successfully', {
      order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    return errorResponse(res, 500, 'Failed to fetch order');
  }
});

/**
 * Bulk delete orders (admin)
 * POST /api/admin/orders/bulk-delete
 * Body: { orderIds: string[] }
 *
 * Notes:
 * - Accepts either MongoDB _id strings (24 chars) or orderId strings.
 * - Deletes Order documents and Payment documents linked via orderId (ObjectId).
 */
export const bulkDeleteOrders = asyncHandler(async (req, res) => {
  try {
    const { orderIds } = req.body || {};

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return errorResponse(res, 400, "orderIds must be a non-empty array");
    }

    if (orderIds.length > 200) {
      return errorResponse(res, 400, "Cannot delete more than 200 orders at once");
    }

    const uniqueIds = Array.from(
      new Set(orderIds.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim())),
    );

    const objectIds = [];
    const orderIdStrings = [];
    uniqueIds.forEach((id) => {
      if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
        objectIds.push(new mongoose.Types.ObjectId(id));
      } else {
        orderIdStrings.push(id);
      }
    });

    // Find matching orders
    const orders = await Order.find({
      $or: [
        ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
        ...(orderIdStrings.length ? [{ orderId: { $in: orderIdStrings } }] : []),
      ],
    })
      .select("_id orderId status")
      .lean();

    const foundMongoIds = orders.map((o) => o._id);
    const foundOrderIds = new Set(orders.map((o) => o.orderId).filter(Boolean));

    // Determine not found ids (best-effort)
    const notFound = uniqueIds.filter((id) => {
      if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
        return !foundMongoIds.some((x) => x.toString() === id);
      }
      return !foundOrderIds.has(id);
    });

    // Delete payments first (linked by orderId:ObjectId in Payment collection)
    let deletedPayments = 0;
    if (foundMongoIds.length) {
      const paymentDeleteRes = await Payment.deleteMany({ orderId: { $in: foundMongoIds } });
      deletedPayments = paymentDeleteRes?.deletedCount || 0;
    }

    const orderDeleteRes = await Order.deleteMany({ _id: { $in: foundMongoIds } });
    const deletedOrders = orderDeleteRes?.deletedCount || 0;

    return successResponse(res, 200, "Orders deleted successfully", {
      requested: uniqueIds.length,
      matched: orders.length,
      deletedOrders,
      deletedPayments,
      notFound,
    });
  } catch (error) {
    console.error("Error bulk deleting orders:", error);
    return errorResponse(res, 500, error.message || "Failed to bulk delete orders");
  }
});

/**
 * Approve offline payment (COD/cash) - mark as paid when admin verifies payment received
 * PUT /api/admin/orders/:orderId/approve-offline-payment
 */
export const approveOfflinePayment = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;

    let order = null;
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      order = await Order.findById(orderId);
    }
    if (!order) {
      order = await Order.findOne({ orderId });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    const paymentMethod = order.payment?.method || '';
    const isOfflinePayment = paymentMethod === 'cash' || paymentMethod === 'cod';
    if (!isOfflinePayment) {
      return errorResponse(res, 400, 'Only offline (COD/cash) payments can be approved');
    }

    if (order.payment?.status === 'completed') {
      return errorResponse(res, 400, 'Payment is already marked as completed');
    }

    // Update Order.payment.status
    if (!order.payment) order.payment = {};
    order.payment.status = 'completed';
    await order.save();

    // Update Payment collection as source of truth
    const paymentRecord = await Payment.findOne({ orderId: order._id });
    if (paymentRecord) {
      paymentRecord.status = 'completed';
      await paymentRecord.save();
    }

    return successResponse(res, 200, 'Offline payment approved successfully', {
      orderId: order.orderId,
      paymentStatus: 'completed'
    });
  } catch (error) {
    console.error('Error approving offline payment:', error);
    return errorResponse(res, 500, 'Failed to approve offline payment');
  }
});

/**
 * Admin override: update order status and/or payment status
 * PATCH /api/admin/orders/:orderId/status
 * Body: { orderStatus?: string, paymentStatus?: string, cancellationReason?: string }
 */
export const updateOrderAndPaymentStatus = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderStatus, paymentStatus, cancellationReason } = req.body || {};

    if (!orderStatus && !paymentStatus) {
      return errorResponse(res, 400, "Nothing to update");
    }

    let order = null;
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      order = await Order.findById(orderId);
    }
    if (!order) {
      order = await Order.findOne({ orderId });
    }

    if (!order) {
      return errorResponse(res, 404, "Order not found");
    }

    const prevStatus = order.status;
    const allowedOrderStatuses = new Set([
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ]);

    const allowedPaymentStatuses = new Set([
      "pending",
      "processing",
      "completed",
      "failed",
      "refunded",
    ]);

    let shouldNotifyRestaurantPreparing = false;
    let didChangeOrderStatus = false;
    let shouldRunDeliverySettlement = false;

    if (typeof orderStatus === "string" && orderStatus.trim().length > 0) {
      const next = orderStatus.trim().toLowerCase();
      if (!allowedOrderStatuses.has(next)) {
        return errorResponse(res, 400, "Invalid order status");
      }

      const wasCancelled = prevStatus === "cancelled";
      order.status = next;
      didChangeOrderStatus = next !== prevStatus;
      if (next === "cancelled") {
        order.cancelledAt = order.cancelledAt || new Date();
        order.cancelledBy = order.cancelledBy || "admin";
        const reason =
          typeof cancellationReason === "string"
            ? cancellationReason.trim()
            : "";
        order.cancellationReason =
          reason || order.cancellationReason || "Updated by admin";
      } else if (wasCancelled) {
        // Admin reopened the order: clear cancellation so listings and flows treat it as active
        order.cancelledAt = null;
        order.cancelledBy = null;
        order.cancellationReason = null;
      }

      // Match restaurant accept flow: `preparing` is the accepted/in-kitchen state
      if (next === "preparing" && prevStatus !== "preparing") {
        if (!order.tracking) order.tracking = {};
        if (prevStatus === "pending" && !order.tracking.confirmed?.status) {
          order.tracking.confirmed = { status: true, timestamp: new Date() };
        }
        shouldNotifyRestaurantPreparing = true;
      }

      // Mark delivered timestamp/tracking and trigger settlement release
      if (next === 'delivered' && prevStatus !== 'delivered') {
        if (!order.tracking) order.tracking = {};
        order.tracking.delivered = order.tracking.delivered || {
          status: true,
          timestamp: new Date(),
        };
        order.deliveredAt = order.deliveredAt || new Date();
        shouldRunDeliverySettlement = true;
      }
    }

    if (typeof paymentStatus === "string" && paymentStatus.trim().length > 0) {
      const next = paymentStatus.trim().toLowerCase();
      if (!allowedPaymentStatuses.has(next)) {
        return errorResponse(res, 400, "Invalid payment status");
      }

      if (!order.payment) order.payment = {};
      order.payment.status = next;

      // Keep Payment collection in sync when present
      const paymentRecord = await Payment.findOne({ orderId: order._id });
      if (paymentRecord) {
        paymentRecord.status = next;
        await paymentRecord.save();
      }
    }

    await order.save();

    if (shouldNotifyRestaurantPreparing) {
      try {
        await notifyRestaurantOrderUpdate(order._id.toString(), "preparing");
      } catch (notifyErr) {
        console.error(
          "Admin status update: failed to notify restaurant socket clients:",
          notifyErr,
        );
      }
    }

    // CRITICAL: When admin marks an order as delivered, make sure settlement + wallet credits run
    // (same as delivery-partner delivered flow). This fixes QR hotel commission missing on admin delivery.
    if (shouldRunDeliverySettlement) {
      try {
        await calculateOrderSettlement(order._id);
      } catch (e) {
        console.warn(
          'Admin delivered update: failed to calculate settlement (non-blocking):',
          e?.message || e,
        );
      }

      try {
        await updateSettlementOnStatusChange(order._id, 'delivered', prevStatus);
      } catch (e) {
        console.warn(
          'Admin delivered update: failed to update settlement on status change (non-blocking):',
          e?.message || e,
        );
      }

      try {
        await releaseEscrow(order._id);
      } catch (e) {
        // For COD / pay_at_hotel orders escrow may not be held; don't block admin action.
        console.warn(
          'Admin delivered update: escrow release failed (non-blocking):',
          e?.message || e,
        );
      }
    }

    return successResponse(res, 200, "Order updated successfully", {
      orderId: order.orderId,
      status: order.status,
      paymentStatus: order.payment?.status || null,
    });
  } catch (error) {
    console.error("Error updating order/payment status:", error);
    return errorResponse(res, 500, "Failed to update order");
  }
});

/**
 * Get orders searching for deliveryman (ready orders without delivery partner)
 * GET /api/admin/orders/searching-deliveryman
 * Query params: page, limit, search
 */
export const getSearchingDeliverymanOrders = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching searching deliveryman orders...');
    const { 
      page = 1, 
      limit = 50,
      search
    } = req.query;
    
    console.log('📋 Query params:', { page, limit, search });

    // Build base conditions for orders that are ready but don't have delivery partner assigned
    // deliveryPartnerId is ObjectId, so we only check for null or missing
    const baseConditions = {
      status: { $in: ['ready', 'preparing'] },
      $or: [
        { deliveryPartnerId: { $exists: false } },
        { deliveryPartnerId: null }
      ]
    };

    // Build search conditions if search is provided
    let searchConditions = null;
    if (search) {
      const searchOrConditions = [
        { orderId: { $regex: search, $options: 'i' } }
      ];

      // If search looks like a phone number, search in customer data
      const phoneRegex = /[\d\s\+\-()]+/;
      if (phoneRegex.test(search)) {
        const User = (await import('../../auth/models/User.js')).default;
        const cleanSearch = search.replace(/\D/g, '');
        const userSearchQuery = { phone: { $regex: cleanSearch, $options: 'i' } };
        if (mongoose.Types.ObjectId.isValid(search)) {
          userSearchQuery._id = search;
        }
        const users = await User.find(userSearchQuery).select('_id').lean();
        const userIds = users.map(u => u._id);
        if (userIds.length > 0) {
          searchOrConditions.push({ userId: { $in: userIds } });
        }
      }

      // Also search by customer name
      const User = (await import('../../auth/models/User.js')).default;
      const usersByName = await User.find({
        name: { $regex: search, $options: 'i' }
      }).select('_id').lean();
      const userIdsByName = usersByName.map(u => u._id);
      if (userIdsByName.length > 0) {
        searchOrConditions.push({ userId: { $in: userIdsByName } });
      }

      if (searchOrConditions.length > 0) {
        searchConditions = { $or: searchOrConditions };
      }
    }

    // Combine all conditions
    const finalQuery = searchConditions 
      ? { $and: [baseConditions, searchConditions] }
      : baseConditions;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log('🔎 Final query:', JSON.stringify(finalQuery, null, 2));

    // Fetch orders with population
    const orders = await Order.find(finalQuery)
      .populate('userId', 'name email phone')
      .populate('restaurantId', 'name slug')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // Get total count
    const total = await Order.countDocuments(finalQuery);
    
    console.log(`✅ Found ${orders.length} orders (total: ${total})`);

    // Transform orders to match frontend format
    const transformedOrders = orders.map((order, index) => {
      const orderDate = new Date(order.createdAt);
      const dateStr = orderDate.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }).toUpperCase();
      const timeStr = orderDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }).toUpperCase();

      // Get customer phone (masked for display)
      const customerPhone = order.userId?.phone || '';
      let maskedPhone = '';
      if (customerPhone && customerPhone.length > 2) {
        maskedPhone = `+${customerPhone.slice(0, 1)}${'*'.repeat(Math.max(0, customerPhone.length - 2))}${customerPhone.slice(-1)}`;
      } else if (customerPhone) {
        maskedPhone = customerPhone; // If too short, show as is
      }

      // Map payment status
      const paymentStatusMap = {
        'completed': 'Paid',
        'pending': 'Unpaid',
        'failed': 'Failed',
        'refunded': 'Refunded',
        'processing': 'Processing'
      };
      const paymentStatusDisplay = paymentStatusMap[order.payment?.status] || 'Unpaid';

      // Map order status for display
      const statusMap = {
        'pending': 'Pending',
        'confirmed': 'Accepted',
        'preparing': 'Pending',
        'ready': 'Pending',
        'out_for_delivery': 'Food On The Way',
        'delivered': 'Delivered',
        'cancelled': 'Canceled',
        'scheduled': 'Scheduled',
        'dine_in': 'Dine In'
      };
      const orderStatusDisplay = statusMap[order.status] || 'Pending';

      // Determine delivery type
      const deliveryType = order.deliveryFleet === 'standard' ? 
        'Home Delivery' : 
        (order.deliveryFleet === 'fast' ? 'Fast Delivery' : 'Home Delivery');

      // Format total amount
      const totalAmount = order.pricing?.total || 0;
      const formattedTotal = `$ ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      return {
        id: order.orderId || order._id.toString(),
        sl: skip + index + 1,
        date: dateStr,
        time: timeStr,
        customerName: order.userId?.name || 'Unknown',
        customerPhone: maskedPhone,
        restaurant: order.restaurantName || order.restaurantId?.name || 'Unknown Restaurant',
        total: formattedTotal,
        paymentStatus: paymentStatusDisplay,
        orderStatus: orderStatusDisplay,
        deliveryType: deliveryType,
        // Additional fields for view order dialog
        orderId: order.orderId,
        _id: order._id.toString(),
        customerEmail: order.userId?.email || '',
        restaurantId: order.restaurantId?.toString() || order.restaurantId || '',
        items: order.items || [],
        address: order.address || {},
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        status: order.status,
        pricing: order.pricing || {}
      };
    });

    return successResponse(res, 200, 'Searching deliveryman orders retrieved successfully', {
      orders: transformedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching searching deliveryman orders:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch searching deliveryman orders');
  }
});

/**
 * Get ongoing orders (orders with delivery partner assigned but not delivered)
 * GET /api/admin/orders/ongoing
 * Query params: page, limit, search
 */
export const getOngoingOrders = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching ongoing orders...');
    const { 
      page = 1, 
      limit = 50,
      search
    } = req.query;
    
    console.log('📋 Query params:', { page, limit, search });

    // Build base conditions for ongoing orders
    // Orders that have deliveryPartnerId assigned but are not delivered/cancelled
    const baseConditions = {
      deliveryPartnerId: { $exists: true, $ne: null },
      status: { $nin: ['delivered', 'cancelled'] }
    };

    // Build search conditions if search is provided
    let searchConditions = null;
    if (search) {
      const searchOrConditions = [
        { orderId: { $regex: search, $options: 'i' } }
      ];

      // If search looks like a phone number, search in customer data
      const phoneRegex = /[\d\s\+\-()]+/;
      if (phoneRegex.test(search)) {
        const User = (await import('../../auth/models/User.js')).default;
        const cleanSearch = search.replace(/\D/g, '');
        const userSearchQuery = { phone: { $regex: cleanSearch, $options: 'i' } };
        if (mongoose.Types.ObjectId.isValid(search)) {
          userSearchQuery._id = search;
        }
        const users = await User.find(userSearchQuery).select('_id').lean();
        const userIds = users.map(u => u._id);
        if (userIds.length > 0) {
          searchOrConditions.push({ userId: { $in: userIds } });
        }
      }

      // Also search by customer name
      const User = (await import('../../auth/models/User.js')).default;
      const usersByName = await User.find({
        name: { $regex: search, $options: 'i' }
      }).select('_id').lean();
      const userIdsByName = usersByName.map(u => u._id);
      if (userIdsByName.length > 0) {
        searchOrConditions.push({ userId: { $in: userIdsByName } });
      }

      if (searchOrConditions.length > 0) {
        searchConditions = { $or: searchOrConditions };
      }
    }

    // Combine all conditions
    const finalQuery = searchConditions 
      ? { $and: [baseConditions, searchConditions] }
      : baseConditions;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log('🔎 Final query:', JSON.stringify(finalQuery, null, 2));

    // Fetch orders with population
    const orders = await Order.find(finalQuery)
      .populate('userId', 'name email phone')
      .populate('restaurantId', 'name slug')
      .populate('deliveryPartnerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // Get total count
    const total = await Order.countDocuments(finalQuery);
    
    console.log(`✅ Found ${orders.length} ongoing orders (total: ${total})`);

    // Transform orders to match frontend format
    const transformedOrders = orders.map((order, index) => {
      const orderDate = new Date(order.createdAt);
      const dateStr = orderDate.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }).toUpperCase();
      const timeStr = orderDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }).toUpperCase();

      // Get customer phone (masked for display)
      const customerPhone = order.userId?.phone || '';
      let maskedPhone = '';
      if (customerPhone && customerPhone.length > 2) {
        maskedPhone = `+${customerPhone.slice(0, 1)}${'*'.repeat(Math.max(0, customerPhone.length - 2))}${customerPhone.slice(-1)}`;
      } else if (customerPhone) {
        maskedPhone = customerPhone; // If too short, show as is
      }

      // Map payment status
      const paymentStatusMap = {
        'completed': 'Paid',
        'pending': 'Unpaid',
        'failed': 'Failed',
        'refunded': 'Refunded',
        'processing': 'Processing'
      };
      const paymentStatusDisplay = paymentStatusMap[order.payment?.status] || 'Unpaid';

      // Map order status for display with colors
      const statusMap = {
        'pending': { text: 'Pending', color: 'bg-gray-100 text-gray-600' },
        'confirmed': { text: 'Confirmed', color: 'bg-blue-50 text-blue-600' },
        'preparing': { text: 'Preparing', color: 'bg-yellow-50 text-yellow-600' },
        'ready': { text: 'Ready', color: 'bg-green-50 text-green-600' },
        'out_for_delivery': { text: 'Out For Delivery', color: 'bg-orange-100 text-orange-600' },
        'delivered': { text: 'Delivered', color: 'bg-green-100 text-green-600' },
        'cancelled': { text: 'Cancelled', color: 'bg-red-50 text-red-600' },
        'scheduled': { text: 'Scheduled', color: 'bg-purple-50 text-purple-600' },
        'dine_in': { text: 'Dine In', color: 'bg-indigo-50 text-indigo-600' }
      };
      
      // Check for handover status (when delivery partner has reached pickup)
      let orderStatusDisplay = statusMap[order.status]?.text || 'Pending';
      let orderStatusColor = statusMap[order.status]?.color || 'bg-gray-100 text-gray-600';
      
      // If delivery partner has reached pickup, show as "Handover"
      if (order.deliveryState?.currentPhase === 'at_pickup' || 
          order.deliveryState?.currentPhase === 'en_route_to_delivery' ||
          order.deliveryState?.currentPhase === 'at_delivery') {
        orderStatusDisplay = 'Handover';
        orderStatusColor = 'bg-blue-50 text-blue-600';
      }

      // Determine delivery type
      const deliveryType = order.deliveryFleet === 'standard' ? 
        'Home Delivery' : 
        (order.deliveryFleet === 'fast' ? 'Fast Delivery' : 'Home Delivery');

      // Format total amount
      const totalAmount = order.pricing?.total || 0;
      const formattedTotal = `$ ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      return {
        id: order.orderId || order._id.toString(),
        sl: skip + index + 1,
        date: dateStr,
        time: timeStr,
        customerName: order.userId?.name || 'Unknown',
        customerPhone: maskedPhone,
        restaurant: order.restaurantId?.onboarding?.step1?.restaurantName || order.restaurantName || order.restaurantId?.name || 'Unknown Restaurant',
        total: formattedTotal,
        paymentStatus: paymentStatusDisplay,
        orderStatus: orderStatusDisplay,
        orderStatusColor: orderStatusColor,
        deliveryType: deliveryType,
        // Additional fields for view order dialog
        orderId: order.orderId,
        _id: order._id.toString(),
        customerEmail: order.userId?.email || '',
        restaurantId: order.restaurantId?.toString() || order.restaurantId || '',
        items: order.items || [],
        address: order.address || {},
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        status: order.status,
        pricing: order.pricing || {},
        deliveryPartnerName: order.deliveryPartnerId?.name || null,
        deliveryPartnerPhone: order.deliveryPartnerId?.phone || null
      };
    });

    return successResponse(res, 200, 'Ongoing orders retrieved successfully', {
      orders: transformedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching ongoing orders:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch ongoing orders');
  }
});

/**
 * Get transaction report with summary statistics and order transactions
 * GET /api/admin/orders/transaction-report
 * Query params: page, limit, search, zone, restaurant, fromDate, toDate
 */
export const getTransactionReport = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching transaction report...');
    const { 
      page = 1, 
      limit = 50,
      search,
      zone,
      restaurant,
      fromDate,
      toDate
    } = req.query;
    
    console.log('📋 Query params:', { page, limit, search, zone, restaurant, fromDate, toDate });

    // Build query for orders
    const query = {};

    // Date range filter
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        query.createdAt.$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    // Restaurant filter
    if (restaurant && restaurant !== 'All restaurants') {
      const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
      const restaurantDoc = await Restaurant.findOne({
        $or: [
          { name: { $regex: restaurant, $options: 'i' } },
          { _id: mongoose.Types.ObjectId.isValid(restaurant) ? restaurant : null },
          { restaurantId: restaurant }
        ]
      }).select('_id restaurantId').lean();

      if (restaurantDoc) {
        query.restaurantId = { $in: [restaurantDoc._id, restaurantDoc._id?.toString?.(), restaurantDoc.restaurantId].filter(Boolean) };
      }
    }

    // Zone filter
    if (zone && zone !== 'All Zones') {
      const Zone = (await import('../models/Zone.js')).default;
      const zoneDoc = await Zone.findOne({
        name: { $regex: zone, $options: 'i' }
      }).select('_id name').lean();

      if (zoneDoc) {
        query['assignmentInfo.zoneId'] = zoneDoc._id?.toString();
      }
    }

    // Search filter (orderId)
    if (search) {
      query.orderId = { $regex: search, $options: 'i' };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch orders with population
    const orders = await Order.find(query)
      .populate('userId', 'name email phone')
      .populate('restaurantId', 'name slug onboarding')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // Get total count
    const total = await Order.countDocuments(query);

    // Calculate summary statistics (real earnings/refunds) using OrderSettlement lookup.
    // This avoids loading all orders into memory and gives accurate admin/restaurant/delivery earnings.
    const summaryAgg = await Order.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'ordersettlements',
          localField: '_id',
          foreignField: 'orderId',
          as: 'settlement'
        }
      },
      { $unwind: { path: '$settlement', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          _pricingTotal: { $ifNull: ['$pricing.total', 0] },
          _paymentStatus: { $ifNull: ['$payment.status', null] },
          _refundAmount: { $ifNull: ['$settlement.cancellationDetails.refundAmount', 0] },
          _adminEarning: { $ifNull: ['$settlement.adminEarning.totalEarning', 0] },
          _restaurantEarning: { $ifNull: ['$settlement.restaurantEarning.netEarning', 0] },
          _deliveryEarning: { $ifNull: ['$settlement.deliveryPartnerEarning.totalEarning', 0] }
        }
      },
      {
        $group: {
          _id: null,
          completedTransaction: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'delivered'] }, { $eq: ['$_paymentStatus', 'completed'] }] },
                '$_pricingTotal',
                0
              ]
            }
          },
          refundedTransaction: {
            $sum: {
              $cond: [
                { $gt: ['$_refundAmount', 0] },
                '$_refundAmount',
                {
                  $cond: [
                    { $eq: ['$_paymentStatus', 'refunded'] },
                    '$_pricingTotal',
                    0
                  ]
                }
              ]
            }
          },
          adminEarning: { $sum: '$_adminEarning' },
          restaurantEarning: { $sum: '$_restaurantEarning' },
          deliverymanEarning: { $sum: '$_deliveryEarning' }
        }
      }
    ]);

    const computedSummary = summaryAgg?.[0] || {
      completedTransaction: 0,
      refundedTransaction: 0,
      adminEarning: 0,
      restaurantEarning: 0,
      deliverymanEarning: 0
    };

    // Transform orders to match frontend format
    const transformedTransactions = orders.map((order, index) => {
      const subtotal = order.pricing?.subtotal || 0;
      const discount = order.pricing?.discount || 0;
      const deliveryFee = order.pricing?.deliveryFee || 0;
      const tax = order.pricing?.tax || 0;
      const couponCode = order.pricing?.couponCode || null;
      
      // For report: itemDiscount is the discount applied to items
      const itemDiscount = discount;
      // Discounted amount is subtotal after discount
      const discountedAmount = Math.max(0, subtotal - discount);
      // Coupon discount (if coupon was applied, it's part of discount)
      const couponDiscount = couponCode ? discount : 0;
      // Referral discount (not currently in model, default to 0)
      const referralDiscount = 0;
      // VAT/Tax
      const vatTax = tax;
      // Delivery charge
      const deliveryCharge = deliveryFee;
      // Total item amount (subtotal before discounts)
      const totalItemAmount = subtotal;
      // Order amount (final total)
      const orderAmount = order.pricing?.total || 0;

      return {
        id: order._id.toString(),
        orderId: order.orderId,
        restaurant: order.restaurantId?.onboarding?.step1?.restaurantName || order.restaurantName || order.restaurantId?.name || 'Unknown Restaurant',
        customerName: order.userId?.name || 'Invalid Customer Data',
        totalItemAmount: totalItemAmount,
        itemDiscount: itemDiscount,
        couponDiscount: couponDiscount,
        referralDiscount: referralDiscount,
        discountedAmount: discountedAmount,
        vatTax: vatTax,
        deliveryCharge: deliveryCharge,
        orderAmount: orderAmount,
      };
    });

    return successResponse(res, 200, 'Transaction report retrieved successfully', {
      summary: {
        completedTransaction: computedSummary.completedTransaction || 0,
        refundedTransaction: computedSummary.refundedTransaction || 0,
        adminEarning: computedSummary.adminEarning || 0,
        restaurantEarning: computedSummary.restaurantEarning || 0,
        deliverymanEarning: computedSummary.deliverymanEarning || 0
      },
      transactions: transformedTransactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching transaction report:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch transaction report');
  }
});

/**
 * Get restaurant report with statistics for each restaurant
 * GET /api/admin/orders/restaurant-report
 * Query params: zone, all (active/inactive), type (commission/subscription), time, search
 */
export const getRestaurantReport = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching restaurant report...');
    const { 
      zone,
      all,
      type,
      time,
      search
    } = req.query;
    
    console.log('📋 Query params:', { zone, all, type, time, search });

    const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
    const AdminCommission = (await import('../models/AdminCommission.js')).default;
    const FeedbackExperience = (await import('../models/FeedbackExperience.js')).default;

    // Build restaurant query
    const restaurantQuery = {};

    // Zone filter
    if (zone && zone !== 'All Zones') {
      const Zone = (await import('../models/Zone.js')).default;
      const zoneDoc = await Zone.findOne({
        name: { $regex: zone, $options: 'i' }
      }).select('_id name').lean();

      if (zoneDoc) {
        // Find restaurants in this zone by checking orders with this zoneId
        const ordersInZone = await Order.find({
          'assignmentInfo.zoneId': zoneDoc._id?.toString()
        }).distinct('restaurantId').lean();

        if (ordersInZone.length > 0) {
          restaurantQuery.$or = [
            { _id: { $in: ordersInZone } },
            { restaurantId: { $in: ordersInZone } }
          ];
        } else {
          // No restaurants found in this zone
          return successResponse(res, 200, 'Restaurant report retrieved successfully', {
            restaurants: [],
            pagination: {
              page: 1,
              limit: 1000,
              total: 0,
              pages: 0
            }
          });
        }
      }
    }

    // Active/Inactive filter
    if (all && all !== 'All') {
      restaurantQuery.isActive = all === 'Active';
    }

    // Search filter
    if (search) {
      restaurantQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { restaurantId: { $regex: search, $options: 'i' } }
      ];
    }

    // Get all restaurants matching the query
    let restaurants = await Restaurant.find(restaurantQuery)
      .select('_id restaurantId name profileImage rating totalRatings isActive onboarding')
      .lean();
      
    // Filter out incomplete restaurants (those without an onboarding name)
    restaurants = restaurants.filter(restaurant => 
      restaurant.onboarding?.step1?.restaurantName && 
      restaurant.onboarding.step1.restaurantName.trim() !== ''
    );
    
    // Fix restaurant names: Prefer onboarding.step1.restaurantName if available
    restaurants.forEach(restaurant => {
      if (restaurant.onboarding?.step1?.restaurantName) {
        restaurant.name = restaurant.onboarding.step1.restaurantName;
      }
    });

    console.log(`📊 Found ${restaurants.length} restaurants`);

    // Date range filter for orders
    let dateQuery = {};
    if (time && time !== 'All Time') {
      const now = new Date();
      dateQuery.createdAt = {};
      
      if (time === 'Today') {
        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        dateQuery.createdAt.$gte = startDate;
        dateQuery.createdAt.$lte = endDate;
      } else if (time === 'This Week') {
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek;
        const startDate = new Date(now.getFullYear(), now.getMonth(), diff);
        const endDate = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59);
        dateQuery.createdAt.$gte = startDate;
        dateQuery.createdAt.$lte = endDate;
      } else if (time === 'This Month') {
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        dateQuery.createdAt.$gte = startDate;
        dateQuery.createdAt.$lte = endDate;
      } else if (time === 'This Year') {
        const startDate = new Date(now.getFullYear(), 0, 1);
        const endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        dateQuery.createdAt.$gte = startDate;
        dateQuery.createdAt.$lte = endDate;
      }
    }

    // Process each restaurant
    const restaurantReports = await Promise.all(
      restaurants.map(async (restaurant) => {
        const restaurantId = restaurant._id?.toString();
        const restaurantIdField = restaurant.restaurantId;

        // Build order query for this restaurant
        const orderQuery = {
          ...dateQuery,
          $or: [
            { restaurantId: restaurantId },
            { restaurantId: restaurantIdField }
          ]
        };

        // Get orders for this restaurant
        const orders = await Order.find(orderQuery).lean();

        // Calculate statistics
        const totalOrder = orders.length;
        
        // Total order amount
        const totalOrderAmount = orders.reduce((sum, order) => 
          sum + (order.pricing?.total || 0), 0
        );

        // Total discount given
        const totalDiscountGiven = orders.reduce((sum, order) => 
          sum + (order.pricing?.discount || 0), 0
        );

        // Total VAT/TAX
        const totalVATTAX = orders.reduce((sum, order) => 
          sum + (order.pricing?.tax || 0), 0
        );

        // Get unique food items (count distinct itemIds from all orders)
        const uniqueItemIds = new Set();
        orders.forEach(order => {
          if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
              if (item.itemId) {
                uniqueItemIds.add(item.itemId);
              }
            });
          }
        });
        const totalFood = uniqueItemIds.size;

        // Get admin commission for this restaurant
        const restaurantObjectId = restaurant._id instanceof mongoose.Types.ObjectId 
          ? restaurant._id 
          : new mongoose.Types.ObjectId(restaurant._id);

        const commissionQuery = {
          restaurantId: restaurantObjectId,
          status: 'completed'
        };

        if (dateQuery.createdAt) {
          commissionQuery.orderDate = dateQuery.createdAt;
        }

        const commissions = await AdminCommission.find(commissionQuery).lean();
        const totalAdminCommission = commissions.reduce((sum, comm) => 
          sum + (comm.commissionAmount || 0), 0
        );

        // Get ratings from FeedbackExperience
        const ratingStats = await FeedbackExperience.aggregate([
          {
            $match: {
              restaurantId: restaurantObjectId,
              rating: { $exists: true, $ne: null, $gt: 0 }
            }
          },
          {
            $group: {
              _id: null,
              averageRating: { $avg: '$rating' },
              totalRatings: { $sum: 1 }
            }
          }
        ]);

        const averageRatings = ratingStats[0]?.averageRating || restaurant.rating || 0;
        const reviews = ratingStats[0]?.totalRatings || restaurant.totalRatings || 0;

        // Format currency values
        const formatCurrency = (amount) => {
          return `₹${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        };

        // Fix restaurant name: Prefer onboarding.step1.restaurantName if available
        const restaurantName = restaurant.onboarding?.step1?.restaurantName || restaurant.name || 'Restaurant';
        
        return {
          sl: 0, // Will be set in frontend
          id: restaurantId,
          restaurantName: restaurantName,
          icon: restaurant.profileImage?.url || restaurant.profileImage || null,
          totalFood,
          totalOrder,
          totalOrderAmount: formatCurrency(totalOrderAmount),
          totalDiscountGiven: formatCurrency(totalDiscountGiven),
          totalAdminCommission: formatCurrency(totalAdminCommission),
          totalVATTAX: formatCurrency(totalVATTAX),
          averageRatings: parseFloat(averageRatings.toFixed(1)),
          reviews
        };
      })
    );

    // Filter by type (Commission/Subscription) if needed
    let filteredReports = restaurantReports;
    if (type && type !== 'All types') {
      // This would require checking restaurant subscription status
      // For now, we'll return all restaurants
      // You can add subscription filtering logic here if needed
    }

    // Sort by restaurant name
    filteredReports.sort((a, b) => a.restaurantName.localeCompare(b.restaurantName));

    // Add serial numbers
    filteredReports = filteredReports.map((report, index) => ({
      ...report,
      sl: index + 1
    }));

    return successResponse(res, 200, 'Restaurant report retrieved successfully', {
      restaurants: filteredReports,
      pagination: {
        page: 1,
        limit: 1000,
        total: filteredReports.length,
        pages: 1
      }
    });
  } catch (error) {
    console.error('❌ Error fetching restaurant report:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch restaurant report');
  }
});

/**
 * Get refund requests (restaurant cancelled orders with pending refunds)
 * GET /api/admin/refund-requests
 */
export const getRefundRequests = asyncHandler(async (req, res) => {
  try {
    console.log('✅ getRefundRequests route hit!');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    
    const { 
      page = 1, 
      limit = 50,
      search,
      fromDate,
      toDate,
      restaurant
    } = req.query;

    console.log('🔍 Fetching refund requests with params:', { page, limit, search, fromDate, toDate, restaurant });

    // Build query for restaurant cancelled orders with pending refunds
    const query = {
      status: 'cancelled',
      cancellationReason: { 
        $regex: /rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue/i 
      }
    };
    
    console.log('📋 Initial query:', JSON.stringify(query, null, 2));

    // Restaurant filter
    if (restaurant && restaurant !== 'All restaurants') {
      try {
        const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
        const restaurantDoc = await Restaurant.findOne({
          $or: [
            { name: { $regex: restaurant, $options: 'i' } },
            ...(mongoose.Types.ObjectId.isValid(restaurant) ? [{ _id: restaurant }] : []),
            { restaurantId: restaurant }
          ]
        }).select('_id restaurantId').lean();

        if (restaurantDoc) {
          query.restaurantId = { $in: [restaurantDoc._id, restaurantDoc._id?.toString?.(), restaurantDoc.restaurantId].filter(Boolean) };
        }
      } catch (error) {
        console.error('Error filtering by restaurant:', error);
        // Continue without restaurant filter if there's an error
      }
    }

    // Date range filter
    if (fromDate || toDate) {
      query.cancelledAt = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        query.cancelledAt.$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        query.cancelledAt.$lte = endDate;
      }
    }

    // Search filter - build search conditions separately
    const searchConditions = [];
    if (search) {
      searchConditions.push(
        { orderId: { $regex: search, $options: 'i' } },
        { restaurantName: { $regex: search, $options: 'i' } }
      );
    }

    // Combine search with existing query
    if (searchConditions.length > 0) {
      if (Object.keys(query).length > 0 && !query.$and) {
        // Convert existing query to $and format
        const existingQuery = { ...query };
        query = {
          $and: [
            existingQuery,
            { $or: searchConditions }
          ]
        };
      } else if (query.$and) {
        // Add search to existing $and
        query.$and.push({ $or: searchConditions });
      } else {
        // Simple case - just add $or
        query.$or = searchConditions;
      }
    }

    console.log('📋 Final query:', JSON.stringify(query, null, 2));

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch orders with population
    // Sort by cancelledAt if available, otherwise by createdAt
    let orders = [];
    try {
      orders = await Order.find(query)
        .populate('userId', 'name email phone')
        .populate({
          path: 'restaurantId',
          select: 'name slug onboarding',
          match: { _id: { $exists: true } } // Only populate if it's a valid ObjectId
        })
        .sort({ cancelledAt: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();
      
      // Filter out orders where restaurantId population failed (null)
      orders = orders.filter(order => order.restaurantId !== null || order.restaurantName);
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }

    const total = await Order.countDocuments(query);
    console.log(`✅ Found ${total} restaurant cancelled orders`);

    // Get settlement info for each order to check refund status
    let OrderSettlement;
    try {
      OrderSettlement = (await import('../../order/models/OrderSettlement.js')).default;
    } catch (error) {
      console.error('Error importing OrderSettlement:', error);
      OrderSettlement = null;
    }
    
    const transformedOrders = await Promise.all(orders.map(async (order, index) => {
      let settlement = null;
      if (OrderSettlement) {
        try {
          settlement = await OrderSettlement.findOne({ orderId: order._id }).lean();
        } catch (error) {
          console.error(`Error fetching settlement for order ${order._id}:`, error);
        }
      }
      
      const orderDate = new Date(order.createdAt);
      const dateStr = orderDate.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }).toUpperCase();
      const timeStr = orderDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }).toUpperCase();

      const customerPhone = order.userId?.phone || '';
      
      // Check refund status from settlement
      const refundStatus = settlement?.cancellationDetails?.refundStatus || 'pending';
      const refundAmount = settlement?.cancellationDetails?.refundAmount || 0;

      return {
        sl: skip + index + 1,
        orderId: order.orderId,
        id: order._id.toString(),
        date: dateStr,
        time: timeStr,
        customerName: order.userId?.name || 'Unknown',
        customerPhone: customerPhone,
        customerEmail: order.userId?.email || '',
        restaurant: order.restaurantId?.onboarding?.step1?.restaurantName || order.restaurantName || order.restaurantId?.name || 'Unknown Restaurant',
        restaurantId: order.restaurantId?.toString() || order.restaurantId || '',
        totalAmount: order.pricing?.total || 0,
        paymentStatus: order.payment?.status === 'completed' ? 'Paid' : 'Pending',
        orderStatus: 'Refund Requested',
        deliveryType: order.deliveryFleet === 'standard' ? 'Home Delivery' : 'Fast Delivery',
        cancellationReason: order.cancellationReason || 'Rejected by restaurant',
        cancelledAt: order.cancelledAt,
        refundStatus: refundStatus,
        refundAmount: refundAmount,
        settlement: settlement ? {
          cancellationStage: settlement.cancellationDetails?.cancellationStage,
          refundAmount: settlement.cancellationDetails?.refundAmount,
          restaurantCompensation: settlement.cancellationDetails?.restaurantCompensation
        } : null
      };
    }));

    console.log(`✅ Returning ${transformedOrders.length} refund requests`);
    
    return successResponse(res, 200, 'Refund requests retrieved successfully', {
      orders: transformedOrders || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total || 0,
        pages: Math.ceil((total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching refund requests:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    return errorResponse(res, 500, error.message || 'Failed to fetch refund requests');
  }
});

/**
 * Process refund for an order via Razorpay
 * POST /api/admin/orders/:orderId/refund
 */
export const processRefund = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 [processRefund] ========== ROUTE HIT ==========');
    console.log('🔍 [processRefund] Method:', req.method);
    console.log('🔍 [processRefund] URL:', req.url);
    console.log('🔍 [processRefund] Original URL:', req.originalUrl);
    console.log('🔍 [processRefund] Path:', req.path);
    console.log('🔍 [processRefund] Base URL:', req.baseUrl);
    console.log('🔍 [processRefund] Params:', req.params);
    console.log('🔍 [processRefund] Headers:', {
      authorization: req.headers.authorization ? 'Present' : 'Missing',
      'content-type': req.headers['content-type']
    });

    const { orderId } = req.params;
    const { notes, refundAmount } = req.body;
    const adminId = req.user?.id || req.admin?.id || null;

    console.log('🔍 [processRefund] Processing refund request:', {
      orderId,
      orderIdType: typeof orderId,
      orderIdLength: orderId?.length,
      isObjectId: mongoose.Types.ObjectId.isValid(orderId),
      adminId,
      url: req.url,
      method: req.method,
      params: req.params,
      body: req.body,
      refundAmount: refundAmount,
      refundAmountType: typeof refundAmount,
      notes: notes
    });

    // Find order in database - try both MongoDB _id and orderId string
    let order = null;
    
    console.log('🔍 [processRefund] Searching order in database...', {
      searchId: orderId,
      isObjectId: mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24
    });
    
    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      console.log('🔍 [processRefund] Searching by MongoDB _id:', orderId);
      order = await Order.findById(orderId)
        .populate('userId', 'name email phone _id')
        .lean();
      console.log('🔍 [processRefund] Order found by _id:', order ? 'Yes' : 'No');
    }
    
    // If not found by _id, try orderId string
    if (!order) {
      console.log('🔍 [processRefund] Searching by orderId string:', orderId);
      order = await Order.findOne({ orderId: orderId })
        .populate('userId', 'name email phone _id')
        .lean();
      console.log('🔍 [processRefund] Order found by orderId:', order ? 'Yes' : 'No');
    }

    if (!order) {
      console.error('❌ [processRefund] Order NOT FOUND in database');
      console.error('❌ [processRefund] Searched by:', {
        mongoId: mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24 ? orderId : 'N/A',
        orderIdString: orderId,
        orderIdType: typeof orderId,
        orderIdLength: orderId?.length
      });
      
      // Try to find any order with similar orderId (for debugging)
      try {
        const similarOrders = await Order.find({
          $or: [
            { orderId: { $regex: orderId, $options: 'i' } },
            { orderId: { $regex: orderId.substring(0, 10), $options: 'i' } }
          ]
        })
        .select('_id orderId status')
        .limit(5)
        .lean();
        
        if (similarOrders.length > 0) {
          console.log('💡 [processRefund] Found similar orders:', similarOrders.map(o => ({
            mongoId: o._id.toString(),
            orderId: o.orderId,
            status: o.status
          })));
        }
      } catch (debugError) {
        console.error('Error searching for similar orders:', debugError.message);
      }
      
      // Check total orders count
      try {
        const totalOrders = await Order.countDocuments();
        console.log(`📊 [processRefund] Total orders in database: ${totalOrders}`);
      } catch (countError) {
        console.error('Error counting orders:', countError.message);
      }
      
      return errorResponse(res, 404, `Order not found (ID: ${orderId}). Please check if the order exists.`);
    }
    
    // Verify order exists and log complete details
    console.log('✅✅✅ [processRefund] ORDER FOUND IN DATABASE ✅✅✅');
    console.log('📋 [processRefund] Complete Order Details:', {
      mongoId: order._id.toString(),
      orderId: order.orderId,
      status: order.status,
      paymentMethod: order.payment?.method || 'unknown',
      paymentType: order.paymentType || 'unknown',
      total: order.pricing?.total || 0,
      cancelledBy: order.cancelledBy || 'unknown',
      userId: order.userId?._id?.toString() || order.userId?.toString() || 'unknown',
      userName: order.userId?.name || 'unknown',
      userPhone: order.userId?.phone || 'unknown'
    });

    if (order.status !== 'cancelled') {
      return errorResponse(res, 400, 'Order is not cancelled');
    }

    // Check if it's a cancelled order (by restaurant or user)
    const isRestaurantCancelled = order.cancelledBy === 'restaurant' || 
      (order.cancellationReason && 
       /rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue/i.test(order.cancellationReason));
    
    const isUserCancelled = order.cancelledBy === 'user';

    if (!isRestaurantCancelled && !isUserCancelled) {
      return errorResponse(res, 400, 'This order was not cancelled by restaurant or user');
    }

    // Check payment method - wallet payments don't use Razorpay
    const paymentMethod = order.payment?.method;
    
    if (!paymentMethod) {
      return errorResponse(res, 400, 'Payment method not found for this order');
    }
    
    // For wallet payments, allow refund regardless of delivery type (no Razorpay involved)
    // For other payments (Razorpay), only allow refund for Home Delivery orders
    // Note: Order model uses deliveryFleet, not deliveryType
    if (paymentMethod !== 'wallet') {
      // Check deliveryFleet - 'standard' and 'fast' are home delivery types
      const isHomeDelivery = order.deliveryFleet === 'standard' || order.deliveryFleet === 'fast';
      if (!isHomeDelivery) {
        return errorResponse(res, 400, 'Refund can only be processed for Home Delivery orders');
      }
    }

    // Get settlement (for wallet payments, settlement might not exist - create one if needed)
    const OrderSettlement = (await import('../../order/models/OrderSettlement.js')).default;
    let settlement = await OrderSettlement.findOne({ orderId: order._id });

    // Resolve restaurantId to a proper ObjectId for OrderSettlement
    let restaurantIdForSettlement = order.restaurantId;
    try {
      // If it's already a valid ObjectId (string of length 24) keep it
      const asString =
        typeof order.restaurantId === 'string'
          ? order.restaurantId
          : order.restaurantId?.toString?.();
      if (!asString || !mongoose.Types.ObjectId.isValid(asString) || asString.length !== 24) {
        // Find by business keys when legacy string like "REST-xxxx" is stored on Order
        const restaurantDoc = await Restaurant.findOne({
          $or: [
            // If somehow _id string was stored, this will match too
            ...(asString && mongoose.Types.ObjectId.isValid(asString) && asString.length === 24
              ? [{ _id: asString }]
              : []),
            { restaurantId: asString },
            { slug: asString },
          ],
        })
          .select('_id')
          .lean();
        restaurantIdForSettlement = restaurantDoc?._id || restaurantIdForSettlement;
      }
    } catch (resolveErr) {
      console.warn('[processRefund] Failed to resolve restaurantId to ObjectId:', resolveErr?.message);
    }

    // If still not a valid ObjectId, block with a clear error instead of throwing a cast error
    const restaurantIdForSettlementStr =
      typeof restaurantIdForSettlement === 'string'
        ? restaurantIdForSettlement
        : restaurantIdForSettlement?.toString?.();
    if (!restaurantIdForSettlementStr || !mongoose.Types.ObjectId.isValid(restaurantIdForSettlementStr) || restaurantIdForSettlementStr.length !== 24) {
      return errorResponse(
        res,
        500,
        `OrderSettlement validation failed: restaurantId cannot be resolved for order ${order.orderId}. Please ensure restaurant exists and is linked properly.`,
      );
    }

    // For wallet payments, if settlement doesn't exist, create a proper one with all required fields
    if (!settlement && paymentMethod === 'wallet') {
      console.log('📝 [processRefund] Settlement not found for wallet order, creating settlement with order data...');
      
      const pricing = order.pricing || {};
      const subtotal = pricing.subtotal || 0;
      const deliveryFee = pricing.deliveryFee || 0;
      const platformFee = pricing.platformFee || 0;
      const tax = pricing.tax || 0;
      const total = pricing.total || 0;
      
      // Calculate earnings (simplified for wallet refunds - we just need the structure)
      const foodPrice = subtotal;
      const commission = 0; // For wallet refunds, we don't need actual commission
      const netEarning = foodPrice; // Simplified
      
      settlement = new OrderSettlement({
        orderId: order._id,
        orderNumber: order.orderId,
        userId: order.userId?._id || order.userId,
        restaurantId: restaurantIdForSettlementStr,
        restaurantName: order.restaurantName || 'Unknown Restaurant',
        userPayment: {
          subtotal: subtotal,
          discount: pricing.discount || 0,
          deliveryFee: deliveryFee,
          platformFee: platformFee,
          gst: tax,
          packagingFee: 0,
          total: total
        },
        restaurantEarning: {
          foodPrice: foodPrice,
          commission: commission,
          commissionPercentage: 0,
          netEarning: netEarning,
          status: 'cancelled'
        },
        deliveryPartnerEarning: {
          basePayout: 0,
          distance: 0,
          commissionPerKm: 0,
          distanceCommission: 0,
          surgeMultiplier: 1,
          surgeAmount: 0,
          totalEarning: 0,
          status: 'cancelled'
        },
        adminEarning: {
          commission: commission,
          platformFee: platformFee,
          deliveryFee: deliveryFee,
          gst: tax,
          deliveryMargin: 0,
          totalEarning: platformFee + deliveryFee + tax,
          status: 'cancelled'
        },
        escrowStatus: 'refunded',
        escrowAmount: total,
        settlementStatus: 'cancelled',
        cancellationDetails: {
          cancelled: true,
          cancelledAt: order.updatedAt || new Date(),
          refundStatus: 'pending'
        }
      });
      await settlement.save();
      console.log('✅ [processRefund] Settlement created for wallet refund');
    } else if (!settlement) {
      // For non-wallet payments, create a minimal settlement from order data to allow refund processing
      console.log('📝 [processRefund] Settlement not found for online payment, creating settlement with order data...');
      const OrderSettlement = (await import('../../order/models/OrderSettlement.js')).default;

      const pricing = order.pricing || {};
      const subtotal = pricing.subtotal || 0;
      const deliveryFee = pricing.deliveryFee || 0;
      const platformFee = pricing.platformFee || 0;
      const tax = pricing.tax || 0;
      const total = pricing.total || 0;

      // Derive simplified earnings; detailed commission math is not critical for enabling refund
      const foodPrice = subtotal;
      const commission = 0;
      const netEarning = foodPrice;

      settlement = new OrderSettlement({
        orderId: order._id,
        orderNumber: order.orderId,
        userId: order.userId?._id || order.userId,
        restaurantId: restaurantIdForSettlementStr,
        restaurantName: order.restaurantName || 'Unknown Restaurant',
        userPayment: {
          subtotal: subtotal,
          discount: pricing.discount || 0,
          deliveryFee: deliveryFee,
          platformFee: platformFee,
          gst: tax,
          packagingFee: 0,
          total: total
        },
        restaurantEarning: {
          foodPrice: foodPrice,
          commission: commission,
          commissionPercentage: 0,
          netEarning: netEarning,
          status: 'cancelled'
        },
        deliveryPartnerEarning: {
          basePayout: 0,
          distance: 0,
          commissionPerKm: 0,
          distanceCommission: 0,
          surgeMultiplier: 1,
          surgeAmount: 0,
          totalEarning: 0,
          status: 'cancelled'
        },
        adminEarning: {
          commission: commission,
          platformFee: platformFee,
          deliveryFee: deliveryFee,
          gst: tax,
          deliveryMargin: 0,
          totalEarning: platformFee + deliveryFee + tax,
          status: 'cancelled'
        },
        escrowStatus: 'refunded',
        escrowAmount: total,
        settlementStatus: 'cancelled',
        cancellationDetails: {
          cancelled: true,
          cancelledAt: order.updatedAt || new Date(),
          // Default to full refund for admin-triggered online refunds when no prior calc exists
          refundAmount: total,
          refundStatus: 'pending'
        }
      });
      await settlement.save();
      console.log('✅ [processRefund] Settlement created for online refund');
    }

    // Check if refund already processed
    if (settlement.cancellationDetails?.refundStatus === 'processed' || 
        settlement.cancellationDetails?.refundStatus === 'initiated') {
      return errorResponse(res, 400, 'Refund already processed or initiated for this order');
    }

    // Handle wallet refunds differently (paymentMethod already declared above)
    // Wallet payments don't use Razorpay - refund is direct wallet credit
    let refundResult;
    if (paymentMethod === 'wallet') {
      // For wallet payments, use provided refundAmount or calculate from order
      const orderTotal = order.pricing?.total || settlement.userPayment?.total || 0;
      let finalRefundAmount = 0;
      
      // If refundAmount is provided in request body, use it (validate it)
      if (refundAmount !== undefined && refundAmount !== null && refundAmount !== '') {
        const requestedAmount = parseFloat(refundAmount);
        console.log('💰 [processRefund] Validating refund amount:', {
          original: refundAmount,
          parsed: requestedAmount,
          isNaN: isNaN(requestedAmount),
          orderTotal: orderTotal
        });
        
        if (isNaN(requestedAmount) || requestedAmount <= 0) {
          console.error('❌ [processRefund] Invalid refund amount:', requestedAmount);
          return errorResponse(res, 400, `Invalid refund amount provided: ${refundAmount}. Please provide a valid positive number.`);
        }
        if (requestedAmount > orderTotal) {
          console.error('❌ [processRefund] Refund amount exceeds order total:', {
            requestedAmount,
            orderTotal
          });
          return errorResponse(res, 400, `Refund amount (₹${requestedAmount}) cannot exceed order total (₹${orderTotal})`);
        }
        finalRefundAmount = requestedAmount;
        console.log('✅ [processRefund] Wallet payment - using provided refund amount:', finalRefundAmount);
      } else {
        // If no amount provided, use calculated refund or order total
        const calculatedRefund = settlement.cancellationDetails?.refundAmount || 0;
        
        // For wallet, always use order total if calculated refund is 0
        if (calculatedRefund <= 0 && orderTotal > 0) {
          console.log('💰 [processRefund] Wallet payment - using full order total for refund:', orderTotal);
          finalRefundAmount = orderTotal;
        } else if (calculatedRefund > 0) {
          finalRefundAmount = calculatedRefund;
        } else {
          return errorResponse(res, 400, 'No refund amount found for this order');
        }
      }
      
      // Update settlement with refund amount
      if (!settlement.cancellationDetails) {
        settlement.cancellationDetails = {};
      }
      settlement.cancellationDetails.refundAmount = finalRefundAmount;
      await settlement.save();
      
      // Process wallet refund (add to user wallet) with the specified amount
      const { processWalletRefund } = await import('../../order/services/cancellationRefundService.js');
      refundResult = await processWalletRefund(order._id, adminId, finalRefundAmount);
    } else {
      // For Razorpay, check if refund amount is calculated
      const refundAmount = settlement.cancellationDetails?.refundAmount || 0;
      if (refundAmount <= 0) {
        return errorResponse(res, 400, 'No refund amount calculated for this order');
      }
      
      // Process Razorpay refund
      const { processRazorpayRefund } = await import('../../order/services/cancellationRefundService.js');
      refundResult = await processRazorpayRefund(order._id, adminId);
    }

    // Update settlement with admin notes if provided
    if (notes) {
      settlement.metadata = settlement.metadata || new Map();
      settlement.metadata.set('adminRefundNotes', notes);
      await settlement.save();
    }

    return successResponse(res, 200, refundResult.message || 'Refund processed successfully', {
      orderId: order.orderId,
      refundId: refundResult.refundId,
      refundAmount: refundResult.refundAmount,
      razorpayRefund: refundResult.razorpayRefund,
      message: refundResult.message
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    return errorResponse(res, 500, error.message || 'Failed to process refund');
  }
});

/**
 * Manually assign order to delivery partner
 * POST /api/admin/orders/:id/assign-delivery-partner
 * Body: { deliveryPartnerId: string }
 */
export const assignOrderToDeliveryPartner = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { deliveryPartnerId } = req.body;

    if (!deliveryPartnerId) {
      return errorResponse(res, 400, 'Delivery partner ID is required');
    }

    // Find order by _id or orderId
    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findById(id);
    }
    if (!order) {
      order = await Order.findOne({ orderId: id });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Validate order status
    if (order.status === 'cancelled') {
      return errorResponse(res, 400, 'Cannot assign cancelled order');
    }

    if (order.status === 'delivered') {
      return errorResponse(res, 400, 'Cannot assign already delivered order');
    }

    if (order.status !== 'ready') {
      return errorResponse(res, 400, `Order must be in 'ready' status. Current status: ${order.status}`);
    }

    // Check if order already has delivery partner
    if (order.deliveryPartnerId) {
      return errorResponse(res, 400, 'Order already has a delivery partner assigned');
    }

    // Verify delivery partner exists and is active
    const Delivery = (await import('../../delivery/models/Delivery.js')).default;
    const deliveryPartner = await Delivery.findById(deliveryPartnerId)
      .select('name phone status isActive availability')
      .lean();

    if (!deliveryPartner) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    if (deliveryPartner.status !== 'approved' && deliveryPartner.status !== 'active') {
      return errorResponse(res, 400, 'Delivery partner is not approved or active');
    }

    if (!deliveryPartner.isActive) {
      return errorResponse(res, 400, 'Delivery partner is not active');
    }

    // For manual assignment, we don't assign directly
    // Instead, we send a notification/request to the selected delivery boy
    // They can then accept the order, which will assign it to them
    
    // Store the selected delivery partner ID in assignmentInfo for tracking
    // This allows the delivery boy to accept the order when they receive the notification
    if (!order.assignmentInfo) {
      order.assignmentInfo = {};
    }
    
    // Store in priorityDeliveryPartnerIds so delivery boy can accept it
    if (!order.assignmentInfo.priorityDeliveryPartnerIds) {
      order.assignmentInfo.priorityDeliveryPartnerIds = [];
    }
    
    // Add this delivery partner to the priority list (for manual assignment)
    const deliveryPartnerIdStr = deliveryPartnerId.toString();
    if (!order.assignmentInfo.priorityDeliveryPartnerIds.includes(deliveryPartnerIdStr)) {
      order.assignmentInfo.priorityDeliveryPartnerIds.push(deliveryPartnerIdStr);
    }
    
    // Mark as manual assignment
    order.assignmentInfo.assignedBy = 'manual';
    order.assignmentInfo.manualAssignmentRequestedAt = new Date();
    
    await order.save();

    // Send notification/request to the selected delivery partner
    // They will receive 'new_order_available' event and can accept it
    try {
      const { notifyMultipleDeliveryBoys } = await import('../../order/services/deliveryNotificationService.js');
      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name address location phone')
        .lean();
      
      // Send notification to the selected delivery partner
      const notificationResult = await notifyMultipleDeliveryBoys(
        populatedOrder,
        [deliveryPartnerId],
        'priority' // Mark as priority since it's manually selected by admin
      );
      
      console.log(`✅ Sent order request to delivery partner ${deliveryPartnerId} for order ${order.orderId}`);
      console.log(`📤 Notification result:`, notificationResult);
    } catch (notifError) {
      console.error('Error sending notification to delivery partner:', notifError);
      // Continue even if notification fails - order is still marked for manual assignment
    }

    // Reload order with populated data
    const updatedOrder = await Order.findById(order._id)
      .populate('userId', 'name phone')
      .populate('restaurantId', 'name address location')
      .lean();

    return successResponse(res, 200, 'Order request sent to delivery partner successfully. They can accept it to get assigned.', {
      order: updatedOrder,
      message: 'Delivery partner will receive a notification and can accept the order'
    });
  } catch (error) {
    console.error('Error assigning order to delivery partner:', error);
    return errorResponse(res, 500, error.message || 'Failed to assign order');
  }
});

/**
 * Resend delivery notification for unassigned order (admin)
 * POST /api/admin/orders/:id/resend-delivery-notification
 */
export const resendDeliveryNotification = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Try to find order by MongoDB _id or orderId
    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findById(id);
    }
    if (!order) {
      order = await Order.findOne({ orderId: id });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Check if order is in valid status (preparing or ready)
    if (!['preparing', 'ready'].includes(order.status)) {
      return errorResponse(
        res,
        400,
        `Cannot resend notification. Order status must be 'preparing' or 'ready'. Current status: ${order.status}`,
      );
    }

    // Do not resend if already assigned
    if (order.deliveryPartnerId) {
      return errorResponse(res, 400, 'Order already has a delivery partner assigned');
    }

    // Get restaurant location from restaurant doc or fall back to order.restaurantLocation
    const restaurantId = order.restaurantId;
    let restaurantDoc = null;
    const restaurantIdStr = restaurantId?.toString?.() || restaurantId;
    if (mongoose.Types.ObjectId.isValid(restaurantIdStr) && String(restaurantIdStr).length === 24) {
      restaurantDoc = await Restaurant.findById(new mongoose.Types.ObjectId(restaurantIdStr))
        .select('location')
        .lean();
    }
    if (!restaurantDoc) {
      const restaurantOr = [{ restaurantId: restaurantIdStr }];
      // Only include _id lookup when it is a valid ObjectId, otherwise Mongoose throws CastError
      if (mongoose.Types.ObjectId.isValid(restaurantIdStr) && String(restaurantIdStr).length === 24) {
        restaurantOr.push({ _id: new mongoose.Types.ObjectId(restaurantIdStr) });
      }
      restaurantDoc = await Restaurant.findOne({ $or: restaurantOr })
        .select('location')
        .lean();
    }

    // Build effective location
    const fallbackRestaurantLocation =
      order.restaurantLocation && (order.restaurantLocation.latitude || order.restaurantLocation.longitude)
        ? {
            type: 'Point',
            coordinates: [
              Number(order.restaurantLocation.longitude) || 0,
              Number(order.restaurantLocation.latitude) || 0,
            ],
          }
        : null;
    const effectiveRestaurantLocation =
      restaurantDoc?.location?.coordinates?.length ? restaurantDoc.location : fallbackRestaurantLocation;

    if (!effectiveRestaurantLocation || !effectiveRestaurantLocation.coordinates) {
      return errorResponse(res, 400, 'Restaurant location not found. Please update restaurant location.');
    }

    const [restaurantLng, restaurantLat] = effectiveRestaurantLocation.coordinates;

    // Prefer notifying ALL online delivery partners in the restaurant's zone.
    // This matches "all delivery boys in that zone should receive the request".
    // Manual assignment is no longer supported.
    const assignmentMode = 'automatic';

    const Zone = (await import('../models/Zone.js')).default;
    const Delivery = (await import('../../delivery/models/Delivery.js')).default;

    let deliveryPartnerIds = [];

    // Resolve zone by restaurantId (Zone.restaurantId is Restaurant ObjectId).
    // order.restaurantId may be ObjectId or legacy string.
    let zone = null;
    if (mongoose.Types.ObjectId.isValid(restaurantId?.toString?.() || restaurantId)) {
      zone = await Zone.findOne({
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
        isActive: true,
      }).select('_id name').lean();
    }
    if (!zone) {
      // Fallback: try to resolve restaurant by business restaurantId string
      const restaurantOr = [{ restaurantId: restaurantId }];
      // Only include _id lookup when it is a valid ObjectId, otherwise Mongoose throws CastError
      if (mongoose.Types.ObjectId.isValid(restaurantId?.toString?.() || restaurantId)) {
        restaurantOr.push({ _id: new mongoose.Types.ObjectId(restaurantId) });
      }
      const restaurantDoc = await Restaurant.findOne({ $or: restaurantOr })
        .select('_id')
        .lean();
      if (restaurantDoc?._id) {
        zone = await Zone.findOne({
          restaurantId: restaurantDoc._id,
          isActive: true,
        }).select('_id name').lean();
      }
    }

    if (zone?._id) {
      const zonePartners = await Delivery.find({
        'availability.isOnline': true,
        status: { $in: ['approved', 'active'] },
        isActive: true,
        'availability.zones': zone._id,
      }).select('_id').lean();

      deliveryPartnerIds = (zonePartners || []).map((p) => p._id.toString());
      console.log(
        `📣 Admin resend: notifying ${deliveryPartnerIds.length} partners in zone ${zone.name} (${zone._id}) (mode=${assignmentMode})`,
      );
    }

    // Fallback: if zone is missing or no partners in zone, use distance-based nearest logic.
    if (!deliveryPartnerIds || deliveryPartnerIds.length === 0) {
      const priorityDeliveryBoys = (
        await findNearestDeliveryBoys(
          restaurantLat,
          restaurantLng,
          restaurantId,
          20, // 20km radius for priority
        )
      ).slice(0, 10); // Top 10 nearest

      let deliveryBoysToNotify = priorityDeliveryBoys;
      if (!deliveryBoysToNotify || deliveryBoysToNotify.length === 0) {
        deliveryBoysToNotify = (
          await findNearestDeliveryBoys(
            restaurantLat,
            restaurantLng,
            restaurantId,
            50, // 50km radius
          )
        ).slice(0, 20); // Top 20 nearest
      }

      if (!deliveryBoysToNotify || deliveryBoysToNotify.length === 0) {
        return errorResponse(res, 404, 'No delivery partners available in your area');
      }

      deliveryPartnerIds = deliveryBoysToNotify.map((db) => db.deliveryPartnerId);
    }

    // Populate order for notification payload
    const populatedOrder = await Order.findById(order._id)
      .populate('userId', 'name phone')
      .populate('restaurantId', 'name location address phone ownerPhone')
      .lean();

    if (!populatedOrder) {
      return errorResponse(res, 500, 'Failed to load order for notification');
    }

    // Update assignment info for tracking
    await Order.findByIdAndUpdate(order._id, {
      $set: {
        'assignmentInfo.priorityDeliveryPartnerIds': deliveryPartnerIds,
        'assignmentInfo.assignedBy': 'admin_manual_resend',
        'assignmentInfo.assignedAt': new Date(),
      },
      $inc: {
        'assignmentInfo.resendVersion': 1,
      },
    });

    await notifyMultipleDeliveryBoys(populatedOrder, deliveryPartnerIds, 'priority');

    return successResponse(
      res,
      200,
      `Notification sent to ${deliveryPartnerIds.length} delivery partners`,
      { notifiedCount: deliveryPartnerIds.length },
    );
  } catch (error) {
    console.error('Error resending delivery notification (admin):', error);
    return errorResponse(res, 500, `Failed to resend notification: ${error.message}`);
  }
});

/**
 * Backfill restaurantLocation for online (razorpay) orders created in the last N days
 * POST /api/admin/orders/backfill-restaurant-location?days=7
 */
export const backfillRestaurantLocation = asyncHandler(async (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.query.days || "7", 10));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Find candidate orders
    const candidates = await Order.find({
      "payment.method": "razorpay",
      createdAt: { $gte: since },
      $or: [{ restaurantLocation: null }, { restaurantLocation: { $exists: false } }],
    })
      .select("_id restaurantId restaurantLocation createdAt")
      .lean();

    if (!candidates || candidates.length === 0) {
      return successResponse(res, 200, "No orders need backfill", { updated: 0 });
    }

    let updatedCount = 0;

    for (const ord of candidates) {
      // Resolve restaurant by either _id or business restaurantId
      let restaurantDoc = null;
      const rid = ord.restaurantId;
      try {
        if (mongoose.Types.ObjectId.isValid(rid)) {
          restaurantDoc = await Restaurant.findById(rid)
            .select("location address")
            .lean();
        }
        if (!restaurantDoc) {
          restaurantDoc = await Restaurant.findOne({
            $or: [{ restaurantId: rid }, { _id: rid }],
          })
            .select("location address")
            .lean();
        }
      } catch (e) {
        // continue to next
      }

      const coords =
        restaurantDoc?.location?.geoLocation?.coordinates?.length
          ? restaurantDoc.location.geoLocation.coordinates
          : restaurantDoc?.location?.coordinates;

      if (!coords || coords.length !== 2) {
        continue;
      }

      const resolvedRestaurantLocation = {
        type: "Point",
        coordinates: coords,
        formattedAddress:
          restaurantDoc.location?.formattedAddress || restaurantDoc.address || null,
        address: restaurantDoc.location?.address || restaurantDoc.address || null,
      };

      const upd = await Order.updateOne(
        { _id: ord._id },
        { $set: { restaurantLocation: resolvedRestaurantLocation } },
      );

      if (upd.modifiedCount > 0) {
        updatedCount += 1;
      }
    }

    return successResponse(res, 200, "Backfill completed", {
      updated: updatedCount,
      scanned: candidates.length,
      since,
    });
  } catch (error) {
    console.error("Error backfilling restaurantLocation:", error);
    return errorResponse(res, 500, "Failed to backfill restaurant location");
  }
});
/**
 * Reassign a restaurant-cancelled order back to the restaurant
 * POST /api/admin/orders/:id/reassign-restaurant
 */
export const reassignOrderToRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Find order by _id or orderId
    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findById(id);
    }
    if (!order) {
      order = await Order.findOne({ orderId: id });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Only allow reassign if cancelled by restaurant
    const isRestaurantCancelled =
      order.status === 'cancelled' &&
      (order.cancelledBy === 'restaurant' ||
        /order not accepted within time limit|restaurant did not respond|rejected by restaurant|restaurant cancelled/i.test(
          order.cancellationReason || ''
        ));

    if (!isRestaurantCancelled) {
      return errorResponse(
        res,
        400,
        'Order is not cancelled by restaurant or not eligible for reassignment'
      );
    }

    // Restore status so restaurant sees it as a fresh order
    order.status = 'confirmed';
    order.cancelledAt = null;
    order.cancellationReason = null;
    order.cancelledBy = null;

    // Bump resend version and mark who triggered it
    if (!order.assignmentInfo) order.assignmentInfo = {};
    order.assignmentInfo.assignedBy = 'admin_manual_resend';
    order.assignmentInfo.assignedAt = new Date();
    order.assignmentInfo.resendVersion = (order.assignmentInfo.resendVersion || 0) + 1;

    await order.save();

    // Notify restaurant via sockets + FCM
    const restaurantId =
      order.restaurantId?._id?.toString?.() || order.restaurantId?.toString?.() || order.restaurantId;
    await notifyRestaurantNewOrder(order, restaurantId, order.payment?.method);

    return successResponse(res, 200, 'Order reassigned to restaurant and notification sent', {
      orderId: order.orderId,
      restaurantId,
      status: order.status,
      resendVersion: order.assignmentInfo.resendVersion
    });
  } catch (error) {
    console.error('Error reassigning order to restaurant:', error);
    return errorResponse(res, 500, error.message || 'Failed to reassign order to restaurant');
  }
});

/**
 * Resend restaurant new_order notification without changing order status
 * POST /api/admin/orders/:id/resend-restaurant-notification
 */
export const resendRestaurantNotification = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    // Find order by _id or orderId
    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findById(id);
    }
    if (!order) {
      order = await Order.findOne({ orderId: id });
    }
    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Only allow for active states that restaurant should see
    if (!['pending', 'confirmed', 'preparing'].includes(order.status)) {
      return errorResponse(res, 400, `Order status ${order.status} not eligible for resend`);
    }

    const restaurantId =
      order.restaurantId?._id?.toString?.() || order.restaurantId?.toString?.() || order.restaurantId;
    await notifyRestaurantNewOrder(order, restaurantId, order.payment?.method);

    return successResponse(res, 200, 'Restaurant notification resent', {
      orderId: order.orderId,
      restaurantId
    });
  } catch (error) {
    console.error('Error resending restaurant notification:', error);
    return errorResponse(res, 500, error.message || 'Failed to resend restaurant notification');
  }
});

/**
 * Get delivery partner wallet info (for admin)
 * GET /api/admin/delivery-partners/:id/wallet
 */
export const getDeliveryPartnerWallet = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const Delivery = (await import('../../delivery/models/Delivery.js')).default;
    const DeliveryWallet = (await import('../../delivery/models/DeliveryWallet.js')).default;
    const BusinessSettings = (await import('../models/BusinessSettings.js')).default;

    const deliveryPartner = await Delivery.findById(id).lean();
    if (!deliveryPartner) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    // Get or create wallet
    let wallet = await DeliveryWallet.findOne({ deliveryId: id });
    if (!wallet) {
      wallet = await DeliveryWallet.create({
        deliveryId: id,
        totalBalance: 0,
        cashInHand: 0,
        totalWithdrawn: 0,
        totalEarned: 0
      });
    }

    // Get cash limit from settings
    const settings = await BusinessSettings.getSettings();
    const totalCashLimit = Number(settings?.deliveryCashLimit) || 0;

    // Calculate COD cash collected
    const Order = (await import('../../order/models/Order.js')).default;
    const codOrders = await Order.find({
      deliveryPartnerId: id,
      'payment.method': { $in: ['COD', 'cod', 'cash_on_delivery'] },
      status: { $in: ['out_for_delivery', 'delivered'] }
    }).lean();

    let codCollectedTotal = 0;
    for (const order of codOrders) {
      const orderTotal = Number(order.totalAmount) || 0;
      codCollectedTotal += orderTotal;
    }

    const cashInHand = codCollectedTotal;
    const availableCashLimit = Math.max(0, totalCashLimit - cashInHand);

    return successResponse(res, 200, 'Delivery partner wallet retrieved successfully', {
      deliveryPartnerId: id,
      deliveryPartnerName: deliveryPartner.name,
      totalCashLimit,
      cashInHand,
      availableCashLimit,
      totalBalance: wallet.totalBalance || 0,
      totalEarned: wallet.totalEarned || 0,
      totalWithdrawn: wallet.totalWithdrawn || 0
    });
  } catch (error) {
    console.error('Error fetching delivery partner wallet:', error);
    return errorResponse(res, 500, error.message || 'Failed to fetch wallet info');
  }
});
