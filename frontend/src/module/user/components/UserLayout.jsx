import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState, createContext, useContext, lazy, Suspense, useMemo, useCallback } from "react"
import { ProfileProvider } from "../context/ProfileContext"
import { CartProvider } from "../context/CartContext"
import { OrdersProvider } from "../context/OrdersContext"
// Lazy load overlays to reduce initial bundle size
const SearchOverlay = lazy(() => import("./SearchOverlay"))
const LocationSelectorOverlay = lazy(() => import("./LocationSelectorOverlay"))
import BottomNavigation from "./BottomNavigation"
import DesktopNavbar from "./DesktopNavbar"
import ReplaceCartDialog from "./ReplaceCartDialog"
import { useForegroundNotifications } from "@/lib/hooks/useForegroundNotifications"
import { useSharedLocation } from "@/lib/context/LocationContext"
import io from "socket.io-client"
import { BACKEND_ORIGIN } from "@/lib/api/config"
import { toast } from "sonner"

// Create SearchOverlay context with default value
const SearchOverlayContext = createContext({
  isSearchOpen: false,
  searchValue: "",
  setSearchValue: () => {},
  openSearch: () => {},
  closeSearch: () => { }
})

export function useSearchOverlay() {
  const context = useContext(SearchOverlayContext)
  // Always return context, even if provider is not available (will use default values)
  return context
}

function SearchOverlayProvider({ children }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const openSearch = useCallback(() => {
    setIsSearchOpen(true)
  }, [])

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false)
    setSearchValue("")
  }, [])

  const value = useMemo(() => ({
    isSearchOpen,
    searchValue,
    setSearchValue,
    openSearch,
    closeSearch
  }), [isSearchOpen, searchValue, openSearch, closeSearch])

  return (
    <SearchOverlayContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {isSearchOpen && (
          <SearchOverlay
            isOpen={isSearchOpen}
            onClose={closeSearch}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
          />
        )}
      </Suspense>
    </SearchOverlayContext.Provider>
  )
}

// Create LocationSelector context with default value
const LocationSelectorContext = createContext({
  isLocationSelectorOpen: false,
  openLocationSelector: () => {
    console.warn("LocationSelectorProvider not available")
  },
  closeLocationSelector: () => { }
})

export function useLocationSelector() {
  const context = useContext(LocationSelectorContext)
  if (!context) {
    throw new Error("useLocationSelector must be used within LocationSelectorProvider")
  }
  return context
}

function LocationSelectorProvider({ children }) {
  const [isLocationSelectorOpen, setIsLocationSelectorOpen] = useState(false)

  const openLocationSelector = useCallback(() => {
    setIsLocationSelectorOpen(true)
  }, [])

  const closeLocationSelector = useCallback(() => {
    setIsLocationSelectorOpen(false)
  }, [])

  const value = useMemo(() => ({
    isLocationSelectorOpen,
    openLocationSelector,
    closeLocationSelector
  }), [isLocationSelectorOpen, openLocationSelector, closeLocationSelector])

  return (
    <LocationSelectorContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {isLocationSelectorOpen && (
          <LocationSelectorOverlay
            isOpen={isLocationSelectorOpen}
            onClose={closeLocationSelector}
          />
        )}
      </Suspense>
    </LocationSelectorContext.Provider>
  )
}

export default function UserLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { requestLocation, refreshZone } = useSharedLocation()
  const MANUAL_OVERRIDE_STORAGE_KEY = "userLocation_manualOverride"

  // Background chat notifications (delivery <-> user)
  useEffect(() => {
    // Only run on client
    if (typeof window === "undefined") return

    const socketUrl = BACKEND_ORIGIN
    const getUserIdFromStorage = () => {
      const directId = localStorage.getItem("user_id") || localStorage.getItem("userId")
      if (directId) return directId.toString()

      const userUserStr = localStorage.getItem("user_user")
      if (userUserStr) {
        try {
          const userUser = JSON.parse(userUserStr)
          const id = userUser?._id || userUser?.id
          if (id) return id.toString()
        } catch {
          // ignore
        }
      }

      const userProfileStr = localStorage.getItem("userProfile")
      if (userProfileStr) {
        try {
          const userProfile = JSON.parse(userProfileStr)
          const id = userProfile?._id || userProfile?.id
          if (id) return id.toString()
        } catch {
          // ignore
        }
      }
      return null
    }

    const userId = getUserIdFromStorage()
    if (!userId) return

    const socket = io(socketUrl, {
      path: "/socket.io/",
      // Prefer WebSockets for instant notifications, fallback to polling
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    })

    socket.on("connect", () => {
      socket.emit("join-user", userId)
    })

    socket.on("new-message", (data) => {
      const msg = data?.message
      if (!msg) return

      // Only notify user when THEY are the receiver
      const receiverMatches =
        msg?.receiverType === "user" && String(msg?.receiverId || "") === String(userId || "")
      if (!receiverMatches) return

      // If already inside this order chat, don't toast.
      const orderIdForRoute = (data?.orderIdString || data?.orderId || msg?.orderId || "").toString()
      const isOnChatRoute =
        typeof location?.pathname === "string" &&
        location.pathname.includes("/orders/") &&
        location.pathname.includes("/chat") &&
        location.pathname.includes(orderIdForRoute)
      if (isOnChatRoute) return

      const snippet = String(msg?.message || "").trim()
      toast("New message from delivery partner", {
        description: snippet ? (snippet.length > 80 ? `${snippet.slice(0, 80)}…` : snippet) : undefined,
        action: orderIdForRoute
          ? {
              label: "Open chat",
              onClick: () => navigate(`/user/orders/${orderIdForRoute}/chat`),
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
    // We intentionally do NOT re-init on location changes; socket stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle foreground push notifications
  useForegroundNotifications({
    onNotificationClick: (data) => {
      // Navigate based on notification type
      if (data.type === 'order_placed' || data.type === 'restaurant_accepted' || 
          data.type === 'order_ready' || data.type === 'out_for_delivery' || 
          data.type === 'order_delivered') {
        if (data.orderId) {
          navigate(`/user/orders/${data.orderId}`);
        }
      }
    },
    showToasts: true
  });

  useEffect(() => {
    // Reset scroll to top whenever location changes (pathname, search, or hash)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.pathname, location.search, location.hash])

  // Handle tab switching - restore session when tab becomes visible again
  useEffect(() => {
    const emitAppRefresh = (source) => {
      try {
        window.dispatchEvent(new CustomEvent('app:refresh', { detail: { source } }))
      } catch {
        // ignore environments without CustomEvent support
      }
    }

    const handleAppBecameActive = async (source) => {
      // When tab becomes visible again, check and restore session if needed
      if (document.hidden) return
        const { isModuleAuthenticated } = await import("@/lib/utils/auth")
        const { restoreUserSession } = await import("@/lib/utils/auth")
        
        // Only restore if user was authenticated but token might have expired
        // Don't force logout if session restoration fails
        if (!isModuleAuthenticated('user')) {
          try {
            await restoreUserSession()
          } catch (error) {
            // Silently fail - don't logout user if restore fails
            // User might still be logged in via refresh token cookie
            console.warn("Session restoration on tab switch failed:", error)
          }
        }

        // Android WebView "in-app refresh" / returning to foreground / focus restore:
        // 1) refresh GPS + zone detection (best-effort, silent),
        // 2) emit an explicit app-level refresh signal for pages like Home to refetch.
        try {
          refreshZone?.()
          // If user manually selected a location, do NOT auto-refresh GPS and overwrite it.
          const isManualOverride = (() => {
            try {
              return localStorage.getItem(MANUAL_OVERRIDE_STORAGE_KEY) === "true"
            } catch {
              return false
            }
          })()

          if (!isManualOverride) {
            // requestLocation() forces a fresh location fetch; it internally falls back to cached location.
            requestLocation?.().catch(() => {})
          }
        } catch {
          // ignore
        }
        emitAppRefresh(source)
    }

    const handleVisibilityChange = () => handleAppBecameActive('visibilitychange')
    const handleFocus = () => handleAppBecameActive('focus')
    const handlePageShow = (e) => {
      // `pageshow` fires on initial load and BFCache restores; treat both as refresh opportunities.
      // When persisted=true, browser restored from back/forward cache.
      handleAppBecameActive(e?.persisted ? 'pageshow:bfcache' : 'pageshow')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  // Note: Authentication checks and redirects are handled by ProtectedRoute components
  // UserLayout should not interfere with authentication redirects

  // Show bottom navigation only on home page, dining page, under-250 page, profile page, and restaurant pages
  const showBottomNav = useMemo(() => 
    location.pathname === "/" ||
    location.pathname === "/user" ||
    location.pathname === "/dining" ||
    location.pathname === "/user/dining" ||
    location.pathname === "/under-250" ||
    location.pathname === "/user/under-250" ||
    location.pathname === "/profile" ||
    location.pathname === "/user/profile" ||
    location.pathname.startsWith("/user/profile") ||
    location.pathname.startsWith("/restaurants/"),
    [location.pathname]
  )

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] transition-colors duration-200">
      <CartProvider>
        <ProfileProvider>
          <OrdersProvider>
            <SearchOverlayProvider>
              <LocationSelectorProvider>
                {/* Desktop navbar (hidden on pages where showBottomNav is false) */}
                {showBottomNav && <DesktopNavbar />}
                <ReplaceCartDialog />
                <main>
                  <Outlet />
                </main>
                {showBottomNav && <BottomNavigation />}
              </LocationSelectorProvider>
            </SearchOverlayProvider>
          </OrdersProvider>
        </ProfileProvider>
      </CartProvider>
    </div>
  )
}

