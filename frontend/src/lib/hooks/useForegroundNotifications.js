import { useEffect, useRef } from 'react';
import { onForegroundMessage } from '../fcmService.js';
import { toast } from 'sonner';

/**
 * Hook to handle foreground push notifications
 * Shows toast notifications when app is open
 * @param {Object} options - Configuration options
 * @param {Function} options.onNotificationClick - Callback when notification is clicked
 * @param {boolean} options.showToasts - Whether to show toast notifications (default: true)
 */
export function useForegroundNotifications(options = {}) {
  const { onNotificationClick, showToasts = true } = options;
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    let unsubscribe = null;

    const setupNotifications = async () => {
      try {
        unsubscribe = await onForegroundMessage((payload) => {
          console.log('🔔 [Foreground] Notification received:', payload);

          const title = payload.notification?.title || payload.data?.title || 'Notification';
          const body = payload.notification?.body || payload.data?.body || '';
          const data = payload.data || {};

          // Show toast notification if enabled
          if (showToasts) {
            toast.info(title, {
              description: body,
              duration: 5000,
              onClick: () => {
                if (onNotificationClick) {
                  onNotificationClick(data);
                }
              }
            });
          }

          // Call custom click handler if provided
          if (onNotificationClick && data) {
            // Store notification data for potential click handling
            // The toast onClick will handle the actual click
          }
        });

        unsubscribeRef.current = unsubscribe;
        console.log('✅ [Foreground] Notification handler registered');
      } catch (error) {
        console.error('❌ [Foreground] Error setting up notification handler:', error);
      }
    };

    setupNotifications();

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current && typeof unsubscribeRef.current === 'function') {
        unsubscribeRef.current();
        console.log('🧹 [Foreground] Notification handler unregistered');
      }
    };
  }, [onNotificationClick, showToasts]);

  return { unsubscribe: unsubscribeRef.current };
}
