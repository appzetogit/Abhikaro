import { useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import BottomNavigation from "./BottomNavigation"
import { getUnreadDeliveryNotificationCount } from "../utils/deliveryNotifications"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { DeliveryNotificationsProvider } from "../context/DeliveryNotificationsContext"
import { useForegroundNotifications } from "@/lib/hooks/useForegroundNotifications"
import alertSound from "@/assets/audio/alert.mp3"
import io from "socket.io-client"
import { BACKEND_ORIGIN } from "@/lib/api/config"
import { toast } from "sonner"

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

  // Background chat notifications (user <-> delivery)
  useEffect(() => {
    if (typeof window === "undefined") return

    const socketUrl = BACKEND_ORIGIN

    const getDeliveryIdFromStorage = () => {
      const directId = localStorage.getItem("delivery_id") || localStorage.getItem("deliveryId")
      if (directId) return directId.toString()

      const deliveryUserStr = localStorage.getItem("delivery_user")
      if (deliveryUserStr) {
        try {
          const deliveryUser = JSON.parse(deliveryUserStr)
          const id = deliveryUser?._id || deliveryUser?.id
          if (id) return id.toString()
        } catch {
          // ignore
        }
      }

      return null
    }

    const deliveryId = getDeliveryIdFromStorage()
    if (!deliveryId) return

    const socket = io(socketUrl, {
      path: "/socket.io/",
      transports: ["polling"],
      upgrade: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    })

    socket.on("connect", () => {
      socket.emit("join-delivery", deliveryId)
    })

    socket.on("new-message", (data) => {
      const msg = data?.message
      if (!msg) return

      // Only notify delivery partner when THEY are the receiver
      const receiverMatches =
        msg?.receiverType === "delivery" && String(msg?.receiverId || "") === String(deliveryId || "")
      if (!receiverMatches) return

      const orderIdForRoute = (data?.orderIdString || data?.orderId || msg?.orderId || "").toString()

      // If already on dedicated chat route for this order, don't toast.
      const isOnChatRoute =
        typeof location?.pathname === "string" &&
        location.pathname.startsWith("/delivery/chat/") &&
        location.pathname.includes(orderIdForRoute)
      if (isOnChatRoute) return

      const snippet = String(msg?.message || "").trim()
      toast("New message from customer", {
        description: snippet ? (snippet.length > 80 ? `${snippet.slice(0, 80)}…` : snippet) : undefined,
        action: orderIdForRoute
          ? {
              label: "Open chat",
              onClick: () => navigate(`/delivery/chat/${orderIdForRoute}`),
            }
          : undefined,
      })
    })

    return () => {
      try {
        socket.disconnect()
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      document.removeEventListener("click", handleUserInteraction, { capture: true });
      document.removeEventListener("touchstart", handleUserInteraction, { capture: true });
      document.removeEventListener("keydown", handleUserInteraction, { capture: true });
    };
    const gestureOpts = { once: true, capture: true };
    document.addEventListener("click", handleUserInteraction, gestureOpts);
    document.addEventListener("touchstart", handleUserInteraction, gestureOpts);
    document.addEventListener("keydown", handleUserInteraction, gestureOpts);

    const handleMessage = (event) => {
      const msg = event?.data;
      if (!msg || msg.type !== "PLAY_ALERT_SOUND") return;
      const data = msg?.data || {};
      const isDeliveryNewOrder =
        data?.channelId === "delivery_new_order" &&
        (data?.type === "new_order" || !!data?.orderId);
      if (!isDeliveryNewOrder) return;
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
      document.removeEventListener("click", handleUserInteraction, { capture: true });
      document.removeEventListener("touchstart", handleUserInteraction, { capture: true });
      document.removeEventListener("keydown", handleUserInteraction, { capture: true });
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

