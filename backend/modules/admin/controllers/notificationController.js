import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import {
  notifyUserFromAdmin,
  notifyRestaurantFromAdmin,
  notifyDeliveryFromAdmin,
  notifyAllAdmins
} from '../../fcm/services/pushNotificationService.js';
import User from '../../auth/models/User.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Delivery from '../../delivery/models/Delivery.js';

/**
 * Send notification to user(s) from admin
 * POST /api/admin/notifications/send-to-user
 */
export const sendNotificationToUser = asyncHandler(async (req, res) => {
  const { userId, userIds, title, body, data } = req.body;

  if (!title || !body) {
    return errorResponse(res, 400, 'Title and body are required');
  }

  if (!userId && !userIds) {
    return errorResponse(res, 400, 'Either userId or userIds array is required');
  }

  try {
    const payload = { title, body, data: data || {} };
    const targetIds = userIds || [userId];

    const results = await Promise.allSettled(
      targetIds.map(id => notifyUserFromAdmin(id, payload))
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    return successResponse(res, 200, `Notification sent to ${successCount}/${targetIds.length} user(s)`, {
      successCount,
      totalCount: targetIds.length
    });
  } catch (error) {
    console.error('Error sending notification to user:', error);
    return errorResponse(res, 500, 'Failed to send notification');
  }
});

/**
 * Send notification to restaurant(s) from admin
 * POST /api/admin/notifications/send-to-restaurant
 */
export const sendNotificationToRestaurant = asyncHandler(async (req, res) => {
  const { restaurantId, restaurantIds, title, body, data } = req.body;

  if (!title || !body) {
    return errorResponse(res, 400, 'Title and body are required');
  }

  if (!restaurantId && !restaurantIds) {
    return errorResponse(res, 400, 'Either restaurantId or restaurantIds array is required');
  }

  try {
    const payload = { title, body, data: data || {} };
    const targetIds = restaurantIds || [restaurantId];

    const results = await Promise.allSettled(
      targetIds.map(id => notifyRestaurantFromAdmin(id, payload))
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    return successResponse(res, 200, `Notification sent to ${successCount}/${targetIds.length} restaurant(s)`, {
      successCount,
      totalCount: targetIds.length
    });
  } catch (error) {
    console.error('Error sending notification to restaurant:', error);
    return errorResponse(res, 500, 'Failed to send notification');
  }
});

/**
 * Send notification to delivery boy(s) from admin
 * POST /api/admin/notifications/send-to-delivery
 */
export const sendNotificationToDelivery = asyncHandler(async (req, res) => {
  const { deliveryId, deliveryIds, title, body, data } = req.body;

  if (!title || !body) {
    return errorResponse(res, 400, 'Title and body are required');
  }

  if (!deliveryId && !deliveryIds) {
    return errorResponse(res, 400, 'Either deliveryId or deliveryIds array is required');
  }

  try {
    const payload = { title, body, data: data || {} };
    const targetIds = deliveryIds || [deliveryId];

    const results = await Promise.allSettled(
      targetIds.map(id => notifyDeliveryFromAdmin(id, payload))
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    return successResponse(res, 200, `Notification sent to ${successCount}/${targetIds.length} delivery boy(s)`, {
      successCount,
      totalCount: targetIds.length
    });
  } catch (error) {
    console.error('Error sending notification to delivery:', error);
    return errorResponse(res, 500, 'Failed to send notification');
  }
});

/**
 * Send notification to all users/restaurants/delivery from admin
 * POST /api/admin/notifications/broadcast
 */
export const broadcastNotification = asyncHandler(async (req, res) => {
  const { target, title, body, data } = req.body;

  if (!title || !body) {
    return errorResponse(res, 400, 'Title and body are required');
  }

  if (!target || !['user', 'restaurant', 'delivery', 'admin', 'all'].includes(target)) {
    return errorResponse(res, 400, 'Target must be one of: user, restaurant, delivery, admin, all');
  }

  try {
    const payload = { title, body, data: data || {} };
    let results = [];

    if (target === 'all' || target === 'user') {
      const users = await User.find({
        $or: [
          { fcmtokenWeb: { $exists: true, $ne: null } },
          { fcmtokenMobile: { $exists: true, $ne: null } }
        ]
      }).select('_id').lean();
      
      const userResults = await Promise.allSettled(
        users.map(user => notifyUserFromAdmin(user._id.toString(), payload))
      );
      results.push(...userResults);
    }

    if (target === 'all' || target === 'restaurant') {
      const restaurants = await Restaurant.find({
        $or: [
          { fcmtokenWeb: { $exists: true, $ne: null } },
          { fcmtokenMobile: { $exists: true, $ne: null } }
        ]
      }).select('_id').lean();
      
      const restaurantResults = await Promise.allSettled(
        restaurants.map(restaurant => notifyRestaurantFromAdmin(restaurant._id.toString(), payload))
      );
      results.push(...restaurantResults);
    }

    if (target === 'all' || target === 'delivery') {
      const deliveries = await Delivery.find({
        $or: [
          { fcmtokenWeb: { $exists: true, $ne: null } },
          { fcmtokenMobile: { $exists: true, $ne: null } }
        ]
      }).select('_id').lean();
      
      const deliveryResults = await Promise.allSettled(
        deliveries.map(delivery => notifyDeliveryFromAdmin(delivery._id.toString(), payload))
      );
      results.push(...deliveryResults);
    }

    if (target === 'all' || target === 'admin') {
      await notifyAllAdmins(payload);
    }

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    return successResponse(res, 200, `Broadcast notification sent to ${successCount} recipient(s)`, {
      successCount,
      totalCount: results.length
    });
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    return errorResponse(res, 500, 'Failed to broadcast notification');
  }
});
