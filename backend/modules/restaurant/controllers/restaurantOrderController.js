import Order from "../../order/models/Order.js";
import Payment from "../../payment/models/Payment.js";
import Restaurant from "../models/Restaurant.js";
import Delivery from "../../delivery/models/Delivery.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";
import { notifyRestaurantOrderUpdate } from "../../order/services/restaurantNotificationService.js";
import {
  assignOrderToDeliveryBoy,
  findNearestDeliveryBoys,
  findNearestDeliveryBoy,
} from "../../order/services/deliveryAssignmentService.js";
import {
  notifyDeliveryBoyNewOrder,
  notifyMultipleDeliveryBoys,
} from "../../order/services/deliveryNotificationService.js";
import {
  updateSettlementOnStatusChange,
  calculateOrderSettlement,
  getOrderSettlement,
} from "../../order/services/orderSettlementService.js";
import RestaurantWallet from "../models/RestaurantWallet.js";
import RestaurantCommission from "../../admin/models/RestaurantCommission.js";
import mongoose from "mongoose";
import Zone from "../../admin/models/Zone.js";

// Dynamic import to avoid circular dependency; used for customer realtime updates
let getIO = null;
async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import("../../../server.js");
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

/**
 * Get all orders for restaurant
 * GET /api/restaurant/orders
 */
export const getRestaurantOrders = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { status, page = 1, limit = 50 } = req.query;

    // Collect possible restaurant identifiers used in orders (Order.restaurantId is String type)
    const idCandidates = [];
    const mongoIdStr = restaurant._id?.toString?.();
    const businessIdStr = restaurant.restaurantId?.toString?.();
    const genericIdStr = restaurant.id?.toString?.();
    if (mongoIdStr) idCandidates.push(mongoIdStr);
    if (businessIdStr && !idCandidates.includes(businessIdStr)) idCandidates.push(businessIdStr);
    if (genericIdStr && !idCandidates.includes(genericIdStr)) idCandidates.push(genericIdStr);

    const restaurantIdString = idCandidates[0];

    if (!restaurantIdString) {
      console.error("❌ No restaurant ID found:", restaurant);
      return errorResponse(res, 500, "Restaurant ID not found");
    }

    // Query orders by restaurantId (stored as String in Order model). Try multiple formats.
    const restaurantIdVariations = [...idCandidates];

    // Also add ObjectId string format if valid (both directions)
    if (mongoose.Types.ObjectId.isValid(restaurantIdString)) {
      const objectIdString = new mongoose.Types.ObjectId(
        restaurantIdString,
      ).toString();
      if (!restaurantIdVariations.includes(objectIdString)) {
        restaurantIdVariations.push(objectIdString);
      }

      // Also try the original ObjectId if restaurantIdString is already a string
      try {
        const objectId = new mongoose.Types.ObjectId(restaurantIdString);
        const objectIdStr = objectId.toString();
        if (!restaurantIdVariations.includes(objectIdStr)) {
          restaurantIdVariations.push(objectIdStr);
        }
      } catch (e) {
        // Ignore if not a valid ObjectId
      }
    }

    // Also try direct match without ObjectId conversion (ensure unique)
    if (!restaurantIdVariations.includes(restaurantIdString)) {
      restaurantIdVariations.push(restaurantIdString);
    }

    // Build query - search for orders with any matching restaurantId variation
    // Use $in for multiple variations and also try direct match as fallback
    const query = {
      $or: [
        { restaurantId: { $in: restaurantIdVariations } },
        // Direct match fallback
        { restaurantId: restaurantIdString },
      ],
    };

    // If status filter is provided, add it to query
    if (status) {
      if (status !== "all") {
        query.status = status;
      } else {
        // If status is 'all', exclude 'pending' (unpaid/abandoned) orders
        // unless specifically requested in some other way (future proofing)
        // Generally restaurants shouldn't see orders waiting for payment
        query.status = { $ne: "pending" };
      }
    } else {
      // Default (no status provided): Exclude pending orders
      query.status = { $ne: "pending" };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log("🔍 Fetching orders for restaurant:", {
      restaurantIdPrimary: restaurantIdString,
      restaurant_id: restaurant._id?.toString(),
      restaurant_restaurantId: restaurant.restaurantId,
      restaurantIdVariations: restaurantIdVariations,
      query: JSON.stringify(query),
      status: status || "all",
    });

    const orders = await Order.find(query)
      .populate("userId", "name email phone")
      .populate("deliveryPartnerId", "name phone") // Populate deliveryPartnerId to show assignment status
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await Order.countDocuments(query);

    const normalizeDeliveryId = (value) => {
      if (!value) return null;
      const candidate =
        value?._id?.toString?.() ||
        value?.$oid ||
        value?.toString?.() ||
        null;
      if (!candidate) return null;
      return mongoose.Types.ObjectId.isValid(candidate) ? candidate : null;
    };

    // Resolve delivery partner details for cases where populate may return only ObjectId
    const unresolvedDeliveryIds = [
      ...new Set(
        orders
          .flatMap((o) => {
            const ids = [];
            const dp = o.deliveryPartnerId;
            const assignmentDp = o.assignmentInfo?.deliveryPartnerId;

            if (dp) {
              if (!(typeof dp === "object" && (dp.name || dp.phone))) {
                ids.push(normalizeDeliveryId(dp));
              }
            }

            if (assignmentDp) {
              ids.push(normalizeDeliveryId(assignmentDp));
            }

            return ids;
          })
          .filter(Boolean),
      ),
    ];

    let deliveryByIdMap = new Map();
    if (unresolvedDeliveryIds.length > 0) {
      try {
        const deliveryPartners = await Delivery.find({
          _id: { $in: unresolvedDeliveryIds },
        })
          .select("_id name phone")
          .lean();
        deliveryByIdMap = new Map(
          deliveryPartners.map((d) => [d._id.toString(), d]),
        );
      } catch (e) {
        console.warn("⚠️ Failed to resolve delivery partner details:", e.message);
      }
    }

    // Resolve paymentMethod: order.payment.method or Payment collection (COD fallback)
    const orderIds = orders.map((o) => o._id);
    const codOrderIds = new Set();
    try {
      const codPayments = await Payment.find({
        orderId: { $in: orderIds },
        method: "cash",
      })
        .select("orderId")
        .lean();
      codPayments.forEach((p) => codOrderIds.add(p.orderId?.toString()));
    } catch (e) {
      /* ignore */
    }
    const ordersWithPaymentMethod = orders.map((o) => {
      let paymentMethod = o.payment?.method ?? "razorpay";
      if (paymentMethod !== "cash" && codOrderIds.has(o._id?.toString()))
        paymentMethod = "cash";

      const rawDeliveryPartner = o.deliveryPartnerId;
      const deliveryPartnerId = normalizeDeliveryId(rawDeliveryPartner)
        || normalizeDeliveryId(o.assignmentInfo?.deliveryPartnerId);
      const resolvedDelivery =
        (rawDeliveryPartner &&
          typeof rawDeliveryPartner === "object" &&
          (rawDeliveryPartner.name || rawDeliveryPartner.phone)
          ? rawDeliveryPartner
          : null) ||
        (deliveryPartnerId ? deliveryByIdMap.get(deliveryPartnerId) : null) ||
        null;

      return {
        ...o,
        paymentMethod,
        deliveryPartnerName: resolvedDelivery?.name || null,
        deliveryPartnerPhone: resolvedDelivery?.phone || null,
        deliveryPartnerId: resolvedDelivery
          ? {
              _id: resolvedDelivery._id || deliveryPartnerId,
              name: resolvedDelivery.name || null,
              phone: resolvedDelivery.phone || null,
            }
          : rawDeliveryPartner,
      };
    });

    // Log detailed order info for debugging
    console.log("✅ Found orders:", {
      count: orders.length,
      total,
      restaurantId: restaurantIdString,
      queryUsed: JSON.stringify(query),
      orders: orders.map((o) => ({
        orderId: o.orderId,
        status: o.status,
        restaurantId: o.restaurantId,
        restaurantIdType: typeof o.restaurantId,
        createdAt: o.createdAt,
      })),
    });

    // If no orders found, log a warning with more details
    if (orders.length === 0 && total === 0) {
      console.warn("⚠️ No orders found for restaurant:", {
        restaurantId: restaurantIdString,
        restaurant_id: restaurant._id?.toString(),
        variationsTried: restaurantIdVariations,
        query: JSON.stringify(query),
      });

      // Try to find ANY orders in database for debugging
      const allOrdersCount = await Order.countDocuments({});
      console.log(`📊 Total orders in database: ${allOrdersCount}`);

      // Check if orders exist with similar restaurantId
      const sampleOrders = await Order.find({})
        .limit(5)
        .select("orderId restaurantId status")
        .lean();
      if (sampleOrders.length > 0) {
        console.log(
          "📊 Sample orders in database (first 5):",
          sampleOrders.map((o) => ({
            orderId: o.orderId,
            restaurantId: o.restaurantId,
            restaurantIdType: typeof o.restaurantId,
            status: o.status,
          })),
        );
      }
    }

    return successResponse(res, 200, "Orders retrieved successfully", {
      orders: ordersWithPaymentMethod,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching restaurant orders:", error);
    return errorResponse(res, 500, "Failed to fetch orders");
  }
});

/**
 * Get order by ID
 * GET /api/restaurant/orders/:id
 */
export const getRestaurantOrderById = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    // Prepare restaurantId variations to handle String/ObjectId mismatches
    const restaurantIdVariations = [];
    const ridMongo = restaurant._id?.toString?.();
    const ridBusiness = restaurant.restaurantId?.toString?.();
    const ridGeneric = restaurant.id?.toString?.();
    if (ridMongo) restaurantIdVariations.push(ridMongo);
    if (ridBusiness && !restaurantIdVariations.includes(ridBusiness))
      restaurantIdVariations.push(ridBusiness);
    if (ridGeneric && !restaurantIdVariations.includes(ridGeneric))
      restaurantIdVariations.push(ridGeneric);
    // Also add normalized ObjectId form of each candidate when valid
    for (const cand of [...restaurantIdVariations]) {
      if (mongoose.Types.ObjectId.isValid(cand) && String(cand).length === 24) {
        const norm = new mongoose.Types.ObjectId(cand).toString();
        if (!restaurantIdVariations.includes(norm))
          restaurantIdVariations.push(norm);
      }
    }

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations },
      })
        .populate("userId", "name email phone")
        .lean();
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations },
      })
        .populate("userId", "name email phone")
        .lean();
    }

    if (!order) {
      return errorResponse(res, 404, "Order not found");
    }

    // Fix restaurant name: If order.restaurantName is incorrect, fetch from restaurant
    // This ensures correct name even if order was created with old restaurant name
    if (order.restaurantName && order.restaurantName.includes("Restaurant ") && /Restaurant \d+/.test(order.restaurantName)) {
      try {
        const restaurantDoc = await Restaurant.findById(restaurant._id).select("name onboarding.step1.restaurantName").lean();
        if (restaurantDoc?.onboarding?.step1?.restaurantName) {
          order.restaurantName = restaurantDoc.onboarding.step1.restaurantName;
        } else if (restaurantDoc?.name && !restaurantDoc.name.includes("Restaurant ") || !/Restaurant \d+/.test(restaurantDoc.name)) {
          order.restaurantName = restaurantDoc.name;
        }
      } catch (err) {
        console.warn("Could not fix restaurant name in order:", err.message);
      }
    }

    // Use Payment collection as source of truth for payment status (order.payment may be stale)
    const paymentRecord = await Payment.findOne({ orderId: order._id }).select("status method").lean();
    if (paymentRecord && String(paymentRecord.status).toLowerCase() === "completed") {
      if (!order.payment) order.payment = {};
      order.payment.status = "completed";
    } else if (paymentRecord && order.payment) {
      order.payment.status = paymentRecord.status || order.payment.status;
    }

    return successResponse(res, 200, "Order retrieved successfully", {
      order,
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    return errorResponse(res, 500, "Failed to fetch order");
  }
});

/**
 * Accept order
 * PATCH /api/restaurant/orders/:id/accept
 */
export const acceptOrder = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;
    const { preparationTime } = req.body;

    // Prepare restaurantId variations to match both Mongo _id and business restaurantId
    const restaurantIdVariations = [];
    const ridMongo = restaurant._id?.toString?.();
    const ridBusiness = restaurant.restaurantId?.toString?.();
    const ridGeneric = restaurant.id?.toString?.();
    if (ridMongo) restaurantIdVariations.push(ridMongo);
    if (ridBusiness && !restaurantIdVariations.includes(ridBusiness)) restaurantIdVariations.push(ridBusiness);
    if (ridGeneric && !restaurantIdVariations.includes(ridGeneric)) restaurantIdVariations.push(ridGeneric);
    // Also add normalized ObjectId form of each candidate when valid
    for (const cand of [...restaurantIdVariations]) {
      if (mongoose.Types.ObjectId.isValid(cand) && String(cand).length === 24) {
        const norm = new mongoose.Types.ObjectId(cand).toString();
        if (!restaurantIdVariations.includes(norm)) restaurantIdVariations.push(norm);
      }
    }

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations },
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations },
      });
    }

    if (!order) {
      return errorResponse(res, 404, "Order not found");
    }

    // Allow accepting orders with status 'pending' or 'confirmed'
    // 'confirmed' status means payment is verified, restaurant can still accept
    if (!["pending", "confirmed"].includes(order.status)) {
      return errorResponse(
        res,
        400,
        `Order cannot be accepted. Current status: ${order.status}`,
      );
    }

    // When restaurant accepts order, it means they're starting to prepare it
    // So set status to 'preparing' and mark as confirmed if it was pending
    if (order.status === "pending") {
      order.tracking.confirmed = { status: true, timestamp: new Date() };
    }

    // Set status to 'preparing' when restaurant accepts
    order.status = "preparing";
    order.tracking.preparing = { status: true, timestamp: new Date() };

    // Handle preparation time update from restaurant
    if (preparationTime) {
      const restaurantPrepTime = parseInt(preparationTime, 10);
      const initialPrepTime = order.preparationTime || 0;

      // Calculate additional time restaurant is adding
      const additionalTime = Math.max(0, restaurantPrepTime - initialPrepTime);

      // Update ETA with additional time (add to both min and max)
      if (order.eta) {
        const currentMin = order.eta.min || 0;
        const currentMax = order.eta.max || 0;

        order.eta.min = currentMin + additionalTime;
        order.eta.max = currentMax + additionalTime;
        order.eta.additionalTime =
          (order.eta.additionalTime || 0) + additionalTime;
        order.eta.lastUpdated = new Date();

        // Update estimated delivery time to average of new min and max
        order.estimatedDeliveryTime = Math.ceil(
          (order.eta.min + order.eta.max) / 2,
        );
      } else {
        // If ETA doesn't exist, create it
        order.eta = {
          min: (order.estimatedDeliveryTime || 30) + additionalTime,
          max: (order.estimatedDeliveryTime || 30) + additionalTime,
          additionalTime: additionalTime,
          lastUpdated: new Date(),
        };
        order.estimatedDeliveryTime = Math.ceil(
          (order.eta.min + order.eta.max) / 2,
        );
      }

      console.log(`📋 Restaurant updated preparation time:`, {
        initialPrepTime,
        restaurantPrepTime,
        additionalTime,
        newETA: order.eta,
        newEstimatedDeliveryTime: order.estimatedDeliveryTime,
      });
    }

    await order.save();

    // Calculate settlement
    try {
      await calculateOrderSettlement(order._id);
    } catch (settlementError) {
      console.error("Error calculating settlement on accept:", settlementError);
    }

    // Trigger ETA recalculation for restaurant accepted event
    try {
      const etaEventService = (
        await import("../../order/services/etaEventService.js")
      ).default;
      await etaEventService.handleRestaurantAccepted(
        order._id.toString(),
        new Date(),
      );
      console.log(
        `✅ ETA updated after restaurant accepted order ${order.orderId}`,
      );
    } catch (etaError) {
      console.error("Error updating ETA after restaurant accept:", etaError);
      // Continue even if ETA update fails
    }

    // Notify about status update
    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), "preparing");
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    // Send push notification to user when restaurant accepts order
    try {
      const { notifyUserRestaurantAccepted } = 
        await import("../../fcm/services/pushNotificationService.js");
      await notifyUserRestaurantAccepted(order);
    } catch (pushError) {
      console.error("❌ Error sending push notification:", pushError);
    }

    // Priority-based order notification: First notify nearest delivery boys, then expand after 30 seconds
    // Skip for hotel orders as they are served by hotel staff
    if (!order.deliveryPartnerId && !order.hotelReference) {
      try {
        // Canonical restaurant identifier to use for delivery assignment + lookup
        // (Used by `findNearestDeliveryBoys` and restaurant location fetch below)
        // IMPORTANT: Prefer Mongo _id for DB lookups (Restaurant.findById, Zone.restaurantId in many deployments).
        // Using business restaurantId first can silently fail to find location/zone and prevent notifications.
        const restaurantId = ridMongo || ridBusiness || ridGeneric;

        if (!restaurantId) {
          console.error(
            `❌ Missing restaurantId for delivery assignment on order ${order.orderId}.`,
          );
          // Don't fail the order acceptance if notification fails
          return successResponse(res, 200, "Order accepted successfully", { order });
        }

        // Check delivery assignment mode from business settings
        const BusinessSettings = (await import("../../admin/models/BusinessSettings.js")).default;
        const businessSettings = await BusinessSettings.getSettings();
        const assignmentMode = businessSettings?.deliveryAssignmentMode || "automatic";
        
        if (assignmentMode === "manual") {
          console.log(
            `📋 Delivery assignment mode is MANUAL. Order ${order.orderId} will be available for manual assignment in admin panel.`,
          );
          // IMPORTANT: Even in manual mode, restaurant acceptance should still immediately
          // notify the nearest delivery partners (so a rider can pick it up fast).
          // We only skip the continuous resend loop in manual mode to avoid spam.
        } else {
          // Automatic mode - proceed with automatic notification
          console.log(
            `🔄 Starting priority-based order notification for order ${order.orderId}...`,
          );
        }

        // Get restaurant location (required for both manual + automatic modes)
        let restaurantDoc = null;
        if (mongoose.Types.ObjectId.isValid(restaurantId) && String(restaurantId).length === 24) {
          restaurantDoc = await Restaurant.findById(restaurantId).lean();
        }
        if (!restaurantDoc) {
          // Try all known id variations (mongo/business/generic) so we don't miss location due to id format mismatch.
          const orConds = [];
          if (ridMongo) orConds.push({ _id: ridMongo });
          if (ridBusiness) orConds.push({ restaurantId: ridBusiness });
          if (ridGeneric) orConds.push({ restaurantId: ridGeneric });
          // Back-compat: also try with the chosen restaurantId as both restaurantId and _id
          if (restaurantId) {
            orConds.push({ restaurantId: restaurantId });
            orConds.push({ _id: restaurantId });
          }
          restaurantDoc = await Restaurant.findOne({ $or: orConds }).lean();
        }

        if (!restaurantDoc) {
          console.error(
            `❌ Restaurant not found for restaurantId: ${restaurantId}`,
          );
        } else if (
          !restaurantDoc.location ||
          !restaurantDoc.location.coordinates ||
          restaurantDoc.location.coordinates.length < 2 ||
          (restaurantDoc.location.coordinates[0] === 0 &&
            restaurantDoc.location.coordinates[1] === 0)
        ) {
          console.error(
            `❌ Restaurant location not found or invalid for restaurant ${restaurantId}`,
          );
        } else {
          const [restaurantLng, restaurantLat] =
            restaurantDoc.location.coordinates;
          console.log(
            `📍 Restaurant location: ${restaurantLat}, ${restaurantLng}`,
          );

          // --- Continuous resend loop (server-side) ---
          // Requirement: after restaurant accepts, keep notifying delivery partners until someone accepts.
          // This must work even if restaurant app is closed, so we schedule it in backend.
          // Capped to avoid spamming / leaks.
          // NOTE: In manual assignment mode, we intentionally skip the resend loop to avoid spam.
          const shouldRunResendLoop = assignmentMode !== "manual";
          // Periodic refresh until assigned (no FCM on this phase — see deliveryNotificationService).
          // 30s * 10 ≈ 5 minutes of background retries without spamming riders.
          const RESEND_LOOP_MS = 30 * 1000;
          const RESEND_MAX_ATTEMPTS = 10;
          // In-memory map to avoid multiple loops per order (per node process)
          global.__deliveryResendLoops = global.__deliveryResendLoops || new Map();
          const loopKey = String(order._id);

          if (shouldRunResendLoop && !global.__deliveryResendLoops.has(loopKey)) {
            global.__deliveryResendLoops.set(loopKey, { attempts: 0, timer: null });

            const tick = async () => {
              const state = global.__deliveryResendLoops.get(loopKey);
              if (!state) return;

              // Stop if assigned / no longer eligible / exceeded attempts
              const fresh = await Order.findById(order._id)
                .select("deliveryPartnerId status")
                .lean();
              if (!fresh) {
                global.__deliveryResendLoops.delete(loopKey);
                return;
              }
              if (fresh.deliveryPartnerId) {
                global.__deliveryResendLoops.delete(loopKey);
                return;
              }
              const st = String(fresh.status || "").toLowerCase();
              if (!["preparing", "ready"].includes(st)) {
                global.__deliveryResendLoops.delete(loopKey);
                return;
              }
              if (state.attempts >= RESEND_MAX_ATTEMPTS) {
                global.__deliveryResendLoops.delete(loopKey);
                return;
              }

              state.attempts += 1;
              global.__deliveryResendLoops.set(loopKey, state);

              // Find nearest delivery partners
              const candidates = await findNearestDeliveryBoys(
                restaurantLat,
                restaurantLng,
                restaurantId,
                50, // km
                10, // top N (keep smaller since loop is frequent)
                { ignoreManualZoneFilter: true },
              );

              if (!candidates || candidates.length === 0) return;

              const populatedOrder = await Order.findById(order._id)
                .populate("userId", "name phone")
                .populate("restaurantId", "name address location phone ownerPhone")
                .lean();
              if (!populatedOrder) return;

              const deliveryPartnerIds = candidates.map((db) => db.deliveryPartnerId);

              // Save minimal debug info on order
              await Order.findByIdAndUpdate(order._id, {
                $set: {
                  "assignmentInfo.lastResendAt": new Date(),
                  "assignmentInfo.lastResendCount": deliveryPartnerIds.length,
                  "assignmentInfo.resendAttempts": state.attempts,
                  "assignmentInfo.assignedBy": "auto_resend_loop",
                },
              });

              await notifyMultipleDeliveryBoys(
                populatedOrder,
                deliveryPartnerIds,
                "auto_resend",
              );
            };

            // Start immediately + repeat
            tick().catch(() => {});
            const timer = setInterval(() => {
              tick().catch(() => {});
            }, RESEND_LOOP_MS);
            global.__deliveryResendLoops.set(loopKey, { attempts: 0, timer });
          }

          // Reload order to ensure we have the latest version
          const freshOrder = await Order.findById(order._id);
          if (!freshOrder) {
            console.error(`❌ Order ${order.orderId} not found after save`);
          } else if (freshOrder.deliveryPartnerId) {
            console.log(
              `⚠️ Order ${order.orderId} already has delivery partner: ${freshOrder.deliveryPartnerId}`,
            );
          } else {
            // Step 1: Find nearest delivery boys (use a wider radius so "accept" immediately reaches riders;
            // tighter radii can result in 0 candidates and make it look like only manual "Resend" works)
            const priorityDeliveryBoys = await findNearestDeliveryBoys(
              restaurantLat,
              restaurantLng,
              restaurantId,
              20,
              20,
              { ignoreManualZoneFilter: true },
            );

            if (priorityDeliveryBoys && priorityDeliveryBoys.length > 0) {
              console.log(
                `✅ Found ${priorityDeliveryBoys.length} priority delivery partners within 20km`,
              );

              // Store priority notification info in order
              freshOrder.assignmentInfo = {
                priorityNotifiedAt: new Date(),
                priorityDeliveryPartnerIds: priorityDeliveryBoys.map(
                  (db) => db.deliveryPartnerId,
                ),
                notificationPhase: "priority",
              };
              await freshOrder.save();

              // Reload order with populated userId and restaurantId (with location)
              const populatedOrder = await Order.findById(freshOrder._id)
                .populate("userId", "name phone")
                .populate(
                  "restaurantId",
                  "name address location phone ownerPhone",
                )
                .lean();

              if (populatedOrder) {
                // Notify priority delivery boys (without assigning)
                const priorityIds = priorityDeliveryBoys.map(
                  (db) => db.deliveryPartnerId,
                );

                // Bump resendVersion so delivery clients treat this as a fresh request (same behavior as manual Resend button)
                try {
                  await Order.findByIdAndUpdate(freshOrder._id, {
                    $inc: { 'assignmentInfo.resendVersion': 1 },
                    $set: { 'assignmentInfo.assignedBy': 'restaurant_accept' },
                  });
                } catch (e) {
                  // ignore
                }
                await notifyMultipleDeliveryBoys(
                  populatedOrder,
                  priorityIds,
                  "priority",
                );
                console.log(
                  `✅ Notified ${priorityIds.length} priority delivery partners for order ${order.orderId}`,
                );

                // Step 2 (instant): also notify other nearby delivery boys immediately (no 30s delay)
                try {
                  const checkOrder = await Order.findById(order._id);
                  if (checkOrder && !checkOrder.deliveryPartnerId) {
                    const allDeliveryBoys = await findNearestDeliveryBoys(
                      restaurantLat,
                      restaurantLng,
                      restaurantId,
                      50, // km
                      20,
                      { ignoreManualZoneFilter: true },
                    );

                    const expandedDeliveryBoys = allDeliveryBoys.filter(
                      (db) => !priorityIds.includes(db.deliveryPartnerId),
                    );

                    if (expandedDeliveryBoys && expandedDeliveryBoys.length > 0) {
                      const expandedIds = expandedDeliveryBoys.map((db) => db.deliveryPartnerId);

                      checkOrder.assignmentInfo = {
                        ...(checkOrder.assignmentInfo || {}),
                        expandedNotifiedAt: new Date(),
                        expandedDeliveryPartnerIds: expandedIds,
                        notificationPhase: "expanded",
                      };
                      await checkOrder.save();

                      const expandedOrder = await Order.findById(checkOrder._id)
                        .populate("userId", "name phone")
                        .populate("restaurantId", "name address location phone ownerPhone")
                        .lean();

                      if (expandedOrder) {
                        await notifyMultipleDeliveryBoys(expandedOrder, expandedIds, "expanded");
                        console.log(
                          `✅ Notified ${expandedIds.length} expanded delivery partners instantly for order ${order.orderId}`,
                        );
                      }
                    }
                  }
                } catch (expandError) {
                  console.error(
                    `❌ Error in instant expanded notification for order ${order.orderId}:`,
                    expandError,
                  );
                }
              }
            } else {
              // No priority delivery boys found.
              // Fallback order of operations:
              // 1) Try nearest single partner within wider radius
              // 2) If still none, notify a capped set of ANY online riders with valid location
              console.log(
                `⚠️ No priority delivery partners found, searching for any available delivery partner`,
              );
              const anyDeliveryBoy = await findNearestDeliveryBoy(
                restaurantLat,
                restaurantLng,
                restaurantId,
                50,
              );

              const populatedOrder = await Order.findById(freshOrder._id)
                .populate("userId", "name phone")
                .populate("restaurantId", "name address location phone ownerPhone")
                .lean();

              if (anyDeliveryBoy && populatedOrder) {
                await notifyMultipleDeliveryBoys(
                  populatedOrder,
                  [anyDeliveryBoy.deliveryPartnerId],
                  "immediate",
                );
                console.log(
                  `✅ Notified delivery partner immediately for order ${order.orderId}`,
                );
              } else if (populatedOrder) {
                // HARD fallback: notify any online riders (still capped) so order doesn't get stuck.
                try {
                  const fallbackRiders = await Delivery.find({
                    'availability.isOnline': true,
                    status: { $in: ['approved', 'active'] },
                    isActive: true,
                    'availability.currentLocation.coordinates': { $exists: true, $ne: [0, 0] },
                  })
                    .select('_id')
                    .limit(50)
                    .lean();

                  const fallbackIds = fallbackRiders.map((d) => d._id?.toString?.()).filter(Boolean);
                  if (fallbackIds.length > 0) {
                    await notifyMultipleDeliveryBoys(populatedOrder, fallbackIds, 'fallback_any_online');
                    console.log(
                      `✅ Fallback notified ${fallbackIds.length} online delivery partners for order ${order.orderId}`,
                    );
                  } else {
                    console.warn(`⚠️ No online delivery partners with valid location found for fallback on order ${order.orderId}`);
                  }
                } catch (fallbackErr) {
                  console.error(`❌ Fallback notify failed for order ${order.orderId}:`, fallbackErr);
                }
              } else {
                console.warn(`⚠️ Could not populate order for delivery notifications (order ${order.orderId})`);
              }
            }
          }
        }
      } catch (assignmentError) {
        console.error(
          "❌ Error in priority-based order notification:",
          assignmentError,
        );
        console.error("❌ Error stack:", assignmentError.stack);
        // Don't fail the order acceptance if notification fails
      }
    } else {
      console.log(
        `ℹ️ Order ${order.orderId} already has delivery partner assigned: ${order.deliveryPartnerId}`,
      );
    }

    return successResponse(res, 200, "Order accepted successfully", {
      order,
    });
  } catch (error) {
    console.error("Error accepting order:", error);
    return errorResponse(res, 500, "Failed to accept order");
  }
});

/**
 * Reject order
 * PATCH /api/restaurant/orders/:id/reject
 */
export const rejectOrder = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;
    const { reason } = req.body;

    const restaurantId =
      restaurant._id?.toString() || restaurant.restaurantId || restaurant.id;

    // Log for debugging
    console.log("🔍 Reject order - Looking up order:", {
      orderIdParam: id,
      restaurantId: restaurantId,
      restaurant_id: restaurant._id?.toString(),
      restaurant_restaurantId: restaurant.restaurantId,
    });

    // Prepare restaurantId variations for query (handle both _id and restaurantId formats)
    const restaurantIdVariations = [restaurantId];
    if (
      mongoose.Types.ObjectId.isValid(restaurantId) &&
      restaurantId.length === 24
    ) {
      const objectIdString = new mongoose.Types.ObjectId(
        restaurantId,
      ).toString();
      if (!restaurantIdVariations.includes(objectIdString)) {
        restaurantIdVariations.push(objectIdString);
      }
    }
    // Also add restaurant._id if different
    if (restaurant._id) {
      const restaurantMongoId = restaurant._id.toString();
      if (!restaurantIdVariations.includes(restaurantMongoId)) {
        restaurantIdVariations.push(restaurantMongoId);
      }
    }
    // Also add restaurant.restaurantId if different
    if (
      restaurant.restaurantId &&
      !restaurantIdVariations.includes(restaurant.restaurantId)
    ) {
      restaurantIdVariations.push(restaurant.restaurantId);
    }

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations },
      });
      console.log("🔍 Order lookup by _id:", {
        orderId: id,
        found: !!order,
        orderRestaurantId: order?.restaurantId,
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations },
      });
      console.log("🔍 Order lookup by orderId:", {
        orderId: id,
        found: !!order,
        orderRestaurantId: order?.restaurantId,
        restaurantIdVariations,
      });
    }

    if (!order) {
      console.error("❌ Order not found for rejection:", {
        orderIdParam: id,
        restaurantId: restaurantId,
        restaurantIdVariations,
        restaurant_id: restaurant._id?.toString(),
        restaurant_restaurantId: restaurant.restaurantId,
      });
      return errorResponse(res, 404, "Order not found");
    }

    console.log("✅ Order found for rejection:", {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      orderRestaurantId: order.restaurantId,
      orderStatus: order.status,
    });

    // Allow rejecting/cancelling orders with status:
    // - pending/confirmed: before preparation starts
    // - preparing/ready: restaurant can still cancel before delivery partner picks it up
    if (!["pending", "confirmed", "preparing", "ready"].includes(order.status)) {
      return errorResponse(
        res,
        400,
        `Order cannot be cancelled. Current status: ${order.status}`,
      );
    }

    order.status = "cancelled";
    order.cancellationReason = reason || "Cancelled by restaurant";
    order.cancelledBy = "restaurant";
    order.cancelledAt = new Date();
    await order.save();

    // Calculate refund amount but don't process automatically
    // Admin will process refund manually via refund button
    try {
      const { calculateCancellationRefund } =
        await import("../../order/services/cancellationRefundService.js");
      await calculateCancellationRefund(
        order._id,
        reason || "Rejected by restaurant",
      );
      console.log(
        `✅ Cancellation refund calculated for order ${order.orderId} - awaiting admin approval`,
      );
    } catch (refundError) {
      console.error(
        `❌ Error calculating cancellation refund for order ${order.orderId}:`,
        refundError,
      );
      // Don't fail order cancellation if refund calculation fails
      // But log it for investigation
    }

    // Notify about status update
    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), "cancelled");
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    return successResponse(res, 200, "Order rejected successfully", {
      order,
    });
  } catch (error) {
    console.error("Error rejecting order:", error);
    return errorResponse(res, 500, "Failed to reject order");
  }
});

/**
 * Update order status to preparing
 * PATCH /api/restaurant/orders/:id/preparing
 */
export const markOrderPreparing = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    const restaurantId =
      restaurant._id?.toString() || restaurant.restaurantId || restaurant.id;

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId,
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId,
      });
    }

    if (!order) {
      return errorResponse(res, 404, "Order not found");
    }

    // Allow marking as preparing if status is 'confirmed', 'pending', or already 'preparing' (for retry scenarios)
    // If already preparing, we allow it to retry delivery assignment if no delivery partner is assigned
    const allowedStatuses = ["confirmed", "pending", "preparing"];
    if (!allowedStatuses.includes(order.status)) {
      return errorResponse(
        res,
        400,
        `Order cannot be marked as preparing. Current status: ${order.status}`,
      );
    }

    // Only update status if it's not already preparing
    // If already preparing, we're just retrying delivery assignment
    const wasAlreadyPreparing = order.status === "preparing";
    if (!wasAlreadyPreparing) {
      order.status = "preparing";
      order.tracking.preparing = { status: true, timestamp: new Date() };
      await order.save();
    }

    // Notify about status update only if status actually changed
    if (!wasAlreadyPreparing) {
      try {
        await notifyRestaurantOrderUpdate(order._id.toString(), "preparing");
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
      }
    }

    // Assign order to nearest delivery boy and notify them (if not already assigned)
    // This is critical - even if order is already preparing, we need to assign delivery partner
    // Reload order first to get the latest state (in case it was updated elsewhere)
    const freshOrder = await Order.findById(order._id);
    if (!freshOrder) {
      console.error(`❌ Order ${order.orderId} not found after save`);
      return errorResponse(res, 404, "Order not found after update");
    }

    // CRITICAL: Don't assign delivery partner if order is cancelled
    if (freshOrder.status === "cancelled") {
      console.log(
        `⚠️ Order ${freshOrder.orderId} is cancelled. Cannot assign delivery partner.`,
      );
      return successResponse(
        res,
        200,
        "Order is cancelled. Cannot assign delivery partner.",
        {
          order: freshOrder,
        },
      );
    }

    // Check if delivery partner is already assigned (after reload)
    // Skip for hotel orders as they are served by hotel staff
    if (!freshOrder.deliveryPartnerId && !freshOrder.hotelReference) {
      try {
        console.log(
          `🔄 Attempting to assign order ${freshOrder.orderId} to delivery boy (status: ${freshOrder.status})...`,
        );

        // Get restaurant location
        let restaurantDoc = null;
        if (mongoose.Types.ObjectId.isValid(restaurantId)) {
          restaurantDoc = await Restaurant.findById(restaurantId).lean();
        }
        if (!restaurantDoc) {
          restaurantDoc = await Restaurant.findOne({
            $or: [{ restaurantId: restaurantId }, { _id: restaurantId }],
          }).lean();
        }

        if (!restaurantDoc) {
          console.error(
            `❌ Restaurant not found for restaurantId: ${restaurantId}`,
          );
          return errorResponse(
            res,
            500,
            "Restaurant location not found. Cannot assign delivery partner.",
          );
        }

        if (
          !restaurantDoc.location ||
          !restaurantDoc.location.coordinates ||
          restaurantDoc.location.coordinates.length < 2 ||
          (restaurantDoc.location.coordinates[0] === 0 &&
            restaurantDoc.location.coordinates[1] === 0)
        ) {
          console.error(
            `❌ Restaurant location not found or invalid for restaurant ${restaurantId}`,
          );
          return errorResponse(
            res,
            500,
            "Restaurant location is invalid. Please update restaurant location.",
          );
        }

        const [restaurantLng, restaurantLat] =
          restaurantDoc.location.coordinates;
        console.log(
          `📍 Restaurant location: ${restaurantLat}, ${restaurantLng}`,
        );

        // Check if order already has delivery partner assigned
        const orderCheck = await Order.findById(freshOrder._id).select(
          "deliveryPartnerId",
        );
        const isResendRequest =
          req.query.resend === "true" || req.body.resend === true;

        // If order already has delivery partner and it's a resend request, resend notification to existing partner
        if (orderCheck && orderCheck.deliveryPartnerId && isResendRequest) {
          console.log(
            `🔄 Resend request detected - resending notification to existing delivery partner ${orderCheck.deliveryPartnerId}`,
          );

          // Reload order with populated userId
          const populatedOrder = await Order.findById(freshOrder._id)
            .populate("userId", "name phone")
            .lean();

          if (!populatedOrder) {
            console.error(
              `❌ Could not reload order ${freshOrder.orderId} for resend`,
            );
            return errorResponse(res, 500, "Could not reload order for resend");
          }

          // Resend notification to existing delivery partner
          try {
            await notifyDeliveryBoyNewOrder(
              populatedOrder,
              orderCheck.deliveryPartnerId,
            );
            console.log(
              `✅ Resent notification to delivery partner ${orderCheck.deliveryPartnerId} for order ${freshOrder.orderId}`,
            );

            const finalOrder = await Order.findById(freshOrder._id);
            return successResponse(
              res,
              200,
              "Notification resent to delivery partner",
              {
                order: finalOrder,
                resend: true,
                deliveryPartnerId: orderCheck.deliveryPartnerId,
              },
            );
          } catch (notifyError) {
            console.error(`❌ Error resending notification:`, notifyError);
            // Continue to try reassignment if notification fails
            console.log(
              `🔄 Notification failed, attempting to reassign to new delivery partner...`,
            );
          }
        }

        // If order already has delivery partner and it's NOT a resend request, just return
        if (orderCheck && orderCheck.deliveryPartnerId && !isResendRequest) {
          console.log(
            `⚠️ Order ${freshOrder.orderId} was assigned delivery partner ${orderCheck.deliveryPartnerId} by another process`,
          );
          // Reload full order for response
          const updatedOrder = await Order.findById(freshOrder._id);
          return successResponse(res, 200, "Order marked as preparing", {
            order: updatedOrder,
          });
        }

        // If resend request failed notification, or no partner assigned, try to assign/reassign
        // Clear existing assignment if resend request
        if (isResendRequest && orderCheck && orderCheck.deliveryPartnerId) {
          console.log(
            `🔄 Resend request - clearing existing delivery partner to allow reassignment`,
          );
          freshOrder.deliveryPartnerId = null;
          freshOrder.assignmentInfo = undefined;
          await freshOrder.save();
          // Reload to get fresh state
          const reloadedOrder = await Order.findById(freshOrder._id);
          if (reloadedOrder) {
            freshOrder = reloadedOrder;
          }
        }

        // Assign to nearest delivery boy
        const assignmentResult = await assignOrderToDeliveryBoy(
          freshOrder,
          restaurantLat,
          restaurantLng,
          restaurantId,
        );

        if (assignmentResult && assignmentResult.deliveryPartnerId) {
          // Reload order with populated userId after assignment
          const populatedOrder = await Order.findById(freshOrder._id)
            .populate("userId", "name phone")
            .lean();

          if (!populatedOrder) {
            console.error(
              `❌ Could not reload order ${freshOrder.orderId} after assignment`,
            );
            return errorResponse(
              res,
              500,
              "Order assignment succeeded but could not reload order",
            );
          } else {
            // Notify delivery boy about the new order
            try {
              await notifyDeliveryBoyNewOrder(
                populatedOrder,
                assignmentResult.deliveryPartnerId,
              );
              console.log(
                `✅ Order ${freshOrder.orderId} assigned to delivery boy ${assignmentResult.deliveryPartnerId} and notification sent`,
              );
            } catch (notifyError) {
              console.error(`❌ Error notifying delivery boy:`, notifyError);
              console.error(`❌ Notification error details:`, {
                message: notifyError.message,
                stack: notifyError.stack,
              });
              // Assignment succeeded but notification failed - still return success but log error
              console.warn(
                `⚠️ Order assigned but notification failed. Delivery boy may need to refresh.`,
              );
            }

            // Reload full order for response
            const finalOrder = await Order.findById(freshOrder._id);
            return successResponse(
              res,
              200,
              "Order marked as preparing and assigned to delivery partner",
              {
                order: finalOrder,
                assignment: assignmentResult,
              },
            );
          }
        } else {
          console.warn(
            `⚠️ Could not assign order ${freshOrder.orderId} to delivery boy - no available delivery partners`,
          );
          // Return success but warn about no delivery partners
          const finalOrder = await Order.findById(freshOrder._id);
          return successResponse(
            res,
            200,
            "Order marked as preparing, but no delivery partners available",
            {
              order: finalOrder,
              warning:
                "No delivery partners available. Order will be assigned when a delivery partner comes online.",
            },
          );
        }
      } catch (assignmentError) {
        console.error(
          "❌ Error assigning order to delivery boy:",
          assignmentError,
        );
        console.error("❌ Error stack:", assignmentError.stack);
        // Return error so restaurant knows assignment failed
        const finalOrder = await Order.findById(freshOrder._id);
        return errorResponse(
          res,
          500,
          `Order marked as preparing, but delivery assignment failed: ${assignmentError.message}`,
          {
            order: finalOrder,
          },
        );
      }
    } else {
      console.log(
        `ℹ️ Order ${freshOrder.orderId} already has delivery partner assigned: ${freshOrder.deliveryPartnerId}`,
      );
      // Reload full order for response
      const finalOrder = await Order.findById(freshOrder._id);
      return successResponse(res, 200, "Order marked as preparing", {
        order: finalOrder,
      });
    }
  } catch (error) {
    console.error("Error updating order status:", error);
    return errorResponse(res, 500, "Failed to update order status");
  }
});

/**
 * Update order status to ready
 * PATCH /api/restaurant/orders/:id/ready
 */
export const markOrderReady = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    // Build robust list of possible restaurantId representations (Order.restaurantId is String)
    const restaurantIdCandidates = [];
    const mongoIdStr = restaurant?._id?.toString?.();
    const businessIdStr = restaurant?.restaurantId?.toString?.();
    const genericIdStr = restaurant?.id?.toString?.();
    if (mongoIdStr) restaurantIdCandidates.push(mongoIdStr);
    if (businessIdStr && !restaurantIdCandidates.includes(businessIdStr)) {
      restaurantIdCandidates.push(businessIdStr);
    }
    if (genericIdStr && !restaurantIdCandidates.includes(genericIdStr)) {
      restaurantIdCandidates.push(genericIdStr);
    }

    const restaurantIdString = restaurantIdCandidates[0];

    // Expand with ObjectId string variations if applicable
    const restaurantIdVariations = [...restaurantIdCandidates];
    if (restaurantIdString && mongoose.Types.ObjectId.isValid(restaurantIdString)) {
      try {
        const objectId = new mongoose.Types.ObjectId(restaurantIdString);
        const objectIdStr = objectId.toString();
        if (!restaurantIdVariations.includes(objectIdStr)) {
          restaurantIdVariations.push(objectIdStr);
        }
      } catch (e) {
        // ignore
      }
    }

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations },
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations },
      });
    }

    if (!order) {
      return errorResponse(res, 404, "Order not found");
    }

    if (order.status !== "preparing") {
      return errorResponse(
        res,
        400,
        `Order cannot be marked as ready. Current status: ${order.status}`,
      );
    }

    // Update order status and tracking
    const now = new Date();
    const isHotelOrder =
      order.hotelReference || order.payment?.method === "pay_at_hotel";
    const previousStatus = order.status;

    // IMPORTANT: When restaurant marks an order as "ready", the status should be "ready"
    // for both normal and hotel/QR orders. Do NOT auto-mark hotel orders as "delivered",
    // otherwise the user sees the order as delivered immediately after the restaurant clicks ready.
    order.status = "ready";
    if (!order.tracking) order.tracking = {};
    order.tracking.ready = { status: true, timestamp: now };

    if (isHotelOrder) {
      console.log(
        `🏨 Hotel/QR order ${order.orderId} marked as READY (no auto-deliver).`,
      );
    }

    await order.save();

    // Trigger settlement update and credit restaurant wallet if status changed to delivered
    if (order.status === "delivered") {
      try {
        await updateSettlementOnStatusChange(
          order._id.toString(),
          "delivered",
          previousStatus,
        );
        console.log(`✅ Settlement updated for hotel order ${order.orderId}`);

        // Credit restaurant wallet (hotel orders skip delivery flow, so wallet is never credited there)
        const settlement = await getOrderSettlement(order._id);
        const netEarning = settlement?.restaurantEarning?.netEarning;
        if (restaurant._id && netEarning != null && netEarning > 0) {
          const wallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurant._id);
          const orderIdStr = order._id?.toString?.() || order._id;
          const existingTx = wallet.transactions?.find(
            (t) => t.orderId?.toString() === orderIdStr && t.type === "payment"
          );
          if (!existingTx) {
            const orderTotal = order.pricing?.subtotal || order.pricing?.total || 0;
            const commissionResult = await RestaurantCommission.calculateCommissionForOrder(
              restaurant._id,
              orderTotal
            );
            const commission = commissionResult.commission || 0;
            wallet.addTransaction({
              amount: netEarning,
              type: "payment",
              status: "Completed",
              description: `Order #${order.orderId} - Amount: ₹${orderTotal.toFixed(2)}, Commission: ₹${commission.toFixed(2)}`,
              orderId: order._id,
            });
            await wallet.save();
            console.log(`✅ Restaurant wallet credited ₹${netEarning.toFixed(2)} for hotel order ${order.orderId}`);
          }
        }
      } catch (settlementError) {
        console.error(
          `❌ Error updating settlement for hotel order ${order.orderId}:`,
          settlementError,
        );
      }
    }

    // Populate order for notifications
    const populatedOrder = await Order.findById(order._id)
      .populate("restaurantId", "name location address phone")
      .populate("userId", "name phone")
      .populate("deliveryPartnerId", "name phone")
      .lean();

    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), "ready");
    } catch (notifError) {
      console.error("Error sending restaurant notification:", notifError);
    }

    // Realtime notify CUSTOMER UI so it can update instantly (e.g. hide "Cancel order")
    try {
      const io = await getIOInstance();
      if (io) {
        const payload = {
          orderId: populatedOrder?.orderId || order.orderId,
          orderMongoId: order._id.toString(),
          status: "ready",
          title: "Order update",
          message: "Your order is ready",
          updatedAt: new Date(),
        };

        // Customers may join tracking room using either Mongo _id or custom orderId.
        // Emit to both to ensure delivery tracking + order tracking pages receive the update.
        const roomIds = [
          order._id.toString(),
          populatedOrder?.orderId,
          order.orderId,
        ].filter(Boolean);

        [...new Set(roomIds)].forEach((rid) => {
          io.to(`order:${rid}`).emit("order_status_update", payload);
        });
      }
    } catch (e) {
      console.warn("⚠️ Customer realtime notification failed:", e?.message);
    }

    // IMPORTANT: Do NOT auto-assign (set deliveryPartnerId) when restaurant marks "ready".
    // A delivery partner must ACCEPT the order first (first-come-first-serve).
    // We only notify eligible delivery partners and keep the order unassigned until acceptance.
    if (!populatedOrder.deliveryPartnerId && !isHotelOrder) {
      try {
        // Notify ALL delivery partners assigned to this restaurant's zone.
        // This matches product requirement: "jo zone me hai un sab ko request jani chahiye".
        const restaurantObjectId = restaurant?._id;
        let zone = null;
        if (restaurantObjectId) {
          zone = await Zone.findOne({
            restaurantId: restaurantObjectId,
            isActive: true,
          })
            .select("_id name")
            .lean();
        }

        let notifiedIds = [];
        if (zone?._id) {
          const zonePartners = await Delivery.find({
            "availability.isOnline": true,
            status: { $in: ["approved", "active"] },
            isActive: true,
            "availability.zones": zone._id,
          })
            .select("_id")
            .lean();
          notifiedIds = (zonePartners || []).map((p) => p._id.toString());
          console.log(
            `📣 Order ${order.orderId} ready → notifying ${notifiedIds.length} partners in zone ${zone.name} (${zone._id})`,
          );
        }

        // Fallback: if zone missing or empty, fall back to nearest list (better than notifying none)
        if (!notifiedIds || notifiedIds.length === 0) {
          const restaurantDoc = await Restaurant.findById(restaurant?._id)
            .select("location")
            .lean();
          const coords =
            restaurantDoc?.location?.geoLocation?.coordinates?.length
              ? restaurantDoc.location.geoLocation.coordinates
              : restaurantDoc?.location?.coordinates;
          if (coords && coords.length >= 2) {
            const [restaurantLng, restaurantLat] = coords;
            const priorityDeliveryBoys = await findNearestDeliveryBoys(
              restaurantLat,
              restaurantLng,
              restaurantIdString || restaurant?._id?.toString?.(),
              20,
              10,
            );
            notifiedIds =
              priorityDeliveryBoys && priorityDeliveryBoys.length > 0
                ? priorityDeliveryBoys.map((db) => db.deliveryPartnerId)
                : [];
          }
        }

        if (notifiedIds.length > 0) {
          await Order.findByIdAndUpdate(order._id, {
            $set: {
              "assignmentInfo.priorityDeliveryPartnerIds": notifiedIds,
              "assignmentInfo.assignedBy": "zone_ready_broadcast",
              "assignmentInfo.assignedAt": new Date(),
            },
          });

          await notifyMultipleDeliveryBoys(populatedOrder, notifiedIds, "zone_ready");
          console.log(
            `✅ Order ${order.orderId} ready notification sent to ${notifiedIds.length} delivery partners (awaiting acceptance)`,
          );
        } else {
          console.warn(
            `⚠️ Order ${order.orderId} is ready but no delivery partners found to notify`,
          );
        }
      } catch (notifyError) {
        console.error(
          `❌ Error notifying delivery partners for ready order ${order.orderId}:`,
          notifyError,
        );
      }
    }
    
    // Notify delivery boy that order is ready for pickup (if already assigned)
    if (populatedOrder.deliveryPartnerId) {
      try {
        const { notifyDeliveryBoyOrderReady } =
          await import("../../order/services/deliveryNotificationService.js");
        const deliveryPartnerId =
          populatedOrder.deliveryPartnerId._id ||
          populatedOrder.deliveryPartnerId;
        await notifyDeliveryBoyOrderReady(populatedOrder, deliveryPartnerId);
        console.log(
          `✅ Order ready notification sent to delivery partner ${deliveryPartnerId}`,
        );
      } catch (deliveryNotifError) {
        console.error(
          "Error sending delivery boy notification:",
          deliveryNotifError,
        );
      }
    }

    // Send push notification to user when order is ready
    try {
      const { notifyUserOrderReady } = 
        await import("../../fcm/services/pushNotificationService.js");
      await notifyUserOrderReady(populatedOrder || order);
    } catch (pushError) {
      console.error("❌ Error sending push notification:", pushError);
    }

    return successResponse(res, 200, "Order marked as ready", {
      order: populatedOrder || order,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    return errorResponse(res, 500, "Failed to update order status");
  }
});

/**
 * Resend delivery notification for unassigned order
 * POST /api/restaurant/orders/:id/resend-delivery-notification
 */
export const resendDeliveryNotification = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    const restaurantId =
      restaurant._id?.toString() || restaurant.restaurantId || restaurant.id;

    // Try to find order by MongoDB _id or orderId
    let order = null;

    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId,
      });
    }

    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId,
      });
    }

    if (!order) {
      return errorResponse(res, 404, "Order not found");
    }

    // Check if order is in valid status (preparing or ready)
    if (!["preparing", "ready"].includes(order.status)) {
      return errorResponse(
        res,
        400,
        `Cannot resend notification. Order status must be 'preparing' or 'ready'. Current status: ${order.status}`,
      );
    }

    // Get restaurant location
    const restaurantDoc = await Restaurant.findById(restaurantId)
      .select("location")
      .lean();

    if (
      !restaurantDoc ||
      !restaurantDoc.location ||
      !restaurantDoc.location.coordinates
    ) {
      return errorResponse(
        res,
        400,
        "Restaurant location not found. Please update restaurant location.",
      );
    }

    const [restaurantLng, restaurantLat] = restaurantDoc.location.coordinates;

    // Find nearest delivery boys
    const priorityDeliveryBoys = await findNearestDeliveryBoys(
      restaurantLat,
      restaurantLng,
      restaurantId,
      20, // 20km radius for priority
      10, // Top 10 nearest
    );

    if (!priorityDeliveryBoys || priorityDeliveryBoys.length === 0) {
      // Try with larger radius
      const allDeliveryBoys = await findNearestDeliveryBoys(
        restaurantLat,
        restaurantLng,
        restaurantId,
        50, // 50km radius
        20, // Top 20 nearest
      );

      if (!allDeliveryBoys || allDeliveryBoys.length === 0) {
        return errorResponse(
          res,
          404,
          "No delivery partners available in your area",
        );
      }

      // Notify all available delivery boys
      const populatedOrder = await Order.findById(order._id)
        .populate("userId", "name phone")
        .populate("restaurantId", "name location address phone ownerPhone")
        .lean();

      if (populatedOrder) {
        const deliveryPartnerIds = allDeliveryBoys.map(
          (db) => db.deliveryPartnerId,
        );

        // Update assignment info
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            "assignmentInfo.priorityDeliveryPartnerIds": deliveryPartnerIds,
            "assignmentInfo.assignedBy": "manual_resend",
            "assignmentInfo.assignedAt": new Date(),
          },
        });

        await notifyMultipleDeliveryBoys(
          populatedOrder,
          deliveryPartnerIds,
          "priority",
        );

        console.log(
          `✅ Resent notification to ${deliveryPartnerIds.length} delivery partners for order ${order.orderId}`,
        );

        return successResponse(
          res,
          200,
          `Notification sent to ${deliveryPartnerIds.length} delivery partners`,
          {
            order: populatedOrder,
            notifiedCount: deliveryPartnerIds.length,
          },
        );
      }
    } else {
      // Notify priority delivery boys
      const populatedOrder = await Order.findById(order._id)
        .populate("userId", "name phone")
        .populate("restaurantId", "name location address phone ownerPhone")
        .lean();

      if (populatedOrder) {
        const priorityIds = priorityDeliveryBoys.map(
          (db) => db.deliveryPartnerId,
        );

        // Update assignment info
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            "assignmentInfo.priorityDeliveryPartnerIds": priorityIds,
            "assignmentInfo.assignedBy": "manual_resend",
            "assignmentInfo.assignedAt": new Date(),
          },
        });

        await notifyMultipleDeliveryBoys(
          populatedOrder,
          priorityIds,
          "priority",
        );

        console.log(
          `✅ Resent notification to ${priorityIds.length} priority delivery partners for order ${order.orderId}`,
        );

        return successResponse(
          res,
          200,
          `Notification sent to ${priorityIds.length} delivery partners`,
          {
            order: populatedOrder,
            notifiedCount: priorityIds.length,
          },
        );
      }
    }

    return errorResponse(res, 500, "Failed to send notification");
  } catch (error) {
    console.error("Error resending delivery notification:", error);
    return errorResponse(
      res,
      500,
      `Failed to resend notification: ${error.message}`,
    );
  }
});
