/**
 * LocationContext - Shared Location State
 * 
 * CRITICAL FIX for 429 errors:
 * Previously, every page that imported useLocation() created its OWN instance,
 * each starting geolocation watches, DB fetches, and reverse geocode API calls.
 * With 15+ pages doing this, it caused 45-120+ API calls on a single page load.
 * 
 * This context shares a SINGLE useLocation() instance across the entire user module.
 * All pages consume location data from this context instead of creating new hooks.
 */

import { createContext, useContext } from "react"
import { useLocation as useLocationHook } from "@/module/user/hooks/useLocation"

const LocationContext = createContext(null)

/**
 * LocationProvider - Wraps user module routes to provide shared location state.
 * Only ONE instance of useLocation() runs for the entire user module.
 */
export function LocationProvider({ children }) {
  const locationState = useLocationHook()
  
  return (
    <LocationContext.Provider value={locationState}>
      {children}
    </LocationContext.Provider>
  )
}

/**
 * useSharedLocation - Use this instead of useLocation() in page components.
 * Returns the same { location, loading, error, permissionGranted, requestLocation, ... }
 * 
 * Usage:
 *   import { useSharedLocation } from "@/lib/context/LocationContext"
 *   const { location, loading, requestLocation } = useSharedLocation()
 * 
 * Falls back to a safe empty state if used outside LocationProvider
 * (e.g., in restaurant/admin/delivery modules that don't need user location).
 */
export function useSharedLocation() {
  const context = useContext(LocationContext)
  
  if (!context) {
    // Safe fallback if used outside LocationProvider
    return {
      location: null,
      loading: false,
      error: null,
      permissionGranted: false,
      requestLocation: async () => null,
      startWatchingLocation: () => {},
      stopWatchingLocation: () => {},
    }
  }
  
  return context
}

export default LocationContext
