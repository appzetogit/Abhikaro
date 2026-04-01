import { useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import BottomNavigation from "./BottomNavigation"
import { getUnreadDeliveryNotificationCount } from "../utils/deliveryNotifications"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { DeliveryNotificationsProvider } from "../context/DeliveryNotificationsContext"
import { useForegroundNotifications } from "@/lib/hooks/useForegroundNotifications"
import alertSound from "@/assets/audio/alert.mp3"

export default function DeliveryLayout({
  children,
  showGig = false,
  showPocket = false,
  onHomeClick,
  onGigClick
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [requestBadgeCount, setRequestBadgeCount] = useState(() =>
    getUnreadDeliveryNotificationCount()
  )

  // FIXED: Save current route to sessionStorage on route change (for refresh persistence)
  useEffect(() => {
    // Save current route to sessionStorage whenever it changes (for delivery module routes)
    if (location.pathname.startsWith('/delivery') && 
        location.pathname !== '/delivery/sign-in' && 
        location.pathname !== '/delivery/signup' &&
        !location.pathname.includes('/otp')) {
      sessionStorage.setItem('delivery_lastRoute', location.pathname)
    }
  }, [location.pathname])

  // FIXED: Restore saved route so user stays on same screen after refresh (not sent to feed)
  useEffect(() => {
    if (!isModuleAuthenticated("delivery")) return
    const savedRoute = sessionStorage.getItem('delivery_lastRoute')
    const currentPath = location.pathname
    const isFeedRoute = currentPath === '/delivery' || currentPath === '/delivery/'
    const isValidSavedRoute = savedRoute &&
      savedRoute.startsWith('/delivery') &&
      !savedRoute.includes('/sign-in') &&
      !savedRoute.includes('/signup') &&
      !savedRoute.includes('/otp')
    if (isFeedRoute && isValidSavedRoute && savedRoute !== currentPath) {
      // Restoring saved route after refresh
      navigate(savedRoute, { replace: true })
    }
  }, [location.pathname, navigate])

  // Handle foreground push notifications
  useForegroundNotifications({
    onNotificationClick: (data) => {
      // Navigate based on notification type
      if (data.type === 'new_order' || data.type === 'order_ready') {
        if (data.orderId) {
          navigate(`/delivery/order/${data.orderId}`);
        } else {
          navigate('/delivery');
        }
      }
    },
    showToasts: true,
    playSound: true
  });

  // If the Service Worker receives a push while the app has an open window,
  // it can postMessage to ask the UI to play alert.mp3 (best-effort).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const audio = new Audio(alertSound);
    audio.volume = 0.7;

    let userInteracted = false;
    const handleUserInteraction = () => {
      userInteracted = true;
      document.removeEventListener("click", handleUserInteraction);
      document.removeEventListener("touchstart", handleUserInteraction);
      document.removeEventListener("keydown", handleUserInteraction);
    };
    document.addEventListener("click", handleUserInteraction, { once: true });
    document.addEventListener("touchstart", handleUserInteraction, { once: true });
    document.addEventListener("keydown", handleUserInteraction, { once: true });

    const handleMessage = (event) => {
      const msg = event?.data;
      if (!msg || msg.type !== "PLAY_ALERT_SOUND") return;
      if (!userInteracted) return;

      try {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } catch {
        // ignore
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
      document.removeEventListener("click", handleUserInteraction);
      document.removeEventListener("touchstart", handleUserInteraction);
      document.removeEventListener("keydown", handleUserInteraction);
      try {
        audio.pause();
      } catch {
        // ignore
      }
    };
  }, []);

  // Update badge count when location changes
  useEffect(() => {
    setRequestBadgeCount(getUnreadDeliveryNotificationCount())

    // Listen for notification updates
    const handleNotificationUpdate = () => {
      setRequestBadgeCount(getUnreadDeliveryNotificationCount())
    }

    window.addEventListener('deliveryNotificationsUpdated', handleNotificationUpdate)
    window.addEventListener('storage', handleNotificationUpdate)

    return () => {
      window.removeEventListener('deliveryNotificationsUpdated', handleNotificationUpdate)
      window.removeEventListener('storage', handleNotificationUpdate)
    }
  }, [location.pathname, navigate])

  // Pages where bottom navigation should be shown
  const showBottomNav = [
    '/delivery',
    '/delivery/requests',
    '/delivery/trip-history',
    '/delivery/profile'
  ].includes(location.pathname)

  return (
    <DeliveryNotificationsProvider>
      <main>
        {children}
      </main>
      {showBottomNav && (
        <BottomNavigation
          showGig={showGig}
          showPocket={showPocket}
          onHomeClick={onHomeClick}
          onGigClick={onGigClick}
          requestBadgeCount={requestBadgeCount}
        />
      )}
    </DeliveryNotificationsProvider>
  )
}

