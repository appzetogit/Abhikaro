import mongoose from 'mongoose';
import Zone from '../../modules/admin/models/Zone.js';
import Restaurant from '../../modules/restaurant/models/Restaurant.js';
import { isPointInZone, calculateDistance } from './zoneUtils.js';

export const MAX_DELIVERY_DISTANCE_KM = 25; // 25 km max delivery radius

/**
 * Validate restaurant, active zone, customer delivery address, and distance for any order flow.
 * Works across both direct order creation and online payment (Razorpay intent/verify) flows.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.restaurantId
 * @param {Object} params.deliveryAddress
 * @param {string} [params.clientZoneId]
 * @param {string} [params.hotelReference]
 * @returns {Promise<{
 *   isValid: boolean,
 *   statusCode?: number,
 *   message?: string,
 *   restaurant?: Object,
 *   restaurantZone?: Object,
 *   distanceKm?: number,
 *   userLat?: number,
 *   userLng?: number,
 *   restaurantLat?: number,
 *   restaurantLng?: number
 * }>}
 */
export async function validateOrderDeliveryAndZone({
  restaurantId,
  deliveryAddress,
  clientZoneId = null,
  hotelReference = null,
}) {
  try {
    // 1. Restaurant presence check
    if (!restaurantId || restaurantId === 'unknown') {
      return {
        isValid: false,
        statusCode: 400,
        message: 'Restaurant ID is required to place an order.',
      };
    }

    // 2. Lookup Restaurant
    let restaurant = null;
    if (mongoose.Types.ObjectId.isValid(restaurantId) && String(restaurantId).length === 24) {
      restaurant = await Restaurant.findById(restaurantId).lean();
    }
    if (!restaurant) {
      restaurant = await Restaurant.findOne({
        $or: [{ restaurantId: String(restaurantId) }, { slug: String(restaurantId) }],
      }).lean();
    }

    if (!restaurant) {
      return {
        isValid: false,
        statusCode: 404,
        message: 'Restaurant not found.',
      };
    }

    if (!restaurant.isActive) {
      return {
        isValid: false,
        statusCode: 403,
        message: 'Restaurant is currently inactive and cannot accept orders.',
      };
    }

    // 3. Restaurant Coordinates
    const restaurantLat = Number(
      restaurant.location?.latitude ??
      (Array.isArray(restaurant.location?.coordinates) ? restaurant.location.coordinates[1] : null)
    );
    const restaurantLng = Number(
      restaurant.location?.longitude ??
      (Array.isArray(restaurant.location?.coordinates) ? restaurant.location.coordinates[0] : null)
    );

    if (!restaurantLat || !restaurantLng || isNaN(restaurantLat) || isNaN(restaurantLng)) {
      return {
        isValid: false,
        statusCode: 400,
        message: 'Restaurant location coordinates are not configured. Please contact support.',
      };
    }

    // 4. Find Restaurant's Active Zone
    const activeZones = await Zone.find({ isActive: true }).lean();
    let restaurantZone = null;

    for (const zone of activeZones) {
      if (!zone.coordinates || zone.coordinates.length < 3) continue;
      if (isPointInZone(restaurantLat, restaurantLng, zone.coordinates)) {
        restaurantZone = zone;
        break;
      }
    }

    if (!restaurantZone) {
      return {
        isValid: false,
        statusCode: 403,
        message: 'This restaurant is not located within any active delivery zone.',
      };
    }

    // 5. Special handling for Hotel/QR Orders (room service / dine-in)
    if (hotelReference) {
      // Hotel orders are delivered within hotel premises
      return {
        isValid: true,
        restaurant,
        restaurantZone,
        distanceKm: 0,
        userLat: restaurantLat,
        userLng: restaurantLng,
        restaurantLat,
        restaurantLng,
      };
    }

    // 6. Normal Home Delivery - Validate Delivery Coordinates
    const userLat = Number(
      deliveryAddress?.location?.coordinates?.[1] ??
      deliveryAddress?.latitude ??
      (Array.isArray(deliveryAddress?.coordinates) ? deliveryAddress.coordinates[1] : null)
    );
    const userLng = Number(
      deliveryAddress?.location?.coordinates?.[0] ??
      deliveryAddress?.longitude ??
      (Array.isArray(deliveryAddress?.coordinates) ? deliveryAddress.coordinates[0] : null)
    );

    if (
      userLat == null ||
      userLng == null ||
      isNaN(userLat) ||
      isNaN(userLng) ||
      (userLat === 0 && userLng === 0)
    ) {
      return {
        isValid: false,
        statusCode: 400,
        message: 'Precise delivery coordinates are required. Please select a valid delivery address on the map.',
      };
    }

    // 7. CRITICAL: Check if Delivery Coordinates are inside the Restaurant's Zone Polygon
    const isDeliveryInZone = isPointInZone(userLat, userLng, restaurantZone.coordinates);

    if (!isDeliveryInZone) {
      return {
        isValid: false,
        statusCode: 403,
        message: `Your delivery address is outside the active delivery zone for ${restaurant.name || 'this restaurant'}. We do not deliver to this location.`,
      };
    }

    // 8. CRITICAL: If client sent a zoneId, verify it matches restaurant's zone
    if (clientZoneId) {
      const normalizedClientZoneId = String(clientZoneId).trim();
      const normalizedRestaurantZoneId = String(restaurantZone._id).trim();

      if (normalizedClientZoneId !== normalizedRestaurantZoneId) {
        return {
          isValid: false,
          statusCode: 403,
          message: 'Zone mismatch: Your selected address belongs to a different zone than this restaurant.',
        };
      }
    }

    // 9. CRITICAL: Check Maximum Delivery Distance
    const distanceKm = calculateDistance(restaurantLat, restaurantLng, userLat, userLng);
    const maxRadius = Number(restaurant.deliveryRadius) || MAX_DELIVERY_DISTANCE_KM;

    if (distanceKm > maxRadius) {
      return {
        isValid: false,
        statusCode: 403,
        message: `Delivery address is too far from the restaurant (${distanceKm.toFixed(1)} km). Maximum delivery radius is ${maxRadius} km.`,
      };
    }

    return {
      isValid: true,
      restaurant,
      restaurantZone,
      distanceKm,
      userLat,
      userLng,
      restaurantLat,
      restaurantLng,
    };
  } catch (error) {
    console.error('❌ Error in validateOrderDeliveryAndZone:', error);
    return {
      isValid: false,
      statusCode: 500,
      message: 'Failed to validate delivery zone and location. Please try again.',
    };
  }
}
