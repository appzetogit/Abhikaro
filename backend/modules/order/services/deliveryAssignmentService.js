import Delivery from '../../delivery/models/Delivery.js';
import Order from '../models/Order.js';
import Zone from '../../admin/models/Zone.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import mongoose from 'mongoose';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in kilometers
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
 * Find all nearest available delivery boys within priority distance (for priority notification)
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {string} restaurantId - Restaurant ID (for zone lookup)
 * @param {number} priorityDistance - Priority distance in km (default: 5km)
 * @returns {Promise<Array>} Array of delivery boys within priority distance
 */
export async function findNearestDeliveryBoys(
  restaurantLat,
  restaurantLng,
  restaurantId = null,
  priorityDistance = 5,
  topN = 10,
  options = {},
) {
  try {
    console.log(`🔍 Searching for priority delivery partners within ${priorityDistance}km of restaurant: ${restaurantLat}, ${restaurantLng}`);
    
    // Check delivery assignment mode
    const BusinessSettings = (await import('../../admin/models/BusinessSettings.js')).default;
    const businessSettings = await BusinessSettings.getSettings();
    const assignmentMode = businessSettings?.deliveryAssignmentMode || 'automatic';
    // Backward compatibility:
    // Some callers historically passed (lat, lng, restaurantId, radiusKm, topN).
    // Others passed (lat, lng, restaurantId, radiusKm, options) after we added options.
    // Normalize here so both forms work.
    let effectiveTopN = topN;
    let effectiveOptions = options;
    if (typeof topN === 'object' && topN !== null && options === undefined) {
      // Called as (..., priorityDistance, options)
      effectiveOptions = topN;
      effectiveTopN = 10;
    }

    const ignoreManualZoneFilter = effectiveOptions?.ignoreManualZoneFilter === true;
    
    console.log(`📋 Delivery assignment mode: ${assignmentMode}`);
    
    // Use the same logic as findNearestDeliveryBoy but return all within priority distance
    let zone = null;
    let deliveryQuery = {
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: true,
      'availability.currentLocation.coordinates': {
        $exists: true,
        $ne: [0, 0]
      }
    };

    if (restaurantId) {
      try {
        const restaurantIdRaw = restaurantId.toString ? restaurantId.toString() : restaurantId;

        // Zone.restaurantId is a Restaurant ObjectId.
        // Call sites sometimes pass a Restaurant ObjectId, and sometimes pass a business `restaurantId` string.
        // Resolve both to a Restaurant ObjectId before looking up Zone.
        let restaurantObjectId = null;
        if (mongoose.Types.ObjectId.isValid(restaurantIdRaw) && String(restaurantIdRaw).length === 24) {
          restaurantObjectId = new mongoose.Types.ObjectId(restaurantIdRaw);
        } else {
          const restaurantDoc = await Restaurant.findOne({ restaurantId: restaurantIdRaw })
            .select('_id')
            .lean();
          if (restaurantDoc?._id) {
            restaurantObjectId = restaurantDoc._id;
          }
        }

        if (restaurantObjectId) {
          zone = await Zone.findOne({
            restaurantId: restaurantObjectId,
            isActive: true,
          }).lean();
        } else {
          zone = null;
        }

        if (zone) {
          console.log(`✅ Found zone: ${zone.name} (${zone._id}) for restaurant ${restaurantId}`);
        }
      } catch (zoneError) {
        console.warn(`⚠️ Error finding zone:`, zoneError.message);
      }
    }

    const deliveryPartners = await Delivery.find(deliveryQuery)
      .select('_id name phone availability.currentLocation availability.lastLocationUpdate availability.zones status isActive zoneId')
      .lean();

    console.log(`📊 Found ${deliveryPartners?.length || 0} online delivery partners`);

    if (!deliveryPartners || deliveryPartners.length === 0) {
      return [];
    }

    // Calculate distance and filter
    const deliveryPartnersWithDistance = deliveryPartners
      .map(partner => {
        const location = partner.availability?.currentLocation;
        if (!location || !location.coordinates || location.coordinates.length < 2) {
          return null;
        }

        const [lng, lat] = location.coordinates;
        if (lat === 0 && lng === 0) {
          return null;
        }

        // Zone filtering based on assignment mode
        if (assignmentMode === 'manual' && !ignoreManualZoneFilter) {
          // In manual mode: Only show orders to delivery partners assigned to this zone
          if (!zone) {
            console.log(`⚠️ No zone found for restaurant, skipping delivery partner ${partner._id} in manual mode`);
            return null;
          }
          
          // Check if delivery partner has this zone assigned
          const partnerZones = partner.availability?.zones || [];
          const hasZone = partnerZones.some(z => z.toString() === zone._id.toString());
          
          if (!hasZone) {
            console.log(`🚫 Delivery partner ${partner._id} (${partner.name}) not assigned to zone ${zone.name}, skipping in manual mode`);
            return null;
          }
          
          console.log(`✅ Delivery partner ${partner._id} (${partner.name}) is assigned to zone ${zone.name}`);
        } else {
          // In automatic mode: avoid hard filtering by `partner.zoneId`.
          // Reason: many deployments don't keep `Delivery.zoneId` in sync with restaurant zones,
          // which can silently drop all candidates and stop notifications.
          // We'll only apply polygon boundary filtering when available; otherwise distance-only.
          if (zone) {
            if (zone.coordinates && zone.coordinates.length >= 3) {
              const zoneCoords = zone.coordinates;
              let inside = false;
              for (let i = 0, j = zoneCoords.length - 1; i < zoneCoords.length; j = i++) {
                const xi = zoneCoords[i].longitude;
                const yi = zoneCoords[i].latitude;
                const xj = zoneCoords[j].longitude;
                const yj = zoneCoords[j].latitude;
                const intersect =
                  (yi > lat) !== (yj > lat) &&
                  lng < (xj - xi) * (lat - yi) / (yj - yi) + xi;
                if (intersect) inside = !inside;
              }
              if (!inside) return null;
            }
          }
        }

        const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
        return {
          ...partner,
          distance,
          latitude: lat,
          longitude: lng,
          zoneId: partner.zoneId || null
        };
      })
      .filter(partner => partner !== null && partner.distance <= priorityDistance)
      .sort((a, b) => a.distance - b.distance);

    const limited =
      Number.isFinite(Number(effectiveTopN)) && Number(effectiveTopN) > 0
        ? deliveryPartnersWithDistance.slice(0, Number(effectiveTopN))
        : deliveryPartnersWithDistance;

    console.log(`✅ Found ${limited.length} priority delivery partners within ${priorityDistance}km (topN=${effectiveTopN})`);
    return limited.map(partner => ({
      deliveryPartnerId: partner._id.toString(),
      name: partner.name,
      phone: partner.phone,
      distance: partner.distance,
      location: {
        latitude: partner.latitude,
        longitude: partner.longitude
      }
    }));
  } catch (error) {
    console.error('❌ Error finding nearest delivery boys:', error);
    return [];
  }
}

/**
 * Find the nearest available delivery boy to a restaurant location (with zone-based filtering)
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {string} restaurantId - Restaurant ID (for zone lookup)
 * @param {number} maxDistance - Maximum distance in km (default: 50km)
 * @param {Array} excludeIds - Array of delivery partner IDs to exclude (already notified)
 * @returns {Promise<Object|null>} Nearest delivery boy or null
 */
export async function findNearestDeliveryBoy(restaurantLat, restaurantLng, restaurantId = null, maxDistance = 50, excludeIds = []) {
  try {
    console.log(`🔍 Searching for nearest delivery partner near restaurant: ${restaurantLat}, ${restaurantLng} (Restaurant ID: ${restaurantId})`);
    
    // Check delivery assignment mode
    const BusinessSettings = (await import('../../admin/models/BusinessSettings.js')).default;
    const businessSettings = await BusinessSettings.getSettings();
    const assignmentMode = businessSettings?.deliveryAssignmentMode || 'automatic';
    const ignoreManualZoneFilter = false; // kept for signature parity; use `findNearestDeliveryBoys` override for now
    
    console.log(`📋 Delivery assignment mode: ${assignmentMode}`);
    
    // Step 1: Find zone for restaurant (if restaurantId provided)
    let zone = null;
    let deliveryQuery = {
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: true,
      'availability.currentLocation.coordinates': {
        $exists: true,
        $ne: [0, 0] // Exclude default/null coordinates
      }
    };

    if (restaurantId) {
      try {
        // Try to find zone by restaurantId
        const restaurantIdObj = restaurantId.toString ? restaurantId.toString() : restaurantId;
        zone = await Zone.findOne({
          restaurantId: restaurantIdObj,
          isActive: true
        }).lean();

        if (zone) {
          console.log(`✅ Found zone: ${zone.name} for restaurant ${restaurantId}`);
          
          // Option A: Filter by zoneId if Delivery model has zoneId field
          // Uncomment when zoneId is added to Delivery model
          // deliveryQuery.zoneId = zone._id;

          // Option B: Filter by geo-spatial query (if zone has boundary)
          // This is more complex and slower, but works without modifying Delivery model
          if (zone.boundary && zone.boundary.coordinates) {
            // For now, we'll use distance-based with zone coordinate check
            // In production, you can use $geoWithin for better accuracy
            console.log(`📍 Zone boundary found, will filter by location after distance calculation`);
          }
        } else {
          console.log(`⚠️ No zone found for restaurant ${restaurantId}, using distance-based assignment`);
        }
      } catch (zoneError) {
        console.warn(`⚠️ Error finding zone for restaurant ${restaurantId}:`, zoneError.message);
        // Continue with distance-based assignment
      }
    }

    // Exclude already notified delivery partners
    if (excludeIds && excludeIds.length > 0) {
      const excludeObjectIds = excludeIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
      if (excludeObjectIds.length > 0) {
        deliveryQuery._id = { $nin: excludeObjectIds };
        console.log(`🚫 Excluding ${excludeObjectIds.length} already notified delivery partners`);
      }
    }

    // Find all online delivery partners (with zone filter if applicable)
    const deliveryPartners = await Delivery.find(deliveryQuery)
      .select('_id name phone availability.currentLocation availability.lastLocationUpdate availability.zones status isActive zoneId')
      .lean();

    console.log(`📊 Found ${deliveryPartners?.length || 0} online delivery partners in database`);

    if (!deliveryPartners || deliveryPartners.length === 0) {
      console.log('⚠️ No online delivery partners found');
      console.log('⚠️ Checking all delivery partners to see why...');
      
      // Debug: Check all delivery partners to see their status
      const allPartners = await Delivery.find({})
        .select('_id name availability.isOnline status isActive availability.currentLocation')
        .lean();
      
      console.log(`📊 Total delivery partners in database: ${allPartners.length}`);
      allPartners.forEach(partner => {
        console.log(`  - ${partner.name} (${partner._id}): online=${partner.availability?.isOnline}, status=${partner.status}, active=${partner.isActive}, hasLocation=${!!partner.availability?.currentLocation?.coordinates}`);
      });
      
      return null;
    }

    // Calculate distance for each delivery partner and filter by zone if applicable
    const deliveryPartnersWithDistance = deliveryPartners
      .map(partner => {
        const location = partner.availability?.currentLocation;
        if (!location || !location.coordinates || location.coordinates.length < 2) {
          return null;
        }

        const [lng, lat] = location.coordinates; // GeoJSON format: [longitude, latitude]
        
        // Skip if coordinates are invalid
        if (lat === 0 && lng === 0) {
          return null;
        }

        // Zone filtering based on assignment mode
        if (assignmentMode === 'manual') {
          // In manual mode: Only show orders to delivery partners assigned to this zone
          if (!zone) {
            console.log(`⚠️ No zone found for restaurant, skipping delivery partner ${partner._id} in manual mode`);
            return null;
          }
          
          // Check if delivery partner has this zone assigned
          const partnerZones = partner.availability?.zones || [];
          const hasZone = partnerZones.some(z => z.toString() === zone._id.toString());
          
          if (!hasZone) {
            console.log(`🚫 Delivery partner ${partner._id} (${partner.name}) not assigned to zone ${zone.name}, skipping in manual mode`);
            return null;
          }
          
          console.log(`✅ Delivery partner ${partner._id} (${partner.name}) is assigned to zone ${zone.name}`);
        } else {
          // In automatic mode: do NOT hard-filter by `partner.zoneId` mismatch.
          // This frequently causes zero candidates in real data.
          // If a polygon boundary exists, keep that as a safety filter; otherwise distance-only.
          if (zone) {
            if (zone.coordinates && zone.coordinates.length >= 3) {
              const zoneCoords = zone.coordinates;
              let inside = false;

              for (let i = 0, j = zoneCoords.length - 1; i < zoneCoords.length; j = i++) {
                const xi = zoneCoords[i].longitude;
                const yi = zoneCoords[i].latitude;
                const xj = zoneCoords[j].longitude;
                const yj = zoneCoords[j].latitude;

                const intersect =
                  (yi > lat) !== (yj > lat) &&
                  lng < (xj - xi) * (lat - yi) / (yj - yi) + xi;

                if (intersect) inside = !inside;
              }

              if (!inside) return null;
            }
          }
        }

        const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
        
        return {
          ...partner,
          distance,
          latitude: lat,
          longitude: lng,
          zoneId: partner.zoneId || null
        };
      })
      .filter(partner => partner !== null && partner.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance); // Sort by distance (nearest first)

    if (deliveryPartnersWithDistance.length === 0) {
      console.log(`⚠️ No delivery partners found within ${maxDistance}km`);
      return null;
    }

    // Get the nearest delivery partner
    const nearestPartner = deliveryPartnersWithDistance[0];
    
    console.log(`✅ Found nearest delivery partner: ${nearestPartner.name} (ID: ${nearestPartner._id})`);
    console.log(`✅ Distance: ${nearestPartner.distance.toFixed(2)}km away`);
    console.log(`✅ Location: ${nearestPartner.latitude}, ${nearestPartner.longitude}`);
    console.log(`✅ Phone: ${nearestPartner.phone}`);

    return {
      deliveryPartnerId: nearestPartner._id.toString(),
      name: nearestPartner.name,
      phone: nearestPartner.phone,
      distance: nearestPartner.distance,
      location: {
        latitude: nearestPartner.latitude,
        longitude: nearestPartner.longitude
      }
    };
  } catch (error) {
    console.error('❌ Error finding nearest delivery boy:', error);
    throw error;
  }
}

/**
 * Assign order to nearest delivery boy
 * @param {Object} order - Order document
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @returns {Promise<Object|null>} Assignment result or null
 */
export async function assignOrderToDeliveryBoy(order, restaurantLat, restaurantLng, restaurantId = null) {
  try {
    // CRITICAL: Don't assign if order is cancelled
    if (order.status === 'cancelled') {
      console.log(`⚠️ Order ${order.orderId} is cancelled. Cannot assign to delivery partner.`);
      return null;
    }
    
    // CRITICAL: Don't assign if order is already delivered/completed
    if (order.status === 'delivered' || 
        order.deliveryState?.currentPhase === 'completed' ||
        order.deliveryState?.status === 'delivered') {
      console.log(`⚠️ Order ${order.orderId} is already delivered/completed. Cannot assign.`);
      return null;
    }
    
    // FIXED: Only assign orders that are in 'ready' status (Ready to Pickup)
    // Delivery partners should NOT be assigned to orders that are still being prepared
    if (order.status !== 'ready') {
      console.log(`⚠️ Order ${order.orderId} is not ready for pickup (status: ${order.status}). Cannot assign to delivery partner. Order must be marked as 'ready' by restaurant first.`);
      return null;
    }
    
    // Check if order already has a delivery partner assigned
    if (order.deliveryPartnerId) {
      console.log(`⚠️ Order ${order.orderId} already has delivery partner assigned`);
      return null;
    }

    // Get restaurantId from order if not provided
    const orderRestaurantId = restaurantId || order.restaurantId;
    
    // Find nearest delivery boy (with zone-based filtering)
    const nearestDeliveryBoy = await findNearestDeliveryBoy(restaurantLat, restaurantLng, orderRestaurantId);

    if (!nearestDeliveryBoy) {
      console.log(`⚠️ No delivery boy found for order ${order.orderId}`);
      return null;
    }

    // Update order with delivery partner assignment
    // Note: Don't set outForDelivery yet - that should happen when delivery boy picks up the order
    order.deliveryPartnerId = nearestDeliveryBoy.deliveryPartnerId;
    order.assignmentInfo = {
      deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
      distance: nearestDeliveryBoy.distance,
      assignedAt: new Date(),
      assignedBy: 'nearest_available'
    };
    // Don't set outForDelivery status here - that should be set when delivery boy picks up the order
    // order.tracking.outForDelivery = {
    //   status: true,
    //   timestamp: new Date()
    // };
    
    await order.save();

    // Save order tracking to Firebase Realtime Database (with polyline)
    try {
      const { saveOrderTrackingToFirebase } = await import('./firebaseTrackingService.js');
      
      // Get restaurant and customer locations from saved order data (no API calls needed)
      let restaurantLocation = null;
      let dropLocation = null;

      // Priority 1: Use saved locations from order document (saved at order creation)
      if (order.restaurantLocation?.latitude && order.restaurantLocation?.longitude) {
        restaurantLocation = {
          lat: order.restaurantLocation.latitude,
          lng: order.restaurantLocation.longitude,
        };
        console.log('✅ Using saved restaurant location from order document');
      } else if (order.restaurantLocation?.location?.coordinates) {
        const [lng, lat] = order.restaurantLocation.location.coordinates;
        restaurantLocation = { lat, lng };
        console.log('✅ Using saved restaurant location from order coordinates');
      }

      // Priority 1: Use saved user location from order document
      if (order.address?.latitude && order.address?.longitude) {
        dropLocation = {
          lat: order.address.latitude,
          lng: order.address.longitude,
        };
        console.log('✅ Using saved user location from order document');
      } else if (order.address?.location?.coordinates) {
        const [lng, lat] = order.address.location.coordinates;
        dropLocation = { lat, lng };
        console.log('✅ Using saved user location from order coordinates');
      }

      // Fallback: Get from restaurant document (only if not saved in order)
      if (!restaurantLocation && order.restaurantId) {
        const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
        const restaurant = await Restaurant.findById(order.restaurantId).select('location').lean();
        if (restaurant?.location?.coordinates) {
          const [lng, lat] = restaurant.location.coordinates;
          restaurantLocation = { lat, lng };
          console.log('⚠️ Using restaurant location from restaurant document (fallback)');
        }
      }

      // Fallback: Use provided coordinates
      if (!restaurantLocation) {
        restaurantLocation = { lat: restaurantLat, lng: restaurantLng };
        console.log('⚠️ Using provided restaurant coordinates (fallback)');
      }

      if (restaurantLocation && dropLocation) {
        await saveOrderTrackingToFirebase(
          order.orderId || order._id.toString(),
          nearestDeliveryBoy.deliveryPartnerId,
          restaurantLocation,
          dropLocation
        );
        console.log(`✅ Order tracking saved to Firebase for order ${order.orderId}`, {
          restaurantLocation,
          dropLocation,
          source: 'saved_in_order_document',
        });
      } else {
        console.warn('⚠️ Cannot save to Firebase: Missing location coordinates', {
          hasRestaurantLocation: !!restaurantLocation,
          hasDropLocation: !!dropLocation,
        });
      }
    } catch (firebaseError) {
      console.error('❌ Error saving to Firebase (non-critical):', firebaseError);
      // Continue even if Firebase save fails
    }

    // Trigger ETA recalculation for rider assigned event
    try {
      const etaEventService = (await import('./etaEventService.js')).default;
      await etaEventService.handleRiderAssigned(order._id.toString(), nearestDeliveryBoy.deliveryPartnerId);
      console.log(`✅ ETA updated after rider assigned to order ${order.orderId}`);
    } catch (etaError) {
      console.error('Error updating ETA after rider assignment:', etaError);
      // Continue even if ETA update fails
    }

    console.log(`✅ Assigned order ${order.orderId} to delivery partner ${nearestDeliveryBoy.name}`);

    return {
      success: true,
      deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
      deliveryPartnerName: nearestDeliveryBoy.name,
      distance: nearestDeliveryBoy.distance,
      orderId: order.orderId
    };
  } catch (error) {
    console.error('❌ Error assigning order to delivery boy:', error);
    throw error;
  }
}

