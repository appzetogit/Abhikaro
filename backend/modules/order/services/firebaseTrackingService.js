import { getFirebaseRealtimeDB, initializeFirebaseRealtime } from '../../../config/firebaseRealtime.js';
import axios from 'axios';
import { getGoogleMapsApiKey } from '../../../shared/utils/envService.js';

/**
 * Get polyline from Google Directions API
 * This is called ONLY ONCE when order is assigned
 */
async function getPolylineFromGoogle(restaurantLocation, dropLocation) {
  try {
    const apiKey = await getGoogleMapsApiKey();
    if (!apiKey) {
      console.warn('⚠️ Google Maps API key not found, skipping polyline fetch');
      return null;
    }

    const origin = `${restaurantLocation.lat},${restaurantLocation.lng}`;
    const destination = `${dropLocation.lat},${dropLocation.lng}`;
    
    const url = `https://maps.googleapis.com/maps/api/directions/json`;
    const response = await axios.get(url, {
      params: {
        origin,
        destination,
        key: apiKey,
        travelMode: 'DRIVING'
      }
    });

    if (response.data.status === 'OK' && response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const polyline = route.overview_polyline.points;
      
      // Extract distance and duration
      let distance = 0;
      let duration = 0;
      if (route.legs && route.legs.length > 0) {
        distance = route.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0) / 1000; // km
        duration = route.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0) / 60; // minutes
      }
      
      console.log('✅ Polyline fetched from Google Directions API');
      return {
        polyline,
        distance,
        duration
      };
    } else {
      console.warn('⚠️ Google Directions API returned:', response.data.status);
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching polyline from Google:', error.message);
    return null;
  }
}

/**
 * Save order tracking data to Firebase Realtime Database
 * Called when order is assigned to delivery partner
 * 
 * @param {string} orderId - Order ID
 * @param {string} deliveryBoyId - Delivery boy ID
 * @param {Object} restaurantLocation - { lat, lng }
 * @param {Object} dropLocation - { lat, lng }
 * @returns {Promise<string|null>} - Polyline string or null
 */
export async function saveOrderTrackingToFirebase(orderId, deliveryBoyId, restaurantLocation, dropLocation) {
  try {
    // Initialize Firebase if not already done
    await initializeFirebaseRealtime();
    const db = getFirebaseRealtimeDB();
    
    if (!db) {
      console.warn('⚠️ Firebase Realtime Database not available');
      return null;
    }

    // Check Firebase cache first before calling Google API
    let cachedRoute = await getCachedRouteFromFirebase(restaurantLocation, dropLocation);
    let polyline = null;
    let distance = null;
    let duration = null;

    if (cachedRoute) {
      // Use cached route
      polyline = cachedRoute.polyline;
      distance = cachedRoute.distance;
      duration = cachedRoute.duration;
      console.log(`✅ Using cached route from Firebase for order ${orderId}`);
    } else {
      // Get polyline from Google Directions API (ONLY ONCE if not cached)
      const googleResult = await getPolylineFromGoogle(restaurantLocation, dropLocation);
      if (googleResult) {
        polyline = googleResult.polyline;
        distance = googleResult.distance;
        duration = googleResult.duration;

        // Cache this route in Firebase for future use
        if (polyline) {
          await cacheRouteInFirebase(
            restaurantLocation,
            dropLocation,
            polyline,
            distance || 0,
            duration || 0
          );
        }
      }
    }

    // Save to Firebase Realtime Database
    const orderRef = db.ref(`active_orders/${orderId}`);
    
    await orderRef.set({
      polyline: polyline || null,
      distance: distance || null,
      duration: duration || null,
      status: 'assigned',
      boy_id: deliveryBoyId,
      boy_lat: restaurantLocation.lat, // Initial location (restaurant)
      boy_lng: restaurantLocation.lng,
      boy_heading: null, // Will be updated by delivery boy location updates
      restaurant_lat: restaurantLocation.lat,
      restaurant_lng: restaurantLocation.lng,
      customer_lat: dropLocation.lat,
      customer_lng: dropLocation.lng,
      last_updated: Date.now(),
      created_at: Date.now()
    });

    console.log(`✅ Order tracking saved to Firebase for order ${orderId}`);
    return polyline;
  } catch (error) {
    console.error('❌ Error saving order tracking to Firebase:', error);
    return null;
  }
}

/**
 * Update delivery boy's live location in Firebase
 * Called by delivery boy app
 * 
 * @param {string} deliveryBoyId - Delivery boy ID
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string|null} orderId - Active order ID (optional)
 */
export async function updateDeliveryBoyLocation(deliveryBoyId, lat, lng, orderId = null, heading = null) {
  try {
    const db = getFirebaseRealtimeDB();
    if (!db) {
      console.warn('⚠️ Firebase Realtime Database not available');
      return;
    }

    // Update delivery boy's global status
    const boyRef = db.ref(`delivery_boys/${deliveryBoyId}`);
    const updateData = {
      lat,
      lng,
      status: 'online',
      last_updated: Date.now()
    };
    
    // Add heading if available (for marker rotation)
    if (heading !== null && heading !== undefined) {
      updateData.heading = heading;
    }
    
    await boyRef.update(updateData);

    // If there's an active order, update order tracking too
    if (orderId) {
      const orderRef = db.ref(`active_orders/${orderId}`);
      const orderUpdateData = {
        boy_lat: lat,
        boy_lng: lng,
        last_updated: Date.now()
      };
      
      // Add heading to order tracking if available
      if (heading !== null && heading !== undefined) {
        orderUpdateData.boy_heading = heading;
      }
      
      await orderRef.update(orderUpdateData);
      
      console.log(`✅ Delivery boy location updated in Firebase for order ${orderId}:`, {
        lat,
        lng,
        heading: heading || 'N/A',
      });
    }

    console.log(`✅ Delivery boy ${deliveryBoyId} location updated in Firebase:`, {
      lat,
      lng,
      heading: heading || 'N/A',
      orderId: orderId || 'none',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error updating delivery boy location:', error);
  }
}

/**
 * Get order tracking data from Firebase
 * 
 * @param {string} orderId - Order ID
 * @returns {Promise<Object|null>} - Tracking data or null
 */
export async function getOrderTrackingFromFirebase(orderId) {
  try {
    const db = getFirebaseRealtimeDB();
    if (!db) {
      return null;
    }

    const orderRef = db.ref(`active_orders/${orderId}`);
    const snapshot = await orderRef.once('value');
    
    if (snapshot.exists()) {
      return snapshot.val();
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error getting order tracking from Firebase:', error);
    return null;
  }
}

/**
 * Remove order from Firebase when delivered/cancelled
 * 
 * @param {string} orderId - Order ID
 */
export async function removeOrderFromFirebase(orderId) {
  try {
    const db = getFirebaseRealtimeDB();
    if (!db) {
      return;
    }

    const orderRef = db.ref(`active_orders/${orderId}`);
    await orderRef.remove();
    
    console.log(`✅ Order ${orderId} removed from Firebase`);
  } catch (error) {
    console.error('❌ Error removing order from Firebase:', error);
  }
}

/**
 * Get all online delivery boys from Firebase
 * Used for finding nearest delivery boy
 * 
 * @returns {Promise<Array>} - Array of delivery boys with location
 */
export async function getOnlineDeliveryBoysFromFirebase() {
  try {
    const db = getFirebaseRealtimeDB();
    if (!db) {
      return [];
    }

    const boysRef = db.ref('delivery_boys');
    const snapshot = await boysRef.once('value');
    
    if (!snapshot.exists()) {
      return [];
    }

    const boys = snapshot.val();
    const onlineBoys = [];

    for (const boyId in boys) {
      const boy = boys[boyId];
      if (boy.status === 'online' && boy.lat && boy.lng) {
        onlineBoys.push({
          id: boyId,
          lat: boy.lat,
          lng: boy.lng,
          last_updated: boy.last_updated
        });
      }
    }

    return onlineBoys;
  } catch (error) {
    console.error('❌ Error getting online delivery boys from Firebase:', error);
    return [];
  }
}

/**
 * Cache route polyline in Firebase
 * Used to avoid repeated Directions API calls for same routes
 * 
 * @param {Object} start - { lat, lng }
 * @param {Object} end - { lat, lng }
 * @param {string} polyline - Encoded polyline string
 * @param {number} distance - Distance in km
 * @param {number} duration - Duration in minutes
 */
export async function cacheRouteInFirebase(start, end, polyline, distance, duration) {
  try {
    const db = getFirebaseRealtimeDB();
    if (!db) {
      return;
    }

    // Create cache key from coordinates (rounded to 4 decimal places for similarity matching)
    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    const cacheKey = `${roundCoord(start.lat)},${roundCoord(start.lng)}|${roundCoord(end.lat)},${roundCoord(end.lng)}`;

    const routeRef = db.ref(`route_cache/${cacheKey.replace(/[\.|,]/g, '_')}`);
    await routeRef.set({
      polyline,
      distance,
      duration,
      cached_at: Date.now(),
      expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days cache
    });

    console.log(`✅ Route cached in Firebase: ${cacheKey}`);
  } catch (error) {
    console.error('❌ Error caching route in Firebase:', error);
  }
}

/**
 * Get cached route from Firebase
 * 
 * @param {Object} start - { lat, lng }
 * @param {Object} end - { lat, lng }
 * @returns {Promise<Object|null>} - Cached route or null
 */
export async function getCachedRouteFromFirebase(start, end) {
  try {
    const db = getFirebaseRealtimeDB();
    if (!db) {
      return null;
    }

    // Create cache key
    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    const cacheKey = `${roundCoord(start.lat)},${roundCoord(start.lng)}|${roundCoord(end.lat)},${roundCoord(end.lng)}`;

    const routeRef = db.ref(`route_cache/${cacheKey.replace(/[\.|,]/g, '_')}`);
    const snapshot = await routeRef.once('value');

    if (snapshot.exists()) {
      const data = snapshot.val();
      // Check if cache is still valid (not expired)
      if (data.expires_at && data.expires_at > Date.now()) {
        console.log(`✅ Using cached route from Firebase: ${cacheKey}`);
        return {
          polyline: data.polyline,
          distance: data.distance,
          duration: data.duration
        };
      } else {
        // Cache expired, remove it
        await routeRef.remove();
        console.log(`⚠️ Cached route expired, removed: ${cacheKey}`);
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Error getting cached route from Firebase:', error);
    return null;
  }
}

/**
 * Cache distance calculation in Firebase
 * Used to avoid repeated Distance Matrix API calls
 * 
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @param {number} distance - Distance in km
 * @param {number} duration - Duration in minutes
 */
export async function cacheDistanceInFirebase(origin, destination, distance, duration) {
  try {
    const db = getFirebaseRealtimeDB();
    if (!db) {
      return;
    }

    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    const cacheKey = `${roundCoord(origin.lat)},${roundCoord(origin.lng)}|${roundCoord(destination.lat)},${roundCoord(destination.lng)}`;

    const distanceRef = db.ref(`distance_cache/${cacheKey.replace(/[\.|,]/g, '_')}`);
    await distanceRef.set({
      distance,
      duration,
      cached_at: Date.now(),
      expires_at: Date.now() + (24 * 60 * 60 * 1000) // 24 hours cache
    });

    console.log(`✅ Distance cached in Firebase: ${cacheKey}`);
  } catch (error) {
    console.error('❌ Error caching distance in Firebase:', error);
  }
}

/**
 * Get cached distance from Firebase
 * 
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @returns {Promise<Object|null>} - Cached distance or null
 */
export async function getCachedDistanceFromFirebase(origin, destination) {
  try {
    const db = getFirebaseRealtimeDB();
    if (!db) {
      return null;
    }

    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    const cacheKey = `${roundCoord(origin.lat)},${roundCoord(origin.lng)}|${roundCoord(destination.lat)},${roundCoord(destination.lng)}`;

    const distanceRef = db.ref(`distance_cache/${cacheKey.replace(/[\.|,]/g, '_')}`);
    const snapshot = await distanceRef.once('value');

    if (snapshot.exists()) {
      const data = snapshot.val();
      if (data.expires_at && data.expires_at > Date.now()) {
        console.log(`✅ Using cached distance from Firebase: ${cacheKey}`);
        return {
          distance: data.distance,
          duration: data.duration
        };
      } else {
        await distanceRef.remove();
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Error getting cached distance from Firebase:', error);
    return null;
  }
}

/**
 * Update user's live location in Firebase Realtime Database
 * Called when user updates their location
 * 
 * @param {string} userId - User ID
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Object} additionalData - Additional location data (address, city, etc.)
 */
export async function updateUserLocationInFirebase(userId, lat, lng, additionalData = {}) {
  try {
    // Ensure Firebase is initialized
    await initializeFirebaseRealtime();
    const db = getFirebaseRealtimeDB();
    if (!db) {
      console.warn('⚠️ Firebase Realtime Database not available');
      return;
    }

    // Convert userId to string if it's an ObjectId
    const userIdStr = userId?.toString ? userId.toString() : String(userId);
    
    if (!userIdStr) {
      console.warn('⚠️ Invalid userId provided to updateUserLocationInFirebase');
      return;
    }

    // Validate coordinates
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    
    if (isNaN(latNum) || isNaN(lngNum)) {
      console.warn(`⚠️ Invalid coordinates provided for user ${userIdStr}:`, { lat, lng });
      return;
    }

    // Update user's location in Firebase
    const userRef = db.ref(`users/${userIdStr}`);
    const updateData = {
      lat: latNum,
      lng: lngNum,
      last_updated: Date.now()
    };

    // Add additional data if provided
    if (additionalData.address) updateData.address = additionalData.address;
    if (additionalData.city) updateData.city = additionalData.city;
    if (additionalData.state) updateData.state = additionalData.state;
    if (additionalData.area) updateData.area = additionalData.area;
    if (additionalData.formattedAddress) updateData.formatted_address = additionalData.formattedAddress;
    if (additionalData.postalCode) updateData.postal_code = additionalData.postalCode;
    if (additionalData.accuracy !== undefined) updateData.accuracy = parseFloat(additionalData.accuracy) || null;

    await userRef.set(updateData); // Use set() instead of update() to ensure all fields are saved

    console.log(`✅ User ${userIdStr} location updated in Firebase:`, {
      lat: latNum,
      lng: lngNum,
      city: additionalData.city || 'N/A',
      timestamp: new Date(updateData.last_updated).toISOString()
    });
  } catch (error) {
    console.error('❌ Error updating user location in Firebase:', error);
    console.error('Error details:', {
      userId,
      lat,
      lng,
      errorMessage: error.message,
      errorStack: error.stack
    });
  }
}

/**
 * Save order locations to Firebase immediately after order creation
 * This allows delivery boy assignment to use saved locations without API calls
 * 
 * @param {string} orderId - Order ID
 * @param {Object} restaurantLocation - { lat, lng }
 * @param {Object} userLocation - { lat, lng }
 */
export async function saveOrderLocationsToFirebase(orderId, restaurantLocation, userLocation) {
  try {
    // Ensure Firebase is initialized
    await initializeFirebaseRealtime();
    const db = getFirebaseRealtimeDB();
    if (!db) {
      console.warn('⚠️ Firebase Realtime Database not available for saving order locations');
      return;
    }

    // Save locations to Firebase (without polyline - that will be added when delivery boy is assigned)
    const orderRef = db.ref(`active_orders/${orderId}`);
    await orderRef.set({
      restaurant_lat: restaurantLocation.lat,
      restaurant_lng: restaurantLocation.lng,
      customer_lat: userLocation.lat,
      customer_lng: userLocation.lng,
      status: 'pending', // Order created but not assigned yet
      created_at: Date.now(),
      last_updated: Date.now(),
    });

    console.log(`✅ Order locations saved to Firebase for order ${orderId}:`, {
      restaurant: { lat: restaurantLocation.lat, lng: restaurantLocation.lng },
      customer: { lat: userLocation.lat, lng: userLocation.lng },
    });
  } catch (error) {
    console.error('❌ Error saving order locations to Firebase:', error);
  }
}

/**
 * Get user's current location from Firebase
 * Used during order placement to avoid Google Maps API calls
 * 
 * @param {string} userId - User ID (can be ObjectId or string)
 * @returns {Promise<Object|null>} - User location data or null
 */
export async function getUserLocationFromFirebase(userId) {
  try {
    // Ensure Firebase is initialized
    await initializeFirebaseRealtime();
    const db = getFirebaseRealtimeDB();
    if (!db) {
      console.warn('⚠️ Firebase Realtime Database not available for user location fetch');
      return null;
    }

    // Convert userId to string if it's an ObjectId
    const userIdStr = userId?.toString ? userId.toString() : String(userId);
    
    if (!userIdStr) {
      console.warn('⚠️ Invalid userId provided to getUserLocationFromFirebase');
      return null;
    }

    console.log(`🔍 Fetching user location from Firebase for user: ${userIdStr}`);
    const userRef = db.ref(`users/${userIdStr}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      console.log(`⚠️ User location not found in Firebase for user: ${userIdStr}`);
      return null;
    }

    const data = snapshot.val();
    console.log(`📦 User location data from Firebase:`, {
      hasLat: !!data.lat,
      hasLng: !!data.lng,
      lastUpdated: data.last_updated,
      age: data.last_updated ? Math.round((Date.now() - data.last_updated) / (60 * 1000)) + ' minutes' : 'unknown'
    });

    // Check if location data exists
    if (!data.lat || !data.lng) {
      console.log(`⚠️ User location coordinates missing in Firebase for user: ${userIdStr}`);
      return null;
    }

    // Check if location is recent (within last 24 hours - more flexible)
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    if (data.last_updated && data.last_updated < twentyFourHoursAgo) {
      console.log(`⚠️ User location in Firebase is too old (${Math.round((Date.now() - data.last_updated) / (60 * 60 * 1000))} hours) for user: ${userIdStr}`);
      // Still return it, but log warning - better to use old location than no location
    }

    const locationData = {
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      area: data.area || null,
      formattedAddress: data.formatted_address || null,
      postalCode: data.postal_code || null,
      accuracy: data.accuracy || null,
      lastUpdated: data.last_updated
    };

    // Validate coordinates
    if (isNaN(locationData.lat) || isNaN(locationData.lng)) {
      console.warn(`⚠️ Invalid coordinates in Firebase for user ${userIdStr}:`, locationData);
      return null;
    }

    console.log(`✅ Using user location from Firebase for user ${userIdStr}:`, {
      lat: locationData.lat,
      lng: locationData.lng,
      city: locationData.city,
      age: data.last_updated ? Math.round((Date.now() - data.last_updated) / (60 * 1000)) + ' minutes' : 'unknown'
    });

    return locationData;
  } catch (error) {
    console.error('❌ Error getting user location from Firebase:', error);
    console.error('Error details:', {
      userId,
      errorMessage: error.message,
      errorStack: error.stack
    });
    return null;
  }
}
