import { useEffect, useRef } from 'react';
import { onForegroundMessage } from '../fcmService.js';
import { toast } from 'sonner';

/**
 * Hook to handle foreground push notifications
 * Shows toast notifications when app is open
 * @param {Object} options - Configuration options
 * @param {Function} options.onNotificationClick - Callback when notification is clicked
 * @param {Function} options.onReceive - Callback when notification is received in foreground
 * @param {boolean} options.showToasts - Whether to show toast notifications (default: true)
 */
export function useForegroundNotifications(options = {}) {
  const { onNotificationClick, onReceive, showToasts = true } = options;
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    let unsubscribe = null;

    const setupNotifications = async () => {
      try {
        unsubscribe = await onForegroundMessage((payload) => {
          const title = payload.notification?.title || payload.data?.title || 'Notification';
          const body = payload.notification?.body || payload.data?.body || '';
          const data = payload.data || {};

          // Invoke onReceive so callers can react (e.g., play a sound)
          if (typeof onReceive === 'function') {
            try {
              onReceive({ title, body, data, raw: payload });
            } catch (_) {
              // ignore handler errors
            }
          }

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
      } catch (error) {
        // Error setting up notification handler
      }
    };

    setupNotifications();

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current && typeof unsubscribeRef.current === 'function') {
        unsubscribeRef.current();
      }
    };
  }, [onNotificationClick, onReceive, showToasts]);

  return { unsubscribe: unsubscribeRef.current };
}
