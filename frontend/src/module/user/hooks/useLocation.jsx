/* @refresh reset */
import { useState, useEffect, useRef } from "react"
import { locationAPI, userAPI } from "@/lib/api"

export function useLocation() {
  const MOVEMENT_UPDATE_THRESHOLD_METERS = 200
  const UI_COORD_CHANGE_THRESHOLD_METERS = 10
  const SAME_POINT_DEDUPE_MIN_METERS = 20

  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const manualOverrideUntilRef = useRef(0)
  const manualOverrideEnabledRef = useRef(false)
  const MANUAL_OVERRIDE_STORAGE_KEY = "userLocation_manualOverride"

  const watchIdRef = useRef(null)
  const updateTimerRef = useRef(null)
  const prevLocationCoordsRef = useRef({ latitude: null, longitude: null })
  const anchorLocationRef = useRef({ latitude: null, longitude: null }) // Anchor point for 200m rule
  const retryCountRef = useRef(0) // Track retry attempts for reverse geocoding
  const isFetchingLocationRef = useRef(false) // Prevent multiple simultaneous location fetches
  const hasInitializedRef = useRef(false) // Prevent multiple initializations
  const lastSavedLocationRef = useRef({ latitude: null, longitude: null }) // Store last saved location for distance check
  const lastProcessedCoordsRef = useRef({ latitude: null, longitude: null })

  // Helper to check if user is authenticated (used to decide live watch / DB updates)
  const isUserAuthenticated = () => {
    const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
    return !!userToken && userToken !== 'null' && userToken !== 'undefined'
  }

  /* ===================== DISTANCE CALCULATION (HAVERSINE FORMULA) ===================== */
  // Calculate distance between two coordinates in meters
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }

  const hasMovedBeyondThreshold = (fromLat, fromLng, toLat, toLng, thresholdMeters) => {
    if (
      fromLat === null ||
      fromLng === null ||
      toLat === null ||
      toLng === null
    ) {
      return true
    }
    const movedDistance = calculateDistance(fromLat, fromLng, toLat, toLng)
    return movedDistance >= thresholdMeters
  }

  /* ===================== DB UPDATE (LIVE LOCATION TRACKING) ===================== */
  const updateLocationInDB = async (locationData) => {
    try {
      // CRITICAL: Always save coordinates to Firebase even if address is placeholder
      // Coordinates are valid and useful for order calculations, even without address
      // Address can be retried later without losing coordinates
      if (!locationData?.latitude || !locationData?.longitude) {
        return;
      }

      // Only persist if user has moved meaningfully from the last saved anchor.
      const anchor = anchorLocationRef.current
      if (
        anchor.latitude !== null &&
        anchor.longitude !== null &&
        !hasMovedBeyondThreshold(
          anchor.latitude,
          anchor.longitude,
          locationData.latitude,
          locationData.longitude,
          MOVEMENT_UPDATE_THRESHOLD_METERS
        )
      ) {
        return false
      }

      // Check if address has placeholder values (for logging only)
      const hasPlaceholderAddress =
        locationData?.city === "Current Location" ||
        locationData?.address === "Select location" ||
        locationData?.formattedAddress === "Select location" ||
        (!locationData?.city && !locationData?.address && !locationData?.formattedAddress);

      if (hasPlaceholderAddress) {
        // Continue to save coordinates even if address is placeholder
      }

      // Check if user is authenticated before trying to update DB
      if (!isUserAuthenticated()) {
        // User not logged in - skip DB update, just use localStorage (log only in dev)
        return
      }

      // Prepare complete location data for database storage
      const locationPayload = {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address: locationData.address || "",
        city: locationData.city || "",
        state: locationData.state || "",
        area: locationData.area || "",
        formattedAddress: locationData.formattedAddress || locationData.address || "",
      }

      // Add optional fields if available
      if (locationData.accuracy !== undefined && locationData.accuracy !== null) {
        locationPayload.accuracy = locationData.accuracy
      }
      if (locationData.postalCode) {
        locationPayload.postalCode = locationData.postalCode
      }
      if (locationData.street) {
        locationPayload.street = locationData.street
      }
      if (locationData.streetNumber) {
        locationPayload.streetNumber = locationData.streetNumber
      }

      // Get user ID from token for Firebase backup storage
      const userToken =
        localStorage.getItem("user_accessToken") ||
        localStorage.getItem("accessToken")

      let userId = null
      if (userToken) {
        try {
          // Try to decode JWT to get user ID (simple base64 decode)
          const payload = JSON.parse(atob(userToken.split('.')[1]))
          userId = payload._id || payload.id || payload.userId
        } catch (e) {
        }
      }

      // Save to Firebase directly as backup (even if backend API fails)
      if (userId) {
        try {
          const { updateUserLocationInFirebase } = await import('@/lib/firebaseRealtime.js')
          await updateUserLocationInFirebase(userId, locationPayload.latitude, locationPayload.longitude, {
            address: locationPayload.address,
            city: locationPayload.city,
            state: locationPayload.state,
            area: locationPayload.area,
            formattedAddress: locationPayload.formattedAddress,
            postalCode: locationPayload.postalCode,
            accuracy: locationPayload.accuracy
          })
        } catch (firebaseErr) {
        }
      }

      // Save to backend (which also saves to Firebase)
      const response = await userAPI.updateLocation(locationPayload)
      
      // Update last saved location after successful save
      lastSavedLocationRef.current = {
        latitude: locationPayload.latitude,
        longitude: locationPayload.longitude
      }
      anchorLocationRef.current = {
        latitude: locationPayload.latitude,
        longitude: locationPayload.longitude,
      }
      return true
    } catch (err) {
      // Only log non-network and non-auth errors
      if (err.code !== "ERR_NETWORK" && err.response?.status !== 404 && err.response?.status !== 401) {
      } else if (err.response?.status === 404 || err.response?.status === 401) {
        // 404 or 401 means user not authenticated or route doesn't exist
        // Silently skip - this is expected for non-authenticated users
      }
    }
    return false
  }

  // Google Places API removed - using OLA Maps only

  /* ===================== DIRECT REVERSE GEOCODE ===================== */
  const reverseGeocodeDirect = async (latitude, longitude) => {
    try {
      // FIRST: Try backend API (more reliable, handles errors better)
      try {
        const backendResponse = await locationAPI.reverseGeocode(latitude, longitude)
        
        if (backendResponse?.data?.success && backendResponse?.data?.data?.results?.[0]) {
          const result = backendResponse.data.data.results[0]
          const addressComponents = result.address_components || {}
          
          const city = addressComponents.city || ""
          const state = addressComponents.state || ""
          const country = addressComponents.country || ""
          const area = addressComponents.area || ""
          const road = addressComponents.road || addressComponents.street || ""
          const building = addressComponents.building || ""
          const postcode = addressComponents.postcode || addressComponents.postalCode || ""
          const formattedAddress = result.formatted_address || ""
          
          // Check if we got valid data (not just coordinates)
          if (formattedAddress && !formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
            
            return {
              city: city || "Current Location",
              state: state || "",
              country: country || "",
              area: area || "",
              road: road || "",
              building: building || "",
              postalCode: postcode || "",
              address: [road, area, city].filter(Boolean).join(", ") || formattedAddress || "Current Location",
              formattedAddress:
                formattedAddress ||
                [building, road, area, city].filter(Boolean).join(", ") ||
                `${area ? area + ", " : ""}${city || "Current Location"}`,
            }
          }
        }
      } catch (backendError) {
      }

      // FALLBACK: Try BigDataCloud directly if backend fails
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      try {
        const res = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
          { 
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
            }
          }
        )

        clearTimeout(timeoutId) // Clear timeout if request succeeds

        if (!res.ok) {
          throw new Error(`BigDataCloud API error: ${res.status}`)
        }

        const data = await res.json()

        // Check if we got valid data (not empty)
        const city = data.city || data.locality || ""
        const formattedAddress = data.formattedAddress || ""
        
        // If we don't have city or formattedAddress, treat as placeholder
        if (!city && !formattedAddress) {
          return {
            city: "Current Location",
            state: "",
            country: "",
            area: "",
            address: "Select location",
            formattedAddress: "Select location",
          }
        }

        return {
          city: city,
          state: data.principalSubdivision || "",
          country: data.countryName || "",
          area: data.subLocality || "",
          address: formattedAddress || city || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          formattedAddress: formattedAddress || city || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        }
      } catch (fetchError) {
        clearTimeout(timeoutId) // Clear timeout on error
        throw fetchError
      }
    } catch (error) {
      // Suppress network errors - they're expected if API is down or network is unavailable
      // Only log if it's not a network/abort error
      if (error.name !== 'AbortError' && error.message !== 'Failed to fetch') {
      } else {
        // Network error - silently return placeholder (coordinates will still be saved)
      }
      
      // Return placeholder location - coordinates will still be saved to Firebase
      return {
        city: "Current Location",
        state: "",
        country: "",
        area: "",
        address: "Select location",
        formattedAddress: "Select location",
      }
    }
  }

  /* ===================== GOOGLE MAPS REVERSE GEOCODE ===================== */
  const reverseGeocodeWithGoogleMaps = async (latitude, longitude) => {
    try {
      // Check cache first
      try {
        const cacheModule = await import('@/lib/utils/googleMapsApiCache.js').catch(err => {
          return null;
        });
        
        if (cacheModule) {
          const { getCached, setCached, shouldMakeApiCall } = cacheModule;
          
          const cachedResult = getCached('geocoding', latitude, longitude);
          if (cachedResult) {
            return cachedResult;
          }
          
          // Check rate limit
          if (!shouldMakeApiCall('geocoding')) {
            return reverseGeocodeDirect(latitude, longitude);
          }
        }
      } catch (error) {
      }
      
      // Get Google Maps API key from backend database
      const { getGoogleMapsApiKey } = await import('@/lib/utils/googleMapsApiKey.js');
      const GOOGLE_MAPS_API_KEY = await getGoogleMapsApiKey();

      if (!GOOGLE_MAPS_API_KEY) {
        return reverseGeocodeDirect(latitude, longitude);
      }


      // Validate coordinates are in India range BEFORE fetching
      // India: Latitude 6.5° to 37.1° N, Longitude 68.7° to 97.4° E
      const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0

      if (!isInIndiaRange || longitude < 0) {
        throw new Error("Coordinates outside India range")
      }

      // Use AbortController for proper timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 20000); // 20 seconds timeout (increased from 15)

      let data;
      try {
        // ZOMATO-STYLE: Use Geocoding API with proper parameters for EXACT location
        // language=en for English, region=in for India (helps with better results)
        // result_type: prioritize premise > street_address > establishment > point_of_interest for exact location
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}&language=en&region=in&result_type=premise|street_address|establishment|point_of_interest|route|sublocality`,
          { signal: controller.signal }
        );

        clearTimeout(timeoutId); // Clear timeout if request completes

        // Handle HTTP 403 error gracefully - use fallback instead of throwing
        if (response.status === 403) {
          return reverseGeocodeDirect(latitude, longitude);
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        data = await response.json();
      } catch (error) {
        clearTimeout(timeoutId); // Clear timeout on error
        if (error.name === 'AbortError') {
          throw new Error("Google Maps API timeout");
        }
        throw error;
      }

      // Check if response is valid
      if (!data) {
        throw new Error("Google Maps API returned null response");
      }


      // Check for API errors - handle 403 gracefully and use fallback
      if (data.status === "REQUEST_DENIED") {
        // Don't throw error - let it fall back to reverseGeocodeDirect
        return reverseGeocodeDirect(latitude, longitude);
      }

      if (data.status === "OVER_QUERY_LIMIT") {
        throw new Error("Google Maps API quota exceeded. Check billing.");
      }

      if (data.status === "ZERO_RESULTS") {
        throw new Error("No address found for these coordinates");
      }

      if (data.status !== "OK" || !data.results || data.results.length === 0) {
        throw new Error(`Invalid response from Google Maps API: ${data.status} - ${data.error_message || "No results"}`);
      }

      // ZOMATO-STYLE: Find the MOST PRECISE result with POI/premise
      // Filter India results first, then find most specific
      let exactResult = null;
      let bestResultIndex = 0;

      // First, filter India results only
      const indiaResults = data.results.filter(r => {
        const addressComponents = r.address_components || []
        return addressComponents.some(ac =>
          ac.types.includes('country') &&
          (ac.short_name === 'IN' || ac.long_name === 'India')
        )
      })

      if (indiaResults.length === 0) {
        // Check if first result is foreign
        const firstResult = data.results[0]
        const addressComponents = firstResult.address_components || []
        const countryComponent = addressComponents.find(ac => ac.types.includes('country'))

        if (countryComponent && countryComponent.short_name !== 'IN' && countryComponent.long_name !== 'India') {
          throw new Error("Address outside India")
        }
        // If no country info, use first result but log warning
        exactResult = data.results[0]
      } else {
        // Priority: Find result with premise/establishment/street_address (most specific)
        for (let i = 0; i < Math.min(5, indiaResults.length); i++) {
          const result = indiaResults[i];
          const types = result.types || []
          const hasPremise = types.includes("premise") || result.address_components?.some(c => c.types.includes("premise"))
          const hasEstablishment = types.includes("establishment") || result.address_components?.some(c => c.types.includes("establishment"))
          const hasStreetAddress = types.includes("street_address") || result.address_components?.some(c => c.types.includes("street_address"))
          const hasPOI = types.includes("point_of_interest") || result.address_components?.some(c => c.types.includes("point_of_interest"))

          // Priority: premise > establishment > street_address > point_of_interest
          if (hasPremise || hasEstablishment || hasStreetAddress || hasPOI) {
            exactResult = result;
            bestResultIndex = i;
            break;
          }
        }

        // If no specific result found, use first India result
        if (!exactResult) {
          exactResult = indiaResults[0];
        }
      }

      const addressComponents = exactResult.address_components || [];
      const formattedAddress = exactResult.formatted_address || "";

      // Validate address is not foreign (additional check)
      const foreignPattern = /\b(USA|United States|Los Angeles|California|CA \d{5}|New York|NY|UK|United Kingdom|London|Canada|Australia|Singapore|Dubai)\b/i
      if (foreignPattern.test(formattedAddress)) {
        throw new Error("Foreign address detected")
      }




      // Extract address components with priority order (Zomato style - EXACT LOCATION)
      let city = "";
      let state = "";
      let area = "";
      let street = "";
      let streetNumber = "";
      let premise = ""; // Building name (e.g., "Princess Center")
      let pointOfInterest = ""; // Shop/Cafe name (e.g., "Mama Loca Cafe")
      let sublocalityLevel1 = ""; // Area name (e.g., "New Palasia")
      let sublocalityLevel2 = ""; // Sub-area name
      let postalCode = ""; // Pincode (e.g., "452001")
      let floor = ""; // Floor number (e.g., "5th Floor")

      // 1. EXACT LOCATION EXTRACTION - Extract ALL components for complete address
      // Google Maps formatted_address format: "Mama Loca Cafe, 501 Princess Center, 5th Floor, New Palasia, Indore, Madhya Pradesh 452001, India"

      // Extract all address components systematically
      for (const component of addressComponents) {
        const types = component.types || [];
        const longName = component.long_name || "";
        const shortName = component.short_name || "";

        // Point of Interest (POI) - Cafe/Shop name (e.g., "Mama Loca Cafe")
        if (types.includes("point_of_interest") && !pointOfInterest) {
          pointOfInterest = longName;
        }

        // Premise - Building name (e.g., "Princess Center", "501 Princess Center")
        if (types.includes("premise") && !premise) {
          premise = longName;
        }

        // Subpremise - Floor/Unit (e.g., "5th Floor", "G-2")
        if (types.includes("subpremise")) {
          floor = longName;
        }

        // Street number (e.g., "501")
        if (types.includes("street_number") && !streetNumber) {
          streetNumber = longName;
        }

        // Route/Street name
        if (types.includes("route") && !street) {
          street = longName;
        }

        // Sublocality Level 1 - Area name (e.g., "New Palasia")
        if (types.includes("sublocality_level_1") && !sublocalityLevel1) {
          sublocalityLevel1 = longName;
        }

        // Sublocality Level 2 - Sub-area name
        if (types.includes("sublocality_level_2") && !sublocalityLevel2) {
          sublocalityLevel2 = longName;
        }

        // City (locality)
        if (types.includes("locality") && !city) {
          city = longName;
        } else if (types.includes("administrative_area_level_2") && !city) {
          city = longName;
        }

        // State
        if (types.includes("administrative_area_level_1") && !state) {
          state = longName;
        }

        // Postal Code (Pincode)
        if (types.includes("postal_code") && !postalCode) {
          postalCode = longName;
        }
      }

      // ===================== GOOGLE PLACES API REMOVED =====================
      // Google Places API calls have been removed to cut API costs by 99%
      // Restaurant listing now uses MongoDB geospatial queries instead
      // Geocoding is only used for manual address add/edit operations

      // ZOMATO-STYLE: Extract exact building/cafe name (Mama Loca Cafe, Princess Center)
      // Priority: point_of_interest > premise > sublocality_level_1
      let mainTitle = "";

      // Extract from geocoding address components (no Places API)
      // Fallback to geocoding components
      const building = addressComponents.find(c =>
        c.types.includes("point_of_interest") ||
        c.types.includes("premise") ||
        c.types.includes("sublocality_level_1")
      );

      if (building) {
        mainTitle = building.long_name;
      } else {
        mainTitle = "Location Found";
      }

      // Use mainTitle as mainLocation (Zomato-style)
      let mainLocation = mainTitle;

      // Set area from main location (Zomato priority order)
      if (mainLocation && mainLocation !== "Location Found") {
        area = mainLocation;
      } else if (pointOfInterest) {
        area = pointOfInterest;
        mainLocation = pointOfInterest;
      } else if (premise) {
        area = premise;
        mainLocation = premise;
      } else if (sublocalityLevel1) {
        area = sublocalityLevel1;
        mainLocation = sublocalityLevel1;
      } else {
        // Fallback: Use city if nothing else found
        area = city || "Location Found";
        mainLocation = city || "Location Found";
      }

      // 3. Build COMPLETE detailed address from extracted components
      // Format: "Mama Loca Cafe, 501 Princess Center, 5th Floor, New Palasia, Indore, Madhya Pradesh 452001"
      // Order: POI > Street Number + Premise > Floor > Sublocality > City > State + Pincode

      let completeAddressParts = [];

      // Add Point of Interest (Cafe/Shop name) - e.g., "Mama Loca Cafe"
      if (pointOfInterest && pointOfInterest.trim() !== "") {
        completeAddressParts.push(pointOfInterest);
      }

      // Add Street Number + Premise (Building) - e.g., "501 Princess Center"
      if (streetNumber && premise) {
        completeAddressParts.push(`${streetNumber} ${premise}`);
      } else if (premise && premise.trim() !== "") {
        completeAddressParts.push(premise);
      } else if (streetNumber && streetNumber.trim() !== "") {
        completeAddressParts.push(streetNumber);
      }

      // Add Floor/Subpremise - e.g., "5th Floor"
      if (floor && floor.trim() !== "") {
        completeAddressParts.push(floor);
      }

      // Add Sublocality Level 1 (Area) - e.g., "New Palasia"
      if (sublocalityLevel1 && sublocalityLevel1.trim() !== "") {
        completeAddressParts.push(sublocalityLevel1);
      }

      // Add City - e.g., "Indore"
      if (city && city.trim() !== "") {
        completeAddressParts.push(city);
      }

      // Add State + Pincode - e.g., "Madhya Pradesh 452001"
      if (state && state.trim() !== "") {
        if (postalCode && postalCode.trim() !== "") {
          completeAddressParts.push(`${state} ${postalCode}`);
        } else {
          completeAddressParts.push(state);
        }
      } else if (postalCode && postalCode.trim() !== "") {
        completeAddressParts.push(postalCode);
      }

      // Build complete formatted address
      // CRITICAL: Check if Google's formatted_address has complete details
      const formattedParts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0);
      const hasCompleteFormattedAddress = formattedParts.length >= 4;

      let completeFormattedAddress = formattedAddress; // Default to Google's formatted_address

      // If Google's formatted_address is complete (4+ parts), use it directly
      // Otherwise, try to build from components
      if (hasCompleteFormattedAddress) {
        completeFormattedAddress = formattedAddress;
      } else if (completeAddressParts.length > 0 && (pointOfInterest || premise)) {
        // Build from components if we have POI/premise
        completeFormattedAddress = completeAddressParts.join(', ');
      } else {
        // Google's formatted_address is incomplete - log warning
        completeFormattedAddress = formattedAddress; // Use what we have
      }

      // Build display address (for navbar) - ZOMATO-STYLE: Show exact landmark first
      // Format: "Mama Loca Cafe, 501 Princess Center, 5th Floor, New Palasia"
      let displayAddressParts = [];

      // Priority 1: Use mainTitle/mainLocation (building/cafe name) - ZOMATO-STYLE
      // This is the exact Zomato approach - show "Mama Loca Cafe" as the main title
      if (mainLocation && mainLocation.trim() !== "" && mainLocation !== "Location Found") {
        displayAddressParts.push(mainLocation);
      } else if (pointOfInterest && pointOfInterest.trim() !== "") {
        // Fallback to pointOfInterest if mainLocation not set
        displayAddressParts.push(pointOfInterest);
      } else if (premise && premise.trim() !== "") {
        // Fallback to premise
        displayAddressParts.push(premise);
      }

      // Add building details if not already included in mainLocation
      if (premise && premise.trim() !== "" && premise !== mainLocation && premise !== pointOfInterest) {
        if (streetNumber && streetNumber.trim() !== "") {
          displayAddressParts.push(`${streetNumber} ${premise}`);
        } else {
          displayAddressParts.push(premise);
        }
      } else if (streetNumber && streetNumber.trim() !== "" && !mainLocation) {
        displayAddressParts.push(streetNumber);
      }

      // Add floor if available
      if (floor && floor.trim() !== "") {
        displayAddressParts.push(floor);
      }

      // Add sublocality if not already included
      if (sublocalityLevel1 && sublocalityLevel1.trim() !== "" && sublocalityLevel1 !== mainLocation) {
        displayAddressParts.push(sublocalityLevel1);
      }

      // If we couldn't build from components, extract from formatted_address (ZOMATO-STYLE)
      // formatted_address from results[0] usually has: "Mama Loca Cafe, 501 Princess Center, 5th Floor, New Palasia, Indore, Madhya Pradesh 452001"
      if (displayAddressParts.length === 0 && formattedAddress) {
        const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0);

        // Remove pincode, country, and city/state parts
        const filteredParts = parts.filter(part => {
          if (/^\d{6}$/.test(part)) return false; // Skip standalone pincode
          if (/\s+\d{6}$/.test(part)) {
            return part.replace(/\s+\d{6}$/, '').trim(); // Remove pincode from state
          }
          if (part.toLowerCase() === "india" || part.length > 25) return false;
          if (city && part.toLowerCase() === city.toLowerCase()) return false;
          if (state && part.toLowerCase().includes(state.toLowerCase())) return false;
          return true;
        });


        // Find city index
        let cityIndex = -1;
        if (city) {
          cityIndex = filteredParts.findIndex(part => part.toLowerCase() === city.toLowerCase());
        }
        if (cityIndex === -1) {
          const commonCities = ["Indore", "indore", "Bhopal", "bhopal", "Mumbai", "mumbai", "Delhi", "delhi"];
          cityIndex = filteredParts.findIndex(part =>
            commonCities.some(c => part.toLowerCase() === c.toLowerCase())
          );
        }

        // Extract locality parts (everything before city) - this includes POI, building, floor, area
        if (cityIndex > 0) {
          displayAddressParts = filteredParts.slice(0, cityIndex);
        } else if (filteredParts.length >= 4) {
          // If city not found, take first 4 parts (usually POI, building, floor, area)
          displayAddressParts = filteredParts.slice(0, 4);
        } else if (filteredParts.length >= 3) {
          displayAddressParts = filteredParts.slice(0, 3);
        } else if (filteredParts.length >= 2) {
          displayAddressParts = filteredParts.slice(0, 2);
        } else if (filteredParts.length >= 1) {
          displayAddressParts = [filteredParts[0]];
        }
      }

      // Final display address - prioritize extracted parts, fallback to area/mainLocation
      const displayAddress = displayAddressParts.length > 0
        ? displayAddressParts.join(', ')
        : (mainLocation || area || city || "Select location");


      // Set area for backward compatibility
      if (!area) {
        if (sublocalityLevel1) {
          area = sublocalityLevel1;
        } else if (premise) {
          area = premise;
        } else if (pointOfInterest) {
          area = pointOfInterest;
        } else if (city) {
          area = city;
        } else {
          area = "Location Found";
        }
      }



      // Return location object with ZOMATO-STYLE exact location (NO Google Places API)
      const locationResult = {
        city: city || "",
        state: state || "",
        area: area || city || "Location Found",
        address: displayAddress, // Locality parts for navbar display (e.g., "Mama Loca Cafe, 501 Princess Center")
        formattedAddress: completeFormattedAddress, // Complete detailed address (e.g., "Mama Loca Cafe, 501 Princess Center, 5th Floor, New Palasia, Indore, Madhya Pradesh 452001")
        street: street || "",
        streetNumber: streetNumber || "",
        postalCode: postalCode || "",
        // ZOMATO-STYLE: Add mainTitle for exact building/cafe name
        mainTitle: mainTitle !== "Location Found" ? mainTitle : null,
        pointOfInterest: pointOfInterest || null,
        premise: premise || null
      };


      // Cache the result
      try {
        const cacheModule = await import('@/lib/utils/googleMapsApiCache.js').catch(() => null);
        if (cacheModule) {
          const { setCached } = cacheModule;
          setCached('geocoding', locationResult, latitude, longitude);
        }
      } catch (error) {
      }

      return locationResult;
    } catch (error) {
      // If it's an API key or billing error, don't fallback - show error
      if (error.message.includes("REQUEST_DENIED") || error.message.includes("OVER_QUERY_LIMIT")) {

        // Return error location instead of fallback
        return {
          city: "API Error",
          state: "",
          area: "",
          address: "Google Maps API configuration issue",
          formattedAddress: "Please check API key and billing",
          street: "",
          streetNumber: "",
          postalCode: "",
          mainTitle: null,
          pointOfInterest: null,
          premise: null,
          placeId: null,
          placeName: null,
          phone: null,
          website: null,
          rating: null,
          openingHours: null,
          photos: null,
          hasPlaceDetails: false,
          placeTypes: []
        };
      }

      // For other errors, try fallback
      return reverseGeocodeDirect(latitude, longitude);
    }
  };

  /* ===================== OLA MAPS REVERSE GEOCODE (DEPRECATED - KEPT FOR FALLBACK) ===================== */
  const reverseGeocodeWithOLAMaps = async (latitude, longitude) => {
    try {

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OLA Maps API timeout")), 10000)
      )

      const apiPromise = locationAPI.reverseGeocode(latitude, longitude)
      const res = await Promise.race([apiPromise, timeoutPromise])


      // Check if response is valid
      if (!res || !res.data) {
        throw new Error("Invalid response from OLA Maps API")
      }

      // Check if API call was successful
      if (res.data.success === false) {
        throw new Error(res.data.message || "OLA Maps API returned error")
      }

      // Backend returns: { success: true, data: { results: [{ formatted_address, address_components: { city, state, country, area } }] } }
      const backendData = res?.data?.data || {}


      // Handle different OLA Maps response structures
      // Backend processes OLA Maps response and returns: { results: [{ formatted_address, address_components: { city, state, area } }] }
      let result = null;
      if (backendData.results && Array.isArray(backendData.results) && backendData.results.length > 0) {
        result = backendData.results[0];
      } else if (backendData.result && Array.isArray(backendData.result) && backendData.result.length > 0) {
        result = backendData.result[0];
      } else if (backendData.results && !Array.isArray(backendData.results)) {
        result = backendData.results;
      } else {
        result = backendData;
      }

      if (!result) {
        result = {};
      }

      // Extract address_components - handle both object and array formats
      let addressComponents = {};
      if (result.address_components) {
        if (Array.isArray(result.address_components)) {
          // Google Maps style array
          result.address_components.forEach(comp => {
            const types = comp.types || [];
            if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
              addressComponents.area = comp.long_name || comp.short_name;
            } else if (types.includes('neighborhood') && !addressComponents.area) {
              addressComponents.area = comp.long_name || comp.short_name;
            } else if (types.includes('locality')) {
              addressComponents.city = comp.long_name || comp.short_name;
            } else if (types.includes('administrative_area_level_1')) {
              addressComponents.state = comp.long_name || comp.short_name;
            } else if (types.includes('country')) {
              addressComponents.country = comp.long_name || comp.short_name;
            }
          });
        } else {
          // Object format
          addressComponents = result.address_components;
        }
      } else if (result.components) {
        addressComponents = result.components;
      }


      // Extract address details - try multiple possible response structures
      let city = addressComponents?.city ||
        result?.city ||
        result?.locality ||
        result?.address_components?.city ||
        ""

      let state = addressComponents?.state ||
        result?.state ||
        result?.administrative_area_level_1 ||
        result?.address_components?.state ||
        ""

      let country = addressComponents?.country ||
        result?.country ||
        result?.country_name ||
        result?.address_components?.country ||
        ""

      let formattedAddress = result?.formatted_address ||
        result?.formattedAddress ||
        result?.address ||
        ""

      // PRIORITY 1: Extract area from formatted_address FIRST (most reliable for Indian addresses)
      // Indian address format: "Area, City, State" e.g., "New Palasia, Indore, Madhya Pradesh"
      // ALWAYS try formatted_address FIRST - it's the most reliable source and preserves full names like "New Palasia"
      let area = ""
      if (formattedAddress) {
        const addressParts = formattedAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)


        // ZOMATO-STYLE: If we have 3+ parts, first part is ALWAYS the area/locality
        // Format: "New Palasia, Indore, Madhya Pradesh" -> area = "New Palasia"
        if (addressParts.length >= 3) {
          const firstPart = addressParts[0]
          const secondPart = addressParts[1] // Usually city
          const thirdPart = addressParts[2]  // Usually state

          // First part is the area (e.g., "New Palasia")
          // Second part is usually city (e.g., "Indore")
          // Third part is usually state (e.g., "Madhya Pradesh")
          if (firstPart && firstPart.length > 2 && firstPart.length < 50) {
            // Make sure first part is not the same as city or state
            const firstLower = firstPart.toLowerCase()
            const cityLower = (city || secondPart || "").toLowerCase()
            const stateLower = (state || thirdPart || "").toLowerCase()

            if (firstLower !== cityLower &&
              firstLower !== stateLower &&
              !firstPart.match(/^\d+/) && // Not a number
              !firstPart.match(/^\d+\s*(km|m|meters?)$/i) && // Not a distance
              !firstLower.includes("district") && // Not a district name
              !firstLower.includes("city")) { // Not a city name
              area = firstPart

              // Also update city if second part matches better
              if (secondPart && (!city || secondPart.toLowerCase() !== city.toLowerCase())) {
                city = secondPart
              }
              // Also update state if third part matches better
              if (thirdPart && (!state || thirdPart.toLowerCase() !== state.toLowerCase())) {
                state = thirdPart
              }
            }
          }
        } else if (addressParts.length === 2 && !area) {
          // Two parts: Could be "Area, City" or "City, State"
          const firstPart = addressParts[0]
          const secondPart = addressParts[1]

          // Check if first part is city (if we already have city name)
          const isFirstCity = city && firstPart.toLowerCase() === city.toLowerCase()

          // If first part is NOT the city, it's likely the area
          if (!isFirstCity &&
            firstPart.length > 2 &&
            firstPart.length < 50 &&
            !firstPart.toLowerCase().includes("district") &&
            !firstPart.toLowerCase().includes("city") &&
            !firstPart.match(/^\d+/)) {
            area = firstPart
            // Update city if second part exists
            if (secondPart && !city) {
              city = secondPart
            }
          } else if (isFirstCity) {
            // First part is city, second part might be state
            // No area in this case, but update state if needed
            if (secondPart && !state) {
              state = secondPart
            }
          }
        } else if (addressParts.length === 1 && !area) {
          // Single part - could be just city or area
          const singlePart = addressParts[0]
          if (singlePart && singlePart.length > 2 && singlePart.length < 50) {
            // If it doesn't match city exactly, it might be an area
            if (!city || singlePart.toLowerCase() !== city.toLowerCase()) {
              // Don't use as area if it looks like a city name (contains common city indicators)
              if (!singlePart.toLowerCase().includes("city") &&
                !singlePart.toLowerCase().includes("district")) {
                // Could be area, but be cautious - only use if we're sure
              }
            }
          }
        }
      }

      // PRIORITY 2: If still no area from formatted_address, try from address_components (fallback)
      // Note: address_components might have incomplete/truncated names like "Palacia" instead of "New Palasia"
      // So we ALWAYS prefer formatted_address extraction over address_components
      if (!area && addressComponents) {
        // Try all possible area fields (but exclude state and generic names!)
        const possibleAreaFields = [
          addressComponents.sublocality,
          addressComponents.sublocality_level_1,
          addressComponents.neighborhood,
          addressComponents.sublocality_level_2,
          addressComponents.locality,
          addressComponents.area, // Check area last
        ].filter(field => {
          // Filter out invalid/generic area names
          if (!field) return false
          const fieldLower = field.toLowerCase()
          return fieldLower !== state.toLowerCase() &&
            fieldLower !== city.toLowerCase() &&
            !fieldLower.includes("district") &&
            !fieldLower.includes("city") &&
            field.length > 3 // Minimum length
        })

        if (possibleAreaFields.length > 0) {
          const fallbackArea = possibleAreaFields[0]
          // CRITICAL: If formatted_address exists and has a different area, prefer formatted_address
          // This ensures "New Palasia" from formatted_address beats "Palacia" from address_components
          if (formattedAddress && formattedAddress.toLowerCase().includes(fallbackArea.toLowerCase())) {
            // formatted_address contains the fallback area, so it's likely more complete
            // Try one more time to extract from formatted_address
          } else {
            area = fallbackArea
          }
        }
      }

      // Also check address_components array structure (Google Maps style)
      if (!area && result?.address_components && Array.isArray(result.address_components)) {
        const components = result.address_components
        // Find sublocality or neighborhood in the components array
        const sublocality = components.find(comp =>
          comp.types?.includes('sublocality') ||
          comp.types?.includes('sublocality_level_1') ||
          comp.types?.includes('neighborhood')
        )
        if (sublocality?.long_name || sublocality?.short_name) {
          area = sublocality.long_name || sublocality.short_name
        }
      }

      // FINAL FALLBACK: If area is still empty, force extract from formatted_address
      // This is the last resort - be very aggressive (ZOMATO-STYLE)
      // Even if formatted_address only has 2 parts (City, State), try to extract area
      if (!area && formattedAddress) {
        const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)

        if (parts.length >= 2) {
          const potentialArea = parts[0]
          // Very lenient check - if it's not obviously city/state, use it as area
          const potentialAreaLower = potentialArea.toLowerCase()
          const cityLower = (city || "").toLowerCase()
          const stateLower = (state || "").toLowerCase()

          if (potentialArea &&
            potentialArea.length > 2 &&
            potentialArea.length < 50 &&
            !potentialArea.match(/^\d+/) &&
            potentialAreaLower !== cityLower &&
            potentialAreaLower !== stateLower &&
            !potentialAreaLower.includes("district") &&
            !potentialAreaLower.includes("city")) {
            area = potentialArea
          }
        }
      }


      // CRITICAL: If formattedAddress has only 2 parts, OLA Maps didn't provide sublocality
      // Try to get more detailed location using coordinates-based search
      if (!area && formattedAddress) {
        const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)

        // If we have 3+ parts, extract area from first part
        if (parts.length >= 3) {
          // ZOMATO PATTERN: "New Palasia, Indore, Madhya Pradesh"
          // First part = Area, Second = City, Third = State
          const potentialArea = parts[0]
          // Validate it's not state, city, or generic names
          const potentialAreaLower = potentialArea.toLowerCase()
          if (potentialAreaLower !== state.toLowerCase() &&
            potentialAreaLower !== city.toLowerCase() &&
            !potentialAreaLower.includes("district") &&
            !potentialAreaLower.includes("city")) {
            area = potentialArea
            if (!city && parts[1]) city = parts[1]
            if (!state && parts[2]) state = parts[2]
          }
        } else if (parts.length === 2) {
          // Only 2 parts: "Indore, Madhya Pradesh" - area is missing
          // OLA Maps API didn't provide sublocality
          // Try to extract from other fields in the response
          // Check if result has any other location fields
          if (result.locality && result.locality !== city) {
            area = result.locality
          } else if (result.neighborhood) {
            area = result.neighborhood
          } else {
            // Leave area empty - will show city instead
            area = ""
          }
        }
      }

      // FINAL VALIDATION: Never use state as area!
      if (area && state && area.toLowerCase() === state.toLowerCase()) {
        area = ""
      }

      // FINAL VALIDATION: Reject district names
      if (area && area.toLowerCase().includes("district")) {
        area = ""
      }

      // If we have a valid formatted address or city, return it
      if (formattedAddress || city) {
        const finalLocation = {
          city: city || "",
          state: state || "",
          country: country || "",
          area: area || "", // Area is CRITICAL - must be extracted
          address: formattedAddress || `${city || "Current Location"}`,
          formattedAddress: formattedAddress || `${city || "Current Location"}`,
        }

        return finalLocation
      }

      // If no valid data, throw to trigger fallback
      throw new Error("No valid address data from OLA Maps")
    } catch (err) {
      // Fallback to direct reverse geocoding (BigDataCloud / backend only, no Google Maps)
      try {
        return await reverseGeocodeDirect(latitude, longitude)
      } catch (fallbackErr) {
        // If all fail, return minimal location data
        return {
          city: "Current Location",
          address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          formattedAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        }
      }
    }
  }

  /* ===================== DB FETCH ===================== */
  const fetchLocationFromDB = async () => {
    try {
      // Check if user is authenticated before trying to fetch from DB
      const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
      if (!userToken || userToken === 'null' || userToken === 'undefined') {
        // User not logged in - skip DB fetch, return null to use localStorage
        return null
      }

      const res = await userAPI.getLocation()
      const loc = res?.data?.data?.location
      if (loc?.latitude && loc?.longitude) {
        // Validate coordinates are in India range BEFORE attempting geocoding
        const isInIndiaRange = loc.latitude >= 6.5 && loc.latitude <= 37.1 && loc.longitude >= 68.7 && loc.longitude <= 97.4 && loc.longitude > 0

        if (!isInIndiaRange || loc.longitude < 0) {
          // Coordinates are outside India - return placeholder
          return {
            latitude: loc.latitude,
            longitude: loc.longitude,
            city: "Current Location",
            state: "",
            country: "",
            area: "",
            address: "Select location",
            formattedAddress: "Select location",
          }
        }

        const isCoordinatesPattern = (value) =>
          /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test((value || "").trim())
        const hasUsableAddress =
          (loc?.address && loc.address !== "Select location" && !isCoordinatesPattern(loc.address)) ||
          (loc?.formattedAddress &&
            loc.formattedAddress !== "Select location" &&
            !isCoordinatesPattern(loc.formattedAddress))

        // IMPORTANT: Preserve exact location already saved in DB (house no/road/colony).
        // Do not re-geocode if DB already has a usable detailed address.
        if (hasUsableAddress) {
          return {
            ...loc,
            latitude: loc.latitude,
            longitude: loc.longitude,
            address: loc.address || loc.formattedAddress || "",
            formattedAddress: loc.formattedAddress || loc.address || "",
          }
        }

        try {
          const addr = await reverseGeocodeWithGoogleMaps(
            loc.latitude,
            loc.longitude
          )
          return {
            ...addr,
            ...loc,
            latitude: loc.latitude,
            longitude: loc.longitude,
            address: loc.address || addr.address || "",
            formattedAddress: loc.formattedAddress || addr.formattedAddress || addr.address || "",
          }
        } catch (geocodeErr) {
          // If reverse geocoding fails, return location without coordinates in address
          return {
            latitude: loc.latitude,
            longitude: loc.longitude,
            city: "Current Location",
            area: "",
            state: "",
            address: "Select location", // Don't show coordinates
            formattedAddress: "Select location", // Don't show coordinates
          }
        }
      }
    } catch (err) {
      // Silently fail for 404/401 (user not authenticated) or network errors
      if (err.code !== "ERR_NETWORK" && err.response?.status !== 404 && err.response?.status !== 401) {
      }
    }
    return null
  }

  /* ===================== MAIN LOCATION ===================== */
  const getLocation = async (updateDB = true, forceFresh = false, showLoading = false) => {
    // If forceFresh is true, allow the request even if another is in progress (user explicitly requested)
    if (isFetchingLocationRef.current && !forceFresh) {
      if (process.env.NODE_ENV === 'development') {
      }
      // Wait a bit and return current location - don't start another fetch
      return location || (() => {
        try {
          const stored = localStorage.getItem("userLocation")
          return stored ? JSON.parse(stored) : null
        } catch {
          return null
        }
      })()
    }

    // Mark as fetching
    isFetchingLocationRef.current = true

    try {
      // If not forcing fresh, try DB first (faster)
      let dbLocation = !forceFresh ? await fetchLocationFromDB() : null
      if (dbLocation && !forceFresh) {
        localStorage.setItem("userLocation", JSON.stringify(dbLocation))
        setLocation(dbLocation)
        // Initialize last saved location from DB
        if (dbLocation.latitude && dbLocation.longitude) {
          lastSavedLocationRef.current = {
            latitude: dbLocation.latitude,
            longitude: dbLocation.longitude
          }
          anchorLocationRef.current = {
            latitude: dbLocation.latitude,
            longitude: dbLocation.longitude
          }
          lastProcessedCoordsRef.current = {
            latitude: dbLocation.latitude,
            longitude: dbLocation.longitude
          }
        }
        if (showLoading) setLoading(false)
        isFetchingLocationRef.current = false
        return dbLocation
      }

      if (!navigator.geolocation) {
        setError("Geolocation not supported")
        if (showLoading) setLoading(false)
        isFetchingLocationRef.current = false // Reset flag
        return dbLocation
      }

    // Helper function to get position with retry mechanism
    const getPositionWithRetry = (options, retryCount = 0) => {
      return new Promise((resolve, reject) => {
        const isRetry = retryCount > 0

        // Use cached location if available and not too old (faster response)
        // If forceFresh is true, don't use cache (maximumAge: 0)
        const cachedOptions = {
          ...options,
          maximumAge: forceFresh ? 0 : (options.maximumAge || 60000), // If forceFresh, get fresh location
        }
        
        
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const { latitude, longitude, accuracy } = pos.coords
              const timestamp = pos.timestamp || Date.now()
              const processedCoords = lastProcessedCoordsRef.current
              const dedupeThreshold = Math.max(SAME_POINT_DEDUPE_MIN_METERS, Math.min(accuracy || 0, 50))
              const movedSinceLastProcessed = hasMovedBeyondThreshold(
                processedCoords.latitude,
                processedCoords.longitude,
                latitude,
                longitude,
                dedupeThreshold
              )

              // Skip reverse-geocoding churn for same point / GPS jitter.
              if (!forceFresh && !movedSinceLastProcessed) {
                const currentLoc = location || (() => {
                  try {
                    const stored = localStorage.getItem("userLocation")
                    return stored ? JSON.parse(stored) : null
                  } catch {
                    return null
                  }
                })()
                const jitterSafeLoc = currentLoc
                  ? { ...currentLoc, latitude, longitude, accuracy: accuracy || null, timestamp }
                  : null
                if (jitterSafeLoc) {
                  localStorage.setItem("userLocation", JSON.stringify(jitterSafeLoc))
                  setLocation(jitterSafeLoc)
                  if (updateDB) await updateLocationInDB(jitterSafeLoc).catch(() => {})
                  isFetchingLocationRef.current = false
                  resolve(jitterSafeLoc)
                  return
                }
              }


              // Validate coordinates are in India range BEFORE attempting geocoding
              // India: Latitude 6.5° to 37.1° N, Longitude 68.7° to 97.4° E
              const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0

              // Get address from reverse geocoding service (no Google Maps)
              let addr
              if (!isInIndiaRange || longitude < 0) {
                // Coordinates are outside India - skip geocoding and use placeholder
                addr = {
                  city: "Current Location",
                  state: "",
                  country: "",
                  area: "",
                  address: "Select location",
                  formattedAddress: "Select location",
                }
              } else {
                try {
                  addr = await reverseGeocodeWithGoogleMaps(latitude, longitude)

                  // Validate result - if it still has placeholder values, don't save
                  if (addr.city === "Current Location" || addr.address.includes(latitude.toFixed(4))) {
                    addr = {
                      city: "Current Location",
                      state: "",
                      country: "",
                      area: "",
                      address: "Select location",
                      formattedAddress: "Select location",
                    }
                  }
                } catch (fallbackErr) {
                  addr = {
                    city: "Current Location",
                    state: "",
                    country: "",
                    area: "",
                    address: "Select location",
                    formattedAddress: "Select location",
                  }
                }
              }

              // Ensure we don't use coordinates as address if we have area/city
              // Keep the complete formattedAddress from Google Maps (it has all details)
              const completeFormattedAddress = addr.formattedAddress || "";
              let displayAddress = addr.address || "";

              // If address contains coordinates pattern, use area/city instead
              const isCoordinatesPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(displayAddress.trim());
              if (isCoordinatesPattern) {
                if (addr.area && addr.area.trim() !== "") {
                  displayAddress = addr.area;
                } else if (addr.city && addr.city.trim() !== "" && addr.city !== "Unknown City") {
                  displayAddress = addr.city;
                }
              }

              // Build location object with ALL fields from reverse geocoding
              const finalLoc = {
                ...addr, // This includes: city, state, area, road, building, postalCode, formattedAddress
                latitude,
                longitude,
                accuracy: accuracy || null,
                timestamp,
                address: displayAddress, // Locality parts for navbar display
                formattedAddress: completeFormattedAddress || addr.formattedAddress || displayAddress // Complete detailed address
              }

              // Check if address has placeholder values (but still save coordinates)
              const hasPlaceholderAddress =
                finalLoc.city === "Current Location" ||
                finalLoc.address === "Select location" ||
                finalLoc.formattedAddress === "Select location" ||
                (!finalLoc.city && !finalLoc.address && !finalLoc.formattedAddress && !finalLoc.area);

              // CRITICAL: Always save coordinates to Firebase even if address is placeholder
              // Coordinates are valid and useful for order calculations
              if (hasPlaceholderAddress) {
                
                // Even if address is placeholder, DON'T show coordinates - keep trying to get address
              // Coordinates will be saved to Firebase but UI should show "Current Location" or retry
              // We'll retry reverse geocoding in background to get proper address
              }

              localStorage.setItem("userLocation", JSON.stringify(finalLoc))
              lastProcessedCoordsRef.current = { latitude, longitude }
              setLocation(finalLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              setError(null)

              // CRITICAL: Always save coordinates to Firebase immediately, even if address is placeholder
              // Don't wait for debounce - save immediately when location is first fetched
              if (updateDB) {
                await updateLocationInDB(finalLoc).catch(() => {})
              }
              isFetchingLocationRef.current = false // Reset flag on success
              resolve(finalLoc)
            } catch (err) {
              // Try one more time with direct reverse geocode as last resort
              const { latitude, longitude } = pos.coords

              try {
                const lastResortAddr = await reverseGeocodeWithGoogleMaps(latitude, longitude)

                // Check if we got valid data (not just coordinates)
                if (lastResortAddr &&
                  lastResortAddr.city !== "Current Location" &&
                  !lastResortAddr.address.includes(latitude.toFixed(4)) &&
                  lastResortAddr.formattedAddress &&
                  !lastResortAddr.formattedAddress.includes(latitude.toFixed(4))) {
                  const lastResortLoc = {
                    ...lastResortAddr,
                    latitude,
                    longitude,
                    accuracy: pos.coords.accuracy || null,
                    timestamp: pos.timestamp || Date.now(),
                  }
                  localStorage.setItem("userLocation", JSON.stringify(lastResortLoc))
                  lastProcessedCoordsRef.current = { latitude, longitude }
                  setLocation(lastResortLoc)
                  setPermissionGranted(true)
                  if (showLoading) setLoading(false)
                  setError(null)
                  if (updateDB) await updateLocationInDB(lastResortLoc).catch(() => { })
                  isFetchingLocationRef.current = false // Reset flag on success
                  resolve(lastResortLoc)
                  return
                } else {
                }
              } catch (lastErr) {
              }

              // If all geocoding fails, use placeholder but STILL SAVE COORDINATES
              const fallbackLoc = {
                latitude,
                longitude,
                city: "Current Location",
                area: "",
                state: "",
                address: "Select location", // Don't show coordinates
                formattedAddress: "Select location", // Don't show coordinates
                timestamp: pos.timestamp || Date.now(),
              }
              // CRITICAL: Save coordinates even if address is placeholder - coordinates are still useful
              localStorage.setItem("userLocation", JSON.stringify(fallbackLoc))
              lastProcessedCoordsRef.current = { latitude, longitude }
              setLocation(fallbackLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              // CRITICAL: Save coordinates to database and Firebase even if address is placeholder
              if (updateDB) {
                await updateLocationInDB(fallbackLoc).catch(err => {
                })
              }
              isFetchingLocationRef.current = false // Reset flag on fallback
              resolve(fallbackLoc)
            }
          },
          async (err) => {
            // Check if error is due to Google's network location provider 403
            const isGoogle403Error = err.message && (
              err.message.includes('403') || 
              err.message.includes('googleapis') ||
              err.message.includes('Network location provider')
            )

            if (isGoogle403Error) {
              // Try again with high accuracy only (GPS, skip network-based location)
              if (retryCount === 0) {
                getPositionWithRetry({
                  enableHighAccuracy: true, // Force GPS only
                  timeout: 15000,  // Longer timeout for GPS
                  maximumAge: 0 // Don't use cached network location
                }, 1).then(resolve).catch(reject)
                return
              }
            }

            // If timeout and we haven't retried yet, try with lower accuracy
            if (err.code === 3 && retryCount === 0 && options.enableHighAccuracy) {
              // Retry with lower accuracy - faster response (uses network-based location)
              getPositionWithRetry({
                enableHighAccuracy: false,
                timeout: 5000,  // 5 seconds for lower accuracy (network-based is faster)
                maximumAge: 300000 // Allow 5 minute old cached location for instant response
              }, 1).then(resolve).catch(reject)
              return
            }

            // Don't log timeout errors as errors - they're expected in some cases
            if (err.code === 3) {
            } else if (isGoogle403Error) {
            } else {
            }
            // Try multiple fallback strategies
            try {
              // Strategy 1: Use DB location if available
              let fallback = dbLocation
              if (!fallback) {
                fallback = await fetchLocationFromDB()
              }

              // Strategy 2: Use cached location from localStorage
              if (!fallback) {
                const stored = localStorage.getItem("userLocation")
                if (stored) {
                  try {
                    fallback = JSON.parse(stored)
                  } catch (parseErr) {
                  }
                }
              }

              if (fallback) {
                setLocation(fallback)
                // Don't set error for timeout when we have fallback
                if (err.code !== 3) {
                  setError(err.message)
                }
                setPermissionGranted(true) // Still grant permission if we have location
                if (showLoading) setLoading(false)
                isFetchingLocationRef.current = false // Reset flag on fallback success
                resolve(fallback)
              } else {
                // No fallback available - reject the promise so caller can handle it
                setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
                setPermissionGranted(false)
                if (showLoading) setLoading(false)
                isFetchingLocationRef.current = false // Reset flag on error
                // Reject instead of resolving with invalid location
                reject(new Error(err.code === 3 ? "Location request timed out. Please try again." : err.message))
              }
            } catch (fallbackErr) {
              setLocation(null)
              setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
              setPermissionGranted(false)
              if (showLoading) setLoading(false)
              isFetchingLocationRef.current = false // Reset flag on error
              // Reject instead of resolving with null - caller should handle the error
              reject(new Error(err.code === 3 ? "Location request timed out. Please try again." : err.message))
            }
          },
          options
        )
      })
    }

      // Try with high accuracy first
      // If forceFresh is true, don't use cached location (maximumAge: 0)
      // Otherwise, allow cached location for faster response
      const locationResult = await getPositionWithRetry({
        enableHighAccuracy: true,  // Use GPS for exact location (highest accuracy)
        timeout: 15000,            // 15 seconds timeout (gives GPS more time to get accurate fix)
        maximumAge: forceFresh ? 0 : 60000  // If forceFresh, get fresh location. Otherwise allow 1 minute cache
      })
      
      // Ensure flag is reset after getting location
      isFetchingLocationRef.current = false
      
      return locationResult
    } catch (err) {
      // Handle any unexpected errors
      isFetchingLocationRef.current = false // Reset flag on error
      setError(err.message)
      if (showLoading) setLoading(false)
      return null
    }
  }

  /* ===================== WATCH LOCATION ===================== */
  const startWatchingLocation = () => {
    if (!navigator.geolocation) {
      return
    }

    // If user manually selected a location recently, don't let GPS watcher overwrite it immediately.
    if (Date.now() < manualOverrideUntilRef.current) {
      return
    }

    // If user manually selected a location, only resume live tracking when they explicitly request it.
    if (manualOverrideEnabledRef.current) {
      return
    }

    // Clear any existing watch
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    let retryCount = 0
    const maxRetries = 2

    const startWatch = (options) => {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            const { latitude, longitude, accuracy } = pos.coords

            // Reset retry count on success
            retryCount = 0

            // CRITICAL: Live tracking should NOT call reverse geocoding (cuts API costs by 99%)
            // Use stored address from current location or localStorage instead
            // Reverse geocoding should ONLY happen when user manually adds/edits address
            
            // Get current location to preserve address fields
            const currentLoc = location || (() => {
              try {
                const stored = localStorage.getItem("userLocation")
                return stored ? JSON.parse(stored) : null
              } catch {
                return null
              }
            })()

            // Build location object - update ONLY coordinates, preserve existing address
            const loc = {
              ...(currentLoc || {}), // Preserve all existing address fields
              latitude,
              longitude,
              accuracy: accuracy || null
            }

            // If no existing address, use coordinates as display (don't call geocoding API)
            if (!loc.address || loc.address === "Select location" || loc.address === "Current Location") {
              // Show coordinates in a user-friendly way when address is not available
              loc.address = `Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
              loc.formattedAddress = `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
              loc.city = currentLoc?.city || "Current Location"
            }

            // STABILITY: Only update if coordinates changed significantly (>10m)
            // Don't check address improvement since we're not calling geocoding
            const prevLoc = location
            if (prevLoc && prevLoc.latitude && prevLoc.longitude) {
              const distanceMeters = calculateDistance(latitude, longitude, prevLoc.latitude, prevLoc.longitude)

              // Only update if moved >10 meters
              if (distanceMeters <= UI_COORD_CHANGE_THRESHOLD_METERS) {
                return // Don't update - coordinates haven't changed significantly
              }
            }

            // Check if coordinates have changed significantly (threshold: ~10 meters)
            const coordThreshold = 0.0001 // approximately 10 meters
            const coordsChanged =
              !prevLocationCoordsRef.current.latitude ||
              !prevLocationCoordsRef.current.longitude ||
              Math.abs(prevLocationCoordsRef.current.latitude - loc.latitude) > coordThreshold ||
              Math.abs(prevLocationCoordsRef.current.longitude - loc.longitude) > coordThreshold

            // Only update location state if coordinates changed significantly
            if (coordsChanged) {
              prevLocationCoordsRef.current = { latitude: loc.latitude, longitude: loc.longitude }
              localStorage.setItem("userLocation", JSON.stringify(loc))
              setLocation(loc)
              setPermissionGranted(true)
              setError(null)
            } else {
              // Coordinates haven't changed significantly, skip state update to prevent re-renders
              // Still update localStorage silently for persistence
              localStorage.setItem("userLocation", JSON.stringify(loc))
            }

            // Debounce DB updates - only update every 5 seconds when movement from anchor is >= 200m
            if (isUserAuthenticated()) {
              let shouldUpdateDB = false

              if (anchorLocationRef.current.latitude && anchorLocationRef.current.longitude) {
                const distanceFromAnchor = calculateDistance(
                  latitude,
                  longitude,
                  anchorLocationRef.current.latitude,
                  anchorLocationRef.current.longitude
                )

                if (distanceFromAnchor >= MOVEMENT_UPDATE_THRESHOLD_METERS) {
                  shouldUpdateDB = true
                }
              } else {
                // Initialize anchor if not set
                anchorLocationRef.current = { latitude, longitude }
              }

              if (shouldUpdateDB) {
                clearTimeout(updateTimerRef.current)
                updateTimerRef.current = setTimeout(() => {
                  updateLocationInDB(loc).catch(err => {
                  })
                }, 5000)
              }
            }
          } catch (err) {
            // On error, preserve existing location (don't update with placeholder)
            // This ensures we keep the stored address even if coordinate update fails
          }
        },
        (err) => {
          // Don't log timeout errors for watchPosition (it's a background operation)
          // Only log non-timeout errors
          if (err.code !== 3) {
          }

          // If timeout and we haven't exceeded max retries, retry with HIGH ACCURACY GPS
          // CRITICAL: Keep using GPS (not network-based) for accurate location
          // Network-based location won't give exact landmarks like "Mama Loca Cafe"
          if (err.code === 3 && retryCount < maxRetries) {
            retryCount++

            // Clear current watch
            if (watchIdRef.current) {
              navigator.geolocation.clearWatch(watchIdRef.current)
              watchIdRef.current = null
            }

            // Retry with HIGH ACCURACY GPS (don't use network-based location)
            // Network-based location is less accurate and won't give exact landmarks
            setTimeout(() => {
              startWatch({
                enableHighAccuracy: true,   // Keep using GPS (not network-based)
                timeout: 20000,              // 20 seconds timeout (give GPS more time)
                maximumAge: 0                // Always get fresh GPS location
              })
            }, 3000) // 3 second delay before retry
            return
          }

          // If all retries failed, silently continue - don't set error state for background watch
          // The watch will keep trying in background, user won't notice
          // Only set error for non-timeout errors that are critical
          if (err.code !== 3) {
            setError(err.message)
            setPermissionGranted(false)
          }

          // Don't clear the watch - let it keep trying in background
          // The user might move to a location with better GPS signal
        },
        options
      )
    }

    // Start with HIGH ACCURACY GPS for live location tracking
    // CRITICAL: enableHighAccuracy: true forces GPS (not network-based) for accurate location
    // Network-based location won't give exact landmarks like "Mama Loca Cafe"
    startWatch({
      enableHighAccuracy: true,   // CRITICAL: Use GPS (not network-based) for accurate location
      timeout: 15000,             // 15 seconds timeout (gives GPS more time to get accurate fix)
      maximumAge: 0               // Always get fresh GPS location (no cache for live tracking)
    })
  }

  const stopWatchingLocation = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    clearTimeout(updateTimerRef.current)
  }

  /**
   * Manually set user location (e.g. user selects from search / pin on map).
   * This updates state immediately so the UI reflects the change without reload,
   * persists to localStorage, and optionally syncs to backend when available.
   */
  const setManualLocation = async (
    locationData,
    {
      updateDB = true,
      pauseWatchMs = 2500,
    } = {}
  ) => {
    try {
      if (!locationData) return null

      const lat = Number(locationData.latitude)
      const lng = Number(locationData.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

      // Pause watcher briefly so it doesn't instantly overwrite the manual choice.
      manualOverrideUntilRef.current = Date.now() + Math.max(0, Number(pauseWatchMs) || 0)
      // Enable manual override mode: do not resume live tracking until user explicitly requests it.
      manualOverrideEnabledRef.current = true
      stopWatchingLocation()
      try {
        localStorage.setItem(MANUAL_OVERRIDE_STORAGE_KEY, "true")
      } catch {}

      const nextLoc = {
        ...locationData,
        latitude: lat,
        longitude: lng,
        timestamp: locationData.timestamp || Date.now(),
      }

      // Persist + update state immediately
      try {
        localStorage.setItem("userLocation", JSON.stringify(nextLoc))
      } catch {}

      lastProcessedCoordsRef.current = { latitude: lat, longitude: lng }
      prevLocationCoordsRef.current = { latitude: lat, longitude: lng }
      anchorLocationRef.current = { latitude: lat, longitude: lng }
      lastSavedLocationRef.current = { latitude: lat, longitude: lng }

      setLocation(nextLoc)
      setPermissionGranted(true)
      setError(null)

      // Best-effort backend sync (safe for guest users - API can fail silently)
      if (updateDB) {
        try {
          await userAPI.updateLocation({
            latitude: lat,
            longitude: lng,
            address: nextLoc.address || "",
            city: nextLoc.city || "",
            state: nextLoc.state || "",
            area: nextLoc.area || "",
            formattedAddress: nextLoc.formattedAddress || nextLoc.address || "",
            accuracy: nextLoc.accuracy ?? null,
            postalCode: nextLoc.postalCode || nextLoc.zipCode || "",
            street: nextLoc.street || "",
            streetNumber: nextLoc.streetNumber || "",
          })
        } catch {}
      }

      return nextLoc
    } catch {
      return null
    }
  }

  /* ===================== INIT ===================== */
  useEffect(() => {
    // Load stored location first for IMMEDIATE display (no loading state)
    const stored = localStorage.getItem("userLocation")
    let shouldForceRefresh = false
    let hasInitialLocation = false

    if (stored) {
      try {
        const parsedLocation = JSON.parse(stored)

        // Show cached location immediately (even if incomplete) - better UX
        // We'll refresh in background but user sees something right away
        // Show location even if address is placeholder, as long as we have coordinates
        if (parsedLocation && parsedLocation.latitude && parsedLocation.longitude) {
          // CRITICAL: Remove coordinates from address if they were added before
          // Don't show coordinates in UI - show "Current Location" instead
          if (parsedLocation.address && (
              parsedLocation.address.includes('Location (') ||
              parsedLocation.address.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)
            )) {
            parsedLocation.address = "Current Location"
          }
          if (parsedLocation.formattedAddress && (
              parsedLocation.formattedAddress.includes('Location (') ||
              parsedLocation.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)
            )) {
            parsedLocation.formattedAddress = "Current Location"
          }
          
          // Update localStorage with cleaned address (without coordinates)
          const originalAddress = parsedLocation.address
          const originalFormattedAddress = parsedLocation.formattedAddress
          if (originalAddress !== parsedLocation.address || 
              originalFormattedAddress !== parsedLocation.formattedAddress) {
            localStorage.setItem("userLocation", JSON.stringify(parsedLocation))
          }
          
          setLocation(parsedLocation)
          setPermissionGranted(true)
          setLoading(false) // Set loading to false immediately
          hasInitialLocation = true
          
          // Initialize last saved location from localStorage
          if (parsedLocation.latitude && parsedLocation.longitude) {
            lastSavedLocationRef.current = {
              latitude: parsedLocation.latitude,
              longitude: parsedLocation.longitude
            };
          }
          
          // If address is placeholder, trigger reverse geocoding retry in background
          if (parsedLocation.formattedAddress === "Select location" || 
              parsedLocation.formattedAddress === "Current Location" ||
              parsedLocation.city === "Current Location" ||
              !parsedLocation.formattedAddress ||
              parsedLocation.address === "Current Location") {
            shouldForceRefresh = true
          }

          // Check if we should refresh in background for better address
          const hasCompleteAddress = parsedLocation?.formattedAddress &&
            parsedLocation.formattedAddress !== "Select location" &&
            !parsedLocation.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) &&
            parsedLocation.formattedAddress.split(',').length >= 4

          if (!hasCompleteAddress) {
            shouldForceRefresh = true
          }
        } else {
          shouldForceRefresh = true
        }
      } catch (err) {
        shouldForceRefresh = true
      }
    }

    // If no cached location, try DB
    if (!hasInitialLocation) {
      fetchLocationFromDB()
        .then((dbLoc) => {
          if (dbLoc && (dbLoc.latitude || dbLoc.city)) {
            setLocation(dbLoc)
            setPermissionGranted(true)
            setLoading(false)
            hasInitialLocation = true
            
            // Initialize last saved location from DB
            if (dbLoc.latitude && dbLoc.longitude) {
              lastSavedLocationRef.current = {
                latitude: dbLoc.latitude,
                longitude: dbLoc.longitude
              };
            }

            // Check if we should refresh for better address
            const hasCompleteAddress = dbLoc?.formattedAddress &&
              dbLoc.formattedAddress !== "Select location" &&
              !dbLoc.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) &&
              dbLoc.formattedAddress.split(',').length >= 4

            if (!hasCompleteAddress) {
              shouldForceRefresh = true
            }
          } else {
            // No location found - set loading to false and show fallback
            setLoading(false)
            shouldForceRefresh = true
          }
        })
        .catch(() => {
          setLoading(false)
          shouldForceRefresh = true
        })
    }

    // Always ensure loading is false after initial check
    // Safety timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      setLoading((currentLoading) => {
        if (currentLoading) {
          // Only set fallback if we still don't have a location
          setLocation((currentLocation) => {
            if (!currentLocation ||
              (currentLocation.formattedAddress === "Select location" &&
                !currentLocation.latitude && !currentLocation.city)) {
              return {
                city: "Select location",
                address: "Select location",
                formattedAddress: "Select location"
              }
            }
            return currentLocation
          })
        }
        return false
      })
    }, 5000) // 5 second safety timeout (increased to allow background fetch to complete)

    // Don't set fallback immediately - wait for background fetch to complete
    // The background fetch will set the location, or we'll use the cached/DB location
    // Only set fallback if we have no location after all attempts

    const checkPermissionAndStart = async () => {
      // Prevent multiple simultaneous calls
      if (hasInitializedRef.current) {
        if (process.env.NODE_ENV === 'development') {
        }
        return
      }
      
      hasInitializedRef.current = true
      
      try {
        // ZOMATO-STYLE: Always attempt to fetch on app open.
        // This will trigger the browser's native permission prompt.
        const currentLocation = location
        const hasPlaceholder =
          currentLocation &&
          (currentLocation.formattedAddress === "Select location" ||
            currentLocation.city === "Current Location")
        const shouldForceFreshFetch = shouldForceRefresh || !hasInitialLocation || hasPlaceholder

        getLocation(true, shouldForceFreshFetch, false)
          .then((freshLoc) => {
            if (freshLoc) {
              setLocation(freshLoc)
              setPermissionGranted(true)
              // Persist coordinates to backend/Firebase only if logged in (updateLocationInDB already guards)
              if (freshLoc.latitude && freshLoc.longitude) {
                updateLocationInDB(freshLoc).catch(() => {})
              }
            }
            // Start watching for live updates regardless (guest users included)
            startWatchingLocation()
          })
          .catch(() => {
            // Even if initial fetch fails (e.g., denied), keep watcher active; it may succeed later.
            startWatchingLocation()
          })
      } catch (err) {
        setLoading(false);
        hasInitializedRef.current = false // Reset flag on error
      } finally {
        // Reset flag after a delay to allow for retries if needed
        setTimeout(() => {
          hasInitializedRef.current = false
        }, 1000)
      }
    };

    // Only check permissions/start watching if we already have a saved location
    checkPermissionAndStart();

    // Battery/perf: pause watcher when tab is hidden; resume when visible.
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopWatchingLocation()
      } else {
        startWatchingLocation()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup timeout and watcher
    return () => {
      clearTimeout(loadingTimeout)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopWatchingLocation()
    }
  }, [])

  const requestLocation = async () => {
    // Reset the fetching flag to allow new request even if one was in progress
    isFetchingLocationRef.current = false
    // User explicitly requested current GPS location; exit manual override mode.
    manualOverrideEnabledRef.current = false
    try {
      localStorage.removeItem(MANUAL_OVERRIDE_STORAGE_KEY)
    } catch {}
    
    setLoading(true)
    setError(null)

    try {
      // Don't clear localStorage yet - keep it as fallback if geolocation fails
      // We'll update it after successfully getting new location

      // Show loading, so pass showLoading = true
      // forceFresh = true, updateDB = true, showLoading = true
      // This ensures we get fresh GPS coordinates and reverse geocode with Google Maps
      const location = await getLocation(true, true, true)

      if (!location) {
        throw new Error("Failed to get location. Please check your GPS settings and try again.")
      }

      if (!location.latitude || !location.longitude) {
        throw new Error("Invalid location data received. Please try again.")
      }

      // Verify we got complete address (POI, building, floor, area, city, state, pincode)
      if (!location?.formattedAddress ||
        location.formattedAddress === "Select location" ||
        location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) ||
        location.formattedAddress.split(',').length < 4) {
      }

      // Restart watching for live updates
      startWatchingLocation()

      return location
    } catch (err) {
      setError(err.message || "Failed to get location")
      
      // Try to use cached location as fallback
      const cached = localStorage.getItem("userLocation")
      if (cached) {
        try {
          const cachedLocation = JSON.parse(cached)
          if (cachedLocation?.latitude && cachedLocation?.longitude) {
            setLocation(cachedLocation)
            // Don't throw error if we have cached location
            setLoading(false)
            return cachedLocation
          }
        } catch (e) {
        }
      }
      
      // Still try to start watching in case it works
      startWatchingLocation()
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    location,
    loading,
    error,
    permissionGranted,
    requestLocation,
    startWatchingLocation,
    stopWatchingLocation,
    setManualLocation,
    isManualOverrideEnabled: manualOverrideEnabledRef.current,
  }
}
