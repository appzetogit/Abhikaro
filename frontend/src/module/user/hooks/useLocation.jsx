import { useState, useEffect, useRef } from "react"
import { locationAPI, userAPI } from "@/lib/api"

export function useLocation() {
  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [permissionGranted, setPermissionGranted] = useState(false)

  const watchIdRef = useRef(null)
  const updateTimerRef = useRef(null)
  const prevLocationCoordsRef = useRef({ latitude: null, longitude: null })
  const retryCountRef = useRef(0) // Track retry attempts for reverse geocoding
  const isFetchingLocationRef = useRef(false) // Prevent multiple simultaneous location fetches
  const hasInitializedRef = useRef(false) // Prevent multiple initializations

  // Helper to check if user is authenticated (used to decide live watch / DB updates)
  const isUserAuthenticated = () => {
    const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
    return !!userToken && userToken !== 'null' && userToken !== 'undefined'
  }

  /* ===================== DB UPDATE (LIVE LOCATION TRACKING) ===================== */
  const updateLocationInDB = async (locationData) => {
    try {
      // CRITICAL: Always save coordinates to Firebase even if address is placeholder
      // Coordinates are valid and useful for order calculations, even without address
      // Address can be retried later without losing coordinates
      if (!locationData?.latitude || !locationData?.longitude) {
        console.log("⚠️ Skipping DB update - missing coordinates:", locationData);
        return;
      }

      // Check if address has placeholder values (for logging only)
      const hasPlaceholderAddress =
        locationData?.city === "Current Location" ||
        locationData?.address === "Select location" ||
        locationData?.formattedAddress === "Select location" ||
        (!locationData?.city && !locationData?.address && !locationData?.formattedAddress);

      if (hasPlaceholderAddress) {
        console.log("⚠️ Address is placeholder, but saving coordinates to Firebase:", {
          coordinates: `${locationData.latitude}, ${locationData.longitude}`,
          city: locationData?.city,
          address: locationData?.address
        });
        // Continue to save coordinates even if address is placeholder
      }

      // Check if user is authenticated before trying to update DB
      if (!isUserAuthenticated()) {
        // User not logged in - skip DB update, just use localStorage (log only in dev)
        if (process.env.NODE_ENV === 'development') {
          console.log("ℹ️ User not authenticated, skipping DB update (using localStorage only)")
        }
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

      console.log("💾 Updating live location in database:", {
        coordinates: `${locationPayload.latitude}, ${locationPayload.longitude}`,
        formattedAddress: locationPayload.formattedAddress,
        city: locationPayload.city,
        area: locationPayload.area,
        accuracy: locationPayload.accuracy
      })

      // Get user ID from token (userToken already declared above)
      let userId = null
      if (userToken) {
        try {
          // Try to decode JWT to get user ID (simple base64 decode)
          const payload = JSON.parse(atob(userToken.split('.')[1]))
          userId = payload._id || payload.id || payload.userId
        } catch (e) {
          console.warn("⚠️ Could not extract userId from token:", e)
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
          console.log("✅ Location saved directly to Firebase as backup")
        } catch (firebaseErr) {
          console.warn("⚠️ Failed to save to Firebase directly:", firebaseErr)
        }
      }

      // Save to backend (which also saves to Firebase)
      const response = await userAPI.updateLocation(locationPayload)
      
      console.log("✅ Live location successfully stored in database and Firebase:", {
        response: response?.data,
        message: response?.data?.message || "Location updated",
        userId: userId || "unknown"
      })
    } catch (err) {
      // Only log non-network and non-auth errors
      if (err.code !== "ERR_NETWORK" && err.response?.status !== 404 && err.response?.status !== 401) {
        console.error("❌ DB location update error:", err)
      } else if (err.response?.status === 404 || err.response?.status === 401) {
        // 404 or 401 means user not authenticated or route doesn't exist
        // Silently skip - this is expected for non-authenticated users
        console.log("ℹ️ Location update skipped (user not authenticated or route not available)")
      }
    }
  }

  // Google Places API removed - using OLA Maps only

  /* ===================== DIRECT REVERSE GEOCODE ===================== */
  const reverseGeocodeDirect = async (latitude, longitude) => {
    try {
      // FIRST: Try backend API (more reliable, handles errors better)
      try {
        console.log("🔍 Trying backend reverse geocoding API:", { latitude, longitude })
        const backendResponse = await locationAPI.reverseGeocode(latitude, longitude)
        
        if (backendResponse?.data?.success && backendResponse?.data?.data?.results?.[0]) {
          const result = backendResponse.data.data.results[0]
          const addressComponents = result.address_components || {}
          
          const city = addressComponents.city || ""
          const state = addressComponents.state || ""
          const country = addressComponents.country || ""
          const area = addressComponents.area || ""
          const formattedAddress = result.formatted_address || ""
          
          // Check if we got valid data (not just coordinates)
          if (formattedAddress && !formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
            console.log("✅ Backend reverse geocoding successful:", {
              city,
              area,
              formattedAddress
            })
            
            return {
              city: city || "Current Location",
              state: state || "",
              country: country || "",
              area: area || "",
              address: area || city || formattedAddress || "Current Location",
              formattedAddress: formattedAddress || `${area ? area + ', ' : ''}${city || 'Current Location'}`,
            }
          }
        }
      } catch (backendError) {
        console.warn("⚠️ Backend reverse geocoding failed, trying direct BigDataCloud:", backendError.message)
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
          console.warn("⚠️ BigDataCloud returned empty response:", data)
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
        console.warn("⚠️ Reverse geocoding failed:", error.message)
      } else {
        // Network error - silently return placeholder (coordinates will still be saved)
        console.log("ℹ️ Reverse geocoding unavailable (network error) - using coordinates only")
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
          console.warn('Failed to load cache utility:', err);
          return null;
        });
        
        if (cacheModule) {
          const { getCached, setCached, shouldMakeApiCall } = cacheModule;
          
          const cachedResult = getCached('geocoding', latitude, longitude);
          if (cachedResult) {
            console.log("✅ Using cached geocoding result");
            return cachedResult;
          }
          
          // Check rate limit
          if (!shouldMakeApiCall('geocoding')) {
            console.warn("⚠️ Geocoding API rate limit reached, using fallback");
            return reverseGeocodeDirect(latitude, longitude);
          }
        }
      } catch (error) {
        console.warn('Cache utility not available:', error);
      }
      
      // Get Google Maps API key from backend database
      const { getGoogleMapsApiKey } = await import('@/lib/utils/googleMapsApiKey.js');
      const GOOGLE_MAPS_API_KEY = await getGoogleMapsApiKey();

      if (!GOOGLE_MAPS_API_KEY) {
        console.warn("⚠️ Google Maps API key not found, using fallback");
        console.warn("⚠️ Please set Google Maps API Key in ENV Setup");
        return reverseGeocodeDirect(latitude, longitude);
      }

      console.log("🔍 Fetching address from Google Maps for:", latitude, longitude);
      console.log("🔍 Using Google Maps API Key:", GOOGLE_MAPS_API_KEY.substring(0, 10) + "...");
      console.log("🔍 Coordinates precision:", {
        lat: latitude.toFixed(8),
        lng: longitude.toFixed(8)
      });

      // Validate coordinates are in India range BEFORE fetching
      // India: Latitude 6.5° to 37.1° N, Longitude 68.7° to 97.4° E
      const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0

      if (!isInIndiaRange || longitude < 0) {
        console.warn("⚠️ Coordinates are outside India range - skipping geocoding")
        console.warn("⚠️ Coordinates: Lat", latitude, "Lng", longitude)
        console.warn("⚠️ India Range: Lat 6.5-37.1, Lng 68.7-97.4 (must be positive/East)")
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
          console.warn("⚠️⚠️⚠️ Google Maps API returned HTTP 403 - using fallback reverse geocoding");
          console.warn("⚠️ This usually means API key restrictions or billing issues");
          console.warn("⚠️ Falling back to alternative reverse geocoding service...");
          return reverseGeocodeDirect(latitude, longitude);
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        data = await response.json();
      } catch (error) {
        clearTimeout(timeoutId); // Clear timeout on error
        if (error.name === 'AbortError') {
          console.error("❌ Google Maps API request was aborted due to timeout");
          throw new Error("Google Maps API timeout");
        }
        throw error;
      }

      // Check if response is valid
      if (!data) {
        console.error("❌ Google Maps API returned null/undefined response");
        throw new Error("Google Maps API returned null response");
      }

      // Log full response for debugging
      console.log("📦📦📦 Google Maps API Full Response:", {
        status: data.status,
        error_message: data.error_message,
        results_count: data.results?.length || 0,
        has_results: !!data.results && data.results.length > 0
      });

      // Check for API errors - handle 403 gracefully and use fallback
      if (data.status === "REQUEST_DENIED") {
        console.warn("⚠️⚠️⚠️ Google Maps API REQUEST_DENIED (403) - using fallback reverse geocoding");
        console.warn("⚠️ Error message:", data.error_message);
        console.warn("⚠️ Possible reasons:");
        console.warn("   1. API key is invalid or missing");
        console.warn("   2. Geocoding API is not enabled in Google Cloud Console");
        console.warn("   3. Billing is not enabled");
        console.warn("   4. API key restrictions are blocking the request");
        console.warn("⚠️ Falling back to alternative reverse geocoding service...");
        // Don't throw error - let it fall back to reverseGeocodeDirect
        return reverseGeocodeDirect(latitude, longitude);
      }

      if (data.status === "OVER_QUERY_LIMIT") {
        console.error("❌❌❌ Google Maps API OVER_QUERY_LIMIT!");
        console.error("❌ You have exceeded your quota. Check billing in Google Cloud Console");
        throw new Error("Google Maps API quota exceeded. Check billing.");
      }

      if (data.status === "ZERO_RESULTS") {
        console.warn("⚠️⚠️⚠️ Google Maps API ZERO_RESULTS!");
        console.warn("⚠️ No results found for these coordinates:", latitude, longitude);
        console.warn("⚠️ This might mean the coordinates are invalid or in an unmapped area");
        throw new Error("No address found for these coordinates");
      }

      if (data.status !== "OK" || !data.results || data.results.length === 0) {
        console.error("❌ Google Maps Geocoding Error:", {
          status: data.status,
          error_message: data.error_message,
          results_count: data.results?.length || 0
        });
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
        console.warn("⚠️ No India results found in geocoding response")
        // Check if first result is foreign
        const firstResult = data.results[0]
        const addressComponents = firstResult.address_components || []
        const countryComponent = addressComponents.find(ac => ac.types.includes('country'))

        if (countryComponent && countryComponent.short_name !== 'IN' && countryComponent.long_name !== 'India') {
          console.error("❌ Address is from foreign country:", countryComponent.long_name)
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
            console.log(`✅✅✅ Found India result with exact location at index ${i}`, {
              hasPremise,
              hasEstablishment,
              hasStreetAddress,
              hasPOI
            });
            break;
          }
        }

        // If no specific result found, use first India result
        if (!exactResult) {
          exactResult = indiaResults[0];
          console.log("⚠️ No premise/establishment found, using first India result");
        }
      }

      const addressComponents = exactResult.address_components || [];
      const formattedAddress = exactResult.formatted_address || "";

      // Validate address is not foreign (additional check)
      const foreignPattern = /\b(USA|United States|Los Angeles|California|CA \d{5}|New York|NY|UK|United Kingdom|London|Canada|Australia|Singapore|Dubai)\b/i
      if (foreignPattern.test(formattedAddress)) {
        console.error("❌ REJECTED: Address is from foreign country:", formattedAddress)
        throw new Error("Foreign address detected")
      }

      // Log detailed information about the selected result
      console.log(`📦 Using results[${bestResultIndex}] (Most Precise - Zomato Style):`, {
        index: bestResultIndex,
        formattedAddress,
        formattedAddressParts: formattedAddress.split(',').length,
        hasPOI: addressComponents.some(c => c.types.includes("point_of_interest")),
        hasPremise: addressComponents.some(c => c.types.includes("premise")),
        hasSublocality: addressComponents.some(c => c.types.includes("sublocality_level_1")),
        allComponents: addressComponents.map(c => ({
          name: c.long_name,
          types: c.types
        }))
      });

      // If formattedAddress is incomplete (only 2 parts = city, state), log warning
      const addressPartsCount = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0).length;
      if (addressPartsCount <= 2 && !addressComponents.some(c => c.types.includes("point_of_interest") || c.types.includes("premise"))) {
        console.warn("⚠️⚠️⚠️ Incomplete address detected - only city/state level");
        console.warn("⚠️ Address parts count:", addressPartsCount);
        console.warn("⚠️ This usually means:");
        console.warn("   1. GPS coordinates are not accurate (network-based location instead of GPS)");
        console.warn("   2. Location is on a road/street without specific building");
        console.warn("   3. Solution: Use mobile device for better GPS accuracy (enableHighAccuracy: true)");
      }

      // Log ALL results to see what Google is returning
      console.log("📦 Google Maps API Response - All Results:", {
        totalResults: data.results.length,
        results: data.results.map((r, i) => ({
          index: i,
          formatted_address: r.formatted_address,
          types: r.types,
          hasPOI: r.address_components?.some(c => c.types.includes("point_of_interest")),
          hasPremise: r.address_components?.some(c => c.types.includes("premise")),
          hasSublocality: r.address_components?.some(c => c.types.includes("sublocality_level_1"))
        }))
      });

      console.log("📦 Using results[0] (Most Precise - Zomato Style):", {
        status: data.status,
        formattedAddress,
        addressComponentsCount: addressComponents.length,
        hasPremise: addressComponents.some(c => c.types.includes("premise")),
        hasPOI: addressComponents.some(c => c.types.includes("point_of_interest")),
        hasSublocality: addressComponents.some(c => c.types.includes("sublocality_level_1")),
        allComponentTypes: addressComponents.map(c => ({
          name: c.long_name,
          types: c.types
        }))
      });

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
          console.log("✅ Found POI:", pointOfInterest);
        }

        // Premise - Building name (e.g., "Princess Center", "501 Princess Center")
        if (types.includes("premise") && !premise) {
          premise = longName;
          console.log("✅ Found premise:", premise);
        }

        // Subpremise - Floor/Unit (e.g., "5th Floor", "G-2")
        if (types.includes("subpremise")) {
          floor = longName;
          console.log("✅ Found floor/subpremise:", floor);
        }

        // Street number (e.g., "501")
        if (types.includes("street_number") && !streetNumber) {
          streetNumber = longName;
          console.log("✅ Found street number:", streetNumber);
        }

        // Route/Street name
        if (types.includes("route") && !street) {
          street = longName;
          console.log("✅ Found route:", street);
        }

        // Sublocality Level 1 - Area name (e.g., "New Palasia")
        if (types.includes("sublocality_level_1") && !sublocalityLevel1) {
          sublocalityLevel1 = longName;
          console.log("✅ Found sublocality_level_1:", sublocalityLevel1);
        }

        // Sublocality Level 2 - Sub-area name
        if (types.includes("sublocality_level_2") && !sublocalityLevel2) {
          sublocalityLevel2 = longName;
          console.log("✅ Found sublocality_level_2:", sublocalityLevel2);
        }

        // City (locality)
        if (types.includes("locality") && !city) {
          city = longName;
          console.log("✅ Found city:", city);
        } else if (types.includes("administrative_area_level_2") && !city) {
          city = longName;
          console.log("✅ Found city from admin_area_level_2:", city);
        }

        // State
        if (types.includes("administrative_area_level_1") && !state) {
          state = longName;
          console.log("✅ Found state:", state);
        }

        // Postal Code (Pincode)
        if (types.includes("postal_code") && !postalCode) {
          postalCode = longName;
          console.log("✅ Found postal code:", postalCode);
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
      {
        // Fallback to geocoding components
        const building = addressComponents.find(c =>
          c.types.includes("point_of_interest") ||
          c.types.includes("premise") ||
          c.types.includes("sublocality_level_1")
        );

        if (building) {
          mainTitle = building.long_name;
          console.log("✅✅✅ ZOMATO-STYLE: Found exact building/cafe name from geocoding:", mainTitle);
        } else {
          mainTitle = "Location Found";
          console.warn("⚠️ No building/cafe name found in address components");
        }
      }

      // Use mainTitle as mainLocation (Zomato-style)
      let mainLocation = mainTitle;

      // Set area from main location (Zomato priority order)
      if (mainLocation && mainLocation !== "Location Found") {
        area = mainLocation;
        console.log("✅✅✅ ZOMATO-STYLE: Using mainTitle as area:", area);
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
        console.log("✅✅✅ Using Google's formatted_address directly (complete - 4+ parts):", completeFormattedAddress);
      } else if (completeAddressParts.length > 0 && (pointOfInterest || premise)) {
        // Build from components if we have POI/premise
        completeFormattedAddress = completeAddressParts.join(', ');
        console.log("✅ Using built address from components:", completeFormattedAddress);
      } else {
        // Google's formatted_address is incomplete - log warning
        console.warn("⚠️⚠️⚠️ Google's formatted_address is incomplete (only 2-3 parts):", formattedAddress);
        console.warn("⚠️ This usually means:");
        console.warn("   1. GPS coordinates are not accurate (network-based location)");
        console.warn("   2. Location is in a generic area without specific POI/premise");
        console.warn("   3. Try on mobile device for better GPS accuracy");
        completeFormattedAddress = formattedAddress; // Use what we have
      }

      // Build display address (for navbar) - ZOMATO-STYLE: Show exact landmark first
      // Format: "Mama Loca Cafe, 501 Princess Center, 5th Floor, New Palasia"
      let displayAddressParts = [];

      // Priority 1: Use mainTitle/mainLocation (building/cafe name) - ZOMATO-STYLE
      // This is the exact Zomato approach - show "Mama Loca Cafe" as the main title
      if (mainLocation && mainLocation.trim() !== "" && mainLocation !== "Location Found") {
        displayAddressParts.push(mainLocation);
        console.log("✅✅✅ ZOMATO-STYLE: Using mainTitle/mainLocation for display:", mainLocation);
      } else if (pointOfInterest && pointOfInterest.trim() !== "") {
        // Fallback to pointOfInterest if mainLocation not set
        displayAddressParts.push(pointOfInterest);
        console.log("✅ Using pointOfInterest for display:", pointOfInterest);
      } else if (premise && premise.trim() !== "") {
        // Fallback to premise
        displayAddressParts.push(premise);
        console.log("✅ Using premise for display:", premise);
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
        console.log("🔍 Extracting from formatted_address (fallback):", formattedAddress);
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

        console.log("📋 Filtered parts from formatted_address:", filteredParts);

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
          console.log("✅✅✅ Extracted locality from formatted_address (before city):", displayAddressParts);
        } else if (filteredParts.length >= 4) {
          // If city not found, take first 4 parts (usually POI, building, floor, area)
          displayAddressParts = filteredParts.slice(0, 4);
          console.log("✅ Using first 4 parts from formatted_address:", displayAddressParts);
        } else if (filteredParts.length >= 3) {
          displayAddressParts = filteredParts.slice(0, 3);
          console.log("✅ Using first 3 parts from formatted_address:", displayAddressParts);
        } else if (filteredParts.length >= 2) {
          displayAddressParts = filteredParts.slice(0, 2);
          console.log("✅ Using first 2 parts from formatted_address:", displayAddressParts);
        } else if (filteredParts.length >= 1) {
          displayAddressParts = [filteredParts[0]];
          console.log("✅ Using first part from formatted_address:", displayAddressParts);
        }
      }

      // Final display address - prioritize extracted parts, fallback to area/mainLocation
      const displayAddress = displayAddressParts.length > 0
        ? displayAddressParts.join(', ')
        : (mainLocation || area || city || "Select location");

      console.log("🎯🎯🎯 FINAL Display Address:", displayAddress);

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

      console.log("✅✅✅ Reverse Geocode Complete Address (NO Google Places API):", {
        mainTitle, // ZOMATO-STYLE: Building/Cafe name
        mainLocation, // ZOMATO-STYLE: Main location for display
        pointOfInterest,
        premise,
        streetNumber,
        floor,
        sublocalityLevel1,
        city,
        state,
        postalCode,
        completeFormattedAddress,
        displayAddress,
        area,
        formattedAddressFromGoogle: formattedAddress
      });

      // Final validation: Ensure mainTitle/mainLocation is used properly
      if (mainTitle && mainTitle !== "Location Found") {
        console.log("✅✅✅ ZOMATO-STYLE SUCCESS: Exact building/cafe name extracted:", mainTitle);
      } else {
        console.warn("⚠️⚠️⚠️ ZOMATO-STYLE WARNING: Could not extract exact building/cafe name");
        console.warn("⚠️ This might be due to:");
        console.warn("   1. Location is not at a specific building/cafe (e.g., on a road)");
        console.warn("   2. Google Maps doesn't have POI/premise data for this location");
        console.warn("   3. GPS accuracy is low (try on mobile device)");
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

      console.log("✅✅✅ FINAL Location Result (ZOMATO-STYLE, NO Google Places API):", {
        mainTitle: locationResult.mainTitle,
        address: locationResult.address,
        formattedAddress: locationResult.formattedAddress,
        area: locationResult.area,
        city: locationResult.city,
        state: locationResult.state,
        hasCompleteAddress: locationResult.formattedAddress &&
          locationResult.formattedAddress.split(',').length >= 4
      });

      // Cache the result
      try {
        const cacheModule = await import('@/lib/utils/googleMapsApiCache.js').catch(() => null);
        if (cacheModule) {
          const { setCached } = cacheModule;
          setCached('geocoding', locationResult, latitude, longitude);
        }
      } catch (error) {
        console.warn('Failed to cache geocoding result:', error);
      }

      return locationResult;
    } catch (error) {
      console.error("❌❌❌ Google Maps Reverse Geocode Error:", error);
      console.error("❌ Error details:", {
        message: error.message,
        stack: error.stack,
        coordinates: { latitude, longitude }
      });

      // If it's an API key or billing error, don't fallback - show error
      if (error.message.includes("REQUEST_DENIED") || error.message.includes("OVER_QUERY_LIMIT")) {
        console.error("❌❌❌ CRITICAL: Google Maps API configuration issue!");
        console.error("❌ Please check:");
        console.error("   1. API key is correct in .env file");
        console.error("   2. Geocoding API is enabled in Google Cloud Console");
        console.error("   3. Billing is enabled and linked");
        console.error("   4. API key restrictions allow this request");

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
      console.warn("⚠️ Trying fallback reverse geocoding...");
      return reverseGeocodeDirect(latitude, longitude);
    }
  };

  /* ===================== OLA MAPS REVERSE GEOCODE (DEPRECATED - KEPT FOR FALLBACK) ===================== */
  const reverseGeocodeWithOLAMaps = async (latitude, longitude) => {
    try {
      console.log("🔍 Fetching address from OLA Maps for:", latitude, longitude)

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OLA Maps API timeout")), 10000)
      )

      const apiPromise = locationAPI.reverseGeocode(latitude, longitude)
      const res = await Promise.race([apiPromise, timeoutPromise])

      // Log full response for debugging
      console.log("📦 Full OLA Maps API Response:", JSON.stringify(res?.data, null, 2))

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

      // Debug: Check backend data structure
      console.log("🔍 Backend data structure:", {
        hasResults: !!backendData.results,
        hasResult: !!backendData.result,
        keys: Object.keys(backendData),
        dataType: typeof backendData,
        backendData: JSON.stringify(backendData, null, 2).substring(0, 500) // First 500 chars
      })

      // Handle different OLA Maps response structures
      // Backend processes OLA Maps response and returns: { results: [{ formatted_address, address_components: { city, state, area } }] }
      let result = null;
      if (backendData.results && Array.isArray(backendData.results) && backendData.results.length > 0) {
        result = backendData.results[0];
        console.log("✅ Using results[0] from backend")
      } else if (backendData.result && Array.isArray(backendData.result) && backendData.result.length > 0) {
        result = backendData.result[0];
        console.log("✅ Using result[0] from backend")
      } else if (backendData.results && !Array.isArray(backendData.results)) {
        result = backendData.results;
        console.log("✅ Using results object from backend")
      } else {
        result = backendData;
        console.log("⚠️ Using backendData directly (fallback)")
      }

      if (!result) {
        console.warn("⚠️ No result found in backend data")
        result = {};
      }

      console.log("📦 Parsed result:", {
        hasFormattedAddress: !!result.formatted_address,
        hasAddressComponents: !!result.address_components,
        formattedAddress: result.formatted_address,
        addressComponents: result.address_components
      })

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

      console.log("📦 Parsed result structure:", {
        result,
        addressComponents,
        hasArrayComponents: Array.isArray(result.address_components),
        hasObjectComponents: !Array.isArray(result.address_components) && !!result.address_components
      })

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

        console.log("🔍 Parsing formatted address for area:", { formattedAddress, addressParts, city, state, currentArea: area })

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
              console.log("✅✅✅ EXTRACTED AREA from formatted address (3+ parts):", area)

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
            console.log("✅ Extracted area from 2 part address:", area)
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
                console.log("⚠️ Single part address - ambiguous, not using as area:", singlePart)
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
            console.log("⚠️ address_components has area but formatted_address might have full name, re-checking formatted_address")
          } else {
            area = fallbackArea
            console.log("✅ Extracted area from address_components (fallback):", area)
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
        console.log("🔍 Final fallback: Parsing formatted_address for area", { parts, city, state })

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
            console.log("✅✅✅ FORCE EXTRACTED area (final fallback):", area)
          }
        }
      }

      // Final validation and logging
      console.log("✅✅✅ FINAL PARSED OLA Maps response:", {
        city,
        state,
        country,
        area,
        formattedAddress,
        hasArea: !!area,
        areaLength: area?.length || 0
      })

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
            console.log("✅✅✅ ZOMATO-STYLE EXTRACTION:", { area, city, state })
          }
        } else if (parts.length === 2) {
          // Only 2 parts: "Indore, Madhya Pradesh" - area is missing
          // OLA Maps API didn't provide sublocality
          console.warn("⚠️ Only 2 parts in address - OLA Maps didn't provide sublocality")
          // Try to extract from other fields in the response
          // Check if result has any other location fields
          if (result.locality && result.locality !== city) {
            area = result.locality
            console.log("✅ Using locality as area:", area)
          } else if (result.neighborhood) {
            area = result.neighborhood
            console.log("✅ Using neighborhood as area:", area)
          } else {
            // Leave area empty - will show city instead
            area = ""
          }
        }
      }

      // FINAL VALIDATION: Never use state as area!
      if (area && state && area.toLowerCase() === state.toLowerCase()) {
        console.warn("⚠️⚠️⚠️ REJECTING area (same as state):", area)
        area = ""
      }

      // FINAL VALIDATION: Reject district names
      if (area && area.toLowerCase().includes("district")) {
        console.warn("⚠️⚠️⚠️ REJECTING area (contains district):", area)
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

        console.log("✅✅✅ RETURNING LOCATION DATA:", finalLocation)
        return finalLocation
      }

      // If no valid data, throw to trigger fallback
      throw new Error("No valid address data from OLA Maps")
    } catch (err) {
      console.warn("⚠️ OLA Maps failed, falling back to direct reverse geocoding:", err.message)
      // Fallback to direct reverse geocoding (BigDataCloud / backend only, no Google Maps)
      try {
        return await reverseGeocodeDirect(latitude, longitude)
      } catch (fallbackErr) {
        // If all fail, return minimal location data
        console.error("❌ All reverse geocoding failed:", fallbackErr)
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
          console.warn("⚠️ Coordinates from DB are outside India range:", { latitude: loc.latitude, longitude: loc.longitude })
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

        try {
          const addr = await reverseGeocodeDirect(
            loc.latitude,
            loc.longitude
          )
          return { ...addr, latitude: loc.latitude, longitude: loc.longitude }
        } catch (geocodeErr) {
          // If reverse geocoding fails, return location without coordinates in address
          console.warn("⚠️ Reverse geocoding failed in fetchLocationFromDB:", geocodeErr.message)
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
        console.error("DB location fetch error:", err)
      }
    }
    return null
  }

  /* ===================== MAIN LOCATION ===================== */
  const getLocation = async (updateDB = true, forceFresh = false, showLoading = false) => {
    // If forceFresh is true, allow the request even if another is in progress (user explicitly requested)
    if (isFetchingLocationRef.current && !forceFresh) {
      if (process.env.NODE_ENV === 'development') {
        console.log("⏸️ Location fetch already in progress, skipping duplicate call", { forceFresh })
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
        setLocation(dbLocation)
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
        console.log(`📍 Requesting location${isRetry ? ' (retry with lower accuracy)' : ' (high accuracy)'}...`)
        console.log(`📍 Force fresh: ${forceFresh ? 'YES' : 'NO'}, updateDB: ${updateDB}, showLoading: ${showLoading}`)
        console.log(`📍 Options:`, {
          enableHighAccuracy: options.enableHighAccuracy,
          timeout: options.timeout,
          maximumAge: options.maximumAge
        })

        // Use cached location if available and not too old (faster response)
        // If forceFresh is true, don't use cache (maximumAge: 0)
        const cachedOptions = {
          ...options,
          maximumAge: forceFresh ? 0 : (options.maximumAge || 60000), // If forceFresh, get fresh location
        }
        
        console.log(`📍 Final geolocation options:`, cachedOptions)

        console.log(`🔵 Calling navigator.geolocation.getCurrentPosition with options:`, cachedOptions)
        
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const { latitude, longitude, accuracy } = pos.coords
              const timestamp = pos.timestamp || Date.now()

              console.log(`✅✅✅ Got location${isRetry ? ' (lower accuracy)' : ' (high accuracy)'}:`, {
                latitude,
                longitude,
                accuracy: `${accuracy}m`,
                timestamp: new Date(timestamp).toISOString(),
                coordinates: `${latitude.toFixed(8)}, ${longitude.toFixed(8)}`,
                forceFresh,
                updateDB
              })

              // Validate coordinates are in India range BEFORE attempting geocoding
              // India: Latitude 6.5° to 37.1° N, Longitude 68.7° to 97.4° E
              const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0

              // Get address from reverse geocoding service (no Google Maps)
              let addr
              if (!isInIndiaRange || longitude < 0) {
                // Coordinates are outside India - skip geocoding and use placeholder
                console.warn("⚠️ Coordinates outside India range, skipping geocoding:", { latitude, longitude })
                addr = {
                  city: "Current Location",
                  state: "",
                  country: "",
                  area: "",
                  address: "Select location",
                  formattedAddress: "Select location",
                }
              } else {
                console.log("🔍 Calling reverse geocode with coordinates (no Google Maps):", { latitude, longitude })
                try {
                  addr = await reverseGeocodeDirect(latitude, longitude)
                  console.log("✅ Reverse geocoding successful:", addr)

                  // Validate result - if it still has placeholder values, don't save
                  if (addr.city === "Current Location" || addr.address.includes(latitude.toFixed(4))) {
                    console.warn("⚠️ Reverse geocoding returned placeholder, will not save")
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
                  console.error("❌ Geocoding failed:", fallbackErr.message)
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
              console.log("✅ Reverse geocode result:", addr)

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
                ...addr, // This includes: city, state, area, street, streetNumber, postalCode, formattedAddress
                latitude,
                longitude,
                accuracy: accuracy || null,
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
                console.warn("⚠️ Address is placeholder, but saving coordinates to Firebase:", {
                  coordinates: `${latitude}, ${longitude}`,
                  address: finalLoc.address
                })
                
                // Even if address is placeholder, DON'T show coordinates - keep trying to get address
              // Coordinates will be saved to Firebase but UI should show "Current Location" or retry
              // We'll retry reverse geocoding in background to get proper address
              }

              console.log("💾 Saving location:", finalLoc)
              localStorage.setItem("userLocation", JSON.stringify(finalLoc))
              setLocation(finalLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              setError(null)

              // CRITICAL: Always save coordinates to Firebase immediately, even if address is placeholder
              // Don't wait for debounce - save immediately when location is first fetched
              if (updateDB) {
                console.log("🔥 Saving location to database and Firebase immediately:", {
                  coordinates: `${finalLoc.latitude}, ${finalLoc.longitude}`,
                  hasAddress: !!finalLoc.address && finalLoc.address !== "Select location"
                })
                await updateLocationInDB(finalLoc).catch(err => {
                  console.error("❌ Failed to update location in DB:", err)
                })
              } else {
                console.warn("⚠️ updateDB is false, skipping database update")
              }
              isFetchingLocationRef.current = false // Reset flag on success
              resolve(finalLoc)
            } catch (err) {
              console.error("❌ Error processing location:", err)
              // Try one more time with direct reverse geocode as last resort
              const { latitude, longitude } = pos.coords

              try {
                console.log("🔄 Last attempt: trying direct reverse geocode...")
                const lastResortAddr = await reverseGeocodeDirect(latitude, longitude)

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
                    accuracy: pos.coords.accuracy || null
                  }
                  console.log("✅ Last resort geocoding succeeded:", lastResortLoc)
                  localStorage.setItem("userLocation", JSON.stringify(lastResortLoc))
                  setLocation(lastResortLoc)
                  setPermissionGranted(true)
                  if (showLoading) setLoading(false)
                  setError(null)
                  if (updateDB) await updateLocationInDB(lastResortLoc).catch(() => { })
                  isFetchingLocationRef.current = false // Reset flag on success
                  resolve(lastResortLoc)
                  return
                } else {
                  console.warn("⚠️ Last resort geocoding returned invalid data:", lastResortAddr)
                }
              } catch (lastErr) {
                console.error("❌ Last resort geocoding also failed:", lastErr.message)
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
              }
              // CRITICAL: Save coordinates even if address is placeholder - coordinates are still useful
              console.warn("⚠️ All geocoding failed, but saving coordinates to database and Firebase:", {
                coordinates: `${latitude}, ${longitude}`
              })
              localStorage.setItem("userLocation", JSON.stringify(fallbackLoc))
              setLocation(fallbackLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              // CRITICAL: Save coordinates to database and Firebase even if address is placeholder
              if (updateDB) {
                await updateLocationInDB(fallbackLoc).catch(err => {
                  console.error("❌ Failed to update location in DB (fallback):", err)
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
              console.warn("⚠️ Google network location provider returned 403 - trying GPS-only mode...")
              // Try again with high accuracy only (GPS, skip network-based location)
              if (retryCount === 0) {
                console.warn("🔄 Retrying with GPS-only (high accuracy, longer timeout)...")
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
              console.warn("⏱️ High accuracy timeout, retrying with lower accuracy...")
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
              console.warn("⏱️ Geolocation timeout (code 3) - using fallback location")
            } else if (isGoogle403Error) {
              console.warn("⚠️ Google network location provider 403 - using fallback location")
            } else {
              console.error("❌ Geolocation error:", err.code, err.message)
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
                    console.log("✅ Using cached location from localStorage")
                  } catch (parseErr) {
                    console.warn("⚠️ Failed to parse stored location:", parseErr)
                  }
                }
              }

              if (fallback) {
                console.log("✅ Using fallback location:", fallback)
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
                console.warn("⚠️ No fallback location available and geolocation failed")
                setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
                setPermissionGranted(false)
                if (showLoading) setLoading(false)
                isFetchingLocationRef.current = false // Reset flag on error
                // Reject instead of resolving with invalid location
                reject(new Error(err.code === 3 ? "Location request timed out. Please try again." : err.message))
              }
            } catch (fallbackErr) {
              console.warn("⚠️ Fallback retrieval failed:", fallbackErr)
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
      console.error("❌ Unexpected error in getLocation:", err)
      isFetchingLocationRef.current = false // Reset flag on error
      setError(err.message)
      if (showLoading) setLoading(false)
      return null
    }
  }

  /* ===================== WATCH LOCATION ===================== */
  const startWatchingLocation = () => {
    if (!navigator.geolocation) {
      console.warn("⚠️ Geolocation not supported")
      return
    }

    // If user is not authenticated, don't start live watch to avoid unnecessary updates
    if (!isUserAuthenticated()) {
      if (process.env.NODE_ENV === 'development') {
        console.log("ℹ️ User not authenticated - live location watch disabled (using one-time location only)")
      }
      return
    }

    // Clear any existing watch
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    if (process.env.NODE_ENV === 'development') {
      console.log("👀 Starting to watch location for live updates...")
    }

    let retryCount = 0
    const maxRetries = 2

    const startWatch = (options) => {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            const { latitude, longitude, accuracy } = pos.coords
            if (process.env.NODE_ENV === 'development') {
              console.log("🔄 Location updated:", { latitude, longitude, accuracy: `${accuracy}m` })
            }

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

            if (process.env.NODE_ENV === 'development') {
              console.log("🔄 Live location updated (coordinates only, NO reverse geocoding):", {
                latitude,
                longitude,
                accuracy: `${accuracy}m`,
                address: loc.address,
                city: loc.city
              })
            }

            // STABILITY: Only update if coordinates changed significantly (>10m)
            // Don't check address improvement since we're not calling geocoding
            const prevLoc = location
            if (prevLoc && prevLoc.latitude && prevLoc.longitude) {
              // Calculate distance in meters (Haversine formula simplified for small distances)
              const latDiff = latitude - prevLoc.latitude
              const lngDiff = longitude - prevLoc.longitude
              const distanceMeters = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111320 // ~111320m per degree

              // Only update if moved >10 meters
              if (distanceMeters <= 10) {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`📍 Location unchanged (${distanceMeters.toFixed(1)}m change), skipping update`)
                }
                return // Don't update - coordinates haven't changed significantly
              }

              if (process.env.NODE_ENV === 'development') {
                console.log(`📍 Location updated: ${distanceMeters.toFixed(1)}m change (coordinates only)`)
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
              if (process.env.NODE_ENV === 'development') {
                console.log("💾 Updating live location:", loc)
              }
              localStorage.setItem("userLocation", JSON.stringify(loc))
              setLocation(loc)
              setPermissionGranted(true)
              setError(null)
            } else {
              // Coordinates haven't changed significantly, skip state update to prevent re-renders
              // Still update localStorage silently for persistence
              localStorage.setItem("userLocation", JSON.stringify(loc))
            }

            // Debounce DB updates - only update every 5 seconds to avoid too many API calls
            // Only schedule debounced updates if user is authenticated
            if (isUserAuthenticated()) {
              clearTimeout(updateTimerRef.current)
              updateTimerRef.current = setTimeout(() => {
                if (process.env.NODE_ENV === 'development') {
                  console.log("🔄 Debounced location update - saving to database and Firebase:", {
                    coordinates: `${loc.latitude}, ${loc.longitude}`,
                    hasAddress: !!loc.address && loc.address !== "Select location"
                  })
                }
                updateLocationInDB(loc).catch(err => {
                  console.error("❌ Failed to update location in DB (debounced):", err)
                })
              }, 5000)
            }
          } catch (err) {
            console.error("❌ Error processing live location update:", err)
            // On error, preserve existing location (don't update with placeholder)
            // This ensures we keep the stored address even if coordinate update fails
            console.warn("⚠️ Error updating coordinates, preserving existing location")
          }
        },
        (err) => {
          // Don't log timeout errors for watchPosition (it's a background operation)
          // Only log non-timeout errors
          if (err.code !== 3) {
            console.warn("⚠️ Watch position error (non-timeout):", err.code, err.message)
          }

          // If timeout and we haven't exceeded max retries, retry with HIGH ACCURACY GPS
          // CRITICAL: Keep using GPS (not network-based) for accurate location
          // Network-based location won't give exact landmarks like "Mama Loca Cafe"
          if (err.code === 3 && retryCount < maxRetries) {
            retryCount++
            console.log(`⏱️ GPS timeout, retrying with high accuracy GPS (attempt ${retryCount}/${maxRetries})...`)

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

    console.log("✅✅✅ GPS High Accuracy enabled for live location tracking")
    console.log("✅ Live tracking updates coordinates only (NO reverse geocoding - cuts API costs by 99%)")
    console.log("✅ Address is preserved from stored location")
  }

  const stopWatchingLocation = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    clearTimeout(updateTimerRef.current)
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
          console.log("📂 Loaded stored location instantly:", parsedLocation)
          
          // If address is placeholder, trigger reverse geocoding retry in background
          if (parsedLocation.formattedAddress === "Select location" || 
              parsedLocation.formattedAddress === "Current Location" ||
              parsedLocation.city === "Current Location" ||
              !parsedLocation.formattedAddress ||
              parsedLocation.address === "Current Location") {
            console.log("🔄 Address is placeholder, will retry reverse geocoding in background")
            shouldForceRefresh = true
          }

          // Check if we should refresh in background for better address
          const hasCompleteAddress = parsedLocation?.formattedAddress &&
            parsedLocation.formattedAddress !== "Select location" &&
            !parsedLocation.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) &&
            parsedLocation.formattedAddress.split(',').length >= 4

          if (!hasCompleteAddress) {
            console.log("⚠️ Cached location incomplete, will refresh in background")
            shouldForceRefresh = true
          }
        } else {
          console.log("⚠️ Cached location is placeholder, will fetch fresh")
          shouldForceRefresh = true
        }
      } catch (err) {
        console.error("Failed to parse stored location:", err)
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
            console.log("📂 Loaded location from DB:", dbLoc)

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
          console.warn("⚠️ Loading timeout - setting loading to false")
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

    // Request fresh location in BACKGROUND (non-blocking)
    // CRITICAL FIX: Only auto-request if permission is ALREADY granted
    // This prevents "Requests geolocation permission on page load" warning
    const checkPermissionAndStart = async () => {
      // Prevent multiple simultaneous calls
      if (hasInitializedRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log("⏸️ Location initialization already in progress, skipping duplicate call")
        }
        return
      }
      
      hasInitializedRef.current = true
      
      try {
        let permissionGranted = false;

        if (navigator.permissions && navigator.permissions.query) {
          try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            if (result.state === 'granted') {
              permissionGranted = true;
            } else {
              console.log(`📍 Geolocation permission is '${result.state}' - Waiting for user action (avoiding prompt on load)`);
            }
          } catch (permErr) {
            console.warn("⚠️ Permission query failed:", permErr);
          }
        } else {
          // Fallback for browsers without permissions API - assume not granted to be safe
          console.log("📍 Permissions API not available - Skipping auto-start");
        }

        // If permission NOT granted, and we don't have a specific user request (this is page load),
        // we should SKIP automatic fetching/watching to allow the user to choose when to enable it.
        // UNLESS we already have a valid initial location from localStorage/DB, in which case we might want to refresh?
        // Actually, even then, we shouldn't prompt.
        if (!permissionGranted) {
          // If we have an initial location, we are fine (it's displayed).
          // If we don't, we show "Select Location".
          // In either case, we avoid the PROMPT.
          // Ensure loading is false so UI doesn't hang
          setLoading(false);
          hasInitializedRef.current = false // Reset flag if permission not granted
          return;
        }

        console.log("🚀 Permission granted! Fetching/Watching location...", shouldForceRefresh ? "(FORCE REFRESH)" : "");

        // Always fetch fresh location if we don't have a valid one
        // Check current location state to see if it's a placeholder
        const currentLocation = location
        const hasPlaceholder = currentLocation &&
          (currentLocation.formattedAddress === "Select location" ||
            currentLocation.city === "Current Location")

        const shouldFetch = shouldForceRefresh || !hasInitialLocation || hasPlaceholder

        if (shouldFetch) {
          console.log("🔄 Fetching location - shouldForceRefresh:", shouldForceRefresh, "hasInitialLocation:", hasInitialLocation, "hasPlaceholder:", hasPlaceholder)
          getLocation(true, shouldForceRefresh) // forceFresh = true if cached location is incomplete
            .then((location) => {
              if (location &&
                location.formattedAddress !== "Select location" &&
                location.city !== "Current Location") {
                console.log("✅ Fresh location fetched:", location)
                console.log("✅ Location details:", {
                  formattedAddress: location?.formattedAddress,
                  address: location?.address,
                  city: location?.city,
                  state: location?.state,
                  area: location?.area
                })
                // CRITICAL: Update state with fresh location so PageNavbar displays it
                setLocation(location)
                setPermissionGranted(true)
                
                // CRITICAL: Save location to database and Firebase immediately
                if (location.latitude && location.longitude) {
                  console.log("🔥 Saving valid location to database and Firebase immediately:", {
                    coordinates: `${location.latitude}, ${location.longitude}`,
                    address: location.formattedAddress
                  })
                  updateLocationInDB(location).catch(err => {
                    console.error("❌ Failed to save location to DB:", err)
                  })
                }
                
                // Start watching for live updates
                startWatchingLocation()
              } else {
                // Address is placeholder, but coordinates are valid - save them and retry reverse geocoding
                console.warn("⚠️ Address is placeholder, but coordinates are valid. Retrying reverse geocoding to get place name:", {
                  coordinates: `${location.latitude}, ${location.longitude}`,
                  retryCount: retryCountRef.current
                })
                
                // Save coordinates to Firebase even if address is placeholder
                setLocation(location)
                setPermissionGranted(true)
                
                // Save coordinates to Firebase
                if (location.latitude && location.longitude) {
                  updateLocationInDB(location).catch(err => {
                    console.warn("Failed to save coordinates to Firebase:", err)
                  })
                }
                
                // Retry reverse geocoding with backend API (more reliable)
                // Retry up to 3 times with increasing delays
                if (retryCountRef.current < 3) {
                  retryCountRef.current += 1
                  const retryDelay = retryCountRef.current * 2000 // 2s, 4s, 6s
                  console.log(`🔄 Retrying reverse geocoding via backend API (attempt ${retryCountRef.current}/3) in ${retryDelay}ms...`)
                  
                  setTimeout(() => {
                    // Force fresh reverse geocoding
                    getLocation(true, true)
                      .then((retryLocation) => {
                        if (retryLocation &&
                          retryLocation.formattedAddress !== "Select location" &&
                          retryLocation.city !== "Current Location" &&
                          !retryLocation.formattedAddress.includes('Location (')) {
                          retryCountRef.current = 0 // Reset on success
                          console.log("✅ Reverse geocoding succeeded on retry:", retryLocation.formattedAddress)
                          setLocation(retryLocation)
                          setPermissionGranted(true)
                          updateLocationInDB(retryLocation).catch(() => {})
                        } else {
                          // Still placeholder, will retry again if under limit
                          console.warn("⚠️ Reverse geocoding still returned placeholder, will retry again")
                        }
                        // Start watching regardless of retry result
                        startWatchingLocation()
                      })
                      .catch(() => {
                        // On error, still start watching
                        startWatchingLocation()
                      })
                  }, retryDelay)
                } else {
                  // Max retries reached, start watching - address will show "Current Location"
                  console.log("⚠️ Max retries reached. Address will show 'Current Location' until reverse geocoding succeeds")
                  retryCountRef.current = 0 // Reset for next time
                  startWatchingLocation()
                }
              }
            })
            .catch((err) => {
              console.warn("⚠️ Background location fetch failed (using cached):", err.message)
              // Still start watching in case permission is granted later
              startWatchingLocation()
            })
        } else {
          // We have a valid location, just start watching
          startWatchingLocation()
        }
      } catch (err) {
        console.error("Error in checkPermissionAndStart:", err);
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
    // This avoids "Requests geolocation permission on page load" warnings on fresh visits
    // New users must explicitly click "Use Current Location" first
    const hasStoredLocation = localStorage.getItem("userLocation");
    if (hasStoredLocation) {
      checkPermissionAndStart();
    } else {
      console.log("📍 Fresh visit - skipping auto-geolocation check (waiting for user action)");
      setLoading(false);
    }

    // Cleanup timeout and watcher
    return () => {
      clearTimeout(loadingTimeout)
      console.log("🧹 Cleaning up location watcher")
      stopWatchingLocation()
    }

    return () => {
      console.log("🧹 Cleaning up location watcher")
      stopWatchingLocation()
    }
  }, [])

  const requestLocation = async () => {
    console.log("📍📍📍 User requested location update - fetching fresh")
    console.log("📍📍📍 Resetting isFetchingLocationRef to allow fresh request")
    
    // Reset the fetching flag to allow new request even if one was in progress
    isFetchingLocationRef.current = false
    
    setLoading(true)
    setError(null)

    try {
      // Don't clear localStorage yet - keep it as fallback if geolocation fails
      // We'll update it after successfully getting new location
      console.log("📍 Keeping cached location as fallback until new location is confirmed")

      // Show loading, so pass showLoading = true
      // forceFresh = true, updateDB = true, showLoading = true
      // This ensures we get fresh GPS coordinates and reverse geocode with Google Maps
      console.log("📍📍📍 Calling getLocation with forceFresh=true, updateDB=true, showLoading=true")
      const location = await getLocation(true, true, true)

      if (!location) {
        console.error("❌❌❌ getLocation returned null/undefined")
        throw new Error("Failed to get location. Please check your GPS settings and try again.")
      }

      if (!location.latitude || !location.longitude) {
        console.error("❌❌❌ Location missing coordinates:", location)
        throw new Error("Invalid location data received. Please try again.")
      }

      console.log("✅✅✅ Fresh location requested successfully:", location)
      console.log("✅✅✅ Complete Location details:", {
        formattedAddress: location?.formattedAddress,
        address: location?.address,
        city: location?.city,
        state: location?.state,
        area: location?.area,
        pointOfInterest: location?.pointOfInterest,
        premise: location?.premise,
        coordinates: location?.latitude && location?.longitude ?
          `${location.latitude.toFixed(8)}, ${location.longitude.toFixed(8)}` : "N/A",
        hasCompleteAddress: location?.formattedAddress &&
          location.formattedAddress !== "Select location" &&
          !location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) &&
          location.formattedAddress.split(',').length >= 4
      })

      // Verify we got complete address (POI, building, floor, area, city, state, pincode)
      if (!location?.formattedAddress ||
        location.formattedAddress === "Select location" ||
        location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) ||
        location.formattedAddress.split(',').length < 4) {
        console.warn("⚠️⚠️⚠️ Location received but address is incomplete!")
        console.warn("⚠️ Address parts count:", location?.formattedAddress?.split(',').length || 0)
        console.warn("⚠️ This might be due to:")
        console.warn("   1. Google Maps API not enabled or billing not set up")
        console.warn("   2. Location permission not granted")
        console.warn("   3. GPS accuracy too low (try on mobile device)")
      } else {
        console.log("✅✅✅ SUCCESS: Complete detailed address received!")
        console.log("✅ Full address:", location.formattedAddress)
      }

      // Restart watching for live updates
      startWatchingLocation()

      return location
    } catch (err) {
      console.error("❌ Failed to request location:", err)
      setError(err.message || "Failed to get location")
      
      // Try to use cached location as fallback
      const cached = localStorage.getItem("userLocation")
      if (cached) {
        try {
          const cachedLocation = JSON.parse(cached)
          if (cachedLocation?.latitude && cachedLocation?.longitude) {
            console.log("📍 Using cached location as fallback after error:", cachedLocation)
            setLocation(cachedLocation)
            // Don't throw error if we have cached location
            setLoading(false)
            return cachedLocation
          }
        } catch (e) {
          console.error("❌ Failed to parse cached location:", e)
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
  }
}
