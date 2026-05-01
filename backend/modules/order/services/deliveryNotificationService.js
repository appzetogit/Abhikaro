import Order from '../models/Order.js';
import Delivery from '../../delivery/models/Delivery.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import mongoose from 'mongoose';

// Dynamic import to avoid circular dependency
let getIO = null;

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import('../../../server.js');
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

function buildActiveOrderQueryForDeliveryPartner(deliveryPartnerIdCondition, excludeOrderObjectId = null) {
  const q = {
    deliveryPartnerId: deliveryPartnerIdCondition,
    status: { $nin: ['delivered', 'cancelled'] },
    $or: [
      { 'deliveryState.currentPhase': { $ne: 'completed' } },
      { 'deliveryState.currentPhase': { $exists: false } },
    ],
  };
  if (excludeOrderObjectId) {
    q._id = { $ne: excludeOrderObjectId };
  }
  return q;
}

async function isDeliveryPartnerBusy(deliveryPartnerId, { excludeOrderId } = {}) {
  const normalized = deliveryPartnerId?.toString?.() || String(deliveryPartnerId);
  if (!mongoose.Types.ObjectId.isValid(normalized)) return false;

  const deliveryObjectId = new mongoose.Types.ObjectId(normalized);
  const excludeOrderObjectId =
    excludeOrderId && mongoose.Types.ObjectId.isValid(String(excludeOrderId))
      ? new mongoose.Types.ObjectId(String(excludeOrderId))
      : null;

  const active = await Order.exists(buildActiveOrderQueryForDeliveryPartner(deliveryObjectId, excludeOrderObjectId));
  return !!active;
}

async function filterOutBusyDeliveryPartners(deliveryPartnerIds, { excludeOrderId } = {}) {
  const ids = Array.isArray(deliveryPartnerIds) ? deliveryPartnerIds : [];
  const objectIds = ids
    .map((id) => {
      const s = id?.toString?.() || String(id);
      return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : null;
    })
    .filter(Boolean);

  if (objectIds.length === 0) return ids;

  const excludeOrderObjectId =
    excludeOrderId && mongoose.Types.ObjectId.isValid(String(excludeOrderId))
      ? new mongoose.Types.ObjectId(String(excludeOrderId))
      : null;

  const busy = await Order.distinct(
    'deliveryPartnerId',
    buildActiveOrderQueryForDeliveryPartner({ $in: objectIds }, excludeOrderObjectId),
  );

  const busySet = new Set((busy || []).map((x) => x?.toString?.() || String(x)));
  return ids.filter((id) => !busySet.has(id?.toString?.() || String(id)));
}

/**
 * Check if delivery partner is connected to socket
 * @param {string} deliveryPartnerId - Delivery partner ID
 * @returns {Promise<{connected: boolean, room: string|null, socketCount: number}>}
 */
async function checkDeliveryPartnerConnection(deliveryPartnerId) {
  try {
    const io = await getIOInstance();
    if (!io) {
      return { connected: false, room: null, socketCount: 0 };
    }

    const deliveryNamespace = io.of('/delivery');
    const normalizedId = deliveryPartnerId?.toString() || deliveryPartnerId;
    
    const roomVariations = [
      `delivery:${normalizedId}`,
      `delivery:${deliveryPartnerId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedId) 
        ? [`delivery:${new mongoose.Types.ObjectId(normalizedId).toString()}`]
        : [])
    ];

    for (const room of roomVariations) {
      const sockets = await deliveryNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        return { connected: true, room, socketCount: sockets.length };
      }
    }

    return { connected: false, room: null, socketCount: 0 };
  } catch (error) {
    console.error('Error checking delivery partner connection:', error);
    return { connected: false, room: null, socketCount: 0 };
  }
}

/**
 * Notify delivery boy about new order assignment via Socket.IO
 * @param {Object} order - Order document
 * @param {string} deliveryPartnerId - Delivery partner ID
 */
export async function notifyDeliveryBoyNewOrder(order, deliveryPartnerId) {
  // CRITICAL: Don't notify if order is cancelled
  if (order.status === 'cancelled') {
    console.log(`⚠️ Order ${order.orderId} is cancelled. Cannot notify delivery partner.`);
    return { success: false, reason: 'Order is cancelled' };
  }
  try {
    // Guard: don't send "new order" to a rider already busy with another active order
    const busy = await isDeliveryPartnerBusy(deliveryPartnerId, { excludeOrderId: order?._id });
    if (busy) {
      console.warn(`⚠️ Skipping notification: delivery partner ${deliveryPartnerId} is busy with another active order`);
      return { success: false, reason: 'Delivery partner is busy with another active order' };
    }

    const io = await getIOInstance();
    
    if (!io) {
      console.warn('Socket.IO not initialized, skipping delivery boy notification');
      return;
    }

    // Populate userId if it's not already populated
    let orderWithUser = order;
    if (order.userId && typeof order.userId === 'object' && order.userId._id) {
      // Already populated
      orderWithUser = order;
    } else if (order.userId) {
      // Need to populate
      const OrderModel = await import('../models/Order.js');
      orderWithUser = await OrderModel.default.findById(order._id)
        .populate('userId', 'name phone')
        .lean();
    }

    // Get delivery partner details
    const deliveryPartner = await Delivery.findById(deliveryPartnerId)
      .select('name phone availability.currentLocation availability.isOnline status isActive')
      .lean();

    if (!deliveryPartner) {
      console.error(`❌ Delivery partner not found: ${deliveryPartnerId}`);
      return;
    }

    // Verify delivery partner is online and active
    if (!deliveryPartner.availability?.isOnline) {
      console.warn(`⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) is not online. Notification may not be received.`);
    }

    if (!deliveryPartner.isActive) {
      console.warn(`⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) is not active.`);
    }

    if (!deliveryPartner.availability?.currentLocation?.coordinates || 
        deliveryPartner.availability.currentLocation.coordinates[0] === 0 && 
        deliveryPartner.availability.currentLocation.coordinates[1] === 0) {
      console.warn(`⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) has no valid location.`);
    }

    console.log(`📋 Delivery partner details:`, {
      id: deliveryPartnerId,
      name: deliveryPartner.name,
      isOnline: deliveryPartner.availability?.isOnline,
      isActive: deliveryPartner.isActive,
      status: deliveryPartner.status,
      hasLocation: !!deliveryPartner.availability?.currentLocation?.coordinates
    });

    // Check if delivery partner is connected to socket BEFORE trying to notify
    const connectionStatus = await checkDeliveryPartnerConnection(deliveryPartnerId);
    console.log(`🔌 Delivery partner socket connection status:`, connectionStatus);
    
    if (!connectionStatus.connected) {
      console.warn(`⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) is NOT connected to socket!`);
      console.warn(`⚠️ Notification will be sent but may not be received until they reconnect.`);
    } else {
      console.log(`✅ Delivery partner ${deliveryPartnerId} is connected via socket in room: ${connectionStatus.room}`);
    }

    // Get restaurant details for pickup location
    // order.restaurantId is usually a string, but can be a populated object in some call sites.
    let restaurant = null;
    const restaurantIdRaw = order.restaurantId;
    const populatedRestaurantObjectId = restaurantIdRaw?._id;
    const populatedRestaurantPublicId = restaurantIdRaw?.restaurantId;

    if (populatedRestaurantObjectId) {
      restaurant = await Restaurant.findById(populatedRestaurantObjectId).lean();
    } else if (mongoose.Types.ObjectId.isValid(restaurantIdRaw)) {
      restaurant = await Restaurant.findById(restaurantIdRaw).lean();
    }
    if (!restaurant) {
      const lookupId = populatedRestaurantPublicId || restaurantIdRaw;
      restaurant = await Restaurant.findOne({
        $or: [{ restaurantId: lookupId }, { _id: lookupId }],
      }).lean();
    }

    // Build an effective restaurant location/address with robust fallbacks
    const fallbackRestaurantLocation =
      order.restaurantLocation && (order.restaurantLocation.latitude || order.restaurantLocation.longitude)
        ? {
            type: "Point",
            coordinates: [
              Number(order.restaurantLocation.longitude) || 0,
              Number(order.restaurantLocation.latitude) || 0,
            ],
            formattedAddress:
              order.restaurantLocation.formattedAddress ||
              order.restaurantLocation.address ||
              null,
            address:
              order.restaurantLocation.formattedAddress ||
              order.restaurantLocation.address ||
              null,
          }
        : null;
    const normalizedRestaurantLocation = restaurant?.location
      ? {
          ...restaurant.location,
          // Support both legacy `location.coordinates` and new `location.geoLocation.coordinates`
          coordinates:
            restaurant.location.coordinates?.length
              ? restaurant.location.coordinates
              : restaurant.location.geoLocation?.coordinates?.length
                ? restaurant.location.geoLocation.coordinates
                : restaurant.location.coordinates,
        }
      : null;

    const effectiveRestaurantLocation =
      normalizedRestaurantLocation?.coordinates?.length
        ? normalizedRestaurantLocation
        : fallbackRestaurantLocation;

    const effectiveRestaurantAddress =
      restaurant?.location?.formattedAddress ||
      restaurant?.location?.address ||
      restaurant?.address ||
      fallbackRestaurantLocation?.formattedAddress ||
      fallbackRestaurantLocation?.address ||
      "Restaurant address";

    // Calculate distances
    let pickupDistance = null;
    let deliveryDistance = null;
    
    if (deliveryPartner.availability?.currentLocation?.coordinates && effectiveRestaurantLocation?.coordinates) {
      const [deliveryLng, deliveryLat] = deliveryPartner.availability.currentLocation.coordinates;
      const [restaurantLng, restaurantLat] = effectiveRestaurantLocation.coordinates;
      const [customerLng, customerLat] = order.address.location.coordinates;

      // Calculate pickup distance (delivery boy to restaurant)
      pickupDistance = calculateDistance(deliveryLat, deliveryLng, restaurantLat, restaurantLng);
      
      // Calculate delivery distance (restaurant to customer)
      deliveryDistance = calculateDistance(restaurantLat, restaurantLng, customerLat, customerLng);
    }

    // Calculate estimated earnings (delivery partner payout).
    // IMPORTANT: Do NOT fall back to order.pricing.deliveryFee here — that's customer billing, not rider earning.
    const deliveryFeeFromOrder = order.pricing?.deliveryFee ?? 0;
    let estimatedEarnings = await calculateEstimatedEarnings(deliveryDistance || 0);
    const earnedValue = typeof estimatedEarnings === 'object' ? (estimatedEarnings.totalEarning ?? 0) : (Number(estimatedEarnings) || 0);
    if (earnedValue <= 0) {
      // Last-resort fallback: keep a sane non-zero payout so UI never shows ₹0/₹1 due to billing fee confusion.
      estimatedEarnings = {
        basePayout: 10,
        distance: Number(deliveryDistance || 0),
        commissionPerKm: 0,
        distanceCommission: 0,
        totalEarning: 10,
        breakdown: 'Fallback: base payout only'
      };
    }

    // Prepare order notification data
    const orderNotification = {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      restaurantId: order.restaurantId,
      restaurantName: order.restaurantName,
      resendVersion: Number(order.assignmentInfo?.resendVersion || 0),
      assignedBy: order.assignmentInfo?.assignedBy || null,
      isResend: ['manual_resend', 'admin_manual_resend'].includes(order.assignmentInfo?.assignedBy),
      restaurantAddress: effectiveRestaurantAddress,
      restaurantLocation: effectiveRestaurantLocation
        ? {
            latitude: effectiveRestaurantLocation.coordinates[1],
            longitude: effectiveRestaurantLocation.coordinates[0],
            address: effectiveRestaurantAddress,
          }
        : null,
      // Include explicit scalar coordinates for rider clients that expect them
      restaurantLat: effectiveRestaurantLocation?.coordinates?.[1] ?? null,
      restaurantLng: effectiveRestaurantLocation?.coordinates?.[0] ?? null,
      customerLocation: {
        latitude: order.address.location.coordinates[1],
        longitude: order.address.location.coordinates[0],
        address: order.address.formattedAddress || `${order.address.street}, ${order.address.city}` || 'Customer address'
      },
      // Also provide delivery coordinates explicitly
      deliveryLat: order.address.location.coordinates?.[1] ?? null,
      deliveryLng: order.address.location.coordinates?.[0] ?? null,
      // Explicit pickup/drop aliases (some client builds rely on these)
      pickupLat: effectiveRestaurantLocation?.coordinates?.[1] ?? null,
      pickupLng: effectiveRestaurantLocation?.coordinates?.[0] ?? null,
      pickupAddress: effectiveRestaurantAddress,
      dropLat: order.address.location.coordinates?.[1] ?? null,
      dropLng: order.address.location.coordinates?.[0] ?? null,
      dropAddress:
        order.address.formattedAddress ||
        order.address.address ||
        `${order.address.street || ""}${order.address.city ? `, ${order.address.city}` : ""}`.trim() ||
        "Customer address",
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      total: order.pricing.total,
      deliveryFee: deliveryFeeFromOrder,
      customerName: orderWithUser.userId?.name || 'Customer',
      customerPhone: orderWithUser.userId?.phone || '',
      status: order.status,
      createdAt: order.createdAt,
      estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
      note: order.note || '',
      pickupDistance: pickupDistance ? `${pickupDistance.toFixed(2)} km` : 'Distance not available',
      deliveryDistance: deliveryDistance ? `${deliveryDistance.toFixed(2)} km` : 'Calculating...',
      deliveryDistanceRaw: deliveryDistance || 0, // Raw distance number for calculations
      estimatedEarnings,
      // Payment + hotel context (delivery app shows Pay at Hotel / cash-collected UI from this)
      paymentMethod: order.payment?.method || "razorpay",
      paymentStatus: order.payment?.status || null,
      orderType: order.orderType || null,
      hotelReference: order.hotelReference || null,
      hotelId: (() => {
        const h = order.hotelId;
        if (!h) return null;
        if (typeof h === "object" && h._id) return h._id.toString();
        return h.toString?.() || String(h);
      })(),
      hotelName: order.hotelName || null,
      roomNumber: order.roomNumber || null,
      hotelCashSettled: order.hotelCashSettled === true,
      cashCollected: order.cashCollected === true,
    };

    // Get delivery namespace
    const deliveryNamespace = io.of('/delivery');
    
    // Normalize deliveryPartnerId to string
    const normalizedDeliveryPartnerId = deliveryPartnerId?.toString() || deliveryPartnerId;
    
    // Try multiple room formats to ensure we find the delivery partner
    const roomVariations = [
      `delivery:${normalizedDeliveryPartnerId}`,
      `delivery:${deliveryPartnerId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedDeliveryPartnerId) 
        ? [`delivery:${new mongoose.Types.ObjectId(normalizedDeliveryPartnerId).toString()}`]
        : [])
    ];
    
    // Get all connected sockets in the delivery partner room
    let socketsInRoom = [];
    let foundRoom = null;
    
    // First, get all connected sockets in delivery namespace for debugging
    const allSockets = await deliveryNamespace.fetchSockets();
    console.log(`📊 Total connected delivery sockets: ${allSockets.length}`);
    
    // Check each room variation
    for (const room of roomVariations) {
      const sockets = await deliveryNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        socketsInRoom = sockets;
        foundRoom = room;
        console.log(`📢 Found ${sockets.length} socket(s) in room: ${room}`);
        console.log(`📢 Socket IDs in room:`, sockets.map(s => s.id));
        break;
      } else {
        // Check room size using adapter (alternative method)
        const roomSize = deliveryNamespace.adapter.rooms.get(room)?.size || 0;
        if (roomSize > 0) {
          console.log(`📢 Room ${room} has ${roomSize} socket(s) (checked via adapter)`);
        }
      }
    }
    
    const primaryRoom = roomVariations[0];
    
    console.log(`📢 Attempting to notify delivery partner ${normalizedDeliveryPartnerId} about order ${order.orderId}`);
    console.log(`📢 Delivery partner name: ${deliveryPartner.name}`);
    console.log(`📢 Room variations to try:`, roomVariations);
    console.log(`📢 Connected sockets in primary room ${primaryRoom}:`, socketsInRoom.length);
    console.log(`📢 Found room:`, foundRoom || 'none');
    
    // Emit new order notification to all room variations (even if no sockets found, in case they connect)
    let notificationSent = false;
    roomVariations.forEach(room => {
      deliveryNamespace.to(room).emit('new_order', orderNotification);
      deliveryNamespace.to(room).emit('play_notification_sound', {
        type: 'new_order',
        orderId: order.orderId,
        message: `New order assigned: ${order.orderId}`
      });
      notificationSent = true;
      console.log(`📤 Emitted notification to room: ${room}`);
    });

    // Also emit to all sockets in the delivery namespace (fallback if no specific room found)
    if (socketsInRoom.length === 0) {
      console.warn(`⚠️ No sockets connected in any delivery room for partner ${normalizedDeliveryPartnerId}`);
      console.warn(`⚠️ Delivery partner details:`, {
        id: normalizedDeliveryPartnerId,
        name: deliveryPartner.name,
        isOnline: deliveryPartner.availability?.isOnline,
        isActive: deliveryPartner.isActive,
        status: deliveryPartner.status
      });
      console.warn(`⚠️ This means the delivery partner is not currently connected to the app`);
      console.warn(`⚠️ Possible reasons:`);
      console.warn(`  1. Delivery partner app is closed or not running`);
      console.warn(`  2. Delivery partner is not logged in`);
      console.warn(`  3. Socket connection failed`);
      console.warn(`  4. Delivery partner needs to refresh their app`);
      console.warn(`  5. Delivery partner ID mismatch (check if ID used to join room matches ${normalizedDeliveryPartnerId})`);
      
      if (allSockets.length > 0) {
        console.log(`📊 Connected delivery socket IDs:`, allSockets.map(s => s.id));
        console.log(`📊 Checking all delivery rooms to see which partners are connected...`);
        
        // List all rooms in delivery namespace
        const allRooms = deliveryNamespace.adapter.rooms;
        console.log(`📊 All delivery rooms:`, Array.from(allRooms.keys()).filter(room => room.startsWith('delivery:')));
      } else {
        console.warn(`⚠️ No delivery partners are currently connected to the app!`);
      }
      
      // Still broadcast to all delivery sockets as fallback
      console.warn(`⚠️ Broadcasting to all delivery sockets as fallback (in case they connect later)`);
      deliveryNamespace.emit('new_order', orderNotification);
      deliveryNamespace.emit('play_notification_sound', {
        type: 'new_order',
        orderId: order.orderId,
        message: `New order assigned: ${order.orderId}`
      });
      notificationSent = true;
    } else {
      console.log(`✅ Successfully found ${socketsInRoom.length} connected socket(s) for delivery partner ${normalizedDeliveryPartnerId}`);
      console.log(`✅ Notification sent to room: ${foundRoom}`);
    }

    if (notificationSent) {
      console.log(`✅ Notification emitted for order ${order.orderId} to delivery partner ${normalizedDeliveryPartnerId}`);
    } else {
      console.error(`❌ Failed to send notification - no sockets found and broadcast failed`);
    }

    // FCM push notification for delivery partner
    try {
      const { sendToUser } = await import('../../fcm/services/fcmService.js');
      await sendToUser(deliveryPartnerId, 'delivery', {
        title: 'New Order Assigned',
        body: `Order #${order.orderId} has been assigned to you.`,
      }, {
        // Standardize type for SW/clients (audible only for delivery_new_order channel)
        type: 'new_order',
        orderId: order.orderId,
        tag: order.orderId,
        link: `/delivery/order/${order.orderId}`,
        channelId: 'delivery_new_order',
        // For native Android: raw resource name (res/raw/alert.mp3) => "alert"
        sound: 'alert',
      resendVersion: Number(order.assignmentInfo?.resendVersion || 0),
      assignedBy: order.assignmentInfo?.assignedBy || null,
      isResend: ['manual_resend', 'admin_manual_resend'].includes(order.assignmentInfo?.assignedBy),
      });
    } catch (fcmErr) {
      console.warn('FCM delivery notification:', fcmErr.message);
    }

    return {
      success: true,
      deliveryPartnerId,
      orderId: order.orderId
    };
  } catch (error) {
    console.error('Error notifying delivery boy:', error);
    throw error;
  }
}

/**
 * Notify multiple delivery boys about new order (without assigning)
 * Used for priority-based notification where nearest delivery boys get first chance
 * @param {Object} order - Order document
 * @param {Array} deliveryPartnerIds - Array of delivery partner IDs to notify
 * @param {string} phase - Notification phase: 'priority' or 'expanded'
 * @returns {Promise<{success: boolean, notified: number}>}
 */
export async function notifyMultipleDeliveryBoys(order, deliveryPartnerIds, phase = 'priority') {
  try {
    if (!deliveryPartnerIds || deliveryPartnerIds.length === 0) {
      return { success: false, notified: 0 };
    }

    // CRITICAL: Stop circulation if order is already assigned
    if (order.deliveryPartnerId) {
      console.log(`🚫 Order ${order.orderId} already assigned to ${order.deliveryPartnerId}; stopping notification circulation.`);
      return { success: false, notified: 0, reason: 'Already assigned' };
    }

    // Exclude delivery partners who are already handling an active order
    const filteredIds = await filterOutBusyDeliveryPartners(deliveryPartnerIds, { excludeOrderId: order?._id });
    if (filteredIds.length === 0) {
      console.log(`🚫 All target delivery partners are busy; skipping notifications for order ${order?.orderId}`);
      return { success: false, notified: 0 };
    }
    if (filteredIds.length !== deliveryPartnerIds.length) {
      console.log(`🚫 Excluding ${deliveryPartnerIds.length - filteredIds.length} busy delivery partners from notification targets`);
    }

    // Server-side auto-resend loop should refresh availability without spamming
    // FCM pushes / notification sounds / forced "new_order" popups every few seconds.
    const isAutoResendTick = phase === 'auto_resend';

    const io = await getIOInstance();
    if (!io) {
      console.warn('Socket.IO not initialized, skipping delivery boy notifications');
      return { success: false, notified: 0 };
    }

    const deliveryNamespace = io.of('/delivery');
    let notifiedCount = 0;

    // Populate userId if needed
    let orderWithUser = order;
    if (order.userId && typeof order.userId === 'object' && order.userId._id) {
      orderWithUser = order;
    } else if (order.userId) {
      const OrderModel = await import('../models/Order.js');
      orderWithUser = await OrderModel.default.findById(order._id)
        .populate('userId', 'name phone')
        .lean();
    }

    // Get restaurant details for complete address
    let restaurantAddress = 'Restaurant address';
    let restaurantLocation = null;
    
    if (orderWithUser.restaurantId) {
      // If restaurantId is populated, use it directly
      if (typeof orderWithUser.restaurantId === 'object') {
        restaurantAddress = orderWithUser.restaurantId.address || 
                          orderWithUser.restaurantId.location?.formattedAddress ||
                          orderWithUser.restaurantId.location?.address ||
                          'Restaurant address';
        // Normalize coordinates (supports geoLocation) for populated restaurant
        restaurantLocation = orderWithUser.restaurantId.location
          ? {
              ...orderWithUser.restaurantId.location,
              coordinates:
                orderWithUser.restaurantId.location.coordinates?.length
                  ? orderWithUser.restaurantId.location.coordinates
                  : orderWithUser.restaurantId.location.geoLocation?.coordinates?.length
                    ? orderWithUser.restaurantId.location.geoLocation.coordinates
                    : orderWithUser.restaurantId.location.coordinates,
            }
          : orderWithUser.restaurantId.location;
      } else {
        // If restaurantId is just an ID, fetch restaurant details
        try {
          const RestaurantModel = await import('../../restaurant/models/Restaurant.js');
          const rawRid = orderWithUser.restaurantId;
          let restaurant = null;
          const rawRidStr = rawRid?.toString?.() || rawRid;
          if (mongoose.Types.ObjectId.isValid(rawRidStr) && String(rawRidStr).length === 24) {
            restaurant = await RestaurantModel.default.findById(new mongoose.Types.ObjectId(rawRidStr))
              .select('name address location')
              .lean();
          }
          if (!restaurant) {
            const or = [{ restaurantId: rawRidStr }];
            // Only include _id when valid to avoid CastError for values like "REST-...."
            if (mongoose.Types.ObjectId.isValid(rawRidStr) && String(rawRidStr).length === 24) {
              or.push({ _id: new mongoose.Types.ObjectId(rawRidStr) });
            }
            restaurant = await RestaurantModel.default.findOne({ $or: or })
              .select('name address location')
              .lean();
          }
          if (restaurant) {
            restaurantAddress = restaurant.address || 
                              restaurant.location?.formattedAddress ||
                              restaurant.location?.address ||
                              'Restaurant address';
            // Normalize coordinates (supports geoLocation)
            restaurantLocation = restaurant.location
              ? {
                  ...restaurant.location,
                  coordinates:
                    restaurant.location.coordinates?.length
                      ? restaurant.location.coordinates
                      : restaurant.location.geoLocation?.coordinates?.length
                        ? restaurant.location.geoLocation.coordinates
                        : restaurant.location.coordinates,
                }
              : restaurant.location;
          }
        } catch (e) {
          console.warn('⚠️ Could not fetch restaurant details for notification:', e.message);
        }
      }
    }

    // Calculate delivery distance (restaurant to customer) for earnings calculation
    let deliveryDistance = 0;
    
    console.log(`🔍 Calculating earnings for order ${orderWithUser.orderId}:`, {
      hasRestaurantLocation: !!restaurantLocation,
      restaurantCoords: restaurantLocation?.coordinates,
      hasAddressLocation: !!orderWithUser.address?.location,
      addressCoords: orderWithUser.address?.location?.coordinates
    });
    
    if (restaurantLocation?.coordinates && orderWithUser.address?.location?.coordinates) {
      const [restaurantLng, restaurantLat] = restaurantLocation.coordinates;
      const [customerLng, customerLat] = orderWithUser.address.location.coordinates;
      
      // Validate coordinates
      if (restaurantLat && restaurantLng && customerLat && customerLng &&
          !isNaN(restaurantLat) && !isNaN(restaurantLng) && 
          !isNaN(customerLat) && !isNaN(customerLng)) {
        // Calculate distance using Haversine formula
        const R = 6371; // Earth radius in km
        const dLat = (customerLat - restaurantLat) * Math.PI / 180;
        const dLng = (customerLng - restaurantLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(restaurantLat * Math.PI / 180) * Math.cos(customerLat * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        deliveryDistance = R * c;
        console.log(`✅ Calculated delivery distance: ${deliveryDistance.toFixed(2)} km`);
      } else {
        console.warn('⚠️ Invalid coordinates for distance calculation');
      }
    } else {
      console.warn('⚠️ Missing coordinates for distance calculation');
    }

    // Calculate estimated earnings based on delivery distance
    let estimatedEarnings = null;
    const deliveryFeeFromOrder = orderWithUser.pricing?.deliveryFee ?? 0;
    
    try {
      estimatedEarnings = await calculateEstimatedEarnings(deliveryDistance);
      const earnedValue = typeof estimatedEarnings === 'object' ? (estimatedEarnings.totalEarning ?? 0) : (Number(estimatedEarnings) || 0);
      
      console.log(`💰 Earnings calculation result:`, {
        estimatedEarnings,
        earnedValue,
        deliveryFeeFromOrder,
        deliveryDistance
      });
      
      // Do NOT fall back to deliveryFee (billing). If commission returns 0, use a minimal base payout.
      if (earnedValue <= 0) {
        console.log(`⚠️ Earnings is 0, using base payout fallback (not deliveryFee).`);
        estimatedEarnings = typeof estimatedEarnings === 'object'
          ? { ...estimatedEarnings, totalEarning: Math.max(Number(estimatedEarnings.basePayout || 0) || 0, 10) }
          : 10;
      }
      
      console.log(`✅ Final estimated earnings for order ${orderWithUser.orderId}: ₹${typeof estimatedEarnings === 'object' ? estimatedEarnings.totalEarning : estimatedEarnings} (distance: ${deliveryDistance.toFixed(2)} km)`);
    } catch (earningsError) {
      console.error('❌ Error calculating estimated earnings in notification:', earningsError);
      console.error('❌ Error stack:', earningsError.stack);
      // Fallback to default (never use deliveryFee here)
      estimatedEarnings = {
        basePayout: 10,
        distance: deliveryDistance,
        commissionPerKm: 5,
        distanceCommission: 0,
        totalEarning: 10,
        breakdown: 'Default calculation'
      };
      console.log(`⚠️ Using fallback earnings: ₹${typeof estimatedEarnings === 'object' ? estimatedEarnings.totalEarning : estimatedEarnings}`);
    }

    // Prepare notification payload
    const orderNotification = {
      orderId: orderWithUser.orderId || orderWithUser._id,
      mongoId: orderWithUser._id?.toString(),
      orderMongoId: orderWithUser._id?.toString(), // Also include orderMongoId for compatibility
      status: orderWithUser.status || 'preparing',
      resendVersion: Number(orderWithUser.assignmentInfo?.resendVersion || 0),
      assignedBy: orderWithUser.assignmentInfo?.assignedBy || null,
      isResend: ['manual_resend', 'admin_manual_resend'].includes(orderWithUser.assignmentInfo?.assignedBy),
      // Provide a stable restaurantId identifier for client fallbacks (some clients fetch restaurant details by id)
      restaurantId:
        typeof orderWithUser.restaurantId === 'string'
          ? orderWithUser.restaurantId
          : (orderWithUser.restaurantId?.restaurantId || orderWithUser.restaurantId?._id?.toString?.() || null),
      restaurantName: orderWithUser.restaurantName || orderWithUser.restaurantId?.name,
      restaurantAddress: restaurantAddress,
      restaurantLocation: restaurantLocation ? {
        latitude: restaurantLocation.coordinates?.[1],
        longitude: restaurantLocation.coordinates?.[0],
        address: restaurantLocation.formattedAddress || restaurantLocation.address || restaurantAddress,
        formattedAddress: restaurantLocation.formattedAddress || restaurantLocation.address || restaurantAddress
      } : null,
      // Explicit pickup/drop aliases (for consistent delivery UI)
      pickupLat: restaurantLocation?.coordinates?.[1] || orderWithUser.restaurantId?.location?.coordinates?.[1] || null,
      pickupLng: restaurantLocation?.coordinates?.[0] || orderWithUser.restaurantId?.location?.coordinates?.[0] || null,
      pickupAddress: restaurantAddress,
      customerName: orderWithUser.userId?.name || 'Customer',
      customerPhone: orderWithUser.userId?.phone || '',
      deliveryAddress: orderWithUser.address?.address || orderWithUser.address?.location?.address || orderWithUser.address?.formattedAddress,
      customerLocation: orderWithUser.address?.location ? {
        latitude: orderWithUser.address.location.coordinates?.[1],
        longitude: orderWithUser.address.location.coordinates?.[0],
        address: orderWithUser.address.formattedAddress || orderWithUser.address.address
      } : null,
      dropLat: orderWithUser.address?.location?.coordinates?.[1] || null,
      dropLng: orderWithUser.address?.location?.coordinates?.[0] || null,
      dropAddress:
        orderWithUser.address?.formattedAddress ||
        orderWithUser.address?.address ||
        orderWithUser.address?.location?.address ||
        'Customer address',
      totalAmount: orderWithUser.pricing?.total || 0,
      deliveryFee: deliveryFeeFromOrder,
      estimatedEarnings: estimatedEarnings, // Include calculated earnings
      deliveryDistance: deliveryDistance > 0 ? `${deliveryDistance.toFixed(2)} km` : 'Calculating...',
      paymentMethod: orderWithUser.payment?.method || 'cash',
      message: `New order available: ${orderWithUser.orderId || orderWithUser._id}`,
      timestamp: new Date().toISOString(),
      phase: phase, // 'priority' or 'expanded'
      // Include restaurant coordinates
      restaurantLat: restaurantLocation?.coordinates?.[1] || orderWithUser.restaurantId?.location?.coordinates?.[1],
      restaurantLng: restaurantLocation?.coordinates?.[0] || orderWithUser.restaurantId?.location?.coordinates?.[0],
      // Include delivery coordinates
      deliveryLat: orderWithUser.address?.location?.coordinates?.[1] || orderWithUser.address?.location?.latitude,
      deliveryLng: orderWithUser.address?.location?.coordinates?.[0] || orderWithUser.address?.location?.longitude,
      // Include full order for frontend use
      fullOrder: orderWithUser
    };

    console.log(`📤 Notification payload for order ${orderWithUser.orderId}:`, {
      orderId: orderNotification.orderId,
      estimatedEarnings: orderNotification.estimatedEarnings,
      estimatedEarningsType: typeof orderNotification.estimatedEarnings,
      estimatedEarningsValue: typeof orderNotification.estimatedEarnings === 'object' ? orderNotification.estimatedEarnings.totalEarning : orderNotification.estimatedEarnings,
      deliveryDistance: orderNotification.deliveryDistance,
      deliveryFee: orderNotification.deliveryFee,
      hasRestaurantLocation: !!orderNotification.restaurantLocation,
      hasCustomerLocation: !!orderNotification.customerLocation
    });

    // Notify each delivery partner
    for (const deliveryPartnerId of filteredIds) {
      try {
        const normalizedId = deliveryPartnerId?.toString() || deliveryPartnerId;
        // Also try legacy business identifier room (`deliveryId`) if present on Delivery profile
        // Some older clients join rooms using deliveryId instead of Mongo _id.
        let legacyDeliveryId = null;
        try {
          const deliveryDoc = await Delivery.findById(normalizedId).select('deliveryId').lean();
          legacyDeliveryId = deliveryDoc?.deliveryId?.toString?.() || null;
        } catch {
          legacyDeliveryId = null;
        }
        const roomVariations = [
          `delivery:${normalizedId}`,
          `delivery:${deliveryPartnerId}`,
          ...(legacyDeliveryId ? [`delivery:${legacyDeliveryId}`] : []),
          ...(mongoose.Types.ObjectId.isValid(normalizedId)
            ? [`delivery:${new mongoose.Types.ObjectId(normalizedId).toString()}`]
            : [])
        ];

        let notificationSent = false;
        for (const room of roomVariations) {
          const sockets = await deliveryNamespace.in(room).fetchSockets();
          if (sockets.length > 0) {
            // Backward/forward compatibility:
            // - Newer clients listen to `new_order_available` (priority-based offers)
            // - Some clients still rely on `new_order` to open the accept popup immediately
            deliveryNamespace.to(room).emit('new_order_available', orderNotification);
            if (!isAutoResendTick) {
              deliveryNamespace.to(room).emit('new_order', orderNotification);
              deliveryNamespace.to(room).emit('play_notification_sound', {
                type: 'new_order_available',
                orderId: order.orderId,
                message: `New order available: ${order.orderId}`,
                phase: phase
              });
            }
            notificationSent = true;
            notifiedCount++;
            console.log(`📤 Notified delivery partner ${normalizedId} in room: ${room} (phase: ${phase})`);
            break;
          }
        }

        if (!notificationSent) {
          console.warn(`⚠️ Delivery partner ${normalizedId} not connected, but will receive notification when they connect`);
          // Still emit to room for when they connect
          roomVariations.forEach(room => {
            deliveryNamespace.to(room).emit('new_order_available', orderNotification);
            if (!isAutoResendTick) {
              deliveryNamespace.to(room).emit('new_order', orderNotification);
            }
          });
          notifiedCount++;
        }

        // FCM fallback (reliable): resend flows often happen when sockets are flaky/offline.
        // Skip FCM for automated loop ticks — restaurant "Resend" / first accept notify handles loud alerts.
        if (!isAutoResendTick) {
          try {
            const { sendToUser } = await import('../../fcm/services/fcmService.js');
            const oid = orderWithUser?.orderId || orderWithUser?._id?.toString?.();
            if (oid) {
              await sendToUser(deliveryPartnerId, 'delivery', {
                title: 'New Order Available',
                body: `Order #${oid} is available to accept.`,
              }, {
                type: 'new_order',
                orderId: oid,
                tag: oid, // used by frontend to dedupe foreground events
                link: `/delivery/order/${oid}`,
                channelId: 'delivery_new_order',
                // For native Android: raw resource name (res/raw/alert.mp3) => "alert"
                sound: 'alert',
                phase: phase,
                resendVersion: Number(orderWithUser.assignmentInfo?.resendVersion || 0),
                assignedBy: orderWithUser.assignmentInfo?.assignedBy || null,
                isResend: ['manual_resend', 'admin_manual_resend'].includes(orderWithUser.assignmentInfo?.assignedBy),
              });
            }
          } catch (fcmErr) {
            console.warn('⚠️ FCM delivery notification (multiple) failed:', fcmErr.message);
          }
        }
      } catch (partnerError) {
        console.error(`❌ Error notifying delivery partner ${deliveryPartnerId}:`, partnerError);
      }
    }

    console.log(`✅ Notified ${notifiedCount} delivery partners (phase: ${phase}) for order ${order.orderId}`);
    return { success: true, notified: notifiedCount };
  } catch (error) {
    console.error('❌ Error notifying multiple delivery boys:', error);
    return { success: false, notified: 0 };
  }
}

/**
 * Notify delivery boy that order is ready for pickup
 * @param {Object} order - Order document
 * @param {string} deliveryPartnerId - Delivery partner ID
 */
export async function notifyDeliveryBoyOrderReady(order, deliveryPartnerId) {
  try {
    const io = await getIOInstance();
    
    if (!io) {
      console.warn('Socket.IO not initialized, skipping delivery boy notification');
      return;
    }

    const deliveryNamespace = io.of('/delivery');
    const normalizedDeliveryPartnerId = deliveryPartnerId?.toString() || deliveryPartnerId;

    // Prepare order ready notification
    const coords =
      order.restaurantId?.location?.geoLocation?.coordinates?.length
        ? order.restaurantId.location.geoLocation.coordinates
        : order.restaurantId?.location?.coordinates;
    const orderReadyNotification = {
      orderId: order.orderId || order._id,
      mongoId: order._id?.toString(),
      status: 'ready',
      restaurantName: order.restaurantName || order.restaurantId?.name,
      restaurantAddress: order.restaurantId?.address || order.restaurantId?.location?.address,
      message: `Order ${order.orderId} is ready for pickup`,
      timestamp: new Date().toISOString(),
      // Include restaurant coords so delivery app can show Reached Pickup when rider is near (coordinates: [lng, lat])
      restaurantLat: coords?.[1],
      restaurantLng: coords?.[0]
    };

    // Try to find delivery partner's room
    const roomVariations = [
      `delivery:${normalizedDeliveryPartnerId}`,
      `delivery:${deliveryPartnerId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedDeliveryPartnerId) 
        ? [`delivery:${new mongoose.Types.ObjectId(normalizedDeliveryPartnerId).toString()}`]
        : [])
    ];

    let notificationSent = false;
    let foundRoom = null;
    let socketsInRoom = [];

    for (const room of roomVariations) {
      const sockets = await deliveryNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        foundRoom = room;
        socketsInRoom = sockets;
        break;
      }
    }

    if (foundRoom && socketsInRoom.length > 0) {
      // Send to specific delivery partner room
      deliveryNamespace.to(foundRoom).emit('order_ready', orderReadyNotification);
      notificationSent = true;
      console.log(`✅ Order ready notification sent to delivery partner ${normalizedDeliveryPartnerId} in room ${foundRoom}`);
    } else {
      // Fallback: broadcast to all delivery sockets
      console.warn(`⚠️ Delivery partner ${normalizedDeliveryPartnerId} not found in any room, broadcasting to all`);
      deliveryNamespace.emit('order_ready', orderReadyNotification);
      notificationSent = true;
    }

    // Also send FCM push (reliable) so rider gets "Order is ready" even if socket is flaky.
    try {
      const { sendToUser } = await import('../../fcm/services/fcmService.js');
      const oid = order.orderId || order._id?.toString?.();
      if (oid) {
        await sendToUser(deliveryPartnerId, 'delivery', {
          title: 'Order is ready',
          body: `Order #${oid} is ready for pickup.`,
        }, {
          type: 'order_ready',
          orderId: oid,
          tag: oid,
          link: `/delivery/order/${oid}`,
          channelId: 'delivery_order_ready',
        });
      }
    } catch (fcmErr) {
      console.warn('FCM delivery order_ready notification failed:', fcmErr.message);
    }

    return {
      success: notificationSent,
      deliveryPartnerId: normalizedDeliveryPartnerId,
      orderId: order.orderId
    };
  } catch (error) {
    console.error('Error notifying delivery boy about order ready:', error);
    throw error;
  }
}

/**
 * Notify assigned delivery partner that customer updated delivery instructions (order.deliveryInstructions)
 * Emits socket event + sends FCM push (non-blocking).
 */
export async function notifyDeliveryBoyOrderNoteUpdated(order, deliveryPartnerId) {
  try {
    const io = await getIOInstance();
    const deliveryNamespace = io ? io.of("/delivery") : null;

    const oid = order?.orderId || order?._id?.toString?.() || null;
    const mongoId = order?._id?.toString?.() || null;
    const note =
      typeof order?.deliveryInstructions === "string"
        ? order.deliveryInstructions
        : "";

    const payload = {
      type: "order_note_updated",
      orderId: oid,
      orderMongoId: mongoId,
      note,
      updatedAt: new Date().toISOString(),
    };

    if (deliveryNamespace) {
      const normalizedDeliveryPartnerId = deliveryPartnerId?.toString?.() || String(deliveryPartnerId);
      const roomVariations = [
        `delivery:${normalizedDeliveryPartnerId}`,
        `delivery:${deliveryPartnerId}`,
        ...(mongoose.Types.ObjectId.isValid(normalizedDeliveryPartnerId)
          ? [`delivery:${new mongoose.Types.ObjectId(normalizedDeliveryPartnerId).toString()}`]
          : []),
      ];

      roomVariations.forEach((room) => {
        deliveryNamespace.to(room).emit("order_note_updated", payload);
      });
    }

    // FCM push (reliable)
    try {
      const { sendToUser } = await import("../../fcm/services/fcmService.js");
      if (oid) {
        const short =
          note && note.length > 80 ? `${note.slice(0, 77)}...` : (note || "Updated instructions");
        await sendToUser(
          deliveryPartnerId,
          "delivery",
          {
            title: "Delivery instructions updated",
            body: `Order #${oid}: ${short}`,
          },
          {
            type: "order_note_updated",
            orderId: oid,
            tag: `order_note_${oid}_${Date.now()}`,
            link: `/delivery/order/${oid}`,
            channelId: "delivery_order_note",
          },
        );
      }
    } catch (fcmErr) {
      console.warn("FCM delivery order_note_updated notification failed:", fcmErr?.message || fcmErr);
    }

    return { success: true };
  } catch (error) {
    console.error("Error notifying delivery partner about order note update:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

/**
 * Calculate estimated earnings for delivery boy based on admin commission rules
 * Uses DeliveryBoyCommission model to calculate: Base Payout + (Distance × Per Km) if distance > minDistance
 */
async function calculateEstimatedEarnings(deliveryDistance) {
  try {
    const DeliveryBoyCommission = (await import('../../admin/models/DeliveryBoyCommission.js')).default;
    
    // Always use calculateCommission method which handles all cases including distance = 0
    // It will return base payout even if distance is 0
    const deliveryDistanceForCalc = deliveryDistance || 0;
    const commissionResult = await DeliveryBoyCommission.calculateCommission(deliveryDistanceForCalc);
    
    // If distance is 0 or not provided, still return base payout
    if (!deliveryDistance || deliveryDistance <= 0) {
      console.log(`💰 Distance is 0 or missing, returning base payout only: ₹${commissionResult.breakdown.basePayout}`);
      return {
        basePayout: commissionResult.breakdown.basePayout,
        distance: 0,
        commissionPerKm: commissionResult.breakdown.commissionPerKm,
        distanceCommission: 0,
        totalEarning: commissionResult.breakdown.basePayout, // Base payout only when distance is 0
        breakdown: `Base payout: ₹${commissionResult.breakdown.basePayout}`,
        minDistance: commissionResult.rule.minDistance,
        maxDistance: commissionResult.rule.maxDistance
      };
    }

    // Use the already calculated commissionResult for distance > 0
    
    const basePayout = commissionResult.breakdown.basePayout;
    const distance = deliveryDistance;
    const commissionPerKm = commissionResult.breakdown.commissionPerKm;
    const distanceCommission = commissionResult.breakdown.distanceCommission;
    const totalEarning = commissionResult.commission;

    // Create breakdown text
    let breakdown = `Base payout: ₹${basePayout}`;
    if (distance > commissionResult.rule.minDistance) {
      breakdown += ` + Distance (${distance.toFixed(1)} km × ₹${commissionPerKm}/km) = ₹${distanceCommission.toFixed(0)}`;
    } else {
      breakdown += ` (Distance ${distance.toFixed(1)} km ≤ ${commissionResult.rule.minDistance} km, per km not applicable)`;
    }
    breakdown += ` = ₹${totalEarning.toFixed(0)}`;

    return {
      basePayout: Math.round(basePayout * 100) / 100,
      distance: Math.round(distance * 100) / 100,
      commissionPerKm: Math.round(commissionPerKm * 100) / 100,
      distanceCommission: Math.round(distanceCommission * 100) / 100,
      totalEarning: Math.round(totalEarning * 100) / 100,
      breakdown: breakdown,
      minDistance: commissionResult.rule.minDistance,
      maxDistance: commissionResult.rule.maxDistance
    };
  } catch (error) {
    console.error('Error calculating estimated earnings:', error);
    // Fallback to default calculation
    return {
      basePayout: 10,
      distance: deliveryDistance || 0,
      commissionPerKm: 5,
      distanceCommission: deliveryDistance && deliveryDistance > 4 ? deliveryDistance * 5 : 0,
      totalEarning: 10 + (deliveryDistance && deliveryDistance > 4 ? deliveryDistance * 5 : 0),
      breakdown: 'Default calculation'
    };
  }
}

