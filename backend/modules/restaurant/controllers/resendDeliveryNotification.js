import Order from '../../order/models/Order.js';
import Restaurant from '../models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { findNearestDeliveryBoys } from '../../order/services/deliveryAssignmentService.js';
import { notifyMultipleDeliveryBoys } from '../../order/services/deliveryNotificationService.js';
import mongoose from 'mongoose';

/** Minimum seconds between manual "Resend" pushes for the same order (stops double-tap / UI spam). */
const MANUAL_RESEND_COOLDOWN_MS = 45 * 1000;

/**
 * Resend delivery notification for unassigned order
 * POST /api/restaurant/orders/:id/resend-delivery-notification
 */
export const resendDeliveryNotification = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    // Build restaurant id variations to support both Mongo _id and business restaurantId
    const restaurantIdCandidates = [];
    const ridMongo = restaurant._id?.toString?.();
    const ridBusiness = restaurant.restaurantId?.toString?.();
    const ridGeneric = restaurant.id?.toString?.();
    if (ridMongo) restaurantIdCandidates.push(ridMongo);
    if (ridBusiness && !restaurantIdCandidates.includes(ridBusiness)) restaurantIdCandidates.push(ridBusiness);
    if (ridGeneric && !restaurantIdCandidates.includes(ridGeneric)) restaurantIdCandidates.push(ridGeneric);
    for (const cand of [...restaurantIdCandidates]) {
      if (mongoose.Types.ObjectId.isValid(cand) && String(cand).length === 24) {
        const norm = new mongoose.Types.ObjectId(cand).toString();
        if (!restaurantIdCandidates.includes(norm)) restaurantIdCandidates.push(norm);
      }
    }

    // Try to find order by MongoDB _id or orderId
    let order = null;

    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdCandidates }
      });
    }

    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdCandidates }
      });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Check if order is in valid status (preparing or ready)
    if (!['preparing', 'ready', 'confirmed'].includes(order.status)) {
      return errorResponse(res, 400, `Cannot resend notification. Order status must be 'preparing' or 'ready'. Current status: ${order.status}`);
    }

    const lastManual = order.assignmentInfo?.lastRestaurantManualResendAt;
    if (lastManual) {
      const elapsed = Date.now() - new Date(lastManual).getTime();
      if (elapsed >= 0 && elapsed < MANUAL_RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((MANUAL_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return errorResponse(
          res,
          429,
          `Please wait ${waitSec} seconds before resending the delivery notification again.`,
        );
      }
    }

    // Get restaurant location
    // Fetch restaurant document using either _id or restaurantId
    let restaurantDoc = null;
    if (mongoose.Types.ObjectId.isValid(ridMongo || '')) {
      restaurantDoc = await Restaurant.findById(ridMongo).select('location').lean();
    }
    if (!restaurantDoc) {
      const orConditions = [];
      if (ridBusiness) orConditions.push({ restaurantId: ridBusiness });
      if (ridMongo && mongoose.Types.ObjectId.isValid(ridMongo)) orConditions.push({ _id: ridMongo });
      restaurantDoc = await Restaurant.findOne({ $or: orConditions }).select('location').lean();
    }

    if (!restaurantDoc || !restaurantDoc.location || !restaurantDoc.location.coordinates) {
      return errorResponse(res, 400, 'Restaurant location not found. Please update restaurant location.');
    }

    const [restaurantLng, restaurantLat] = restaurantDoc.location.coordinates;

    // Find nearest delivery boys
    const priorityDeliveryBoys = await findNearestDeliveryBoys(
      restaurantLat,
      restaurantLng,
      ridBusiness || ridMongo || ridGeneric,
      20, // 20km radius for priority
      10  // Top 10 nearest
    );

    if (!priorityDeliveryBoys || priorityDeliveryBoys.length === 0) {
      // Try with larger radius
      const allDeliveryBoys = await findNearestDeliveryBoys(
        restaurantLat,
        restaurantLng,
      ridBusiness || ridMongo || ridGeneric,
        50, // 50km radius
        20  // Top 20 nearest
      );

      if (!allDeliveryBoys || allDeliveryBoys.length === 0) {
        return errorResponse(res, 404, 'No delivery partners available in your area');
      }

      // Notify all available delivery boys
      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name location address phone ownerPhone')
        .lean();

      if (populatedOrder) {
        const deliveryPartnerIds = allDeliveryBoys.map(db => db.deliveryPartnerId);
        
        // Update assignment info
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            'assignmentInfo.priorityDeliveryPartnerIds': deliveryPartnerIds,
            'assignmentInfo.assignedBy': 'manual_resend',
            'assignmentInfo.assignedAt': new Date(),
            'assignmentInfo.lastRestaurantManualResendAt': new Date(),
          },
          $inc: {
            'assignmentInfo.resendVersion': 1
          },
        });

        const populatedAfter = await Order.findById(order._id)
          .populate('userId', 'name phone')
          .populate('restaurantId', 'name location address phone ownerPhone')
          .lean();

        if (!populatedAfter) {
          return errorResponse(res, 500, 'Failed to reload order after update');
        }

        await notifyMultipleDeliveryBoys(populatedAfter, deliveryPartnerIds, 'priority');
        
        console.log(`✅ Resent notification to ${deliveryPartnerIds.length} delivery partners for order ${order.orderId}`);

        return successResponse(res, 200, `Notification sent to ${deliveryPartnerIds.length} delivery partners`, {
          order: populatedAfter,
          notifiedCount: deliveryPartnerIds.length
        });
      }
    } else {
      // Notify priority delivery boys
      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name location address phone ownerPhone')
        .lean();

      if (populatedOrder) {
        const priorityIds = priorityDeliveryBoys.map(db => db.deliveryPartnerId);
        
        // Update assignment info
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            'assignmentInfo.priorityDeliveryPartnerIds': priorityIds,
            'assignmentInfo.assignedBy': 'manual_resend',
            'assignmentInfo.assignedAt': new Date(),
            'assignmentInfo.lastRestaurantManualResendAt': new Date(),
          },
          $inc: {
            'assignmentInfo.resendVersion': 1
          },
        });

        const populatedAfter = await Order.findById(order._id)
          .populate('userId', 'name phone')
          .populate('restaurantId', 'name location address phone ownerPhone')
          .lean();

        if (!populatedAfter) {
          return errorResponse(res, 500, 'Failed to reload order after update');
        }

        await notifyMultipleDeliveryBoys(populatedAfter, priorityIds, 'priority');
        
        console.log(`✅ Resent notification to ${priorityIds.length} priority delivery partners for order ${order.orderId}`);

        return successResponse(res, 200, `Notification sent to ${priorityIds.length} delivery partners`, {
          order: populatedAfter,
          notifiedCount: priorityIds.length
        });
      }
    }

    return errorResponse(res, 500, 'Failed to send notification');
  } catch (error) {
    console.error('Error resending delivery notification:', error);
    return errorResponse(res, 500, `Failed to resend notification: ${error.message}`);
  }
});
