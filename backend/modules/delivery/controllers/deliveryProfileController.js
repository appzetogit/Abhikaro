import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../models/Delivery.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';
import winston from 'winston';
import { normalizeDeliveryProfileImages } from '../utils/profileImageNormalize.js';
import Order from '../../order/models/Order.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Get Delivery Partner Profile
 * GET /api/delivery/profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery; // From authenticate middleware

    // Populate related fields if needed
    const profile = await Delivery.findById(delivery._id)
      .select('-password -refreshToken')
      .lean();

    if (!profile) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    // Ensure rating fields are present (compute from delivered orders reviews if missing).
    // Some legacy delivery documents might not have metrics populated.
    const hasRating =
      profile?.metrics?.rating !== null && profile?.metrics?.rating !== undefined;
    const hasRatingCount =
      profile?.metrics?.ratingCount !== null &&
      profile?.metrics?.ratingCount !== undefined;

    if (!hasRating || !hasRatingCount) {
      try {
        const agg = await Order.aggregate([
          {
            $match: {
              status: 'delivered',
              deliveryPartnerId: profile._id,
              'review.rating': { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: null,
              avgRating: { $avg: '$review.rating' },
              ratingCount: { $sum: 1 },
            },
          },
        ]);

        const avgRating = agg?.[0]?.avgRating ?? null;
        const ratingCount = agg?.[0]?.ratingCount ?? 0;

        profile.metrics = profile.metrics || {};
        // If no reviews yet, keep rating as 0 (so UI can show 0.0 (0))
        profile.metrics.rating =
          avgRating === null || avgRating === undefined ? 0 : Number(avgRating);
        profile.metrics.ratingCount = Number(ratingCount || 0);
      } catch (e) {
        profile.metrics = profile.metrics || {};
        if (!hasRating) profile.metrics.rating = 0;
        if (!hasRatingCount) profile.metrics.ratingCount = 0;
      }
    }

    normalizeDeliveryProfileImages(profile, req);

    return successResponse(res, 200, 'Profile retrieved successfully', {
      profile
    });
  } catch (error) {
    logger.error(`Error fetching delivery profile: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch profile');
  }
});

/**
 * Update Delivery Partner Profile
 * PUT /api/delivery/profile
 */
const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  email: Joi.string().email().lowercase().trim().optional().allow(null, ''),
  dateOfBirth: Joi.date().optional().allow(null),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer-not-to-say').optional(),
  vehicle: Joi.object({
    type: Joi.string().valid('bike', 'scooter', 'bicycle', 'car').optional(),
    number: Joi.string().trim().optional().allow(null, ''),
    model: Joi.string().trim().optional().allow(null, ''),
    brand: Joi.string().trim().optional().allow(null, '')
  }).optional(),
  location: Joi.object({
    addressLine1: Joi.string().trim().optional().allow(null, ''),
    addressLine2: Joi.string().trim().optional().allow(null, ''),
    area: Joi.string().trim().optional().allow(null, ''),
    city: Joi.string().trim().optional().allow(null, ''),
    state: Joi.string().trim().optional().allow(null, ''),
    zipCode: Joi.string().trim().optional().allow(null, '')
  }).optional(),
  profileImage: Joi.object({
    url: Joi.string().uri().optional().allow(null, ''),
    publicId: Joi.string().trim().optional().allow(null, '')
  }).optional(),
  documents: Joi.object({
    photo: Joi.string().uri().optional().allow(null, ''),
    profilePhoto: Joi.string().uri().optional().allow(null, ''),
    bankDetails: Joi.object({
      accountHolderName: Joi.string().trim().min(2).max(100).optional().allow(null, ''),
      accountNumber: Joi.string().trim().min(9).max(18).optional().allow(null, ''),
      ifscCode: Joi.string().trim().length(11).uppercase().optional().allow(null, ''),
      bankName: Joi.string().trim().min(2).max(100).optional().allow(null, '')
    }).optional()
  }).optional()
});

export const updateProfile = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const updateData = req.body;

    // Validate input
    const { error } = updateProfileSchema.validate(updateData);
    if (error) {
      return errorResponse(res, 400, error.details[0].message);
    }

    // Handle nested documents.* updates properly
    const setData = { ...updateData };
    if (updateData.documents) {
      if (updateData.documents.bankDetails) {
        setData["documents.bankDetails"] = {
          ...delivery.documents?.bankDetails,
          ...updateData.documents.bankDetails,
        };
      }
      if (Object.prototype.hasOwnProperty.call(updateData.documents, "photo")) {
        setData["documents.photo"] = updateData.documents.photo;
      }
      if (Object.prototype.hasOwnProperty.call(updateData.documents, "profilePhoto")) {
        setData["documents.profilePhoto"] = updateData.documents.profilePhoto;
      }
      // Remove the nested documents object to avoid conflicts
      delete setData.documents;
    }

    // Update profile
    const updatedDelivery = await Delivery.findByIdAndUpdate(
      delivery._id,
      { $set: setData },
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    if (!updatedDelivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    logger.info('Profile updated successfully', {
      deliveryId: updatedDelivery.deliveryId || updatedDelivery._id,
      updatedFields: Object.keys(updateData)
    });

    const profileOut = updatedDelivery.toObject({ depopulate: true });
    normalizeDeliveryProfileImages(profileOut, req);

    return successResponse(res, 200, 'Profile updated successfully', {
      profile: profileOut
    });
  } catch (error) {
    logger.error(`Error updating delivery profile: ${error.message}`);
    
    // Handle duplicate email error
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Email already exists');
    }
    
    return errorResponse(res, 500, 'Failed to update profile');
  }
});

/**
 * Reverify Delivery Partner (Resubmit for approval)
 * POST /api/delivery/reverify
 */
export const reverify = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;

    if (delivery.status !== 'blocked') {
      return errorResponse(res, 400, 'Only rejected delivery partners can resubmit for verification');
    }

    // Reset to pending status and clear rejection details
    delivery.status = 'pending';
    delivery.isActive = true; // Allow login to see verification message
    delivery.rejectionReason = undefined;
    delivery.rejectedAt = undefined;
    delivery.rejectedBy = undefined;

    await delivery.save();

    logger.info(`Delivery partner resubmitted for verification: ${delivery._id}`, {
      deliveryId: delivery.deliveryId
    });

    return successResponse(res, 200, 'Request resubmitted for verification successfully', {
      profile: {
        _id: delivery._id.toString(),
        name: delivery.name,
        status: delivery.status
      }
    });
  } catch (error) {
    logger.error(`Error reverifying delivery partner: ${error.message}`);
    return errorResponse(res, 500, 'Failed to resubmit for verification');
  }
});

/**
 * Delete delivery partner account
 * DELETE /api/delivery/profile
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  try {
    const deliveryId = req.delivery._id;

    // Check for active orders assigned to this delivery partner
    const activeOrders = await Order.findOne({
      deliveryPartnerId: deliveryId,
      status: { $in: ['confirmed', 'preparing', 'ready', 'picked_up'] }
    });

    if (activeOrders) {
      return errorResponse(res, 400, "Cannot delete account with active orders assigned. Please complete your current orders first.");
    }

    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return errorResponse(res, 404, "Delivery partner not found");
    }

    // Delete delivery partner
    await Delivery.findByIdAndDelete(deliveryId);

    logger.info(`Delivery partner account deleted: ${deliveryId}`);

    return successResponse(res, 200, "Account deleted successfully");
  } catch (error) {
    logger.error(`Error deleting delivery partner account: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to delete account");
  }
});

