import { useEffect, useRef } from 'react';
import { onForegroundMessage } from '../fcmService.js';
import { toast } from 'sonner';
import alertSound from '@/assets/audio/alert.mp3';

/**
 * Hook to handle foreground push notifications
 * Shows toast notifications when app is open
 * @param {Object} options - Configuration options
 * @param {Function} options.onNotificationClick - Callback when notification is clicked
 * @param {boolean} options.showToasts - Whether to show toast notifications (default: true)
 * @param {boolean} options.playSound - Whether to play alert sound on notification (default: false)
 */
export function useForegroundNotifications(options = {}) {
  const { onNotificationClick, showToasts = true, playSound = false } = options;
  const unsubscribeRef = useRef(null);
  const audioRef = useRef(null);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    let unsubscribe = null;

    const setupNotifications = async () => {
      try {
        unsubscribe = await onForegroundMessage((payload) => {
          const title = payload.notification?.title || payload.data?.title || 'Notification';
          const body = payload.notification?.body || payload.data?.body || '';
          const data = payload.data || {};

          // Broadcast an in-app event so modules (delivery/restaurant/admin/etc) can react
          // immediately (e.g., open an "accept order" popup) even when the notification
          // only contains an orderId.
          try {
            window.dispatchEvent(
              new CustomEvent('appForegroundNotification', {
                detail: {
                  title,
                  body,
                  data,
                  raw: payload,
                },
              }),
            );
          } catch {
            // ignore
          }

          // Play alert sound if enabled (best-effort; browsers require a prior user interaction)
          if (playSound) {
            try {
              if (!audioRef.current) {
                audioRef.current = new Audio(alertSound);
                audioRef.current.volume = 0.7;
              }
              if (userInteractedRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => {});
              }
            } catch {
              // ignore audio errors (autoplay policy, etc.)
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
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      } catch {
        // ignore
      }
    };
  }, [onNotificationClick, showToasts, playSound]);

  // Track first user interaction so audio playback is allowed by autoplay policies
  useEffect(() => {
    if (!playSound) return;

    const handleUserInteraction = () => {
      userInteractedRef.current = true;
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };

    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, [playSound]);

  return { unsubscribe: unsubscribeRef.current };
}
