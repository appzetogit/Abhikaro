import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, Search, ChevronRight, Plus, MapPin, MoreHorizontal, Navigation, Home, Building2, Briefcase, Phone, X, Crosshair } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useProfile } from "../context/ProfileContext"
import { toast } from "sonner"
import { locationAPI, userAPI } from "@/lib/api"
import { Loader } from '@googlemaps/js-api-loader'
import { useSharedLocation } from "@/lib/context/LocationContext"

// Google Maps implementation - Leaflet components removed

// Google Maps implementation - removed Leaflet components

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

export default function LocationSelectorOverlay({ isOpen, onClose }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [searchValue, setSearchValue] = useState("")
  const { location, loading, requestLocation, setManualLocation } = useSharedLocation()
  const { addresses = [], addAddress, updateAddress, userProfile } = useProfile()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [mapPosition, setMapPosition] = useState([22.7196, 75.8577]) // Default Indore coordinates [lat, lng]
  const [addressFormData, setAddressFormData] = useState({
    street: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    label: "Home",
    phone: "",
  })
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const mapContainerRef = useRef(null)
  const googleMapRef = useRef(null) // Google Maps instance
  // Green marker ref removed - using sticky center pin instead
  // const greenMarkerRef = useRef(null) 
  const blueDotCircleRef = useRef(null) // Blue dot circle for Google Maps
  const userLocationMarkerRef = useRef(null) // Blue dot marker for user location
  const userLocationAccuracyCircleRef = useRef(null) // Accuracy circle for MapLibre/Mapbox
  const watchPositionIdRef = useRef(null) // Geolocation watchPosition ID
  const lastUserLocationRef = useRef(null) // Last user location for tracking
  const locationUpdateTimeoutRef = useRef(null) // Timeout for location updates
  const [currentAddress, setCurrentAddress] = useState("")
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState("")
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchRequestIdRef = useRef(0)

  // Load Google Maps API key from backend
  useEffect(() => {
    import('@/lib/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)

        // Pre-load Google Maps SDK with Places library as soon as we have the key
        if (key) {
          const loader = new Loader({
            apiKey: key,
            version: "weekly",
            libraries: ["places"]
          })
          loader.load().catch(() => {})
        }
      })
    })
  }, [])
  const reverseGeocodeTimeoutRef = useRef(null) // Debounce timeout for reverse geocoding
  const lastReverseGeocodeCoordsRef = useRef(null) // Track last coordinates to avoid duplicate calls


  // Current location display - Show complete formatted address (SAVED ADDRESSES FORMAT)
  // Format should match saved addresses: "B2/4, Gandhi Park Colony, Anand Nagar, Indore, Madhya Pradesh, 452001"
  // Show ALL parts of formattedAddress (like saved addresses show all parts)
  const currentLocationText = (() => {
    // Priority 0: Use currentAddress from map (most up-to-date when user selects location on map)
    // This is updated when map moves or "Use current location" is clicked
    if (currentAddress &&
      currentAddress !== "Select location" &&
      !currentAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
      // Remove "India" from the end if present
      let fullAddress = currentAddress
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }
      return fullAddress
    }

    // Priority 1: Use addressFormData.additionalDetails (updated when map moves)
    // This contains the full formatted address from Google Maps Places API
    if (addressFormData.additionalDetails &&
      addressFormData.additionalDetails !== "Select location" &&
      addressFormData.additionalDetails.trim() !== "") {
      let fullAddress = addressFormData.additionalDetails
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }
      // Build complete address with all components
      const addressParts = [fullAddress]
      if (addressFormData.city) addressParts.push(addressFormData.city)
      if (addressFormData.state) {
        if (addressFormData.zipCode) {
          addressParts.push(`${addressFormData.state} ${addressFormData.zipCode}`)
        } else {
          addressParts.push(addressFormData.state)
        }
      } else if (addressFormData.zipCode) {
        addressParts.push(addressFormData.zipCode)
      }
      return addressParts.join(', ')
    }

    // Priority 2: Use formattedAddress from location hook (complete detailed address) - SAVED ADDRESSES FORMAT
    // Show full address with all parts (street, area, city, state, pincode) - just like saved addresses
    if (location?.formattedAddress &&
      location.formattedAddress !== "Select location" &&
      !location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
      // Remove "India" from the end if present (saved addresses don't show country)
      let fullAddress = location.formattedAddress
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }

      // Show complete address - ALL parts (like saved addresses format)
      // Saved addresses format: "additionalDetails, street, city, state, zipCode"
      // Current location format: "POI, Building, Floor, Area, City, State, Pincode"
      return fullAddress
    }

    // Priority 3: Build address from components (SAVED ADDRESSES FORMAT)
    // Format: "street/area, city, state, pincode" (matching saved addresses)
    if (location?.address || location?.area || location?.street) {
      const addressParts = []

      // Add street/address/area (like saved addresses' additionalDetails + street)
      if (location.address && location.address !== "Select location") {
        addressParts.push(location.address)
      } else if (location.area) {
        addressParts.push(location.area)
      } else if (location.street) {
        addressParts.push(location.street)
      }

      // Add city
      if (location.city) {
        addressParts.push(location.city)
      }

      // Add state
      if (location.state) {
        addressParts.push(location.state)
      }

      // Add pincode (like saved addresses show zipCode)
      if (location.postalCode) {
        addressParts.push(location.postalCode)
      }

      if (addressParts.length > 0) {
        return addressParts.join(', ')
      }
    }

    // Priority 3: Use area + city + state + pincode
    if (location?.area && location?.city && location?.state) {
      const parts = [location.area, location.city, location.state]
      if (location.postalCode) {
        parts.push(location.postalCode)
      }
      return parts.join(', ')
    }

    // Priority 4: Fallback to city + state + pincode
    if (location?.city && location?.state) {
      const parts = [location.city, location.state]
      if (location.postalCode) {
        parts.push(location.postalCode)
      }
      return parts.join(', ')
    }

    // Final fallback
    return location?.city || location?.area || "Detecting location..."
  })()

  useEffect(() => {
    const query = searchValue.trim()

    if (query.length < 3) {
      setSearchResults([])
      setSearchError("")
      setSearchLoading(false)
      return
    }

    const baseLat = location?.latitude || mapPosition?.[0]
    const baseLng = location?.longitude || mapPosition?.[1]
    if (!baseLat || !baseLng) {
      setSearchResults([])
      setSearchError("Current location unavailable")
      return
    }

    const requestId = ++searchRequestIdRef.current
    setSearchLoading(true)
    setSearchError("")

    const timer = setTimeout(async () => {
      try {
        let locations = []
        
        // Try Google Places Autocomplete first
        if (window.google && window.google.maps && window.google.maps.places && GOOGLE_MAPS_API_KEY) {
          try {
            const autocompleteService = new window.google.maps.places.AutocompleteService()
            const response = await new Promise((resolve) => {
              autocompleteService.getPlacePredictions({
                input: query,
                locationBias: { radius: 50000, center: { lat: baseLat, lng: baseLng } }, // 50km bias
                componentRestrictions: { country: 'in' }
              }, (predictions, status) => {
                if (status === "OK" && predictions) {
                  resolve(predictions)
                } else {
                  resolve([])
                }
              })
            })

            locations = response.map((p, idx) => {
              const mainText = p.structured_formatting?.main_text || p.description.split(',')[0]
              const secondaryText = p.structured_formatting?.secondary_text || ""
              
              // Include sub-locality in name if mainText is very short or generic
              const name = (mainText.length < 4 && secondaryText) 
                ? `${mainText}, ${secondaryText.split(',')[0]}` 
                : mainText

              return {
                id: p.place_id || `p_${idx}`,
                name: name,
                address: p.description || secondaryText || "", // Google full description
                isGoogle: true
              }
            })
          } catch (googleError) {
          }
        }

        // Fallback to backend Nominatim if Google found nothing OR is unavailable
        if (locations.length === 0) {
          const response = await locationAPI.getNearbyLocations(baseLat, baseLng, 5000, query)
          if (requestId !== searchRequestIdRef.current) return
          locations = response?.data?.data?.locations || []
        }

        if (requestId !== searchRequestIdRef.current) return
        setSearchResults(Array.isArray(locations) ? locations : [])
      } catch (error) {
        if (requestId !== searchRequestIdRef.current) return
        setSearchResults([])
        setSearchError("Address search failed. Please try again.")
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setSearchLoading(false)
        }
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [searchValue, location?.latitude, location?.longitude, mapPosition?.[0], mapPosition?.[1], GOOGLE_MAPS_API_KEY])

  // Global error suppression for legacy map SDK errors (runs on component mount)
  useEffect(() => {
    // Suppress console errors for non-critical map SDK errors
    const originalConsoleError = console.error
    const errorSuppressor = (...args) => {
      const errorStr = args.join(' ')
      // Suppress AbortError and sprite file errors from old map SDK integrations
      if (errorStr.includes('AbortError') ||
        errorStr.includes('user aborted') ||
        errorStr.includes('sprite@2x.json') ||
        errorStr.includes('3d_model') ||
        (errorStr.includes('Source layer') && errorStr.includes('does not exist')) ||
        (errorStr.includes('AJAXError') && errorStr.includes('sprite'))) {
        // Silently ignore these non-critical errors
        return
      }
      // Log other errors normally
      originalConsoleError.apply(console, args)
    }

    // Replace console.error globally
    console.error = errorSuppressor

    // Handle unhandled promise rejections
    const unhandledRejectionHandler = (event) => {
      const error = event.reason || event
      const errorMsg = error?.message || String(error) || ''
      const errorName = error?.name || ''
      const errorStack = error?.stack || ''

      // Suppress non-critical errors from old map SDK integrations
      if (errorName === 'AbortError' ||
        errorMsg.includes('AbortError') ||
        errorMsg.includes('user aborted') ||
        errorMsg.includes('3d_model') ||
        (errorMsg.includes('Source layer') && errorMsg.includes('does not exist')) ||
        (errorMsg.includes('AJAXError') && errorMsg.includes('sprite'))) {
        event.preventDefault() // Prevent error from showing in console
        return
      }
    }

    window.addEventListener('unhandledrejection', unhandledRejectionHandler)

    // Cleanup
    return () => {
      // Restore original console.error
      console.error = originalConsoleError
      // Remove event listener
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler)
    }
  }, []) // Run once on mount

  // Initialize map position from current location and update blue dot
  useEffect(() => {
    if (location?.latitude && location?.longitude && googleMapRef.current && window.google && window.google.maps) {
      const userPos = {
        lat: location.latitude,
        lng: location.longitude
      }

      const accuracyRadius = Math.max(location.accuracy || 50, 20)


      // Update or create blue dot marker
      if (userLocationMarkerRef.current) {
        try {
          if (userLocationMarkerRef.current.setPosition) {
            userLocationMarkerRef.current.setPosition(userPos)
          }
          // Ensure marker is visible and on map
          const currentMap = userLocationMarkerRef.current.getMap()
          if (currentMap !== googleMapRef.current) {
            userLocationMarkerRef.current.setMap(googleMapRef.current)
          }
          userLocationMarkerRef.current.setVisible(true)
        } catch (e) {
          // Recreate if update fails
          userLocationMarkerRef.current = null
        }
      }

      if (!userLocationMarkerRef.current) {
        // Create blue dot marker if it doesn't exist
        try {
          const blueDotMarker = new window.google.maps.Marker({
            position: userPos,
            map: googleMapRef.current,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#4285F4",
              fillOpacity: 1,
              strokeColor: "#FFFFFF",
              strokeWeight: 3,
            },
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 1,
            optimized: false,
            visible: true,
            title: "Your location"
          })
          userLocationMarkerRef.current = blueDotMarker
        } catch (e) {
        }
      }

      // Update or create accuracy circle
      if (blueDotCircleRef.current) {
        try {
          blueDotCircleRef.current.setCenter(userPos)
          blueDotCircleRef.current.setRadius(accuracyRadius)
          // Ensure circle is visible and on map
          const currentMap = blueDotCircleRef.current.getMap()
          if (currentMap !== googleMapRef.current) {
            blueDotCircleRef.current.setMap(googleMapRef.current)
          }
          blueDotCircleRef.current.setVisible(true)
        } catch (e) {
          // Recreate if update fails
          blueDotCircleRef.current = null
        }
      }

      if (!blueDotCircleRef.current) {
        // Create accuracy circle if it doesn't exist
        try {
          const blueDot = new window.google.maps.Circle({
            strokeColor: "#4285F4",
            strokeOpacity: 0.4,
            strokeWeight: 1,
            fillColor: "#4285F4",
            fillOpacity: 0.15,
            map: googleMapRef.current,
            center: userPos,
            radius: accuracyRadius,
            zIndex: window.google.maps.Marker.MAX_ZINDEX,
            visible: true
          })
          blueDotCircleRef.current = blueDot
        } catch (e) {
        }
      }

      // Final verification
      setTimeout(() => {
        const markerVisible = userLocationMarkerRef.current?.getVisible()
        const circleVisible = blueDotCircleRef.current?.getVisible()
        const markerOnMap = userLocationMarkerRef.current?.getMap() === googleMapRef.current
        const circleOnMap = blueDotCircleRef.current?.getMap() === googleMapRef.current
      }, 500)
    }
  }, [
    location?.latitude ?? null,
    location?.longitude ?? null,
    location?.accuracy ?? null
  ])

  // Initialize Google Maps with Loader (ZOMATO-STYLE)
  useEffect(() => {
    if (!showAddressForm || !mapContainerRef.current || !GOOGLE_MAPS_API_KEY) {
      return
    }

    // Check if map is already initialized to prevent re-creation on GPS updates
    if (googleMapRef.current && showAddressForm) {
      return
    }

    let isMounted = true
    setMapLoading(true)

    const initializeGoogleMap = async () => {
      try {
        const loader = new Loader({
          apiKey: GOOGLE_MAPS_API_KEY,
          version: "weekly",
          libraries: ["places"]
        })

        const google = await loader.load()

        if (!isMounted || !mapContainerRef.current) return

        // Initial location (Indore center or current location)
        const initialLocation = location?.latitude && location?.longitude
          ? { lat: location.latitude, lng: location.longitude }
          : { lat: 22.7196, lng: 75.8577 }

        // Create map
        const map = new google.maps.Map(mapContainerRef.current, {
          center: initialLocation,
          zoom: 15,
          mapTypeId: google.maps.MapTypeId?.TERRAIN || 'terrain',
          disableDefaultUI: true, // Zomato-style clean look
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy"
        })

        googleMapRef.current = map


        // Handle map move: Update address when map stops moving
        google.maps.event.addListener(map, 'idle', () => {
          const center = map.getCenter();
          const lat = center.lat();
          const lng = center.lng();
          setMapPosition([lat, lng]);
          handleMapMoveEnd(lat, lng);
        });

        // Initialize address for the starting position
        handleMapMoveEnd(initialLocation.lat, initialLocation.lng);

        // Function to create/update blue dot and accuracy circle
        const createBlueDotWithCircle = (position, accuracyValue) => {
          if (!isMounted || !map) return

          const userPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }

          const accuracyRadius = Math.max(accuracyValue || 50, 20) // Minimum 20m

          // Remove existing blue dot and circle if any
          if (userLocationMarkerRef.current) {
            try {
              userLocationMarkerRef.current.setMap(null)
            } catch (e) {
            }
          }
          if (blueDotCircleRef.current) {
            try {
              blueDotCircleRef.current.setMap(null)
            } catch (e) {
            }
          }

          // Create Blue Dot Marker (Google Maps native style)
          const blueDotMarker = new google.maps.Marker({
            position: userPos,
            map: map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10, // Blue dot size
              fillColor: "#4285F4", // Google blue
              fillOpacity: 1,
              strokeColor: "#FFFFFF", // White border
              strokeWeight: 3,
            },
            zIndex: google.maps.Marker.MAX_ZINDEX + 1,
            optimized: false,
            visible: true,
            title: "Your location"
          })

          // Create Accuracy Circle (Light blue zone around blue dot)
          const accuracyCircle = new google.maps.Circle({
            strokeColor: "#4285F4",
            strokeOpacity: 0.4,
            strokeWeight: 1,
            fillColor: "#4285F4",
            fillOpacity: 0.15, // Light transparent blue
            map: map,
            center: userPos,
            radius: accuracyRadius, // Meters
            zIndex: google.maps.Marker.MAX_ZINDEX,
            visible: true
          })

          blueDotCircleRef.current = accuracyCircle
          userLocationMarkerRef.current = blueDotMarker


          // Force visibility check (silent fix - no error logging)
          setTimeout(() => {
            if (!isMounted || !map) return

            const markerVisible = userLocationMarkerRef.current?.getVisible()
            const circleVisible = blueDotCircleRef.current?.getVisible()
            const markerOnMap = userLocationMarkerRef.current?.getMap() === map
            const circleOnMap = blueDotCircleRef.current?.getMap() === map

            // Silently fix marker visibility if needed
            if (userLocationMarkerRef.current && (!markerOnMap || !markerVisible)) {
              try {
                userLocationMarkerRef.current.setMap(map)
                userLocationMarkerRef.current.setVisible(true)
              } catch (e) {
                // Silently handle - marker might not be ready yet
              }
            }

            // Silently fix circle visibility if needed
            if (blueDotCircleRef.current && (!circleOnMap || !circleVisible)) {
              try {
                blueDotCircleRef.current.setMap(map)
                blueDotCircleRef.current.setVisible(true)
              } catch (e) {
                // Silently handle - circle might not be ready yet
              }
            }
          }, 1000)
        }

        // Wait for map to be fully ready before getting location
        google.maps.event.addListenerOnce(map, 'idle', () => {

          // Get user's current location and show Blue Dot
          if (navigator.geolocation) {
            // First, get current position immediately
            navigator.geolocation.getCurrentPosition(
              (position) => {
                if (!isMounted) return
                createBlueDotWithCircle(position, position.coords.accuracy)
                handleMapMoveEnd(initialLocation.lat, initialLocation.lng)
              },
              (error) => {
                handleMapMoveEnd(initialLocation.lat, initialLocation.lng)
              },
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
              }
            )

            // Then, watch for position updates (live tracking)
            const watchId = navigator.geolocation.watchPosition(
              (position) => {
                if (!isMounted) return
                createBlueDotWithCircle(position, position.coords.accuracy)
              },
              (error) => {
                // Suppress timeout errors - they're non-critical
                if (error.code !== 3) {
                }
              },
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000 // Allow 5 second old cached location
              }
            )

            // Store watch ID for cleanup
            watchPositionIdRef.current = watchId
          } else {
            handleMapMoveEnd(initialLocation.lat, initialLocation.lng)
          }
        })

        setMapLoading(false)
      } catch (error) {
        setMapLoading(false)
        toast.error("Failed to load map. Please refresh the page.")
      }
    }

    initializeGoogleMap()

    return () => {
      isMounted = false
      // Cleanup geolocation watch
      if (watchPositionIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchPositionIdRef.current)
        watchPositionIdRef.current = null
      }
      // Cleanup markers
      /* greenMarkerRef removed
      if (greenMarkerRef.current) {
        greenMarkerRef.current.setMap(null)
      }
      */
      if (userLocationMarkerRef.current) {
        try {
          userLocationMarkerRef.current.setMap(null)
        } catch (e) {
        }
      }
      if (blueDotCircleRef.current) {
        try {
          blueDotCircleRef.current.setMap(null)
        } catch (e) {
        }
      }
    }
  }, [showAddressForm, GOOGLE_MAPS_API_KEY, location?.latitude, location?.longitude])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  const handleUseCurrentLocation = async () => {
    try {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        toast.error("Location services are not supported in your browser", {
          duration: 3000,
        })
        return
      }

      // Show loading toast
      toast.loading("Fetching your current location...", {
        id: "location-request",
      })

      // Request location - this will automatically prompt for permission if needed
      // Clear any cached location first to ensure fresh coordinates

      // Increase timeout to 15 seconds to allow GPS to get accurate fix
      // The getLocation function already has a 15-second timeout, so we match it
      const locationPromise = requestLocation()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Location request is taking longer than expected. Please check your GPS settings.")), 15000)
      )

      let locationData
      try {
        locationData = await Promise.race([locationPromise, timeoutPromise])

        // Check if we got valid location data
        if (!locationData || (!locationData.latitude || !locationData.longitude)) {
          throw new Error("Invalid location data received")
        }
      } catch (raceError) {

        // If timeout or error, try to use cached location as fallback
        const stored = localStorage.getItem("userLocation")
        if (stored) {
          try {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              locationData = cachedLocation

              // Show info toast that we're using cached location
              toast.info("Using your last known location", {
                id: "location-request",
                duration: 2000,
              })
            } else {
              throw new Error("Invalid cached location")
            }
          } catch (cacheErr) {
            // Determine specific error message
            let errorMessage = "Could not get location. Please try again."
            if (raceError.message.includes("permission") || raceError.message.includes("denied")) {
              errorMessage = "Location permission denied. Please enable location access in your browser settings."
            } else if (raceError.message.includes("timeout") || raceError.message.includes("longer")) {
              errorMessage = "Location request timed out. Please check your GPS settings and try again."
            } else if (raceError.message.includes("unavailable")) {
              errorMessage = "Location information is unavailable. Please check your device settings."
            } else if (raceError.message.includes("403") || raceError.message.includes("googleapis")) {
              errorMessage = "Location service temporarily unavailable. Using GPS instead. Please wait..."
            }

            toast.error(errorMessage, {
              id: "location-request",
              duration: 5000,
            })
            return
          }
        } else {
          // No cached location available
          let errorMessage = "Could not get location. Please try again."
          if (raceError.message.includes("permission") || raceError.message.includes("denied")) {
            errorMessage = "Location permission denied. Please enable location access in your browser settings."
          } else if (raceError.message.includes("timeout") || raceError.message.includes("longer")) {
            errorMessage = "Location request timed out. Please check your GPS settings and try again."
          } else if (raceError.message.includes("unavailable")) {
            errorMessage = "Location information is unavailable. Please check your device settings."
          } else if (raceError.message.includes("403") || raceError.message.includes("googleapis")) {
            errorMessage = "Location service temporarily unavailable. Using GPS instead. Please wait..."
          }

          toast.error(errorMessage, {
            id: "location-request",
            duration: 5000,
          })
          return
        }
      }

      // Validate location data
      if (!locationData) {
        toast.error("Could not get location. Please try again.", { id: "location-request" })
        return
      }

      if (!locationData.latitude || !locationData.longitude) {
        toast.error("Invalid location data received. Please try again.", { id: "location-request" })
        return
      }

      // Verify we got complete address (but don't fail if incomplete - still use the location)
      if (!locationData?.formattedAddress ||
        locationData.formattedAddress === "Select location" ||
        locationData.formattedAddress.split(',').length < 4) {
        // Don't retry immediately - let the map handle address fetching
        // The address will be fetched when map moves to the location
      }

      // CRITICAL: Ensure location state is updated in the hook
      // The requestLocation function already updates the state, but we verify here

      // CRITICAL: Save location to localStorage immediately so it's available right away
      if (locationData?.latitude && locationData?.longitude) {
        try {
          localStorage.setItem("userLocation", JSON.stringify(locationData))
        } catch (storageError) {
        }
      }

      // Save location to backend with ALL fields (backend also saves to Firebase)
      if (locationData?.latitude && locationData?.longitude) {
        try {
          await userAPI.updateLocation({
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            address: locationData.address || locationData.formattedAddress || "",
            city: locationData.city || "",
            state: locationData.state || "",
            area: locationData.area || "",
            formattedAddress: locationData.formattedAddress || locationData.address || "",
            accuracy: locationData.accuracy,
            postalCode: locationData.postalCode,
            street: locationData.street,
            streetNumber: locationData.streetNumber
          })
        } catch (backendError) {
          // Only log non-network errors (network errors are handled by axios interceptor)
          if (backendError.code !== 'ERR_NETWORK' && backendError.message !== 'Network Error') {
          }
          // Don't fail the whole operation if backend save fails
        }

        // Also save directly to Firebase as backup (even if backend API fails)
        try {
          const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
          if (userToken) {
            try {
              const payload = JSON.parse(atob(userToken.split('.')[1]))
              const userId = payload._id || payload.id || payload.userId
              
              if (userId) {
                const { updateUserLocationInFirebase } = await import('@/lib/firebaseRealtime.js')
                await updateUserLocationInFirebase(userId, locationData.latitude, locationData.longitude, {
                  address: locationData.address || locationData.formattedAddress || "",
                  city: locationData.city || "",
                  state: locationData.state || "",
                  area: locationData.area || "",
                  formattedAddress: locationData.formattedAddress || locationData.address || "",
                  postalCode: locationData.postalCode,
                  accuracy: locationData.accuracy
                })
              }
            } catch (tokenErr) {
            }
          }
        } catch (firebaseErr) {
        }
      }

      // Update map position - don't automatically show address form
      // User can manually open address form if needed
      if (locationData?.latitude && locationData?.longitude) {
        setMapPosition([locationData.latitude, locationData.longitude])
        // Don't automatically show address form - keep user on same page
        // setShowAddressForm(true)

        // Update address form data with complete address (for when user opens form)
        if (locationData.formattedAddress) {
          setCurrentAddress(locationData.formattedAddress)
          setAddressFormData(prev => ({
            ...prev,
            street: locationData.street || locationData.area || prev.street,
            city: locationData.city || prev.city,
            state: locationData.state || prev.state,
            zipCode: locationData.postalCode || prev.zipCode,
            additionalDetails: locationData.formattedAddress || prev.additionalDetails,
          }))
        }

        // Update map if it's initialized
        if (googleMapRef.current && window.google && window.google.maps) {
          try {
            googleMapRef.current.panTo({ lat: locationData.latitude, lng: locationData.longitude })
            googleMapRef.current.setZoom(17)

            /* Green marker position update removed - center-aligned pin used instead */

            // Fetch detailed address using Places API
            setTimeout(async () => {
              await handleMapMoveEnd(locationData.latitude, locationData.longitude)
            }, 500)
          } catch (mapError) {
          }
        } else {
          // Map not initialized, fetch address directly
          setTimeout(async () => {
            await handleMapMoveEnd(locationData.latitude, locationData.longitude)
          }, 300)
        }
      }

      // Success toast with address preview
      const addressPreview = locationData?.formattedAddress || locationData?.address || "Location updated"
      toast.success(`Location updated: ${addressPreview.split(',').slice(0, 2).join(', ')}`, {
        id: "location-request",
        duration: 1500,
      })

      // Close overlay and navigate immediately so user sees the location updated
      onClose()
      navigate("/")
    } catch (error) {
      // Handle permission denied or other errors
      if (error.code === 1 || error.message?.includes("denied") || error.message?.includes("permission")) {
        toast.error("Location permission denied. Please enable location access in your browser settings.", {
          id: "location-request",
          duration: 4000,
        })
      } else if (error.code === 2 || error.message?.includes("unavailable")) {
        toast.error("Location unavailable. Please check your GPS settings.", {
          id: "location-request",
          duration: 3000,
        })
      } else if (error.code === 3 || error.message?.includes("timeout")) {
        toast.error("Location request timed out. Please try again.", {
          id: "location-request",
          duration: 3000,
        })
      } else if (error.message?.includes("403") || error.message?.includes("googleapis")) {
        // 403 error from Google's network location provider - try GPS only
        toast.info("Location service issue detected. Trying GPS-only mode...", {
          id: "location-request",
          duration: 3000,
        })
        // The hook will automatically retry with GPS-only mode
      } else {
        toast.error("Failed to get location. Please try again.", {
          id: "location-request",
          duration: 3000,
        })
      }
      // Don't close the selector if there's an error, so user can try other options
    }
  }

  const handleAddAddress = () => {
    setShowAddressForm(true)
    // Initialize form with current location data
    if (location?.latitude && location?.longitude) {
      setMapPosition([location.latitude, location.longitude])
      setAddressFormData(prev => ({
        ...prev,
        city: location.city || "",
        state: location.state || "",
        street: location.address || location.area || "",
        phone: userProfile?.phone || "",
      }))
    }
  }

  const handleSearchResultSelect = async (result) => {
    let lat = parseFloat(result?.latitude)
    let lng = parseFloat(result?.longitude)

    // Handle Google Places Results (they don't have lat/lng directly)
    if (result.isGoogle && window.google && window.google.maps) {
      setSearchLoading(true)
      try {
        const geocoder = new window.google.maps.Geocoder()
        const geocodeResult = await new Promise((resolve, reject) => {
          geocoder.geocode({ placeId: result.id }, (results, status) => {
            if (status === "OK" && results && results[0]) {
              resolve(results[0])
            } else {
              reject(new Error("Geocoding failed: " + status))
            }
          })
        })

        if (geocodeResult && geocodeResult.geometry && geocodeResult.geometry.location) {
          lat = geocodeResult.geometry.location.lat()
          lng = geocodeResult.geometry.location.lng()
        }
      } catch (err) {
        toast.error("Could not find exact location for this place.")
        setSearchLoading(false)
        return
      }
      setSearchLoading(false)
    }

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("Invalid location selected")
      return
    }
    // Move map to the search result (sticky pin stays at center)
    if (googleMapRef.current && window.google && window.google.maps) {
      try {
        googleMapRef.current.panTo({ lat, lng })
        googleMapRef.current.setZoom(17)
      } catch (mapError) {
        console.error("Error moving map:", mapError)
      }
    }

    setMapPosition([lat, lng])
    setCurrentAddress(result?.address || result?.name || "Locating...")
    setSearchValue(result?.address || result?.name || "")
    setShowSearchResults(false)

    // Trigger reverse geocode for this exact spot to get full House/Nagar details
    setTimeout(() => {
      handleMapMoveEnd(lat, lng)
    }, 500)

    setAddressFormData(prev => ({
      ...prev,
      street: result?.name || prev.street,
      additionalDetails: result?.address || prev.additionalDetails,
    }))

    const locationData = {
      latitude: lat,
      longitude: lng,
      address: result?.name || "",
      area: result?.address || "",
      formattedAddress: result?.address || "",
    }

    // Update the SINGLE shared location source so Home updates instantly (no reload needed)
    try {
      if (typeof setManualLocation === "function") {
        await setManualLocation(locationData, { updateDB: true, pauseWatchMs: 2500 })
      } else {
        localStorage.setItem("userLocation", JSON.stringify(locationData))
        try {
          await userAPI.updateLocation(locationData)
        } catch {}
      }
    } catch {}

    await handleMapMoveEnd(lat, lng)
    toast.success("Location selected")

    // Close + navigate home so user immediately sees updated location + zone-scoped data
    onClose()
    navigate("/")
  }

  const handleAddressFormChange = (e) => {
    setAddressFormData({
      ...addressFormData,
      [e.target.name]: e.target.value,
    })
  }

  // Google Maps loading is handled by the Loader in the initialization useEffect above

  // OLD OLA MAPS INITIALIZATION - REMOVED (Replaced with Google Maps Loader above)
  // All old Ola Maps/Leaflet code has been removed and replaced with Google Maps Loader implementation

  // Removed old useEffect that initialized Ola Maps - now using Google Maps Loader above
  // All old Ola Maps initialization code has been removed

  // Resize Google Map when container dimensions change
  useEffect(() => {
    if (googleMapRef.current && showAddressForm) {
      const resizeMap = () => {
        try {
          if (googleMapRef.current && typeof window.google !== 'undefined' && window.google.maps) {
            window.google.maps.event.trigger(googleMapRef.current, 'resize');
          }
        } catch (error) {
        }
      };

      const timer = setTimeout(() => {
        resizeMap();
      }, 300);

      window.addEventListener('resize', resizeMap);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', resizeMap);
      }
    }
  }, [showAddressForm])

  // Track user's live location with blue dot indicator
  const trackUserLocation = (mapInstance, sdkInstance) => {
    if (!navigator.geolocation) {
      return
    }


    // Clear any existing watchPosition
    if (watchPositionIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchPositionIdRef.current)
      watchPositionIdRef.current = null
    }

    // Helper function to calculate distance between two coordinates (in meters)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371e3 // Earth's radius in meters
      const φ1 = lat1 * Math.PI / 180
      const φ2 = lat2 * Math.PI / 180
      const Δφ = (lat2 - lat1) * Math.PI / 180
      const Δλ = (lon2 - lon1) * Math.PI / 180

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

      return R * c // Distance in meters
    }

    // Helper function to create/update marker (with throttling)
    const createOrUpdateMarker = (latitude, longitude, heading, accuracy = null) => {
      // Check if location changed significantly (at least 10 meters)
      if (lastUserLocationRef.current) {
        const distance = calculateDistance(
          lastUserLocationRef.current.latitude,
          lastUserLocationRef.current.longitude,
          latitude,
          longitude
        )

        // If distance is less than 10 meters, skip update (unless it's the first time)
        if (distance < 10) {
          // Only log occasionally to avoid console spam
          if (Math.random() < 0.1) { // Log 10% of skipped updates
          }
          return
        }

      }

      // Update last location
      lastUserLocationRef.current = { latitude, longitude, heading }

      // 1. Custom Blue Dot Element Banana
      let el = null
      if (userLocationMarkerRef.current) {
        // If marker exists, get its element
        el = userLocationMarkerRef.current.getElement?.() ||
          userLocationMarkerRef.current._element ||
          document.querySelector('.user-location-marker')
      }

      if (!el) {
        el = document.createElement('div')
        el.className = 'user-location-marker'
        // Ensure element is visible with inline styles (same pattern as green pin)
        el.style.cssText = `
          width: 20px;
          height: 20px;
          background-color: #4285F4;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(0,0,0,0.3);
          position: relative;
          z-index: 1001;
          display: block;
          visibility: visible;
          opacity: 1;
          cursor: default;
        `
      } else {
        // Ensure existing element styles are correct
        el.style.display = 'block'
        el.style.visibility = 'visible'
        el.style.opacity = '1'
        el.style.zIndex = '1001'
      }

      // 2. Update accuracy circle if it exists
      if (userLocationAccuracyCircleRef.current) {
        try {
          if (userLocationAccuracyCircleRef.current.update) {
            userLocationAccuracyCircleRef.current.update(latitude, longitude, accuracy)
          }
        } catch (circleError) {
        }
      }

      // 3. Agar marker pehle se hai to update karein, nahi to naya banayein
      if (userLocationMarkerRef.current) {
        try {
          if (userLocationMarkerRef.current.setLngLat) {
            userLocationMarkerRef.current.setLngLat([longitude, latitude])
          } else if (userLocationMarkerRef.current.setPosition) {
            userLocationMarkerRef.current.setPosition([longitude, latitude])
          } else {
          }
        } catch (error) {
        }
      } else {
        try {
          // Try different marker creation methods - EXACT SAME PATTERN AS GREEN PIN
          let newMarker = null

          // Method 1: Try SDK's addMarker method (EXACT SAME AS GREEN PIN)
          if (sdkInstance && sdkInstance.addMarker) {
            try {
              newMarker = sdkInstance.addMarker({
                element: el,
                anchor: 'center',
                draggable: false
              }).setLngLat([longitude, latitude]).addTo(mapInstance)
            } catch (err) {
            }
          }
          // Method 2: Try SDK's Marker class (EXACT SAME AS GREEN PIN)
          else if (sdkInstance && sdkInstance.Marker) {
            try {
              newMarker = new sdkInstance.Marker({
                element: el,
                anchor: 'center',
                draggable: false
              }).setLngLat([longitude, latitude]).addTo(mapInstance)
            } catch (err) {
            }
          }
          // Method 3: Try using MapLibre Marker (fallback - same as green pin)
          else if (window.maplibregl && window.maplibregl.Marker) {
            try {
              newMarker = new window.maplibregl.Marker({
                element: el,
                anchor: 'center'
              }).setLngLat([longitude, latitude]).addTo(mapInstance)
            } catch (err) {
            }
          }
          else {
          }

          if (newMarker) {
            userLocationMarkerRef.current = newMarker

            // Verify blue dot is visible (same pattern as green pin)
            setTimeout(() => {
              const markerEl = newMarker.getElement?.() || newMarker._element
              if (markerEl) {
                // Ensure element is visible (same as green pin)
                markerEl.style.display = 'block'
                markerEl.style.visibility = 'visible'
                markerEl.style.opacity = '1'
                markerEl.style.zIndex = '1001'

                // Also check the inner element (the actual blue dot div)
                const innerEl = markerEl.querySelector('.user-location-marker') || markerEl
                if (innerEl) {
                  innerEl.style.display = 'block'
                  innerEl.style.visibility = 'visible'
                  innerEl.style.opacity = '1'
                }
              } else {
              }
            }, 500)

            // Additional check after 1 second
            setTimeout(() => {
              const markerEl = newMarker.getElement?.() || newMarker._element
              if (markerEl) {
                // Ensure marker is still visible after animations/styles settle
                const computedStyle = window.getComputedStyle(markerEl)
                markerEl.style.display = computedStyle.display || 'block'
                markerEl.style.visibility = computedStyle.visibility || 'visible'
                markerEl.style.opacity = computedStyle.opacity || '1'
                markerEl.style.zIndex = computedStyle.zIndex || '1001'
              }
            }, 1000)

            // Create accuracy circle around blue dot (like Google Maps)
            const accuracyRadius = accuracy || 50 // Default to 50m if accuracy not available
            try {
              // Remove existing circle if any
              if (userLocationAccuracyCircleRef.current) {
                if (userLocationAccuracyCircleRef.current.remove) {
                  userLocationAccuracyCircleRef.current.remove()
                } else if (mapInstance.removeLayer) {
                  mapInstance.removeLayer(userLocationAccuracyCircleRef.current)
                }
              }

              // Try to create circle using MapLibre/Mapbox API
              if (mapInstance.addSource && mapInstance.addLayer) {
                const circleId = 'user-location-accuracy-circle'
                const sourceId = 'user-location-accuracy-circle-source'

                // Remove existing source/layer if present
                if (mapInstance.getLayer(circleId)) {
                  mapInstance.removeLayer(circleId)
                }
                if (mapInstance.getSource(sourceId)) {
                  mapInstance.removeSource(sourceId)
                }

                // Add circle source
                mapInstance.addSource(sourceId, {
                  type: 'geojson',
                  data: {
                    type: 'Feature',
                    geometry: {
                      type: 'Point',
                      coordinates: [longitude, latitude]
                    },
                    properties: {
                      radius: accuracyRadius
                    }
                  }
                })

                // Add circle layer
                // Convert meters to pixels: use zoom-based scaling
                // At zoom 15: ~1.2 meters per pixel, at zoom 18: ~0.15 meters per pixel
                mapInstance.addLayer({
                  id: circleId,
                  type: 'circle',
                  source: sourceId,
                  paint: {
                    'circle-radius': [
                      'interpolate',
                      ['exponential', 2],
                      ['zoom'],
                      10, ['/', accuracyRadius, 2],
                      15, ['/', accuracyRadius, 1.2],
                      18, ['/', accuracyRadius, 0.15],
                      20, ['/', accuracyRadius, 0.04]
                    ],
                    'circle-color': '#4285F4',
                    'circle-opacity': 0.15,
                    'circle-stroke-color': '#4285F4',
                    'circle-stroke-opacity': 0.4,
                    'circle-stroke-width': 1
                  }
                })

                userLocationAccuracyCircleRef.current = {
                  sourceId,
                  layerId: circleId,
                  update: (newLat, newLng, newAccuracy) => {
                    if (mapInstance.getSource(sourceId)) {
                      mapInstance.getSource(sourceId).setData({
                        type: 'Feature',
                        geometry: {
                          type: 'Point',
                          coordinates: [newLng, newLat]
                        },
                        properties: {
                          radius: newAccuracy || accuracyRadius
                        }
                      })
                    }
                  },
                  remove: () => {
                    if (mapInstance.getLayer(circleId)) {
                      mapInstance.removeLayer(circleId)
                    }
                    if (mapInstance.getSource(sourceId)) {
                      mapInstance.removeSource(sourceId)
                    }
                  }
                }

              }
            } catch (circleError) {
            }

            // Don't auto-fly to user location - let green pin stay at center
            // User can use "Use current location" button if needed
          } else {
          }
        } catch (markerError) {
        }
      }

      // 3. Arrow Direction (Heading) agar available ho
      // Heading is in degrees (0-360), where 0 is North
      if (heading !== null && heading !== undefined && !isNaN(heading)) {
        el.style.transform = `rotate(${heading}deg)`
      } else {
        // Reset transform if no heading
        el.style.transform = 'rotate(0deg)'
      }
    }

    // First, try to get current position immediately
    // Use a small delay to ensure map is fully ready
    setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, heading } = position.coords
          createOrUpdateMarker(latitude, longitude, heading, position.coords.accuracy)

          // Then start watching for updates (with throttling)
          watchPositionIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              const { latitude, longitude, heading, accuracy } = position.coords

              // Clear any pending update
              if (locationUpdateTimeoutRef.current) {
                clearTimeout(locationUpdateTimeoutRef.current)
              }

              // Throttle updates - only process after 2 seconds of no new updates
              locationUpdateTimeoutRef.current = setTimeout(() => {
                // Only log significant updates to avoid console spam
                if (!lastUserLocationRef.current ||
                  calculateDistance(
                    lastUserLocationRef.current.latitude,
                    lastUserLocationRef.current.longitude,
                    latitude,
                    longitude
                  ) >= 10) {
                }
                createOrUpdateMarker(latitude, longitude, heading, accuracy)
              }, 2000) // Wait 2 seconds before processing update
            },
            (error) => {
              // Suppress timeout errors - they're non-critical and will retry
              if (error.code === 3) {
                // Timeout - silently ignore, will retry automatically
                return
              } else if (error.code === 1) {
              } else if (error.code === 2) {
              }
              // Don't log timeout errors repeatedly
            },
            {
              enableHighAccuracy: false, // Less strict for better compatibility
              timeout: 30000, // Longer timeout (30 seconds)
              maximumAge: 60000 // Allow cached location up to 1 minute old
            }
          )
        },
        (error) => {
          // Suppress timeout errors - they're non-critical
          if (error.code === 3) {
            // Timeout - try to use cached location or continue without location

            // Try to get cached location from localStorage
            try {
              const cachedLocation = localStorage.getItem("userLocation")
              if (cachedLocation) {
                const location = JSON.parse(cachedLocation)
                if (location.latitude && location.longitude) {
                  createOrUpdateMarker(location.latitude, location.longitude, null, location.accuracy)
                }
              }
            } catch (cacheError) {
              // Ignore cache errors
            }
          } else if (error.code === 1) {
          } else if (error.code === 2) {
          } else {
            // Only log non-timeout errors
          }

          // Even if initial location fails, try watchPosition with less strict options
          watchPositionIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              const { latitude, longitude, heading, accuracy } = position.coords

              // Clear any pending update
              if (locationUpdateTimeoutRef.current) {
                clearTimeout(locationUpdateTimeoutRef.current)
              }

              // Throttle updates - only process after 2 seconds of no new updates
              locationUpdateTimeoutRef.current = setTimeout(() => {
                // Only log significant updates to avoid console spam
                if (!lastUserLocationRef.current ||
                  calculateDistance(
                    lastUserLocationRef.current.latitude,
                    lastUserLocationRef.current.longitude,
                    latitude,
                    longitude
                  ) >= 10) {
                }
                createOrUpdateMarker(latitude, longitude, heading, accuracy)
              }, 2000) // Wait 2 seconds before processing update
            },
            (error) => {
              // Suppress timeout errors in watchPosition too
              if (error.code === 3) {
                // Timeout - silently ignore, will retry
                return
              } else if (error.code === 1) {
              }
              // Don't log other errors repeatedly
            },
            {
              enableHighAccuracy: false, // Less strict for better compatibility
              timeout: 30000, // Longer timeout
              maximumAge: 60000 // Allow cached location up to 1 minute old
            }
          )
        },
        {
          enableHighAccuracy: false, // Less strict for better compatibility
          timeout: 30000, // Longer timeout (30 seconds)
          maximumAge: 60000 // Allow cached location up to 1 minute old
        }
      )
    }, 500) // Small delay to ensure map is ready

  }

  const handleMapMoveEnd = async (lat, lng) => {
    // Round coordinates to 6 decimal places (about 10cm precision) to avoid duplicate calls
    const roundedLat = parseFloat(lat.toFixed(6))
    const roundedLng = parseFloat(lng.toFixed(6))

    // Check if this is the same location as last call
    if (lastReverseGeocodeCoordsRef.current) {
      const lastLat = parseFloat(lastReverseGeocodeCoordsRef.current.lat.toFixed(6))
      const lastLng = parseFloat(lastReverseGeocodeCoordsRef.current.lng.toFixed(6))
      if (lastLat === roundedLat && lastLng === roundedLng) {
        return
      }
    }

    // Clear any pending timeout
    if (reverseGeocodeTimeoutRef.current) {
      clearTimeout(reverseGeocodeTimeoutRef.current)
    }

    // Debounce: Wait 500ms before making the API call (increased to reduce API calls)
    reverseGeocodeTimeoutRef.current = setTimeout(async () => {
      // Update last coordinates
      lastReverseGeocodeCoordsRef.current = { lat: roundedLat, lng: roundedLng }

      setLoadingAddress(true)
      try {
        let formattedAddress = ""
        let city = ""
        let state = ""
        let area = ""
        let street = ""
        let streetNumber = ""
        let postalCode = ""
        let pointOfInterest = ""
        let premise = ""
        let building = ""

        // Try Google Maps Geocoding first (much more detailed for India)
        let googleSuccess = false
        if (window.google && window.google.maps && GOOGLE_MAPS_API_KEY) {
          try {
            const geocoder = new window.google.maps.Geocoder()
            const response = await new Promise((resolve, reject) => {
              geocoder.geocode({ location: { lat: roundedLat, lng: roundedLng } }, (results, status) => {
                if (status === "OK" && results && results[0]) {
                  resolve(results[0])
                } else {
                  reject(new Error("Google geocoding failed: " + status))
                }
              })
            })

            if (response) {
              formattedAddress = response.formatted_address || ""
              const components = response.address_components || []
              
              // Extract components accurately from Google
              const getComp = (type) => components.find(c => c.types.includes(type))?.long_name || ""
              
              streetNumber = getComp("street_number") || getComp("subpremise") || getComp("premise")
              street = getComp("route") || getComp("sublocality_level_2")
              const neighborhood = getComp("neighborhood") || getComp("sublocality_level_1")
              const sublocality = getComp("sublocality")
              city = getComp("locality") || getComp("administrative_area_level_2")
              state = getComp("administrative_area_level_1")
              postalCode = getComp("postal_code")
              pointOfInterest = getComp("point_of_interest") || getComp("establishment")
              premise = getComp("premise")
              area = neighborhood || sublocality || ""
              
              // Build custom detailed address for India: "House/Building, Gali/Street, Nagar/Colony, City"
              const detailParts = []
              
              // 1. House Number / Building
              const houseAndBuilding = [streetNumber, premise || pointOfInterest].filter(Boolean).join(', ')
              if (houseAndBuilding) detailParts.push(houseAndBuilding)
              
              // 2. Street / Road
              if (street && !houseAndBuilding.toLowerCase().includes(street.toLowerCase())) {
                detailParts.push(street)
              }
              
              // 3. Nagar / Sublocality (Crucial for user)
              // Filter out generic administrative terms like "Nagar Tahsil"
              const nagar = (neighborhood || sublocality || area || "").replace(/\s+Nagar Tahsil/i, '').trim()
              if (nagar && nagar.length > 2 && !detailParts.some(p => p.toLowerCase().includes(nagar.toLowerCase()))) {
                detailParts.push(nagar)
              }
              
              // 4. District / City
              const cityClean = (city || "").replace(/\s+Nagar Tahsil/i, '').trim()
              if (cityClean && !detailParts.some(p => p.toLowerCase().includes(cityClean.toLowerCase()))) {
                detailParts.push(cityClean)
              }

              // Combine detailed parts
              if (detailParts.length > 0) {
                // If we have specific details, use our custom string for the start
                const baseInfo = detailParts.join(', ')
                // Add pincode if available
                formattedAddress = baseInfo + (postalCode ? `, ${postalCode}` : '')
              }
              
              googleSuccess = true
            }
          } catch (googleError) {
          }
        }

        // If Google failed or not available, fallback to backend Nominatim API
        if (!googleSuccess) {
          try {
            // Always use backend reverse geocode to avoid direct Google billing
            const response = await locationAPI.reverseGeocode(roundedLat, roundedLng)
            const backendData = response?.data?.data
            const result = backendData?.results?.[0] || backendData?.result?.[0] || null

            if (result) {
              formattedAddress = result.formatted_address || result.formattedAddress || ""
              const addressComponents = result.address_components || {}
              city = addressComponents.city || ""
              state = addressComponents.state || ""
              area = addressComponents.area || addressComponents.suburb || addressComponents.neighbourhood || ""
              // Optional extra fields if backend provides them
              street = addressComponents.road || addressComponents.street || street
              streetNumber = addressComponents.houseNumber || addressComponents.streetNumber || streetNumber
              postalCode = addressComponents.postcode || addressComponents.postalCode || postalCode
              pointOfInterest = addressComponents.building || addressComponents.landmark || addressComponents.pointOfInterest || pointOfInterest
              premise = addressComponents.premise || ""
              
              // Reconstruct a more detailed address if possible (In India, specific to general)
              const addressParts = []
              
              // 1. Building/House Name/Number
              const houseInfo = [addressComponents.houseNumber, building || pointOfInterest].filter(Boolean).join(', ')
              if (houseInfo) addressParts.push(houseInfo)
              
              // 2. Street/Road
              if (street && !houseInfo.includes(street)) addressParts.push(street)
              
              // 3. Sublocality/Neighborhood (Nagar/Colony)
              const sublocality = addressComponents.neighbourhood || addressComponents.suburb || addressComponents.sublocality || ""
              if (sublocality && !addressParts.some(p => p.includes(sublocality))) addressParts.push(sublocality)
              
              // 4. Area (fallback if different from sublocality)
              if (area && !addressParts.some(p => p.includes(area))) addressParts.push(area)
              
              // Combine these parts for a highly detailed base
              const detailedBase = addressParts.join(', ')
              
              // If our detailed base is longer or has more info than the first parts of formattedAddress, let's use it
              if (detailedBase && formattedAddress) {
                const formattedParts = formattedAddress.split(',').map(p => p.trim())
                // If the first part of formattedAddress is just the city or general area, replace it with our detailed base
                if (formattedParts.length > 0 && (formattedParts[0] === city || formattedParts[0] === area || formattedParts[0].length < 5)) {
                  // Keep the rest of formattedAddress (city, state, etc)
                  const restOfAddress = formattedParts.slice(1).join(', ')
                  formattedAddress = detailedBase + (restOfAddress ? ', ' + restOfAddress : '')
                } else if (!formattedAddress.includes(detailedBase.split(',')[0])) {
                  // If the detailed base isn't in there, prepend it if it's not redundant
                  formattedAddress = detailedBase + ', ' + formattedAddress
                }
              } else if (detailedBase) {
                // Fallback if formattedAddress is missing
                const tail = [city, state, postalCode].filter(Boolean).join(', ')
                formattedAddress = detailedBase + (tail ? ', ' + tail : '')
              }
            }
          } catch (backendError) {
          }
        }

        if (formattedAddress || city || state) {
          // Build complete address if we have components (already done above, but keeping fallback)
          if (!formattedAddress || formattedAddress.split(',').length < 3) {
            // Build from components (fallback)
            const fallbackParts = []
            if (pointOfInterest) fallbackParts.push(pointOfInterest)
            if (premise && premise !== pointOfInterest) fallbackParts.push(premise)
            const st = (streetNumber ? `${streetNumber}, ` : '') + (street || '')
            if (st) fallbackParts.push(st)
            if (area) fallbackParts.push(area)
            if (city) fallbackParts.push(city)
            if (state) {
              if (postalCode) fallbackParts.push(`${state} ${postalCode}`)
              else fallbackParts.push(state)
            }
            formattedAddress = fallbackParts.join(', ')
          }

          // Set street from formatted address if not set
          if (!street && formattedAddress) {
            const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)
            if (parts.length > 0) {
              street = parts[0]
            }
          }

          // Set area if not set
          if (!area) {
            area = pointOfInterest || premise || street || ""
          }

          // Deduplicate and clean up formattedAddress (e.g. remove repeating cities and 'India')
          if (formattedAddress) {
            const parts = formattedAddress.split(',').map(p => p.trim()).filter(Boolean);
            const uniqueParts = [];
            
            parts.forEach(part => {
              if (part.toLowerCase() === 'india') return; // Remove India
              
              // Normalize by removing common suffixes for comparison
              const normalize = (str) => str.toLowerCase()
                  .replace(/\s+(city|tahsil|tehsil|district)$/, '')
                  .trim();
                  
              const normalizedPart = normalize(part);
              
              // Check if we already have this part
              const isDuplicate = uniqueParts.some(existing => normalize(existing) === normalizedPart);
              
              if (!isDuplicate) {
                uniqueParts.push(part);
              }
            });
            formattedAddress = uniqueParts.join(', ');
          }

          // Update current address display
          setCurrentAddress(formattedAddress || `${roundedLat.toFixed(6)}, ${roundedLng.toFixed(6)}`)

          // Update form data
          // Store FULL formatted address in additionalDetails (Address details field) - this is what user sees
          // This should be the complete address with all parts: POI, Building, Floor, Area, City, State, Pincode
          const fullAddressForField = formattedAddress ||
            (pointOfInterest && city && state ? `${pointOfInterest}, ${city}, ${state}` : '') ||
            (premise && city && state ? `${premise}, ${city}, ${state}` : '') ||
            (street && city && state ? `${street}, ${city}, ${state}` : '') ||
            (area && city && state ? `${area}, ${city}, ${state}` : '') ||
            (city && state ? `${city}, ${state}` : '') ||
            ''

          setAddressFormData(prev => ({
            ...prev,
            street: street || prev.street,
            city: city || prev.city,
            state: state || prev.state,
            zipCode: postalCode || prev.zipCode,
            additionalDetails: fullAddressForField || prev.additionalDetails, // Store FULL address in Address details field
          }))
        } else {
          console.warn("⚠️ No address data found from Google Maps or backend")
          setCurrentAddress(`${roundedLat.toFixed(6)}, ${roundedLng.toFixed(6)}`)
        }
      } catch (error) {
        setCurrentAddress(`${roundedLat.toFixed(6)}, ${roundedLng.toFixed(6)}`)
        // Don't show error toast, just use coordinates
      } finally {
        setLoadingAddress(false)
      }
    }, 300) // 300ms debounce delay
  }

  const handleUseCurrentLocationForAddress = async () => {
    try {
      if (!navigator.geolocation) {
        toast.error("Location services are not supported")
        return
      }

      toast.loading("Getting your fresh location...", { id: "current-location" })

      // Use Promise.race to get location within 2 seconds
      const locationPromise = requestLocation(true, true) // forceFresh = true, updateDB = true
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Location timeout")), 2000)
      )

      let locationData
      try {
        locationData = await Promise.race([locationPromise, timeoutPromise])
      } catch (raceError) {
        // If timeout, try to use cached location immediately
        const stored = localStorage.getItem("userLocation")
        if (stored) {
          try {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              locationData = cachedLocation
            } else {
              throw new Error("Invalid cached location")
            }
          } catch (cacheErr) {
            toast.error("Could not get location. Please try again.", { id: "current-location" })
            return
          }
        } else {
          toast.error("Could not get location. Please try again.", { id: "current-location" })
          return
        }
      }

      if (!locationData?.latitude || !locationData?.longitude) {
        toast.error("Could not get your location. Please try again.", { id: "current-location" })
        return
      }

      const lat = parseFloat(locationData.latitude)
      const lng = parseFloat(locationData.longitude)

      if (isNaN(lat) || isNaN(lng)) {
        toast.error("Invalid location coordinates", { id: "current-location" })
        return
      }

      setMapPosition([lat, lng])

      // Update Google Maps to new location
      if (googleMapRef.current && window.google && window.google.maps) {
        try {

          // Pan to current location
          googleMapRef.current.panTo({ lat, lng })
          googleMapRef.current.setZoom(17)

          /* Green marker position update removed - center-aligned pin used instead */

          // Update blue dot marker position
          if (userLocationMarkerRef.current) {
            if (userLocationMarkerRef.current.setPosition) {
              userLocationMarkerRef.current.setPosition({ lat, lng })
            } else if (userLocationMarkerRef.current.setMap) {
              // Marker exists but might not be on map, ensure it's visible
              userLocationMarkerRef.current.setMap(googleMapRef.current)
              if (userLocationMarkerRef.current.setPosition) {
                userLocationMarkerRef.current.setPosition({ lat, lng })
              }
            }
          } else if (googleMapRef.current && window.google) {
            // Create blue dot if it doesn't exist
            const blueDotMarker = new window.google.maps.Marker({
              position: { lat, lng },
              map: googleMapRef.current,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: "#4285F4",
                fillOpacity: 1,
                strokeColor: "#FFFFFF",
                strokeWeight: 4,
              },
              zIndex: window.google.maps.Marker.MAX_ZINDEX + 1,
              optimized: false,
              visible: true
            })
            userLocationMarkerRef.current = blueDotMarker
          }

          // Update blue dot accuracy circle position
          if (blueDotCircleRef.current) {
            blueDotCircleRef.current.setCenter({ lat, lng })
            // Update radius if accuracy is available
            const accuracyRadius = Math.max(locationData?.accuracy || 50, 20)
            blueDotCircleRef.current.setRadius(accuracyRadius)
          } else if (googleMapRef.current && window.google) {
            // Create accuracy circle if it doesn't exist
            const accuracyRadius = Math.max(locationData?.accuracy || 50, 20)
            const blueDot = new window.google.maps.Circle({
              strokeColor: "#4285F4",
              strokeOpacity: 0.5,
              strokeWeight: 2,
              fillColor: "#4285F4",
              fillOpacity: 0.2,
              map: googleMapRef.current,
              center: { lat, lng },
              radius: accuracyRadius,
              zIndex: window.google.maps.Marker.MAX_ZINDEX,
              visible: true
            })
            blueDotCircleRef.current = blueDot
          }

          // Wait for map to finish moving, then fetch address (reduced delay for faster response)
          setTimeout(async () => {
            await handleMapMoveEnd(lat, lng)
            toast.success("Location updated!", { id: "current-location" })
          }, 200)

        } catch (mapError) {
          console.error("❌ Error updating map location:", mapError)
          toast.error("Failed to update map location", { id: "current-location" })
        }
      } else {
        // Map not initialized yet, just update position and fetch address (reduced delay)
        setTimeout(async () => {
          await handleMapMoveEnd(lat, lng)
          toast.success("Location updated!", { id: "current-location" })
        }, 200)
      }
    } catch (error) {

      // Check if it's a timeout error
      if (error.message && (error.message.includes("timeout") || error.message.includes("Timeout"))) {
        // Try to use cached location from localStorage
        try {
          const stored = localStorage.getItem("userLocation")
          if (stored) {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              setMapPosition([cachedLocation.latitude, cachedLocation.longitude])

              // Update Google Maps with cached location
              if (googleMapRef.current && window.google && window.google.maps) {
                try {
                  googleMapRef.current.panTo({ lat: cachedLocation.latitude, lng: cachedLocation.longitude });
                  googleMapRef.current.setZoom(17);

                  /* Green marker position update removed - center-aligned pin used instead */
                  if (blueDotCircleRef.current) {
                    blueDotCircleRef.current.setCenter({ lat: cachedLocation.latitude, lng: cachedLocation.longitude });
                  }

                  setTimeout(async () => {
                    await handleMapMoveEnd(cachedLocation.latitude, cachedLocation.longitude);
                    toast.success("Using cached location", { id: "current-location" });
                  }, 500);
                } catch (mapErr) {
                  toast.warning("Location request timed out. Please try again.", { id: "current-location" });
                }
              } else {
                setTimeout(async () => {
                  await handleMapMoveEnd(cachedLocation.latitude, cachedLocation.longitude)
                  toast.success("Using cached location", { id: "current-location" })
                }, 300)
              }
              return
            }
          }
        } catch (cacheErr) {
        }

        toast.warning("Location request timed out. Please try again or check your GPS settings.", { id: "current-location" })
      } else {
        toast.error("Failed to get current location: " + (error.message || "Unknown error"), { id: "current-location" })
      }
    }
  }

  const handleAddressFormSubmit = async (e) => {
    e.preventDefault()

    // Validate required fields (zipCode is optional)
    if (!addressFormData.street || !addressFormData.city || !addressFormData.state) {
      toast.error("Please fill in all required fields (Street, City, State)")
      return
    }

    // Validate that we have coordinates
    if (!mapPosition || mapPosition.length !== 2 || !mapPosition[0] || !mapPosition[1]) {
      toast.error("Please select a location on the map")
      return
    }

    setLoadingAddress(true)
    try {
      // Prepare address data matching backend format
      // Backend expects: label, street, additionalDetails, city, state, zipCode, latitude, longitude
      // Backend label enum: ['Home', 'Office', 'Other'] - not 'Work'
      // mapPosition is [latitude, longitude]

      // Validate and normalize label to match backend enum
      let normalizedLabel = addressFormData.label || "Home"
      if (normalizedLabel === "Work") {
        normalizedLabel = "Office" // Convert Work to Office to match backend enum
      }
      if (!["Home", "Office", "Other"].includes(normalizedLabel)) {
        normalizedLabel = "Other" // Fallback to Other if invalid
      }

      // Validate that trimmed fields are not empty
      const trimmedStreet = addressFormData.street.trim()
      const trimmedCity = addressFormData.city.trim()
      const trimmedState = addressFormData.state.trim()

      if (!trimmedStreet || !trimmedCity || !trimmedState) {
        toast.error("Street, City, and State cannot be empty")
        setLoadingAddress(false)
        return
      }

      const addressToSave = {
        label: normalizedLabel,
        street: trimmedStreet,
        additionalDetails: (addressFormData.additionalDetails || "").trim(),
        city: trimmedCity,
        state: trimmedState,
        zipCode: (addressFormData.zipCode || "").trim(),
        latitude: mapPosition[0], // latitude from mapPosition[0]
        longitude: mapPosition[1], // longitude from mapPosition[1]
      }

      // Check if an address with the same label already exists
      const existingAddressWithSameLabel = addresses.find(addr => addr.label === normalizedLabel)

      if (existingAddressWithSameLabel) {
        // Update existing address instead of creating a new one
        await updateAddress(existingAddressWithSameLabel.id, addressToSave)
        toast.success(`Address updated for ${normalizedLabel}!`)
      } else {
        // Create new address
        await addAddress(addressToSave)
        toast.success(`Address saved as ${normalizedLabel}!`)
      }

      // Reset form
      setAddressFormData({
        street: "",
        city: "",
        state: "",
        zipCode: "",
        additionalDetails: "",
        label: "Home",
        phone: "",
      })
      setShowAddressForm(false)
      setLoadingAddress(false)

      // Close overlay and redirect to home page
      onClose()
      navigate("/")
    } catch (error) {
      // Show more detailed error message
      let errorMessage = "Failed to add address. Please try again."
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.response?.status === 400) {
        errorMessage = "Invalid address data. Please check all fields."
      } else if (error.response?.status === 500) {
        errorMessage = "Server error. Please try again later."
      }

      toast.error(errorMessage)
      setLoadingAddress(false)
    }
  }

  const handleCancelAddressForm = () => {
    setShowAddressForm(false)
    setAddressFormData({
      street: "",
      city: "",
      state: "",
      zipCode: "",
      additionalDetails: "",
      label: "Home",
      phone: "",
    })
    onClose() // Ensure the overlay is closed
    navigate("/")
  }

  const handleSelectSavedAddress = async (address) => {
    try {
      // Get coordinates from address location
      const coordinates = address.location?.coordinates || []
      const longitude = coordinates[0]
      const latitude = coordinates[1]

      if (latitude && longitude) {
        // Update location in backend
        await userAPI.updateLocation({
          latitude,
          longitude,
          address: `${address.street}, ${address.city}`,
          city: address.city,
          state: address.state,
          area: address.additionalDetails || "",
          formattedAddress: `${address.street}, ${address.city}, ${address.state}`
        })
      }

      // Update the location in localStorage with this address
      const locationData = {
        city: address.city,
        state: address.state,
        address: `${address.street}, ${address.city}`,
        area: address.additionalDetails || "",
        zipCode: address.zipCode,
        latitude,
        longitude,
        formattedAddress: `${address.street}, ${address.city}, ${address.state}`
      }
      localStorage.setItem("userLocation", JSON.stringify(locationData))

      // Update map position to show selected address
      setMapPosition([latitude, longitude])

      // Update address form data with selected address
      setAddressFormData({
        street: address.street || "",
        city: address.city || "",
        state: address.state || "",
        zipCode: address.zipCode || "",
        additionalDetails: address.additionalDetails || "",
        label: address.label || "Home",
        phone: address.phone || "",
      })

      // Update Google Maps to show selected address
      if (googleMapRef.current && window.google && window.google.maps) {
        try {
          googleMapRef.current.panTo({ lat: latitude, lng: longitude })
          googleMapRef.current.setZoom(17)

          /* Green marker position update removed - center-aligned pin used instead */

          // Fetch and update address details
          setTimeout(async () => {
            await handleMapMoveEnd(latitude, longitude)
            toast.success("Location updated!", { id: "saved-address" })
          }, 500)
        } catch (mapError) {
          console.error("Error updating map:", mapError)
          toast.success("Location updated!", { id: "saved-address" })
        }
      } else {
        // Map not initialized yet, just fetch address
        setTimeout(async () => {
          await handleMapMoveEnd(latitude, longitude)
          toast.success("Location updated!", { id: "saved-address" })
        }, 300)
      }

      // Don't close overlay - keep user on select location page
      // onClose()
      // window.location.reload()
    } catch (error) {
      console.error("Error selecting saved address:", error)
      toast.error("Failed to update location. Please try again.")
    }
  }

  // Calculate distance for saved addresses
  const getAddressDistance = (address) => {
    if (!location?.latitude || !location?.longitude) return "0 m"

    const coordinates = address.location?.coordinates || []
    const addressLng = coordinates[0]
    const addressLat = coordinates[1]

    if (!addressLat || !addressLng) return "0 m"

    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      addressLat,
      addressLng
    )

    return distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`
  }

  const handleEditAddress = (addressId) => {
    // Edit address functionality removed - user can delete and add new address instead
    toast.info("To edit address, please delete and add a new one")
  }

  if (!isOpen) return null

  // If showing address form, render full-screen address form
  if (showAddressForm) {
    return (
      <div className="fixed inset-0 z-[10000] bg-white dark:bg-[#0a0a0a] flex flex-col h-screen max-h-screen overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 pt-5 pb-3 sm:pt-4">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCancelAddressForm}
              className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            </Button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Select delivery location</h1>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-green-600 z-10" />
            <Input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onFocus={() => setShowSearchResults(true)}
              placeholder="Search for area, street name..."
              className="pl-12 pr-4 h-12 w-full bg-gray-50 dark:bg-[#2a2a2a] border-gray-200 dark:border-gray-700 focus:border-green-600 dark:focus:border-green-600 rounded-xl"
            />
          </div>
        </div>

        {/* Search Results List (Overlays or pushes map) */}
        {showSearchResults && searchValue.trim().length >= 3 && (
          <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 max-h-64 overflow-y-auto z-50">
            {searchLoading ? (
              <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                Searching addresses...
              </div>
            ) : searchError ? (
              <div className="px-4 py-3 text-sm text-red-500">
                {searchError}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                No addresses found
              </div>
            ) : (
              searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSearchResultSelect(result)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-800 first:border-t-0"
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {result.name || "Selected location"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {result.address}
                  </p>
                </button>
              ))
            )}
          </div>
        )}

        {/* Map Section - Google Maps */}
        <div className="flex-shrink-0 relative" style={{ height: '40vh', minHeight: '300px' }}>
          {/* Google Maps Container */}
          <div
            ref={mapContainerRef}
            className="w-full h-full bg-gray-200 dark:bg-gray-800"
            style={{
              width: '100%',
              height: '100%',
              minHeight: '300px',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 1
            }}
          />

          {/* Sticky Centered Pin */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(100%-2px)] z-10 pointer-events-none mb-0 flex flex-col items-center">
            <div className="relative group">
              {/* Green Pin Head */}
              <div className="relative mb-0.5">
                <MapPin 
                  className="h-10 w-10 text-green-600 fill-green-600 drop-shadow-xl z-20" 
                  strokeWidth={2.5} 
                />
              </div>
              {/* Point Indicator/Shadow on Map */}
              <div className="w-1.5 h-1.5 bg-green-800 rounded-full mx-auto shadow-inner ring-1 ring-white/50"></div>
            </div>
          </div>

          {/* Loading State */}
          {mapLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900 bg-opacity-75 z-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading map...</p>
              </div>
            </div>
          )}

          {/* API Key Missing Error */}
          {!GOOGLE_MAPS_API_KEY && !mapLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900 z-20">
              <div className="text-center p-4">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Google Maps API key not found</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Please set VITE_GOOGLE_MAPS_API_KEY in .env file</p>
              </div>
            </div>
          )}

          {/* Use Current Location Button */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
            <Button
              onClick={handleUseCurrentLocationForAddress}
              disabled={mapLoading}
              className="bg-white dark:bg-[#1a1a1a] border-2 border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 shadow-lg disabled:opacity-50 flex items-center gap-2 px-4 py-2"
            >
              <Crosshair className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" strokeWidth={2.5} />
              <span className="text-green-600 dark:text-green-400 font-medium">Use current location</span>
            </Button>
          </div>
        </div>

        {/* Form Section - Scrollable */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0a0a0a] min-h-0 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="px-4 py-4 space-y-4 pb-32">
            {/* Delivery Details */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                Delivery details
              </Label>
              <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-center gap-3">
                <MapPin className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300 break-words">
                    {loadingAddress ? "Locating..." : (
                      currentAddress 
                        ? currentAddress
                        : (addressFormData.city && addressFormData.state)
                          ? `${addressFormData.city}, ${addressFormData.state}`
                          : "Select location on map"
                    )}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>



            {/* Save Address As */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                Save address as
              </Label>
              <div className="flex gap-2">
                {["Home", "Office", "Other"].map((label) => (
                  <Button
                    key={label}
                    type="button"
                    onClick={() => setAddressFormData(prev => ({ ...prev, label }))}
                    variant={addressFormData.label === label ? "default" : "outline"}
                    className={`flex-1 ${addressFormData.label === label
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-white dark:bg-[#1a1a1a]"
                      }`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Hidden required fields for form validation */}
            <div className="hidden">
              <Input
                name="street"
                value={addressFormData.street}
                onChange={handleAddressFormChange}
                required
              />
              <Input
                name="city"
                value={addressFormData.city}
                onChange={handleAddressFormChange}
                required
              />
              <Input
                name="state"
                value={addressFormData.state}
                onChange={handleAddressFormChange}
                required
              />
              {/* zipCode is optional, not required */}
              <Input
                name="zipCode"
                value={addressFormData.zipCode || ""}
                onChange={handleAddressFormChange}
              />
            </div>
          </div>
        </div>

        {/* Save Address Button */}
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 px-4 py-4">
          <form onSubmit={handleAddressFormSubmit}>
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
              disabled={loadingAddress}
            >
              {loadingAddress ? "Loading..." : "Save address"}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#0a0a0a]"
      style={{
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4 sm:pt-5">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                onClose()
                navigate("/")
              }}
              className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 -ml-2"
            >
              <ChevronLeft className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            </Button>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Select a location</h1>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] px-4 sm:px-6 lg:px-8 py-3 max-w-7xl mx-auto w-full">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary-orange z-10" />
          <Input
            ref={inputRef}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setShowSearchResults(true)}
            placeholder="Search for area, street name..."
            className="pl-12 pr-4 h-12 w-full bg-gray-50 dark:bg-[#2a2a2a] border-gray-200 dark:border-gray-700 focus:border-primary-orange dark:focus:border-primary-orange rounded-xl text-base dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Search Results */}
      {showSearchResults && searchValue.trim().length >= 3 && (
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 max-h-64 overflow-y-auto">
          {searchLoading ? (
            <div className="px-4 sm:px-6 lg:px-8 py-3 text-sm text-gray-500 dark:text-gray-400">
              Searching addresses...
            </div>
          ) : searchError ? (
            <div className="px-4 sm:px-6 lg:px-8 py-3 text-sm text-red-500">
              {searchError}
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-4 sm:px-6 lg:px-8 py-3 text-sm text-gray-500 dark:text-gray-400">
              No addresses found
            </div>
          ) : (
            searchResults.map((result) => (
              <button
                key={result.id}
                onClick={() => handleSearchResultSelect(result)}
                className="w-full text-left px-4 sm:px-6 lg:px-8 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-800 first:border-t-0"
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {result.name || "Selected location"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {result.address}
                </p>
                {result.distance && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    {result.distance}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
        <div className="max-w-7xl mx-auto w-full pb-6">
          {/* Use Current Location */}
          <div
            className="px-4 sm:px-6 lg:px-8 py-2 bg-white dark:bg-[#1a1a1a]"
            style={{ animation: 'slideDown 0.3s ease-out 0.1s both' }}
          >
            <button
              onClick={handleUseCurrentLocation}
              disabled={loading}
              className="w-full flex items-center justify-between py-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-colors">
                  <Crosshair className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" strokeWidth={2.5} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-green-700 dark:text-green-400">Use current location</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {loading ? "Getting location..." : currentLocationText}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </button>

            {/* Add Address */}
            <button
              onClick={handleAddAddress}
              className="w-full flex items-center justify-between py-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors group border-t border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-colors">
                  <Plus className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <p className="font-semibold text-green-700 dark:text-green-400">Add Address</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </button>
          </div>

          {/* Saved Addresses Section */}
          {addresses.length > 0 && (
            <div
              className="mt-2"
              style={{ animation: 'slideDown 0.3s ease-out 0.2s both' }}
            >
              <div className="px-4 sm:px-6 lg:px-8 py-3">
                <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider uppercase">
                  Saved Addresses
                </h2>
              </div>
              <div className="bg-white dark:bg-[#1a1a1a]">
                {addresses
                  .filter((address, index, self) => {
                    // Filter out duplicate addresses with same label - keep only first occurrence
                    const firstIndex = self.findIndex(addr => addr.label === address.label)
                    return index === firstIndex
                  })
                  .map((address, index) => {
                    const IconComponent = getAddressIcon(address)
                    return (
                      <div
                        key={address.id}
                        className="px-4 sm:px-6 lg:px-8"
                        style={{ animation: `slideUp 0.3s ease-out ${0.25 + index * 0.05}s both` }}
                      >
                        <div
                          className={`py-4 ${index !== 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}
                        >
                          <button
                            onClick={() => handleSelectSavedAddress(address)}
                            className="w-full flex items-start gap-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors p-2 -m-2"
                          >
                            <div className="flex flex-col items-center">
                              <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <IconComponent className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {address.label || address.additionalDetails || "Home"}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {[
                                  address.additionalDetails,
                                  address.street,
                                  address.city,
                                  address.state,
                                  address.zipCode
                                ].filter(Boolean).join(", ")}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                Phone number: {address.phone || userProfile?.phone || "Not provided"}
                              </p>
                            </div>
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        /* Blue Dot Indicator for Live Location */
        .user-location-marker {
          width: 20px !important;
          height: 20px !important;
          background-color: #4285F4 !important; /* Google Blue */
          border: 3px solid white !important;
          border-radius: 50% !important;
          box-shadow: 0 0 10px rgba(0,0,0,0.3) !important;
          position: relative !important;
          transition: transform 0.3s ease;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          z-index: 1001 !important;
          pointer-events: none;
        }
        
        /* Ensure marker container is also visible */
        .mapboxgl-marker.user-location-marker,
        .maplibregl-marker.user-location-marker {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          z-index: 1001 !important;
        }
        
        /* Arrow indicator pointing in direction of movement */
        .user-location-marker::before {
          content: "";
          position: absolute;
          top: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-bottom: 8px solid #4285F4;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
        }
        
        /* Pulsing Aura Effect */
        .user-location-marker::after {
          content: "";
          position: absolute;
          width: 40px;
          height: 40px;
          top: -13px;
          left: -13px;
          background-color: rgba(66, 133, 244, 0.2);
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}



