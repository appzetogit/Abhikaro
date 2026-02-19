import { getDatabase, ref, onValue, off, update, set } from 'firebase/database';
import { firebaseApp, ensureFirebaseInitialized } from './firebase.js';

let db = null;

/**
 * Initialize Firebase Realtime Database
 */
async function getFirebaseRealtimeDB() {
  if (db) {
    return db;
  }

  try {
    await ensureFirebaseInitialized();
    
    if (!firebaseApp) {
      console.warn('⚠️ Firebase app not initialized');
      return null;
    }

    db = getDatabase(firebaseApp);
    console.log('✅ Firebase Realtime Database initialized');
    return db;
  } catch (error) {
    console.error('❌ Error initializing Firebase Realtime Database:', error);
    return null;
  }
}

/**
 * Subscribe to order tracking updates from Firebase
 * 
 * @param {string} orderId - Order ID
 * @param {Function} callback - Callback function that receives tracking data
 * @returns {Function} - Unsubscribe function
 */
export async function subscribeToOrderTracking(orderId, callback) {
  try {
    const database = await getFirebaseRealtimeDB();
    if (!database) {
      console.warn('⚠️ Firebase Realtime Database not available');
      return () => {};
    }

    const orderRef = ref(database, `active_orders/${orderId}`);
    
    const unsubscribe = onValue(orderRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        callback({
          polyline: data.polyline,
          boyLat: data.boy_lat,
          boyLng: data.boy_lng,
          restaurantLat: data.restaurant_lat,
          restaurantLng: data.restaurant_lng,
          customerLat: data.customer_lat,
          customerLng: data.customer_lng,
          status: data.status,
          lastUpdated: data.last_updated
        });
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('❌ Error reading from Firebase:', error);
      callback(null);
    });

    return () => {
      off(orderRef);
      unsubscribe();
    };
  } catch (error) {
    console.error('❌ Error subscribing to order tracking:', error);
    return () => {};
  }
}

/**
 * Update delivery boy location in Firebase
 * Called by delivery boy app
 * 
 * @param {string} deliveryBoyId - Delivery boy ID
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string|null} orderId - Active order ID (optional)
 */
export async function updateDeliveryBoyLocationInFirebase(deliveryBoyId, lat, lng, orderId = null) {
  try {
    const database = await getFirebaseRealtimeDB();
    if (!database) {
      console.warn('⚠️ Firebase Realtime Database not available');
      return;
    }

    // Update delivery boy's global status
    const boyRef = ref(database, `delivery_boys/${deliveryBoyId}`);
    await update(boyRef, {
      lat,
      lng,
      status: 'online',
      last_updated: Date.now()
    });

    // If there's an active order, update order tracking too
    if (orderId) {
      const orderRef = ref(database, `active_orders/${orderId}`);
      await update(orderRef, {
        boy_lat: lat,
        boy_lng: lng,
        last_updated: Date.now()
      });
    }

    console.log(`✅ Delivery boy ${deliveryBoyId} location updated in Firebase`);
  } catch (error) {
    console.error('❌ Error updating delivery boy location in Firebase:', error);
  }
}

/**
 * Update user location in Firebase Realtime Database
 * Called by user app to save live location
 * 
 * @param {string} userId - User ID
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Object} additionalData - Additional location data (address, city, etc.)
 */
export async function updateUserLocationInFirebase(userId, lat, lng, additionalData = {}) {
  try {
    const database = await getFirebaseRealtimeDB();
    if (!database) {
      console.warn('⚠️ Firebase Realtime Database not available');
      return;
    }

    if (!userId) {
      console.warn('⚠️ Invalid userId provided to updateUserLocationInFirebase');
      return;
    }

    // Validate coordinates
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    
    if (isNaN(latNum) || isNaN(lngNum)) {
      console.warn(`⚠️ Invalid coordinates provided for user ${userId}:`, { lat, lng });
      return;
    }

    // Update user's location in Firebase
    const userRef = ref(database, `users/${userId}`);
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
    if (additionalData.accuracy !== undefined && additionalData.accuracy !== null) {
      updateData.accuracy = parseFloat(additionalData.accuracy);
    }

    await set(userRef, updateData); // Use set() to ensure all fields are saved

    console.log(`✅ User ${userId} location updated in Firebase:`, {
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
 * Get order tracking data from Firebase (one-time read)
 * 
 * @param {string} orderId - Order ID
 * @returns {Promise<Object|null>} - Tracking data or null
 */
export async function getOrderTrackingFromFirebase(orderId) {
  try {
    const database = await getFirebaseRealtimeDB();
    if (!database) {
      return null;
    }

    const { get } = await import('firebase/database');
    const orderRef = ref(database, `active_orders/${orderId}`);
    const snapshot = await get(orderRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      return {
        polyline: data.polyline,
        boyLat: data.boy_lat,
        boyLng: data.boy_lng,
        restaurantLat: data.restaurant_lat,
        restaurantLng: data.restaurant_lng,
        customerLat: data.customer_lat,
        customerLng: data.customer_lng,
        status: data.status,
        lastUpdated: data.last_updated
      };
    }

    return null;
  } catch (error) {
    console.error('❌ Error getting order tracking from Firebase:', error);
    return null;
  }
}
