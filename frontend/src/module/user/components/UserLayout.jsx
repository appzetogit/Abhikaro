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
import { ChefHat, Clock } from "lucide-react"
import { BACKEND_ORIGIN } from "@/lib/api/config"
import { toast } from "sonner"
import { loadBusinessSettings, clearCache } from "@/lib/utils/businessSettings"
import MaintenanceScreen from "./MaintenanceScreen"

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

  const [settings, setSettings] = useState(null)
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false)
  const [checkingMaintenance, setCheckingMaintenance] = useState(true)
  const [offlineExpired, setOfflineExpired] = useState(false)

  // Offline popup blocks the app; lift it automatically when resume time arrives
  useEffect(() => {
    setOfflineExpired(false)
    const resumeAt = settings?.offlineMode?.resumeAt ? new Date(settings.offlineMode.resumeAt).getTime() : NaN
    if (!settings?.offlineMode?.isEnabled || !Number.isFinite(resumeAt)) return
    const delay = resumeAt - Date.now()
    if (delay > 2147483647) return // beyond setTimeout range; reload will re-check
    const t = setTimeout(() => setOfflineExpired(true), Math.max(0, delay))
    return () => clearTimeout(t)
  }, [settings])

  useEffect(() => {
    let active = true
    const checkMaintenanceMode = async () => {
      try {
        const data = await loadBusinessSettings()
        if (active) {
          setSettings(data)
          if (data?.maintenanceMode?.isEnabled) {
            setMaintenanceEnabled(true)
          }
        }
      } catch (err) {
        console.error("Failed to load business settings in UserLayout:", err)
      } finally {
        if (active) {
          setCheckingMaintenance(false)
        }
      }
    }

    checkMaintenanceMode()

    const handleSettingsUpdate = async () => {
      try {
        const data = await loadBusinessSettings()
        if (active) {
          setSettings(data)
          setMaintenanceEnabled(!!data?.maintenanceMode?.isEnabled)
        }
      } catch (err) {
        // ignore
      }
    }
    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)

    // Realtime: admin saves business settings -> backend emits -> refetch (works for guests too).
    // Refetch on every (re)connect as well, so a change missed while disconnected still applies.
    const refetchFresh = () => {
      clearCache()
      handleSettingsUpdate()
    }
    const settingsSocket = io(BACKEND_ORIGIN, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    })
    settingsSocket.on("business_settings_updated", refetchFresh)
    settingsSocket.io.on("reconnect", refetchFresh)

    return () => {
      active = false
      window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
      try {
        settingsSocket.disconnect()
      } catch {
        // ignore
      }
    }
  }, [])

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
          // useLocation's setManualLocation (saved address / search pick) writes sessionStorage "manualLocationOverride";
          // HotelMenuLanding writes the localStorage key. Honor both, otherwise GPS overwrites the picked address.
          const isManualOverride = (() => {
            try {
              return localStorage.getItem(MANUAL_OVERRIDE_STORAGE_KEY) === "true" ||
                sessionStorage.getItem("manualLocationOverride") === "true"
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

  if (checkingMaintenance) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (maintenanceEnabled) {
    return <MaintenanceScreen settings={settings} />;
  }

  const offlineResumeAt = settings?.offlineMode?.resumeAt ? new Date(settings.offlineMode.resumeAt) : null
  const showOfflinePopup = !offlineExpired && !!settings?.offlineMode?.isEnabled &&
    (!offlineResumeAt || offlineResumeAt.getTime() > Date.now())

  // Blocking: app pages are not rendered at all while offline
  if (showOfflinePopup) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 dark:from-[#1a0f05] dark:via-[#0a0a0a] dark:to-[#1a0f05] px-4" role="dialog" aria-modal="true" aria-labelledby="offline-title">
        <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white dark:bg-[#1a1a1a] shadow-2xl shadow-orange-500/20 ring-1 ring-orange-100 dark:ring-orange-900/40">
          <div className="relative bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 px-6 pt-8 pb-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30">
              <ChefHat className="h-8 w-8 text-white" strokeWidth={2} />
            </div>
            
          </div>
          <div className="-mt-5 rounded-t-3xl bg-white dark:bg-[#1a1a1a] px-6 pt-6 pb-7 text-center">
            <h2 id="offline-title" className="text-xl font-bold text-gray-900 dark:text-white">
              We&apos;re taking a short break
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Abhikaro Food is currently offline and not accepting orders. We&apos;ll be back soon with your favourite meals!
            </p>
            {offlineResumeAt && (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-950/30 px-4 py-3 text-left">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-orange-600 dark:text-orange-400">Back online on</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {offlineResumeAt.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            )}
            <p className="mt-5 text-xs text-gray-400">Thank you for your patience 🧡</p>
          </div>
        </div>
      </div>
    )
  }

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

