import Order from '../models/Order.js';
import Payment from '../../payment/models/Payment.js';
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

/**
 * Notify restaurant about new order via Socket.IO
 * @param {Object} order - Order document
 * @param {string} restaurantId - Restaurant ID
 * @param {string} [paymentMethodOverride] - Explicit payment method ('cash' | 'razorpay') so restaurant sees correct value
 */
export async function notifyRestaurantNewOrder(order, restaurantId, paymentMethodOverride) {
  try {
    const io = await getIOInstance();

    if (!io) {
      console.warn('⚠️ Socket.IO not initialized, skipping real-time emission but continuing with FCM fallback');
    }

    // CRITICAL: Validate restaurantId matches order's restaurantId
    const orderRestaurantId = order.restaurantId?.toString() || order.restaurantId;
    const providedRestaurantId = restaurantId?.toString() || restaurantId;
    
    if (orderRestaurantId !== providedRestaurantId) {
      console.error('❌ CRITICAL: RestaurantId mismatch in notification!', {
        orderRestaurantId: orderRestaurantId,
        providedRestaurantId: providedRestaurantId,
        orderId: order.orderId,
        orderRestaurantName: order.restaurantName
      });
      // Use order's restaurantId instead of provided one
      restaurantId = orderRestaurantId;
    }

    // Get restaurant details
    let restaurant = null;
    if (mongoose.Types.ObjectId.isValid(restaurantId)) {
      restaurant = await Restaurant.findById(restaurantId).lean();
    }
    if (!restaurant) {
      restaurant = await Restaurant.findOne({
        $or: [
          { restaurantId: restaurantId },
          { _id: restaurantId }
        ]
      }).lean();
    }
    
    // Validate restaurant name matches order
    if (restaurant && order.restaurantName && restaurant.name !== order.restaurantName) {
      console.warn('⚠️ Restaurant name mismatch:', {
        orderRestaurantName: order.restaurantName,
        foundRestaurantName: restaurant.name,
        restaurantId: restaurantId
      });
      // Still proceed but log warning
    }

    // Resolve payment method: override > order.payment > Payment collection (COD fallback)
    let resolvedPaymentMethod = paymentMethodOverride ?? order.payment?.method ?? 'razorpay';
    if (resolvedPaymentMethod !== 'cash') {
      try {
        const paymentRecord = await Payment.findOne({ orderId: order._id }).select('method').lean();
        if (paymentRecord?.method === 'cash') resolvedPaymentMethod = 'cash';
      } catch (e) { /* ignore */ }
    }

    // Prepare order notification data
    const orderNotification = {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      restaurantId: restaurantId,
      restaurantName: order.restaurantName,
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      total: order.pricing.total,
      customerAddress: {
        label: order.address.label,
        street: order.address.street,
        city: order.address.city,
        location: order.address.location
      },
      status: order.status,
      createdAt: order.createdAt,
      estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
      note: order.note || '',
      sendCutlery: order.sendCutlery,
      paymentMethod: resolvedPaymentMethod
    };
    console.log('📢 Restaurant notification payload paymentMethod:', orderNotification.paymentMethod, { override: paymentMethodOverride, orderPaymentMethod: order.payment?.method });

    // 1. Socket.IO emission
    let socketsInRoom = [];
    if (io) {
      try {
        // Get restaurant namespace
        const restaurantNamespace = io.of('/restaurant');

        // Normalize restaurantId to string (handle both ObjectId and string)
        const normalizedRestaurantId = restaurantId?.toString() || restaurantId;

        // Try multiple room formats to ensure we find the restaurant
        const roomVariations = [
          `restaurant:${normalizedRestaurantId}`,
          `restaurant:${restaurantId}`,
          ...(mongoose.Types.ObjectId.isValid(normalizedRestaurantId)
            ? [`restaurant:${new mongoose.Types.ObjectId(normalizedRestaurantId).toString()}`]
            : [])
        ];

        // Get all connected sockets in the restaurant room
        for (const room of roomVariations) {
          const sockets = await restaurantNamespace.in(room).fetchSockets();
          if (sockets.length > 0) {
            socketsInRoom = sockets;
            console.log(`📢 Found ${sockets.length} socket(s) in room: ${room}`);
            break;
          }
        }

        const primaryRoom = roomVariations[0];

        console.log(`📢 CRITICAL: Attempting to notify restaurant about new order:`);
        console.log(`📢 Order ID: ${order.orderId}`);
        console.log(`📢 Socket Status: ${socketsInRoom.length} socket(s) in room ${primaryRoom}`);

        // CRITICAL: Only emit to the specific restaurant room - NEVER broadcast to all restaurants
        if (socketsInRoom.length > 0) {
          // Found sockets in the restaurant room - send notification only to that room
          roomVariations.forEach(room => {
            restaurantNamespace.to(room).emit('new_order', orderNotification);
            restaurantNamespace.to(room).emit('play_notification_sound', {
              type: 'new_order',
              orderId: order.orderId,
              message: `New order received: ${order.orderId}`
            });
            console.log(`📤 Sent notification to room: ${room}`);
          });
          console.log(`✅ Notified restaurant ${normalizedRestaurantId} about new order ${order.orderId} (${socketsInRoom.length} socket(s) connected)`);
        } else {
          // Still try to emit to room variations (in case socket connects later)
          roomVariations.forEach(room => {
            restaurantNamespace.to(room).emit('new_order', orderNotification);
            restaurantNamespace.to(room).emit('play_notification_sound', {
              type: 'new_order',
              orderId: order.orderId,
              message: `New order received: ${order.orderId}`
            });
            console.log(`📤 Emitted to room ${room} (delayed logic)`);
          });
        }
      } catch (ioError) {
        console.warn('⚠️ [Socket.io] Error during emission, continuing with FCM:', ioError.message);
      }
    } else {
      console.warn('⚠️ Skipping Socket.IO emission - server not initialized yet');
    }

    // 2. FCM push notification (Attempt this regardless of Socket.IO status to ensure backup delivery)
    try {
      const { sendToUser } = await import('../../fcm/services/fcmService.js');
      // Resolve payment method for push: override > order.payment > collection
      let fcmPaymentMethod = paymentMethodOverride ?? order.payment?.method ?? 'razorpay';
      
      const fcmResult = await sendToUser(restaurantId, 'restaurant', {
        title: 'Order has arrived',
        body: `Order #${order.orderId} has arrived. Amount: ₹${order.pricing?.total || 0}. Method: ${fcmPaymentMethod === 'cash' ? 'COD' : fcmPaymentMethod.toUpperCase()}`,
      }, { 
        type: 'new_order', 
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        tag: `new_order_${order.orderId}`
      });
      console.log(`📱 [FCM] Push notification result for restaurant ${restaurantId}:`, fcmResult.success ? 'Success' : 'Failed', fcmResult.error || '');
    } catch (fcmErr) {
      console.warn('⚠️ [FCM] Restaurant push notification error:', fcmErr.message);
    }

    // Return true if at least one notification method should have worked
    return {
      success: true,
      restaurantId,
      orderId: order.orderId,
      socketConnected: socketsInRoom.length > 0
    };
  } catch (error) {
    console.error('❌ Error notifying restaurant:', error);
    throw error;
  }
}

/**
 * Notify restaurant about order status update
 * @param {string} orderId - Order ID
 * @param {string} status - New status
 */
export async function notifyRestaurantOrderUpdate(orderId, status) {
  try {
    const io = await getIOInstance();

    if (!io) {
      return;
    }

    const order = await Order.findById(orderId).lean();
    if (!order) {
      throw new Error('Order not found');
    }

    // Get restaurant namespace
    const restaurantNamespace = io.of('/restaurant');

    restaurantNamespace.to(`restaurant:${order.restaurantId}`).emit('order_status_update', {
      orderId: order.orderId,
      status,
      updatedAt: new Date()
    });

    console.log(`📢 Notified restaurant ${order.restaurantId} about order ${order.orderId} status: ${status}`);
  } catch (error) {
    console.error('Error notifying restaurant about order update:', error);
    throw error;
  }
}

