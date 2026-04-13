import { sendToUser } from './fcmService.js';
import User from '../../../modules/auth/models/User.js';
import Restaurant from '../../../modules/restaurant/models/Restaurant.js';
import Delivery from '../../../modules/delivery/models/Delivery.js';
import Hotel from '../../../modules/hotel/models/Hotel.js';
import Admin from '../../../modules/admin/models/Admin.js';

/**
 * Send push notification with tag-based deduplication
 * @param {string} userId - User ID
 * @param {string} role - 'user' | 'restaurant' | 'delivery' | 'admin'
 * @param {Object} payload - { title, body, data }
 */
export async function sendPushNotification(userId, role, payload) {
  try {
    if (!payload.data) payload.data = {};
    
    // Ensure tag is present for deduplication
    if (!payload.data.tag) {
      payload.data.tag = payload.data.orderId || payload.data.notificationId || Date.now().toString();
    }

    // Add icon URL
    const baseUrl = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173';
    const logoUrl = `${baseUrl}/vite.svg`;
    payload.data.icon = payload.data.icon || logoUrl;

    const result = await sendToUser(userId, role, {
      title: payload.title,
      body: payload.body
    }, payload.data);

    if (result.success) {
      console.log(`✅ [Push Notification] Sent to ${role} ${userId}: ${payload.title}`);
    } else {
      console.warn(`⚠️ [Push Notification] Failed to send to ${role} ${userId}: ${result.error || 'Unknown error'}`);
    }

    return result;
  } catch (error) {
    console.error(`❌ [Push Notification] Error sending to ${role} ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification to user when order is placed
 */
export async function notifyUserOrderPlaced(order) {
  try {
    const userId = order.userId?._id || order.userId;
    if (!userId) {
      console.warn('⚠️ [Push Notification] Cannot notify user: order has no userId');
      return;
    }

    await sendPushNotification(userId.toString(), 'user', {
      title: 'Order Placed Successfully! 🎉',
      body: `Your order #${order.orderId} has been placed and is being prepared.`,
      data: {
        type: 'order_placed',
        orderId: order.orderId || order._id.toString(),
        tag: `order_placed_${order.orderId || order._id}`
      }
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying user about order placement:', error);
  }
}

/**
 * Send notification to user when restaurant accepts order
 */
export async function notifyUserRestaurantAccepted(order) {
  try {
    const userId = order.userId?._id || order.userId;
    if (!userId) {
      console.warn('⚠️ [Push Notification] Cannot notify user: order has no userId');
      return;
    }

    await sendPushNotification(userId.toString(), 'user', {
      title: 'Order Confirmed! ✅',
      body: `Restaurant has accepted your order #${order.orderId}. It's being prepared now.`,
      data: {
        type: 'restaurant_accepted',
        orderId: order.orderId || order._id.toString(),
        tag: `restaurant_accepted_${order.orderId || order._id}`
      }
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying user about restaurant acceptance:', error);
  }
}

/**
 * Send notification to user when order is ready
 */
export async function notifyUserOrderReady(order) {
  try {
    const userId = order.userId?._id || order.userId;
    if (!userId) {
      console.warn('⚠️ [Push Notification] Cannot notify user: order has no userId');
      return;
    }

    await sendPushNotification(userId.toString(), 'user', {
      title: 'Order Ready! 🍽️',
      body: `Your order #${order.orderId} is ready and will be delivered soon.`,
      data: {
        type: 'order_ready',
        orderId: order.orderId || order._id.toString(),
        tag: `order_ready_${order.orderId || order._id}`
      }
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying user about order ready:', error);
  }
}

/**
 * Send notification to user when order is out for delivery
 */
export async function notifyUserOutForDelivery(order) {
  try {
    const userId = order.userId?._id || order.userId;
    if (!userId) {
      console.warn('⚠️ [Push Notification] Cannot notify user: order has no userId');
      return;
    }

    await sendPushNotification(userId.toString(), 'user', {
      title: 'Order On The Way! 🏍️',
      body: `Your order #${order.orderId} is out for delivery. Track it live!`,
      data: {
        type: 'out_for_delivery',
        orderId: order.orderId || order._id.toString(),
        tag: `out_for_delivery_${order.orderId || order._id}`
      }
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying user about out for delivery:', error);
  }
}

/**
 * Send notification to user when order is delivered
 */
export async function notifyUserOrderDelivered(order) {
  try {
    const userId = order.userId?._id || order.userId;
    if (!userId) {
      console.warn('⚠️ [Push Notification] Cannot notify user: order has no userId');
      return;
    }

    await sendPushNotification(userId.toString(), 'user', {
      title: 'Order Delivered! 🎊',
      body: `Your order #${order.orderId} has been delivered. Enjoy your meal!`,
      data: {
        type: 'order_delivered',
        orderId: order.orderId || order._id.toString(),
        orderMongoId: order._id?.toString?.() || order._id || null,
        status: 'delivered',
        deliveredAt: order.deliveredAt
          ? new Date(order.deliveredAt).toISOString()
          : new Date().toISOString(),
        reviewSubmitted: Boolean(order.review?.rating),
        tag: `order_delivered_${order.orderId || order._id}`
      }
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying user about order delivery:', error);
  }
}

/**
 * Send notification to restaurant when new order arrives
 * Mobile push copy: \"Order has arrived\"
 */
export async function notifyRestaurantNewOrder(order) {
  try {
    const restaurantId = order.restaurantId?._id || order.restaurantId;
    if (!restaurantId) {
      console.warn('⚠️ [Push Notification] Cannot notify restaurant: order has no restaurantId');
      return;
    }

    const resendVersion = Number(order.assignmentInfo?.resendVersion || 0);

    await sendPushNotification(restaurantId.toString(), 'restaurant', {
      title: 'Order has arrived',
      body: `Order #${order.orderId} has arrived. Amount: ₹${order.pricing?.total || 0}`,
      data: {
        type: 'new_order',
        orderId: order.orderId || order._id.toString(),
        channelId: 'restaurant_new_order',
        sound: 'alert',
        resendVersion,
        tag: `restaurant_new_order_${order.orderId || order._id}_${resendVersion}`
      }
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying restaurant about new order:', error);
  }
}

/**
 * Send notification to hotel when a user places an order via hotel QR.
 * Copy requirement: "QR is scanned" + room number.
 */
export async function notifyHotelQrScanned(order) {
  try {
    const hotelMongoId = order.hotelId?._id || order.hotelId;
    const hotelReference = order.hotelReference || null;

    // Resolve hotel id if order only has hotelReference string
    let resolvedHotelId = hotelMongoId ? hotelMongoId.toString() : null;
    if (!resolvedHotelId && hotelReference) {
      const hotelDoc = await Hotel.findOne({
        $or: [
          { _id: hotelReference },
          { hotelId: hotelReference },
        ],
      })
        .select('_id')
        .lean();
      resolvedHotelId = hotelDoc?._id?.toString() || null;
    }

    if (!resolvedHotelId) {
      console.warn('⚠️ [Push Notification] Cannot notify hotel: order has no hotel reference/id');
      return;
    }

    const room = order.roomNumber ? String(order.roomNumber) : 'N/A';
    const oid = order.orderId || order._id?.toString?.() || '';

    await sendPushNotification(resolvedHotelId, 'hotel', {
      title: 'QR is scanned',
      body: `Room: ${room} • Order #${oid}`,
      data: {
        type: 'hotel_qr_scanned',
        // Hotel device should receive only once (prefer mobile token if present)
        preferMobileOnly: true,
        orderId: oid,
        orderMongoId: order._id?.toString?.() || null,
        roomNumber: room,
        paymentMethod: order.payment?.method || null,
        channelId: 'hotel_qr_scanned',
        sound: 'default',
        tag: `hotel_qr_scanned_${oid || order._id}`,
      },
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying hotel about QR scan:', error);
  }
}

/**
 * Send notification to all admins
 */
export async function notifyAllAdmins(payload) {
  try {
    const admins = await Admin.find({
      $or: [
        { fcmtokenWeb: { $exists: true, $ne: null } },
        { fcmtokenMobile: { $exists: true, $ne: null } }
      ]
    }).select('_id fcmtokenWeb fcmtokenMobile').lean();

    if (!admins || admins.length === 0) {
      console.log('⚠️ [Push Notification] No admins found with FCM tokens');
      return;
    }

    const results = await Promise.allSettled(
      admins.map(admin => 
        sendPushNotification(admin._id.toString(), 'admin', payload)
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    console.log(`✅ [Push Notification] Sent to ${successCount}/${admins.length} admins: ${payload.title}`);
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying admins:', error);
  }
}

/**
 * Send notification to user from admin
 */
export async function notifyUserFromAdmin(userId, payload) {
  try {
    await sendPushNotification(userId.toString(), 'user', {
      title: payload.title || 'Notification',
      body: payload.body || '',
      data: {
        type: 'admin_notification',
        ...payload.data,
        image: payload.data?.image || undefined, // Ensure image is passed
        tag: payload.data?.tag || `admin_notification_user_${userId}_${Date.now()}`
      }
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying user from admin:', error);
  }
}

/**
 * Send notification to restaurant from admin
 */
export async function notifyRestaurantFromAdmin(restaurantId, payload) {
  try {
    await sendPushNotification(restaurantId.toString(), 'restaurant', {
      title: payload.title || 'Notification',
      body: payload.body || '',
      data: {
        type: 'admin_notification',
        ...payload.data,
        image: payload.data?.image || undefined, // Ensure image is passed
        tag: payload.data?.tag || `admin_notification_restaurant_${restaurantId}_${Date.now()}`
      }
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying restaurant from admin:', error);
  }
}

/**
 * Send notification to delivery boy from admin
 */
export async function notifyDeliveryFromAdmin(deliveryId, payload) {
  try {
    await sendPushNotification(deliveryId.toString(), 'delivery', {
      title: payload.title || 'Notification',
      body: payload.body || '',
      data: {
        type: 'admin_notification',
        ...payload.data,
        image: payload.data?.image || undefined, // Ensure image is passed
        tag: payload.data?.tag || `admin_notification_delivery_${deliveryId}_${Date.now()}`
      }
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying delivery boy from admin:', error);
  }
}

/**
 * Send notification to hotel from admin
 */
export async function notifyHotelFromAdmin(hotelId, payload) {
  try {
    await sendPushNotification(hotelId.toString(), 'hotel', {
      title: payload.title || 'Notification',
      body: payload.body || '',
      data: {
        type: 'admin_notification',
        ...payload.data,
        image: payload.data?.image || undefined,
        tag: payload.data?.tag || `admin_notification_hotel_${hotelId}_${Date.now()}`
      }
    });
  } catch (error) {
    console.error('❌ [Push Notification] Error notifying hotel from admin:', error);
  }
}
