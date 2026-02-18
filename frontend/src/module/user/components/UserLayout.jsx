import { Outlet, useLocation } from "react-router-dom"
import { useEffect, useState, createContext, useContext, lazy, Suspense, useMemo, useCallback } from "react"
import { ProfileProvider } from "../context/ProfileContext"
import LocationPrompt from "./LocationPrompt"
import { CartProvider } from "../context/CartContext"
import { OrdersProvider } from "../context/OrdersContext"
// Lazy load overlays to reduce initial bundle size
const SearchOverlay = lazy(() => import("./SearchOverlay"))
const LocationSelectorOverlay = lazy(() => import("./LocationSelectorOverlay"))
import BottomNavigation from "./BottomNavigation"
import DesktopNavbar from "./DesktopNavbar"

// Create SearchOverlay context with default value
const SearchOverlayContext = createContext({
  isSearchOpen: false,
  searchValue: "",
  setSearchValue: () => {
    console.warn("SearchOverlayProvider not available")
  },
  openSearch: () => {
    console.warn("SearchOverlayProvider not available")
  },
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

  useEffect(() => {
    // Reset scroll to top whenever location changes (pathname, search, or hash)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.pathname, location.search, location.hash])

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

  // Hide navigation components for hotel orders (QR redirect flow)
  const isHotelOrder = sessionStorage.getItem('isHotelOrder') === 'true'

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] transition-colors duration-200">
      <CartProvider>
        <ProfileProvider>
          <OrdersProvider>
            <SearchOverlayProvider>
              <LocationSelectorProvider>
                {/* <Navbar /> */}
                {!isHotelOrder && showBottomNav && <DesktopNavbar />}
                <LocationPrompt />
                <main>
                  <Outlet />
                </main>
                {!isHotelOrder && showBottomNav && <BottomNavigation />}
              </LocationSelectorProvider>
            </SearchOverlayProvider>
          </OrdersProvider>
        </ProfileProvider>
      </CartProvider>
    </div>
  )
}

