import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../models/Delivery.js';
import Zone from '../../admin/models/Zone.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';
import winston from 'winston';

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
 * Update Delivery Partner Location
 * POST /api/delivery/location
 * Can update location and/or online status
 */
const updateLocationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  heading: Joi.number().min(0).max(360).optional(), // Direction in degrees (0-360)
  isOnline: Joi.boolean().optional()
}).min(1); // At least one field must be provided

export const updateLocation = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { latitude, longitude, heading, isOnline } = req.body;

    // Manual validation: at least one field must be provided
    const hasLatitude = latitude !== undefined && latitude !== null;
    const hasLongitude = longitude !== undefined && longitude !== null;
    const hasIsOnline = isOnline !== undefined && isOnline !== null;
    
    if (!hasLatitude && !hasLongitude && !hasIsOnline) {
      return errorResponse(res, 400, 'At least one field (latitude, longitude, or isOnline) must be provided');
    }
    
    // If latitude or longitude is provided, both must be provided
    if ((hasLatitude && !hasLongitude) || (!hasLatitude && hasLongitude)) {
      return errorResponse(res, 400, 'Both latitude and longitude must be provided together');
    }

    // Validate individual fields if provided
    if (hasLatitude || hasLongitude) {
      const locationSchema = Joi.object({
        latitude: Joi.number().min(-90).max(90).required(),
        longitude: Joi.number().min(-180).max(180).required()
      });
      const { error: locationError } = locationSchema.validate({ latitude, longitude });
      if (locationError) {
        return errorResponse(res, 400, locationError.details[0].message);
      }
    }
    
    if (hasIsOnline && typeof isOnline !== 'boolean') {
      return errorResponse(res, 400, 'isOnline must be a boolean');
    }

    const updateData = {};
    
    // Declare final coordinates at function scope so they're accessible throughout
    let finalLatitude = latitude;
    let finalLongitude = longitude;
    let locationSnapped = false;

    // Update location only if both latitude and longitude are provided
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      // Snap location to road if there's an active order with route
      finalLatitude = latitude;
      finalLongitude = longitude;
      locationSnapped = false;

      try {
        // Find active order for this delivery partner
        const Order = (await import('../../order/models/Order.js')).default;
        const activeOrder = await Order.findOne({
          deliveryPartnerId: delivery._id,
          status: { $nin: ['delivered', 'cancelled'] },
          'deliveryState.currentPhase': { $ne: 'completed' }
        })
          .select('orderId _id')
          .lean();

        const orderId = activeOrder ? (activeOrder.orderId || activeOrder._id.toString()) : null;

        // Snap to road if we have an active order
        if (orderId) {
          const { snapLocationToRoad } = await import('../services/locationProcessingService.js');
          const snapped = await snapLocationToRoad(
            { lat: latitude, lng: longitude },
            orderId,
            50 // Max 50 meters to snap
          );

          if (snapped.snapped && snapped.distance <= 50) {
            finalLatitude = snapped.lat;
            finalLongitude = snapped.lng;
            locationSnapped = true;
            console.log(`✅ Location snapped to road (distance: ${snapped.distance.toFixed(2)}m)`);
          }
        }
      } catch (snapError) {
        // Log but don't fail - use original location
        logger.warn(`Failed to snap location to road: ${snapError.message}`);
      }

      updateData['availability.currentLocation'] = {
        type: 'Point',
        coordinates: [finalLongitude, finalLatitude] // MongoDB uses [longitude, latitude]
      };
      // Also save explicit lat/lng for easy access
      updateData['availability.latitude'] = finalLatitude;
      updateData['availability.longitude'] = finalLongitude;
      updateData['availability.lastLocationUpdate'] = new Date();
      
      // Save heading if provided (for marker rotation)
      if (heading !== undefined && heading !== null && typeof heading === 'number') {
        updateData['availability.heading'] = heading;
      }
    }

    // Update online status if provided
    if (typeof isOnline === 'boolean') {
      updateData['availability.isOnline'] = isOnline;
    }

    // If no updates, return error
    if (Object.keys(updateData).length === 0) {
      return errorResponse(res, 400, 'At least one field (latitude, longitude, or isOnline) must be provided');
    }

    const updatedDelivery = await Delivery.findByIdAndUpdate(
      delivery._id,
      { $set: updateData },
      { new: true }
    ).select('-password -refreshToken');

    if (!updatedDelivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }
    const currentLocation = updatedDelivery.availability?.currentLocation;

    // Resolve heading and bearing if location was updated
    let calculatedBearing = null;
    let finalHeading = null;

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      const finalLat = finalLatitude;
      const finalLng = finalLongitude;
      finalHeading = req.body.heading || updatedDelivery.availability?.heading || null;

      // Calculate bearing if not provided and we have previous location
      calculatedBearing = finalHeading;
      if (!calculatedBearing && updatedDelivery.availability?.latitude && updatedDelivery.availability?.longitude) {
        try {
          const { calculateBearingFromLocations } = await import('../utils/bearingCalculation.js');
          const prevLocation = {
            lat: updatedDelivery.availability.latitude,
            lng: updatedDelivery.availability.longitude
          };
          const currentLocationForBearing = { lat: finalLat, lng: finalLng };
          calculatedBearing = calculateBearingFromLocations(prevLocation, currentLocationForBearing);
        } catch (err) {
          logger.warn(`Failed to calculate bearing: ${err.message}`);
        }
      }

      // Update Firebase Realtime Database with delivery boy location (using final snapped coordinates)
      try {
        const { updateDeliveryBoyLocation } = await import('../../order/services/firebaseTrackingService.js');
        
        // Find active order for this delivery partner
        const Order = (await import('../../order/models/Order.js')).default;
        const activeOrder = await Order.findOne({
          deliveryPartnerId: delivery._id,
          status: { $nin: ['delivered', 'cancelled'] },
          'deliveryState.currentPhase': { $ne: 'completed' }
        })
          .select('orderId _id')
          .lean();

        const orderId = activeOrder ? (activeOrder.orderId || activeOrder._id.toString()) : null;

        // Update Firebase (non-blocking) with heading - use final snapped coordinates
        updateDeliveryBoyLocation(
          delivery._id.toString(),
          finalLat,
          finalLng,
          orderId,
          calculatedBearing || finalHeading
        ).catch(err => {
          logger.warn(`Failed to update Firebase location: ${err.message}`);
        });

        logger.info(`✅ Delivery boy location saved to database and Firebase:`, {
          deliveryBoyId: delivery._id.toString(),
          lat: finalLat,
          lng: finalLng,
          heading: calculatedBearing || finalHeading || 'N/A',
          orderId: orderId || 'none',
          snapped: locationSnapped || false
        });
      } catch (firebaseError) {
        logger.warn(`Failed to update Firebase location: ${firebaseError.message}`);
      }

      // Broadcast location update to all active orders for this delivery partner via socket (using final snapped coordinates)
      try {
        const serverModule = await import('../../../server.js');
        const getIO = serverModule.getIO;
        const io = getIO ? getIO() : (req.app ? req.app.get('io') : null);

        if (io) {
          // Find all active orders assigned to this delivery partner
          const Order = (await import('../../order/models/Order.js')).default;
          const activeOrders = await Order.find({
            deliveryPartnerId: delivery._id,
            status: { $nin: ['delivered', 'cancelled'] },
            'deliveryState.currentPhase': { $ne: 'completed' }
          })
            .select('orderId _id')
            .lean();

          const bearingVal = calculatedBearing ?? finalHeading ?? null;

          // Broadcast location to each active order's tracking room
          activeOrders.forEach(order => {
            const mongoId = order._id.toString();
            const orderIdStr = order.orderId ? String(order.orderId) : mongoId;
            
            const locationData = {
              orderId: orderIdStr,
              lat: finalLat,
              lng: finalLng,
              bearing: bearingVal,
              heading: bearingVal, // Alias for compatibility
              timestamp: Date.now()
            };

            // Emit to both mongoId and string orderId for maximum compatibility
            const targetIds = new Set([mongoId, orderIdStr]);
            
            targetIds.forEach(id => {
              // Send to order tracking room (customer tracking this order)
              io.to(`order:${id}`).emit(`location-receive-${id}`, {
                ...locationData,
                orderId: id // Ensure payload matches event ID
              });
              
              // Also emit 'update-location' for backward compatibility
              io.to(`order:${id}`).emit('update-location', {
                ...locationData,
                orderId: id
              });
            });
            
            console.log(`📍 Location broadcasted to order rooms ${Array.from(targetIds).join(', ')} for delivery partner ${delivery._id}`);
          });

          // Emit to delivery namespace for delivery boy's own app
          try {
            const deliveryNamespace = io.of('/delivery');
            const deliveryId = delivery._id.toString();
            deliveryNamespace.to(`delivery:${deliveryId}`).emit('location-update', {
              deliveryId,
              lat: finalLat,
              lng: finalLng,
              bearing: bearingVal,
              heading: bearingVal,
              timestamp: Date.now()
            });
            logger.info(`📡 Socket.io location update emitted for delivery ${deliveryId}`);
          } catch (deliveryNamespaceError) {
            logger.warn(`Failed to emit to delivery namespace: ${deliveryNamespaceError.message}`);
          }
        }
      } catch (socketError) {
        logger.warn(`Failed to broadcast location via socket: ${socketError.message}`);
      }
    }

    return successResponse(res, 200, 'Status updated successfully', {
      location: currentLocation ? {
        latitude: currentLocation.coordinates[1],
        longitude: currentLocation.coordinates[0],
        isOnline: updatedDelivery.availability?.isOnline || false,
        lastUpdate: updatedDelivery.availability?.lastLocationUpdate
      } : null,
      isOnline: updatedDelivery.availability?.isOnline || false
    });
  } catch (error) {
    logger.error(`Error updating delivery location: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update status');
  }
});

/**
 * Get Delivery Partner Current Location
 * GET /api/delivery/location
 */
export const getLocation = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;

    const deliveryData = await Delivery.findById(delivery._id)
      .select('availability')
      .lean();

    if (!deliveryData) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    const location = deliveryData.availability?.currentLocation;
    
    return successResponse(res, 200, 'Location retrieved successfully', {
      location: location ? {
        latitude: location.coordinates[1],
        longitude: location.coordinates[0],
        isOnline: deliveryData.availability?.isOnline || false,
        lastUpdate: deliveryData.availability?.lastLocationUpdate
      } : null
    });
  } catch (error) {
    logger.error(`Error fetching delivery location: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch location');
  }
});

/**
 * Get zones within a radius of delivery boy's location
 * GET /api/delivery/zones/in-radius
 * Query params: latitude, longitude, radius (in km, default 70)
 */
export const getZonesInRadius = asyncHandler(async (req, res) => {
  try {
    const { latitude, longitude, radius = 70 } = req.query;

    // Validate required parameters
    if (!latitude || !longitude) {
      return errorResponse(res, 400, 'Latitude and longitude are required');
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radiusKm = parseFloat(radius);

    // Validate coordinates
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return errorResponse(res, 400, 'Invalid latitude or longitude');
    }

    // Validate radius
    if (isNaN(radiusKm) || radiusKm <= 0) {
      return errorResponse(res, 400, 'Radius must be a positive number');
    }

    // Fetch all active zones
    const zones = await Zone.find({ isActive: true })
      .populate('restaurantId', 'name email phone')
      .lean();

    // Calculate distance from delivery boy's location to each zone center
    const calculateDistance = (lat1, lng1, lat2, lng2) => {
      const R = 6371; // Earth's radius in kilometers
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; // Distance in kilometers
    };

    // Calculate zone center from coordinates
    const getZoneCenter = (coordinates) => {
      if (!coordinates || coordinates.length === 0) return null;
      let sumLat = 0, sumLng = 0;
      let count = 0;
      coordinates.forEach(coord => {
        const coordLat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null;
        const coordLng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null;
        if (coordLat !== null && coordLng !== null) {
          sumLat += coordLat;
          sumLng += coordLng;
          count++;
        }
      });
      return count > 0 ? { lat: sumLat / count, lng: sumLng / count } : null;
    };

    // Filter zones within radius
    const nearbyZones = zones.filter(zone => {
      if (!zone.coordinates || zone.coordinates.length < 3) return false;
      const center = getZoneCenter(zone.coordinates);
      if (!center) return false;
      const distance = calculateDistance(lat, lng, center.lat, center.lng);
      return distance <= radiusKm;
    });

    return successResponse(res, 200, 'Zones retrieved successfully', {
      zones: nearbyZones,
      count: nearbyZones.length,
      radius: radiusKm,
      location: { latitude: lat, longitude: lng }
    });
  } catch (error) {
    logger.error(`Error fetching zones in radius: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch zones');
  }
});

