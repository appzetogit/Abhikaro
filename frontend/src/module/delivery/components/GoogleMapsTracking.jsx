import { useCallback, useRef, useEffect, useState } from 'react'
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api'
import { motion } from 'framer-motion'
import { getGoogleMapsApiKey } from '@/lib/utils/googleMapsApiKey'

/**
 * GoogleMapsTracking Component
 * 
 * Displays a Google Map with route tracking using Directions API in driving mode.
 */

// Use direct public path which is more reliable in this setup
const getDeliveryIconUrl = () => {
  try {
    return '/assets/deliveryboy/deliveryIcon.png'
  } catch {
    return '/src/assets/bikelogo.png'
  }
}

const mapContainerStyle = {
  width: '100%',
  height: '22rem'
}

const LIBRARIES = ['marker']

export default function GoogleMapsTracking({
  storeLocation,
  sellerLocations = [],
  customerLocation,
  deliveryLocation,
  isTracking,
  showRoute = false,
  routeOrigin,
  routeDestination,
  routeWaypoints = [],
  destinationName,
  onRouteInfoUpdate,
  lastUpdate
}) {
  const [apiKey, setApiKey] = useState('')
  const [apiKeyLoading, setApiKeyLoading] = useState(true)
  const mapRef = useRef(null)
  const directionsServiceRef = useRef(null)
  const directionsRendererRef = useRef(null)
  const lastRouteCalcRef = useRef({ time: 0, origin: { lat: 0, lng: 0 } })
  const hasInitialBoundsFitted = useRef(false)
  const [userHasInteracted, setUserHasInteracted] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [routeInfo, setRouteInfo] = useState(null)
  const [routeError, setRouteError] = useState(null)
  const [isGPSWeak, setIsGPSWeak] = useState(false)
  // Advanced Marker refs
  const customerMarkerRef = useRef(null)
  const deliveryMarkerRef = useRef(null)
  const sellerMarkersRef = useRef([])

  // Fetch API key from backend on mount
  useEffect(() => {
    getGoogleMapsApiKey().then(key => {
      setApiKey(key || '')
      setApiKeyLoading(false)
    }).catch(() => {
      setApiKeyLoading(false)
    })
  }, [])

  // Check for weak GPS signal (no updates for > 45 seconds)
  useEffect(() => {
    if (!lastUpdate) return;
    const checkGPS = () => {
      const now = new Date().getTime();
      const lastTime = new Date(lastUpdate).getTime();
      setIsGPSWeak(now - lastTime > 45000);
    };
    const interval = setInterval(checkGPS, 10000);
    checkGPS();
    return () => clearInterval(interval);
  }, [lastUpdate]);

  // Sync routeInfo with parent
  useEffect(() => {
    if (onRouteInfoUpdate) {
      onRouteInfoUpdate(routeInfo);
    }
  }, [routeInfo, onRouteInfoUpdate]);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey || '',
    libraries: LIBRARIES,
  })

  // Combine storeLocation with sellerLocations
  const allSellers = storeLocation ? [storeLocation, ...sellerLocations] : sellerLocations;

  const center = deliveryLocation || (allSellers.length > 0 ? {
    lat: (allSellers[0].lat + customerLocation.lat) / 2,
    lng: (allSellers[0].lng + customerLocation.lng) / 2
  } : customerLocation)

  // Auto-center and fit bounds when location or route changes
  useEffect(() => {
    if (!isLoaded || !mapRef.current || userHasInteracted || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;

    if (deliveryLocation) {
      bounds.extend(deliveryLocation);
      hasPoints = true;
    }

    if (showRoute && routeOrigin && routeDestination) {
      bounds.extend(routeOrigin);
      bounds.extend(routeDestination);
      routeWaypoints.forEach(wp => bounds.extend(wp));
      hasPoints = true;
    } else {
      if (storeLocation) {
        bounds.extend(storeLocation);
        hasPoints = true;
      }
      sellerLocations.forEach(s => {
        bounds.extend(s);
        hasPoints = true;
      });
      if (customerLocation) {
        bounds.extend(customerLocation);
        hasPoints = true;
      }
    }

    if (hasPoints) {
      if (mapRef.current._setProgrammaticChange) {
        mapRef.current._setProgrammaticChange(true);
      }
      if (deliveryLocation && (isFullScreen || !showRoute)) {
        mapRef.current.panTo(deliveryLocation);
        if (!hasInitialBoundsFitted.current || isFullScreen) {
          const targetZoom = isFullScreen ? 17 : 15;
          const MAX_ZOOM = 16;
          mapRef.current.setZoom(isTracking || showRoute ? Math.min(targetZoom, MAX_ZOOM) : targetZoom);
          hasInitialBoundsFitted.current = true;
        }
      } else {
        mapRef.current.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
        setTimeout(() => { limitZoomIfNeeded(mapRef.current); }, 100);
        hasInitialBoundsFitted.current = true;
      }
      if (mapRef.current._setProgrammaticChange) {
        setTimeout(() => mapRef.current._setProgrammaticChange(false), 500);
      }
    }
  }, [isLoaded, deliveryLocation, showRoute, routeOrigin, routeDestination, routeWaypoints, storeLocation, sellerLocations, customerLocation, userHasInteracted, isFullScreen]);

  const handleRecenter = () => {
    setUserHasInteracted(false);
    hasInitialBoundsFitted.current = false;
    if (mapRef.current) {
      if (deliveryLocation && (isFullScreen || !showRoute)) {
        mapRef.current.panTo(deliveryLocation);
        const targetZoom = isFullScreen ? 17 : 15;
        const MAX_ZOOM = 16;
        mapRef.current.setZoom(isTracking || showRoute ? Math.min(targetZoom, MAX_ZOOM) : targetZoom);
        hasInitialBoundsFitted.current = true;
      } else {
        const bounds = new window.google.maps.LatLngBounds();
        if (deliveryLocation) bounds.extend(deliveryLocation);
        if (showRoute && routeOrigin && routeDestination) {
          bounds.extend(routeOrigin);
          bounds.extend(routeDestination);
          routeWaypoints.forEach(wp => bounds.extend(wp));
        } else {
          if (storeLocation) bounds.extend(storeLocation);
          sellerLocations.forEach(s => bounds.extend(s));
          if (customerLocation) bounds.extend(customerLocation);
        }
        mapRef.current.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
        setTimeout(() => { limitZoomIfNeeded(mapRef.current); }, 100);
        hasInitialBoundsFitted.current = true;
      }
    }
  };

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
    setUserHasInteracted(false);
    hasInitialBoundsFitted.current = false;
  };

  const limitZoomIfNeeded = useCallback((map) => {
    if (!map) return;
    const currentZoom = map.getZoom();
    const MAX_ZOOM = 16;
    if ((showRoute || isTracking) && currentZoom > MAX_ZOOM) {
      map.setZoom(MAX_ZOOM);
    }
  }, [showRoute, isTracking]);

  const onLoad = useCallback((map) => {
    mapRef.current = map
    let isProgrammaticChange = false;
    const trackInteraction = () => {
      if (!isProgrammaticChange) setUserHasInteracted(true);
    };
    map.addListener('dragstart', trackInteraction);
    map.addListener('zoom_changed', () => {
      if (!isProgrammaticChange) {
        limitZoomIfNeeded(map);
        setTimeout(() => { if (!isProgrammaticChange) trackInteraction(); }, 100);
      }
    });
    map._setProgrammaticChange = (value) => { isProgrammaticChange = value; };
  }, [limitZoomIfNeeded])

  // Helper to create an AdvancedMarkerElement
  const createAdvancedMarker = useCallback((position, htmlContent, title, map) => {
    if (!window.google?.maps?.marker?.AdvancedMarkerElement) return null
    const pin = document.createElement('div')
    pin.innerHTML = htmlContent
    const marker = new window.google.maps.marker.AdvancedMarkerElement({
      position,
      map,
      title,
      content: pin,
    })
    return marker
  }, [])

  // Update customer marker
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return
    if (customerMarkerRef.current) {
      customerMarkerRef.current.map = null
      customerMarkerRef.current = null
    }
    if (customerLocation && (customerLocation.lat !== 0 || customerLocation.lng !== 0)) {
      customerMarkerRef.current = createAdvancedMarker(
        customerLocation,
        '<div style="font-size:32px;line-height:1">📍</div>',
        'Delivery Address',
        mapRef.current
      )
    }
  }, [isLoaded, customerLocation, createAdvancedMarker])

  // Update seller markers
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return
    sellerMarkersRef.current.forEach(m => { if (m) m.map = null })
    sellerMarkersRef.current = []
    allSellers.forEach((seller, index) => {
      const isRouteDestination = showRoute && routeDestination?.lat === seller.lat
      const content = isRouteDestination
        ? '<div style="width:20px;height:20px;background:#ef4444;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>'
        : '<div style="font-size:32px;line-height:1">🏪</div>'
      const m = createAdvancedMarker(seller, content, seller.name || 'Seller Shop', mapRef.current)
      sellerMarkersRef.current.push(m)
    })
  }, [isLoaded, allSellers, showRoute, routeDestination, createAdvancedMarker])

  // Calculate and display route using Google Directions Service
  const calculateAndDisplayRoute = useCallback(async (origin, destination, waypoints = []) => {
    if (!isLoaded || !mapRef.current || !window.google?.maps) return

    if (!origin || !destination || !origin.lat || !origin.lng || !destination.lat || !destination.lng) return

    // Throttle route calculation (min 10 seconds between calls)
    const now = Date.now()
    const lastCalc = lastRouteCalcRef.current
    const timeDiff = now - lastCalc.time
    if (timeDiff < 10000) {
      const latDiff = Math.abs(origin.lat - lastCalc.origin.lat)
      const lngDiff = Math.abs(origin.lng - lastCalc.origin.lng)
      if (latDiff < 0.001 && lngDiff < 0.001) return
    }
    lastRouteCalcRef.current = { time: now, origin: { ...origin } }

    if (!directionsServiceRef.current) {
      directionsServiceRef.current = new window.google.maps.DirectionsService()
    }

    if (!directionsRendererRef.current) {
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: mapRef.current,
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: {
          strokeColor: '#3b82f6',
          strokeWeight: 6,
          strokeOpacity: 1.0,
          icons: [],
        },
      })
    } else {
      directionsRendererRef.current.setOptions({ preserveViewport: true })
    }

    const googleWaypoints = waypoints.map(wp => ({
      location: new window.google.maps.LatLng(wp.lat, wp.lng),
      stopover: true
    }));

    directionsServiceRef.current.route(
      {
        origin,
        destination,
        waypoints: googleWaypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' },
        optimizeWaypoints: true,
      },
      (result, status) => {
        if (status === 'OK' && result.routes?.[0]) {
          setRouteError(null)
          const route = result.routes[0]
          if (route.legs?.length > 0) {
            let totalDistance = 0, totalDurationSeconds = 0
            route.legs.forEach(leg => {
              totalDistance += leg.distance?.value || 0
              totalDurationSeconds += leg.duration?.value || 0
            })
            totalDurationSeconds += 120
            const formatDuration = (s) => {
              if (s < 60) return `${Math.ceil(s)} sec`
              const m = Math.ceil(s / 60)
              if (m < 60) return `${m} mins`
              return `${Math.floor(m / 60)}h ${m % 60}m`
            }
            const formatDistance = (m) => m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)} km`
            setRouteInfo({ distance: formatDistance(totalDistance), duration: formatDuration(totalDurationSeconds), durationValue: totalDurationSeconds, distanceValue: totalDistance })
          }
          directionsRendererRef.current.setDirections(result);
          [100, 300, 500, 700].forEach(delay => {
            setTimeout(() => {
              if (directionsRendererRef.current) {
                directionsRendererRef.current.setOptions({ polylineOptions: { strokeColor: '#3b82f6', strokeWeight: 6, strokeOpacity: 1.0, icons: [] } });
              }
            }, delay);
          });
        } else {
          setRouteInfo(null)
          if (status === 'ZERO_RESULTS') setRouteError('No road route found. Showing straight line.')
          else if (status === 'OVER_QUERY_LIMIT') setRouteError('Map service busy. Showing straight line.')
          else setRouteError('Navigation error. Showing straight line.')
        }
      }
    )
  }, [isLoaded])

  useEffect(() => {
    if (showRoute && routeOrigin && routeDestination && isLoaded && mapRef.current) {
      calculateAndDisplayRoute(routeOrigin, routeDestination, routeWaypoints)
    } else if (!showRoute && directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null)
      directionsRendererRef.current = null
      setRouteInfo(null)
    }
  }, [showRoute, routeOrigin, routeDestination, routeWaypoints, isLoaded, calculateAndDisplayRoute])

  // Interpolation State
  const [animatedDeliveryLocation, setAnimatedDeliveryLocation] = useState(deliveryLocation);
  const animationRef = useRef(null);
  const lastDeliveryLocationRef = useRef(deliveryLocation);

  const [initialCenter] = useState(center);

  // Animation Logic
  useEffect(() => {
    if (!deliveryLocation) return;
    if (!lastDeliveryLocationRef.current) {
      setAnimatedDeliveryLocation(deliveryLocation);
      lastDeliveryLocationRef.current = deliveryLocation;
      return;
    }
    if (deliveryLocation.lat === lastDeliveryLocationRef.current.lat && deliveryLocation.lng === lastDeliveryLocationRef.current.lng) return;

    const startLocation = animatedDeliveryLocation || lastDeliveryLocationRef.current;
    const targetLocation = deliveryLocation;
    const startTime = performance.now();
    const duration = 3800;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setAnimatedDeliveryLocation({
        lat: startLocation.lat + (targetLocation.lat - startLocation.lat) * progress,
        lng: startLocation.lng + (targetLocation.lng - startLocation.lng) * progress,
      });
      if (progress < 1) animationRef.current = requestAnimationFrame(animate);
      else lastDeliveryLocationRef.current = targetLocation;
    };
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(animate);
    lastDeliveryLocationRef.current = deliveryLocation;
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [deliveryLocation]);

  // Update delivery marker (AdvancedMarkerElement)
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return
    if (deliveryMarkerRef.current) {
      if (animatedDeliveryLocation) {
        deliveryMarkerRef.current.position = animatedDeliveryLocation
      }
      return
    }
    if (animatedDeliveryLocation) {
      const img = document.createElement('img')
      img.src = getDeliveryIconUrl()
      img.style.width = '60px'
      img.style.height = '60px'
      deliveryMarkerRef.current = createAdvancedMarker(
        animatedDeliveryLocation,
        img.outerHTML,
        'Delivery Partner',
        mapRef.current
      )
    }
  }, [isLoaded, animatedDeliveryLocation, createAdvancedMarker])

  // Cleanup markers on unmount
  useEffect(() => {
    return () => {
      if (customerMarkerRef.current) customerMarkerRef.current.map = null
      if (deliveryMarkerRef.current) deliveryMarkerRef.current.map = null
      sellerMarkersRef.current.forEach(m => { if (m) m.map = null })
    }
  }, [])

  const containerClasses = isFullScreen
    ? "fixed inset-0 z-[100] bg-white w-screen h-screen flex flex-col"
    : "relative mx-4 mt-4 rounded-lg overflow-hidden shadow-sm";

  if (apiKeyLoading) {
    return (
      <div className={containerClasses + " bg-gray-100 p-8 text-center"}>
        <div className="animate-spin text-2xl">🗺️</div>
        <p className="text-gray-600 text-sm mt-2">Loading map...</p>
      </div>
    )
  }

  if (!apiKey) {
    return (
      <div className={containerClasses + " bg-yellow-50 border border-yellow-200 p-4 text-center"}>
        <p className="text-yellow-800 text-sm">⚠️ Google Maps API key not configured</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={containerClasses + " bg-red-50 border border-red-200 p-4 text-center"}>
        <p className="text-red-800 text-sm">❌ Failed to load Google Maps</p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className={containerClasses + " bg-gray-100 p-8 text-center"}>
        <div className="animate-spin text-2xl">🗺️</div>
        <p className="text-gray-600 text-sm mt-2">Loading map...</p>
      </div>
    )
  }

  return (
    <div className={containerClasses}>
      {/* Map UI Overlays */}
      <div className={`absolute ${isFullScreen ? 'left-6 top-6' : 'left-3 top-3'} flex flex-col gap-2 z-10`}>
        {isTracking && (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-white bg-black/70 px-2 py-1 rounded text-sm font-medium">Live</span>
          </div>
        )}
        {isGPSWeak && isTracking && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-red-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold shadow-lg flex items-center gap-2"
          >
            <span className="animate-pulse">⚠️</span>
            GPS Signal Weak
          </motion.div>
        )}
        {routeInfo && isFullScreen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-3 rounded-lg shadow-xl border border-gray-100 min-w-[150px]"
          >
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Estimated Arrival</div>
            <div className="flex items-end gap-2">
              <span className="text-xl font-bold text-gray-900">{routeInfo.duration}</span>
              <span className="text-sm text-gray-500 mb-0.5">({routeInfo.distance})</span>
            </div>
            {destinationName && (
              <div className="text-xs text-blue-600 mt-1 font-medium truncate">
                to {destinationName}
              </div>
            )}
          </motion.div>
        )}
      </div>

      <div className={`absolute ${isFullScreen ? 'right-6 top-6' : 'right-3 top-3'} flex flex-col gap-2 z-10`}>
        <button
          onClick={toggleFullScreen}
          className="p-2 bg-white rounded-full shadow-md hover:bg-gray-50 transition-colors"
          title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
        >
          {isFullScreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
          )}
        </button>
        <button
          onClick={handleRecenter}
          className="p-2 bg-white rounded-full shadow-md hover:bg-gray-50 transition-colors"
          title="Recenter"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M3 12h3m12 0h3M12 3v3m0 12v3" /></svg>
        </button>
      </div>

      {routeError && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-full text-xs font-medium shadow-lg flex items-center gap-2">
            <span>⚠️</span>
            {routeError}
          </div>
        </div>
      )}

      {isTracking && (!customerLocation || customerLocation.lat === 0) && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 w-max max-w-[90%]">
          <div className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-lg text-xs font-medium shadow-lg flex flex-col items-center gap-1 text-center">
            <div className="flex items-center gap-2">
              <span>📍</span>
              <span className="font-bold">Location Unavailable</span>
            </div>
            <span>Customer hasn&apos;t pinned their location.</span>
            <span className="text-orange-600/80 text-[10px]">Please rely on the written address.</span>
          </div>
        </div>
      )}

      <GoogleMap
        mapContainerStyle={isFullScreen ? { width: '100%', height: '100%' } : mapContainerStyle}
        center={initialCenter}
        zoom={13}
        onLoad={onLoad}
        options={{
          mapTypeId: 'roadmap',
          zoomControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          disableDefaultUI: true,
          maxZoom: (showRoute || isTracking) ? 16 : 20,
          styles: [
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }
          ]
        }}
      >
        {/* Markers are managed via AdvancedMarkerElement in useEffects above */}
      </GoogleMap>
    </div>
  )
}
