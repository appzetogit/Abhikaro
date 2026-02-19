import { useEffect, useRef } from 'react';
import { updateDeliveryBoyLocationInFirebase } from '@/lib/firebaseRealtime';

/**
 * Hook to automatically update delivery boy location in Firebase
 * 
 * @param {string} deliveryBoyId - Delivery boy ID
 * @param {number|null} lat - Latitude
 * @param {number|null} lng - Longitude
 * @param {string|null} orderId - Active order ID (optional)
 * @param {boolean} enabled - Whether to enable location updates (default: true)
 */
export function useFirebaseLocationUpdate(deliveryBoyId, lat, lng, orderId = null, enabled = true) {
  const intervalRef = useRef(null);
  const lastUpdateRef = useRef({ lat: null, lng: null, timestamp: 0 });

  useEffect(() => {
    if (!enabled || !deliveryBoyId || lat === null || lng === null) {
      return;
    }

    // Throttle updates: only update if location changed significantly or 5 seconds passed
    const shouldUpdate = () => {
      const now = Date.now();
      const lastUpdate = lastUpdateRef.current;
      
      // Update if 5 seconds passed
      if (now - lastUpdate.timestamp > 5000) {
        return true;
      }

      // Update if location changed significantly (> 10 meters)
      if (lastUpdate.lat !== null && lastUpdate.lng !== null) {
        const distance = calculateDistance(lastUpdate.lat, lastUpdate.lng, lat, lng);
        if (distance > 0.01) { // ~10 meters
          return true;
        }
      }

      return false;
    };

    const updateLocation = async () => {
      if (shouldUpdate()) {
        await updateDeliveryBoyLocationInFirebase(deliveryBoyId, lat, lng, orderId);
        lastUpdateRef.current = { lat, lng, timestamp: Date.now() };
      }
    };

    // Update immediately
    updateLocation();

    // Set up interval to update every 5 seconds
    intervalRef.current = setInterval(updateLocation, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [deliveryBoyId, lat, lng, orderId, enabled]);

  // Helper function to calculate distance in kilometers
  function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
