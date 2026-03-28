import { createContext, useContext, useMemo } from "react"
import { useLocation as useLocationHook } from "@/module/user/hooks/useLocation"
import { useZone as useZoneHook } from "@/module/user/hooks/useZone"

const LocationContext = createContext(null)

/**
 * LocationProvider - Wraps user module routes to provide shared location and zone state.
 * Only ONE instance of useLocation() and useZone() runs for the entire user module.
 */
export function LocationProvider({ children }) {
  // 1. Get location state (watching, DB updates, etc.)
  const locationState = useLocationHook()
  
  // 2. Get zone state (depends on location)
  // useZoneHook already has internal distance-based thresholds (200m)
  const zoneState = useZoneHook(locationState.location)
  
  // 3. Combine both states into a single context value
  const contextValue = useMemo(() => {
    return {
      ...locationState,
      ...zoneState,
      // Avoid name collisions if any, but hooks are designed to complement
      zoneLoading: zoneState.loading,
      locationLoading: locationState.loading
    }
  }, [locationState, zoneState])
  
  return (
    <LocationContext.Provider value={contextValue}>
      {children}
    </LocationContext.Provider>
  )
}

/**
 * useSharedLocation - Use this instead of useLocation() or useZone() in page components.
 * Returns both location data AND zone detection status.
 * 
 * Usage:
 *   const { location, zoneId, isInService, isOutOfService } = useSharedLocation()
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
      // Zone fallbacks
      zoneId: null,
      zone: null,
      zoneStatus: 'loading',
      isInService: false,
      isOutOfService: false,
      zoneLoading: false,
      refreshZone: () => {}
    }
  }
  
  return context
}

export default LocationContext
