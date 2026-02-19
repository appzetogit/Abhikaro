import { getDatabase, ref, get } from 'firebase/database';
import { getFirebaseRealtimeDB } from './firebaseRealtime.js';

/**
 * Get Firebase Realtime Database instance
 */
async function getDB() {
  return await getFirebaseRealtimeDB();
}

/**
 * Get cached route from Firebase
 * Used to avoid Directions API calls
 * 
 * @param {Object} start - { lat, lng }
 * @param {Object} end - { lat, lng }
 * @returns {Promise<Object|null>} - Cached route with polyline or null
 */
export async function getCachedRouteFromFirebase(start, end) {
  try {
    const database = await getDB();
    if (!database) {
      return null;
    }

    // Create cache key (rounded coordinates)
    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    const cacheKey = `${roundCoord(start.lat)},${roundCoord(start.lng)}|${roundCoord(end.lat)},${roundCoord(end.lng)}`;
    const safeKey = cacheKey.replace(/[\.|,]/g, '_');

    const routeRef = ref(database, `route_cache/${safeKey}`);
    const snapshot = await get(routeRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      // Check if cache is still valid
      if (data.expires_at && data.expires_at > Date.now()) {
        console.log('✅ Using cached route from Firebase');
        return {
          polyline: data.polyline,
          distance: data.distance,
          duration: data.duration
        };
      } else {
        // Cache expired
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Error getting cached route from Firebase:', error);
    return null;
  }
}

/**
 * Get order tracking polyline from Firebase
 * This is the main polyline saved when order is assigned
 * 
 * @param {string} orderId - Order ID
 * @returns {Promise<string|null>} - Polyline string or null
 */
export async function getOrderPolylineFromFirebase(orderId) {
  try {
    const database = await getDB();
    if (!database) {
      return null;
    }

    const orderRef = ref(database, `active_orders/${orderId}`);
    const snapshot = await get(orderRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      if (data.polyline) {
        console.log('✅ Using order polyline from Firebase');
        return data.polyline;
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Error getting order polyline from Firebase:', error);
    return null;
  }
}
