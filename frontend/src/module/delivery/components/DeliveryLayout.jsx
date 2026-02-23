import { useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import BottomNavigation from "./BottomNavigation"
import { getUnreadDeliveryNotificationCount } from "../utils/deliveryNotifications"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { DeliveryNotificationsProvider } from "../context/DeliveryNotificationsContext"
import { useForegroundNotifications } from "@/lib/hooks/useForegroundNotifications"

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
      console.log(`🔄 Restoring saved route after refresh: ${savedRoute}`)
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
    showToasts: true
  });

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

