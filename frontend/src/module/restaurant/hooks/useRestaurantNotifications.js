import { useContext } from 'react';
import { RestaurantSocketContext } from '../context/RestaurantSocketContext';

/**
 * Hook for restaurant to receive real-time order notifications with sound.
 * Consumes the global RestaurantSocketContext to ensure exactly one persistent socket
 * is shared across the entire dashboard layout without duplicate connections or teardowns.
 * 
 * @returns {object} - { newOrder, clearNewOrder, isConnected, playNotificationSound, stopNotificationSound, isSoundUnlocked, unlockSound, startRingingForOrder }
 */
export const useRestaurantNotifications = () => {
  const context = useContext(RestaurantSocketContext);
  if (!context) {
    throw new Error('useRestaurantNotifications must be used within a RestaurantSocketProvider');
  }
  return context;
};
