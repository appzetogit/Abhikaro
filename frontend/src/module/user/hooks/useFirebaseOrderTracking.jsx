import { useEffect, useState, useRef } from 'react';
import { subscribeToOrderTracking } from '@/lib/firebaseRealtime';

/**
 * Hook to subscribe to Firebase Realtime Database for order tracking
 * 
 * @param {string} orderId - Order ID
 * @returns {Object} - { trackingData, loading, error }
 */
export function useFirebaseOrderTracking(orderId) {
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Subscribe to Firebase Realtime Database
    subscribeToOrderTracking(orderId, (data) => {
      if (data) {
        setTrackingData(data);
        setError(null);
      } else {
        setTrackingData(null);
        setError('Order tracking data not found');
      }
      setLoading(false);
    }).then((unsubscribe) => {
      unsubscribeRef.current = unsubscribe;
    }).catch((err) => {
      console.error('Error subscribing to order tracking:', err);
      setError(err.message);
      setLoading(false);
    });

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [orderId]);

  return { trackingData, loading, error };
}
