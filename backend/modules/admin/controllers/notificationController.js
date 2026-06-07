import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import {
  notifyUserFromAdmin,
  notifyRestaurantFromAdmin,
  notifyDeliveryFromAdmin,
  notifyHotelFromAdmin,
  notifyAllAdmins
} from '../../fcm/services/pushNotificationService.js';
import { sendNotification } from '../../fcm/services/fcmService.js';
import User from '../../auth/models/User.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Delivery from '../../delivery/models/Delivery.js';
import Hotel from '../../hotel/models/Hotel.js';
import Admin from '../../admin/models/Admin.js';
import AdminNotification from '../models/AdminNotification.js';

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
 *
 * Returns 202 Accepted immediately; FCM fan-out runs in the background
 * to avoid nginx 502 timeouts when there are many recipients.
 */
export const broadcastNotification = asyncHandler(async (req, res) => {
  const { target, title, body, data } = req.body;

  if (!title || !body) {
    return errorResponse(res, 400, 'Title and body are required');
  }

  if (!target || !['user', 'restaurant', 'delivery', 'hotel', 'admin', 'all'].includes(target)) {
    return errorResponse(res, 400, 'Target must be one of: user, restaurant, delivery, hotel, admin, all');
  }

  const payload = { title, body, data: data || {} };

  // Persist to DB for history (best-effort, before we respond)
  try {
    const image =
      payload?.data?.image ||
      payload?.data?.banner ||
      payload?.data?.imageUrl ||
      null;
    await AdminNotification.create({
      target,
      title,
      body,
      image,
      data: payload.data || {},
      createdBy: req.user?._id || null
    });
  } catch (e) {
    console.error("Failed to save admin notification history:", e);
  }

  // ── Respond immediately — prevents nginx 502 timeout on large broadcasts ──
  res.status(202).json({
    success: true,
    message: 'Broadcast accepted and is being processed in the background',
    target,
  });

  // ── Background fan-out (fire-and-forget after response is sent) ───────────
  (async () => {
    try {
      const fcmData = {
        type: 'admin_notification',
        ...payload.data,
        tag: payload.data?.tag || `admin_broadcast_${target}_${Date.now()}`,
      };
      const notification = { title, body };

      // Extract unique non-empty FCM tokens directly from DB docs.
      // Avoids N individual Model.findById() calls that caused the original timeout.
      const extractTokens = (docs) => {
        const seen = new Set();
        for (const doc of docs) {
          if (doc.fcmtokenMobile) seen.add(String(doc.fcmtokenMobile));
          if (doc.fcmtokenWeb)    seen.add(String(doc.fcmtokenWeb));
        }
        return Array.from(seen).filter(Boolean);
      };

      // Send in chunks of 500 to stay within FCM multicast limits
      const CHUNK = 500;
      const sendInChunks = async (tokens, label) => {
        if (!tokens.length) {
          console.log(`[Broadcast] No tokens for ${label}`);
          return;
        }
        let success = 0, fail = 0;
        for (let i = 0; i < tokens.length; i += CHUNK) {
          const chunk = tokens.slice(i, i + CHUNK);
          const result = await sendNotification(chunk, notification, fcmData);
          success += result?.successCount || 0;
          fail    += result?.failureCount || 0;
        }
        console.log(`[Broadcast] ${label}: ${success} sent, ${fail} failed`);
      };

      if (target === 'all' || target === 'user') {
        const docs = await User.find({
          $or: [
            { fcmtokenWeb:    { $exists: true, $ne: null } },
            { fcmtokenMobile: { $exists: true, $ne: null } },
          ]
        }).select('fcmtokenWeb fcmtokenMobile').lean();
        await sendInChunks(extractTokens(docs), 'users');
      }

      if (target === 'all' || target === 'restaurant') {
        const docs = await Restaurant.find({
          $or: [
            { fcmtokenWeb:    { $exists: true, $ne: null } },
            { fcmtokenMobile: { $exists: true, $ne: null } },
          ]
        }).select('fcmtokenWeb fcmtokenMobile').lean();
        await sendInChunks(extractTokens(docs), 'restaurants');
      }

      if (target === 'all' || target === 'delivery') {
        const docs = await Delivery.find({
          $or: [
            { fcmtokenWeb:    { $exists: true, $ne: null } },
            { fcmtokenMobile: { $exists: true, $ne: null } },
          ]
        }).select('fcmtokenWeb fcmtokenMobile').lean();
        await sendInChunks(extractTokens(docs), 'delivery');
      }

      if (target === 'all' || target === 'hotel') {
        const docs = await Hotel.find({
          $or: [
            { fcmtokenWeb:    { $exists: true, $ne: null } },
            { fcmtokenMobile: { $exists: true, $ne: null } },
          ]
        }).select('fcmtokenWeb fcmtokenMobile').lean();
        await sendInChunks(extractTokens(docs), 'hotels');
      }

      if (target === 'all' || target === 'admin') {
        const docs = await Admin.find({
          $or: [
            { fcmtokenWeb:    { $exists: true, $ne: null } },
            { fcmtokenMobile: { $exists: true, $ne: null } },
          ]
        }).select('fcmtokenWeb fcmtokenMobile').lean();
        await sendInChunks(extractTokens(docs), 'admins');
      }

      console.log(`[Broadcast] ✅ Completed for target=${target}`);
    } catch (bgErr) {
      console.error('[Broadcast] ❌ Background fan-out error:', bgErr);
    }
  })();
});

/**
 * List admin notification history
 * GET /api/admin/notifications/history
 */
export const listAdminNotificationHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, target } = req.query;

  const q = {};
  if (target && ["user", "restaurant", "delivery", "hotel", "admin", "all"].includes(target)) {
    q.target = target;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [items, total] = await Promise.all([
    AdminNotification.find(q).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    AdminNotification.countDocuments(q)
  ]);

  return successResponse(res, 200, "Admin notification history retrieved", {
    notifications: items,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

/**
 * Toggle admin notification status
 * PATCH /api/admin/notifications/history/:id/status
 */
export const toggleAdminNotificationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const doc = await AdminNotification.findById(id);
  if (!doc) return errorResponse(res, 404, "Notification not found");
  doc.status = !doc.status;
  await doc.save();
  return successResponse(res, 200, "Notification status updated", { notification: doc });
});

/**
 * Delete admin notification from history
 * DELETE /api/admin/notifications/history/:id
 */
export const deleteAdminNotificationHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const doc = await AdminNotification.findByIdAndDelete(id);
  if (!doc) return errorResponse(res, 404, "Notification not found");
  return successResponse(res, 200, "Notification deleted");
});
