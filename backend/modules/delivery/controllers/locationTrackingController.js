/**
 * Location Tracking Controller
 * Handles real-time GPS updates from delivery app
 * Processes and broadcasts location via WebSocket
 */

import { asyncHandler, successResponse, errorResponse } from '../../../shared/utils/responseHelpers.js';
import { 
  processLocationUpdate, 
  cacheRoutePolyline,
  getCachedRoute,
  clearLocationHistory,
  clearRouteCache
} from '../services/locationProcessingService.js';
import Order from '../../order/models/Order.js';
import mongoose from 'mongoose';

/**
 * Receive GPS update from delivery app
 * POST /api/delivery/location/update
 */
export const receiveLocationUpdate = asyncHandler(async (req, res) => {
  try {
    const { orderId, lat, lng, speed, bearing, accuracy } = req.body;
    const deliveryBoyId = req.deliveryBoy?.id || req.user?.id;
    
    if (!orderId || !lat || !lng) {
      return errorResponse(res, 400, 'Missing required fields: orderId, lat, lng');
    }
    
    // Validate coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return errorResponse(res, 400, 'Invalid coordinates');
    }
    
    // Get order details for route information
    const order = await Order.findOne({ 
      orderId: orderId 
    }).populate('restaurantId', 'location').lean();
    
    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }
    
    // Get restaurant and customer coordinates
    const restaurantCoords = order.restaurantId?.location?.coordinates 
      ? { lat: order.restaurantId.location.coordinates[1], lng: order.restaurantId.location.coordinates[0] }
      : null;
    
    const customerCoords = order.address?.location?.coordinates
      ? { lat: order.address.location.coordinates[1], lng: order.address.location.coordinates[0] }
      : null;
    
    // Process location (snap to road, smooth, match to route)
    const processedLocation = await processLocationUpdate(
      deliveryBoyId,
      orderId,
      { lat, lng, speed: speed || 20, bearing: bearing || 0, accuracy: accuracy || 50 },
      {
        restaurant: restaurantCoords,
        customer: customerCoords
      }
    );
    
    // Store processed location in order
    await Order.updateOne(
      { orderId: orderId },
      {
        $set: {
          'deliveryState.currentLocation': {
            lat: processedLocation.lat,
            lng: processedLocation.lng,
            bearing: processedLocation.bearing,
            speed: processedLocation.speed,
            timestamp: new Date(processedLocation.timestamp)
          },
          'deliveryState.routeProgress': processedLocation.progress,
          'deliveryState.distanceCovered': processedLocation.distanceCovered,
          'deliveryState.remainingDistance': processedLocation.remainingDistance
        }
      }
    );
    
    // Broadcast via WebSocket (handled by socket.io in server.js)
    const io = req.app.get('io');
    if (io) {
      const locationPayload = {
        orderId: orderId,
        lat: processedLocation.lat,
        lng: processedLocation.lng,
        bearing: processedLocation.bearing,
        heading: processedLocation.bearing, // alias for frontend
        speed: processedLocation.speed,
        progress: processedLocation.progress,
        distanceCovered: processedLocation.distanceCovered,
        remainingDistance: processedLocation.remainingDistance,
        timestamp: processedLocation.timestamp,
        snapped: processedLocation.snapped,
        onRoute: processedLocation.onRoute,
      };

      // Canonical socket contract (frontend expects these)
      // Rooms: order:<id> where <id> can be Mongo _id or string orderId
      const ids = new Set([
        orderId?.toString?.() || String(orderId),
        order?._id?.toString?.(),
        order?.orderId?.toString?.(),
      ].filter(Boolean));

      ids.forEach((id) => {
        io.to(`order:${id}`).emit(`location-receive-${id}`, {
          ...locationPayload,
          orderId: id,
        });
        // Legacy compatibility: older clients listened to these
        io.to(`order-${id}`).emit(`location-update-${id}`, {
          ...locationPayload,
          orderId: id,
        });
      });

      // Also broadcast to user room (if used anywhere)
      if (order?.userId) {
        const uid = order.userId.toString();
        io.to(`user:${uid}`).emit('location-update', {
          ...locationPayload,
          userId: uid,
        });
        io.to(`user-${uid}`).emit('location-update', {
          ...locationPayload,
          userId: uid,
        });
      }
    }
    
    return successResponse(res, 200, 'Location updated successfully', {
      location: processedLocation
    });
  } catch (error) {
    console.error('Error processing location update:', error);
    return errorResponse(res, 500, error.message || 'Failed to process location update');
  }
});

/**
 * Initialize route for an order
 * POST /api/delivery/location/initialize-route
 */
export const initializeRoute = asyncHandler(async (req, res) => {
  try {
    const { orderId, riderLat, riderLng } = req.body;
    
    if (!orderId) {
      return errorResponse(res, 400, 'Order ID is required');
    }
    
    // Get order details
    const order = await Order.findOne({ orderId: orderId })
      .populate('restaurantId', 'location')
      .lean();
    
    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }
    
    const restaurantCoords = order.restaurantId?.location?.coordinates 
      ? { lat: order.restaurantId.location.coordinates[1], lng: order.restaurantId.location.coordinates[0] }
      : null;
    
    const customerCoords = order.address?.location?.coordinates
      ? { lat: order.address.location.coordinates[1], lng: order.address.location.coordinates[0] }
      : null;
    
    if (!restaurantCoords || !customerCoords) {
      return errorResponse(res, 400, 'Restaurant or customer coordinates missing');
    }
    
    const riderCoords = riderLat && riderLng 
      ? { lat: riderLat, lng: riderLng }
      : restaurantCoords; // Fallback to restaurant if rider location not provided
    
    // Generate route polyline
    const { generateRoutePolyline } = await import('../services/locationProcessingService.js');
    const route = await generateRoutePolyline(
      riderCoords,
      restaurantCoords,
      customerCoords
    );
    
    if (!route) {
      return errorResponse(res, 500, 'Failed to generate route');
    }
    
    // Cache route
    cacheRoutePolyline(orderId, route);
    
    // Broadcast route to connected clients
    const io = req.app.get('io');
    if (io) {
      const routePayload = {
        polyline: route.polyline,
        points: route.points,
        totalDistance: route.totalDistance,
        duration: route.duration,
      };

      // Emit to both canonical rooms and legacy rooms
      const ids = new Set([String(orderId)]);
      // Resolve mongo _id if orderId is string id
      try {
        const found = await Order.findOne({ orderId: orderId }).select('_id orderId').lean();
        if (found?._id) ids.add(found._id.toString());
        if (found?.orderId) ids.add(found.orderId.toString());
      } catch {}

      ids.forEach((id) => {
        io.to(`order:${id}`).emit(`route-initialized-${id}`, routePayload);
        io.to(`order-${id}`).emit(`route-initialized-${id}`, routePayload);
      });
    }
    
    return successResponse(res, 200, 'Route initialized successfully', {
      route: {
        polyline: route.polyline,
        totalDistance: route.totalDistance,
        duration: route.duration,
        pointCount: route.points.length
      }
    });
  } catch (error) {
    console.error('Error initializing route:', error);
    return errorResponse(res, 500, error.message || 'Failed to initialize route');
  }
});

/**
 * Clear location history (when order completes)
 * POST /api/delivery/location/clear
 */
export const clearLocationData = asyncHandler(async (req, res) => {
  try {
    const { orderId, riderId } = req.body;
    
    if (riderId) {
      clearLocationHistory(riderId);
    }
    
    if (orderId) {
      clearRouteCache(orderId);
    }
    
    return successResponse(res, 200, 'Location data cleared successfully');
  } catch (error) {
    console.error('Error clearing location data:', error);
    return errorResponse(res, 500, error.message || 'Failed to clear location data');
  }
});

