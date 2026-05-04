import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL } from '@/lib/api/config';
import bikeLogo from '@/assets/bikelogo.png';
import { RouteBasedAnimationController, updateMarkerIconRotation } from '@/module/user/utils/routeBasedAnimation';
import { extractPolylineFromDirections, findNearestPointOnPolyline } from '@/module/delivery/utils/liveTrackingPolyline';
import { calculateBearingFromLocations } from '@/module/delivery/utils/bearingCalculation';
import { snapToPolyline, detectOffRoute, PolylineAnimationController } from '@/module/delivery/utils/enhancedMapMatching';
import { StrictPolylineController, calculateProgressOnPolyline, getPointOnPolylineByProgress, calculateBearingAtProgress } from '@/module/delivery/utils/strictPolylineTracking';
import { preloadGoogleMaps } from '@/utils/mapsPreload';
import './DeliveryTrackingMap.css';

// Helper function to calculate Haversine distance
function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const DeliveryTrackingMap = ({
  orderId,
  trackingRoomIds = null,
  restaurantCoords,
  customerCoords,
  // User live location is intentionally disabled by default on user order-tracking screen.
  // We only want to show the fixed delivery location (customerCoords), not the moving device GPS.
  showUserLiveLocation = false,
  userLiveCoords = null,
  userLocationAccuracy = null,
  deliveryBoyData = null,
  order = null
}) => {
  const mapRef = useRef(null);
  const bikeMarkerRef = useRef(null);
  const userLocationMarkerRef = useRef(null);
  const userLocationCircleRef = useRef(null);
  const restaurantCircleRef = useRef(null);
  const customerCircleRef = useRef(null);
  const mapInstance = useRef(null);
  const socketRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const isMapLoadedRef = useRef(false);
  const mapLoadTimeoutRef = useRef(null);
  const routePolylineRef = useRef(null);
  const routePolylinePointsRef = useRef(null);
  const animationControllerRef = useRef(null);
  const polylineAnimationControllerRef = useRef(null);
  const strictPolylineControllerRef = useRef(null);
  const previousLocationRef = useRef(null);
  const lastBearingRef = useRef(0);
  const lastBearingTsRef = useRef(0);
  const lastLocationUpdateTsRef = useRef(0);
  const lastIncomingPosRef = useRef(null);
  const lastProcessedSocketTsRef = useRef(0);
  const followRiderRef = useRef(true);
  const lastCameraUpdateTsRef = useRef(0);
  const lastSnappedPositionRef = useRef(null);
  const lastProgressRef = useRef(0);
  const isReRoutingRef = useRef(false);
  const lastRouteUpdateRef = useRef(null);
  const userHasInteractedRef = useRef(false);
  const hasLivePushRef = useRef(false);
  const orderRef = useRef(order);
  const restaurantCoordsRef = useRef(restaurantCoords);
  const socketCandidateIdxRef = useRef(0);
  const isProgrammaticChangeRef = useRef(false);
  const mapInitializedRef = useRef(false);
  const directionsCacheRef = useRef(new Map());
  const lastRouteRequestRef = useRef({ start: null, end: null, timestamp: 0 });
  const lastDirectionsRef = useRef(null);
  const isMountedRef = useRef(true);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapLoadTimeoutError, setMapLoadTimeoutError] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [deliveryBoyLocation, setDeliveryBoyLocation] = useState(null);
  const [followRiderUI, setFollowRiderUI] = useState(true);

  const isOrderDelivered = useMemo(() => {
    const s = String(order?.status || '').toLowerCase()
    const deliveryStatus = String(order?.deliveryState?.status || '').toLowerCase()
    const phase = String(order?.deliveryState?.currentPhase || '').toLowerCase()
    const deliveredByTracking =
      order?.tracking?.delivered?.status === true ||
      order?.tracking?.delivered === true
    return (
      s === 'delivered' ||
      s === 'completed' ||
      deliveryStatus === 'delivered' ||
      phase === 'completed' ||
      deliveredByTracking
    )
  }, [order])

  const socketCandidates = useMemo(() => {
    try {
      if (API_BASE_URL.startsWith("/")) {
        return [
          { url: window.location.origin, path: "/socket.io" },
          { url: window.location.origin, path: "/api/socket.io" },
        ]
      }
      const u = new URL(API_BASE_URL)
      const origin = `${u.protocol}//${u.host}`
      const basePath = String(u.pathname || "").replace(/\/api\/?$/i, "")
      const withBase = (p) => (basePath ? `${basePath}${p}` : p)
      return [
        { url: origin, path: withBase("/socket.io") },
        { url: origin, path: withBase("/api/socket.io") },
        { url: origin, path: "/socket.io" },
      ]
    } catch {
      return [{ url: window.location.origin, path: "/socket.io" }]
    }
  }, [])

  const effectiveTrackingIds = useMemo(() => {
    const ids = Array.isArray(trackingRoomIds) && trackingRoomIds.length > 0
      ? trackingRoomIds
      : [orderId]
    return [...new Set(ids.filter(Boolean).map(String))]
  }, [trackingRoomIds, orderId])

  const normalizeIncomingLatLng = useCallback((rawLat, rawLng) => {
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    const looksSwapped = (lat > 90 || lat < -90) && (lng >= -90 && lng <= 90);
    const finalLat = looksSwapped ? lng : lat;
    const finalLng = looksSwapped ? lat : lng;
    if (finalLat < -90 || finalLat > 90 || finalLng < -180 || finalLng > 180) return null;
    return { lat: finalLat, lng: finalLng };
  }, []);

  const normalizeBearing = useCallback((b) => {
    const n = Number(b);
    if (Number.isNaN(n)) return 0;
    const mod = ((n % 360) + 360) % 360;
    return mod;
  }, []);

  const stableRotateBike = useCallback((bearing) => {
    if (!bikeMarkerRef.current) return;
    const now = Date.now();
    const target = normalizeBearing(bearing);
    const prev = normalizeBearing(lastBearingRef.current);
    let diff = ((target - prev + 540) % 360) - 180;
    const dt = Math.max(16, now - (lastBearingTsRef.current || now));
    const maxStep = (35 * dt) / 1000;
    if (Math.abs(diff) > maxStep) diff = Math.sign(diff) * maxStep;
    const next = normalizeBearing(prev + diff);
    lastBearingRef.current = next;
    lastBearingTsRef.current = now;
    updateMarkerIconRotation(bikeMarkerRef.current, next);
  }, [normalizeBearing]);

  const moveBikeSmoothly = useCallback((lat, lng, heading) => {
    if (!mapInstance.current || !isMapLoaded) {
      setCurrentLocation({ lat, lng, heading });
      return;
    }
    try {
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;
      let calculatedBearing = heading;
      if ((calculatedBearing === null || calculatedBearing === undefined || calculatedBearing === 0) && previousLocationRef.current) {
        calculatedBearing = calculateBearingFromLocations(previousLocationRef.current, { lat, lng });
      }
      const targetBearing = calculatedBearing || 0;
      if (previousLocationRef.current) {
        const d = calculateHaversineDistance(previousLocationRef.current.lat, previousLocationRef.current.lng, lat, lng);
        if (d < 6) calculatedBearing = lastBearingRef.current;
      }
      const position = new window.google.maps.LatLng(lat, lng);
      if (!bikeMarkerRef.current) {
        const bikeSvg = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="28" fill="rgba(34, 197, 94, 0.2)" />
            <circle cx="30" cy="30" r="22" fill="#22c55e" stroke="white" stroke-width="3" />
            <path d="M30 15 L42 40 L30 34 L18 40 Z" fill="white" />
          </svg>
        `);
        try {
          bikeMarkerRef.current = new window.google.maps.Marker({
            position,
            map: mapInstance.current,
            icon: { url: bikeSvg, scaledSize: new window.google.maps.Size(50, 50), anchor: new window.google.maps.Point(25, 25), rotation: 0 },
            optimized: false, zIndex: 999999, title: 'Delivery Partner', visible: true
          });
          updateMarkerIconRotation(bikeMarkerRef.current, targetBearing);
          if (routePolylinePointsRef.current?.length > 0) {
            animationControllerRef.current = new RouteBasedAnimationController(bikeMarkerRef.current, routePolylinePointsRef.current);
          }
        } catch (e) { console.error(e); }
      } else {
        if (strictPolylineControllerRef.current) {
          strictPolylineControllerRef.current.updateFromGPS({ lat, lng }, 3500);
        } else if (routePolylinePointsRef.current?.length > 0) {
          const nearest = findNearestPointOnPolyline(routePolylinePointsRef.current, { lat, lng });
          if (nearest?.nearestPoint) {
            bikeMarkerRef.current.setPosition(nearest.nearestPoint);
            stableRotateBike(targetBearing);
          }
        } else {
          bikeMarkerRef.current.setPosition({ lat, lng });
          stableRotateBike(targetBearing);
        }
      }
      previousLocationRef.current = { lat, lng };
      if (followRiderRef.current && !userHasInteractedRef.current && Date.now() - (lastCameraUpdateTsRef.current || 0) > 900) {
        lastCameraUpdateTsRef.current = Date.now();
        isProgrammaticChangeRef.current = true;
        mapInstance.current.panTo({ lat, lng });
        setTimeout(() => { isProgrammaticChangeRef.current = false; }, 200);
      }
    } catch (e) { console.error(e); }
  }, [isMapLoaded, stableRotateBike]);

  const buildCurvedArcPath = useCallback((start, end) => {
    if (!start || !end) return null;
    const a = { lat: Number(start.lat), lng: Number(start.lng) };
    const b = { lat: Number(end.lat), lng: Number(end.lng) };
    if ([a.lat, a.lng, b.lat, b.lng].some(isNaN)) return null;
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const curvature = 0.12 * dist;
    return [a, { lat: mid.lat + (-dx / dist) * curvature, lng: mid.lng + (dy / dist) * curvature }, b];
  }, []);

  const ensureGoogleMapsReady = useCallback(async () => {
    try {
      if (window.google?.maps?.Map) return true;
      const { getGoogleMapsApiKey } = await import('@/lib/utils/googleMapsApiKey.js');
      const apiKey = await getGoogleMapsApiKey();
      if (!apiKey) return false;
      await preloadGoogleMaps(apiKey);
      return !!window.google?.maps?.Map;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    ensureGoogleMapsReady();
  }, [ensureGoogleMapsReady]);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  useEffect(() => {
    restaurantCoordsRef.current = restaurantCoords;
  }, [restaurantCoords?.lat, restaurantCoords?.lng]);

  useEffect(() => {
    isMapLoadedRef.current = isMapLoaded;
  }, [isMapLoaded]);

  // Track mount/unmount ONLY
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Restore last known rider location after refresh
  useEffect(() => {
    try {
      if (!orderId) return;
      const key = `tracking:lastRiderLoc:${String(orderId)}`;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.lat && data.lng && Number(Date.now() - (data.ts || 0)) < 30 * 60 * 1000) {
        const loc = { 
          lat: Number(data.lat), 
          lng: Number(data.lng), 
          heading: Number(data.heading || 0),
          isRestored: true,
          ts: Number(data.ts)
        };
        setCurrentLocation(loc);
        setDeliveryBoyLocation(loc);
        lastIncomingPosRef.current = { lat: loc.lat, lng: loc.lng };
        if (data.ts) lastProcessedSocketTsRef.current = Math.max(lastProcessedSocketTsRef.current, Number(data.ts));
      }
    } catch (e) {
      console.error(e);
    }
  }, [orderId]);

  // Auto-create bike
  useEffect(() => {
    if (isMapLoaded && currentLocation && !bikeMarkerRef.current) {
      moveBikeSmoothly(currentLocation.lat, currentLocation.lng, currentLocation.heading || 0);
    }
  }, [isMapLoaded, currentLocation, moveBikeSmoothly]);

  // Initialize delivery boy location from order data if available
  useEffect(() => {
    const avail = order?.deliveryPartnerId?.availability || order?.deliveryPartner?.availability;
    
    if (avail && !deliveryBoyLocation) {
      const lat = avail.latitude || (avail.currentLocation?.coordinates && avail.currentLocation.coordinates[1]);
      const lng = avail.longitude || (avail.currentLocation?.coordinates && avail.currentLocation.coordinates[0]);
      
      if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        console.log("📍 Initializing bike location from order data:", { lat, lng });
        const initialLoc = { 
          lat, 
          lng, 
          heading: avail.heading || 0,
        };
        setDeliveryBoyLocation(initialLoc);
        setCurrentLocation(initialLoc);
        lastBearingRef.current = initialLoc.heading || 0;
        console.log("✅ Initialized delivery boy location from order data:", initialLoc);
      }
    }
  }, [order?.deliveryPartnerId?.availability, order?.deliveryPartner?.availability, deliveryBoyLocation]);

  // True only after we receive rider "push" updates (location-receive-<orderId>).
  // This prevents showing stale coordinates from request-current-location.



  // Allow using non-push ("current-location") updates for bike only when partner is actually assigned/accepted.
  const allowPulledLocationForBike = useMemo(() => {
    const currentPhase = order?.deliveryState?.currentPhase;
    const deliveryStatus = order?.deliveryState?.status;
    return (
      deliveryStatus === 'accepted' ||
      currentPhase === 'en_route_to_pickup' ||
      currentPhase === 'at_pickup' ||
      currentPhase === 'en_route_to_delivery' ||
      currentPhase === 'at_delivery' ||
      deliveryStatus === 'reached_pickup' ||
      deliveryStatus === 'order_confirmed' ||
      deliveryStatus === 'en_route_to_delivery' ||
      String(order?.status || '').toLowerCase() === 'out_for_delivery'
    );
  }, [order?.deliveryState?.currentPhase, order?.deliveryState?.status, order?.status]);

  // Draw route using Google Maps Directions API with live updates
  // OPTIMIZED: Added caching to reduce API calls
  const drawRoute = useCallback(async (start, end) => {
    if (!mapInstance.current || !directionsServiceRef.current || !directionsRendererRef.current) return;

    // Validate coordinates before making API call
    if (!start || !end) {
      return;
    }

    const startLat = Number(start.lat);
    const startLng = Number(start.lng);
    const endLat = Number(end.lat);
    const endLng = Number(end.lng);

    // Check if coordinates are valid numbers
    if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
      return;
    }

    // Check if coordinates are within valid range
    if (startLat < -90 || startLat > 90 || endLat < -90 || endLat > 90 ||
      startLng < -180 || startLng > 180 || endLng < -180 || endLng > 180) {
      return;
    }

    // Check if start and end are the same (will cause API error)
    if (startLat === endLat && startLng === endLng) {
      return;
    }

    // Check global cache first
    try {
      const cacheModule = await import('@/lib/utils/googleMapsApiCache.js').catch(err => {
        return null;
      });
      
      if (cacheModule) {
        const { getCached, shouldMakeApiCall } = cacheModule;
        const cachedResult = getCached('directions', start, end);
        
        if (cachedResult) {
          if (lastDirectionsRef.current !== cachedResult) {
            directionsRendererRef.current.setOptions({ preserveViewport: true });
            directionsRendererRef.current.setDirections(cachedResult);
            lastDirectionsRef.current = cachedResult;
          }
          
          // Also update local cache
          const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
          const cacheKey = `${roundCoord(startLat)},${roundCoord(startLng)}|${roundCoord(endLat)},${roundCoord(endLng)}`;
          directionsCacheRef.current.set(cacheKey, {
            result: cachedResult,
            timestamp: Date.now()
          });
          
          // Extract polyline and update animation
          const polylinePoints = extractPolylineFromDirections(cachedResult);
          if (polylinePoints && polylinePoints.length > 0) {
            routePolylinePointsRef.current = polylinePoints;
            if (bikeMarkerRef.current && !animationControllerRef.current) {
              animationControllerRef.current = new RouteBasedAnimationController(
                bikeMarkerRef.current,
                polylinePoints
              );
            }
          }
          
          if (cachedResult.routes && cachedResult.routes[0] && cachedResult.routes[0].overview_path) {
            if (routePolylineRef.current) {
              routePolylineRef.current.setMap(null);
              routePolylineRef.current = null;
            }
          }
          return;
        }
        
        // Check rate limit
        if (!shouldMakeApiCall('directions')) {
          console.warn('⚠️ Directions API rate limit reached, using local cache if available');
          // Try local cache as fallback
          const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
          const cacheKey = `${roundCoord(startLat)},${roundCoord(startLng)}|${roundCoord(endLat)},${roundCoord(endLng)}`;
          const cached = directionsCacheRef.current.get(cacheKey);
          const now = Date.now();
          if (cached && (now - cached.timestamp) < 300000) {
            console.log('✅ Using local cached route as fallback');
            if (cached.result && lastDirectionsRef.current !== cached.result) {
              directionsRendererRef.current.setOptions({ preserveViewport: true });
              directionsRendererRef.current.setDirections(cached.result);
              lastDirectionsRef.current = cached.result;
            }
          }
          return;
        }
      }
    } catch (error) {
      console.warn('Cache utility not available, using local cache:', error);
    }

    // Round coordinates to 4 decimal places (~11 meters) for cache key
    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    const cacheKey = `${roundCoord(startLat)},${roundCoord(startLng)}|${roundCoord(endLat)},${roundCoord(endLng)}`;

    // Check local cache (cache valid for 5 minutes)
    const cached = directionsCacheRef.current.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < 300000) { // 5 minutes cache
      console.log('✅ Using local cached route');
      // Use cached result
      if (cached.result && cached.result.routes && cached.result.routes[0]) {
        directionsRendererRef.current.setOptions({ preserveViewport: true });
        directionsRendererRef.current.setDirections(cached.result);

        const polylinePoints = extractPolylineFromDirections(cached.result);
        if (polylinePoints && polylinePoints.length > 0) {
          routePolylinePointsRef.current = polylinePoints;

          // Initialize STRICT polyline controller (marker always on polyline center)
          if (bikeMarkerRef.current) {
            strictPolylineControllerRef.current = new StrictPolylineController(
              bikeMarkerRef.current,
              polylinePoints,
              (bearing) => {
                updateMarkerIconRotation(bikeMarkerRef.current, bearing);
              }
            );
            
            lastProgressRef.current = 0;
            
            if (!animationControllerRef.current) {
              animationControllerRef.current = new RouteBasedAnimationController(
                bikeMarkerRef.current,
                polylinePoints
              );
            }
            
            console.log('✅ Strict polyline controller initialized from cache');
          }
        }

        if (cached.result.routes && cached.result.routes[0] && cached.result.routes[0].overview_path) {
          if (routePolylineRef.current) {
            routePolylineRef.current.setMap(null);
            routePolylineRef.current = null;
          }
        }
      }
      return;
    }

    // Throttle: Don't make API call if same route was requested within last 2 seconds
    const lastRequest = lastRouteRequestRef.current;
    if (lastRequest.start && lastRequest.end &&
      Math.abs(lastRequest.start.lat - startLat) < 0.0001 &&
      Math.abs(lastRequest.start.lng - startLng) < 0.0001 &&
      Math.abs(lastRequest.end.lat - endLat) < 0.0001 &&
      Math.abs(lastRequest.end.lng - endLng) < 0.0001 &&
      (now - lastRequest.timestamp) < 2000) {
      console.log('⏭️ Skipping duplicate route request (throttled)');
      return;
    }

    lastRouteRequestRef.current = {
      start: { lat: startLat, lng: startLng },
      end: { lat: endLat, lng: endLng },
      timestamp: now
    };

    try {
      directionsServiceRef.current.route({
        origin: { lat: startLat, lng: startLng },
        destination: { lat: endLat, lng: endLng },
        travelMode: window.google.maps.TravelMode.DRIVING
      }, async (result, status) => {
        if (status === 'OK' && result) {
          // Cache the result in local cache
          directionsCacheRef.current.set(cacheKey, {
            result: result,
            timestamp: Date.now()
          });
          
          // Also cache in global cache
          try {
            const cacheModule = await import('@/lib/utils/googleMapsApiCache.js').catch(() => null);
            if (cacheModule) {
              const { setCached } = cacheModule;
              setCached('directions', result, start, end);
            }
          } catch (error) {
            console.warn('Failed to cache in global cache:', error);
          }

          // Clean old cache entries (older than 10 minutes)
          const tenMinutesAgo = Date.now() - 600000;
          for (const [key, value] of directionsCacheRef.current.entries()) {
            if (value.timestamp < tenMinutesAgo) {
              directionsCacheRef.current.delete(key);
            }
          }

          // Ensure viewport doesn't change when route is set
          directionsRendererRef.current.setOptions({ preserveViewport: true });
          directionsRendererRef.current.setDirections(result);
          lastDirectionsRef.current = result;

          // Extract polyline points for route-based animation (Rapido style)
          const polylinePoints = extractPolylineFromDirections(result);
          if (polylinePoints && polylinePoints.length > 0) {
            routePolylinePointsRef.current = polylinePoints;
            console.log('✅ Extracted', polylinePoints.length, 'polyline points for route-based animation');

            // Initialize STRICT polyline controller (marker always on polyline center)
            if (bikeMarkerRef.current) {
              strictPolylineControllerRef.current = new StrictPolylineController(
                bikeMarkerRef.current,
                polylinePoints,
                (bearing) => {
                  // Update marker rotation when bearing changes
                  updateMarkerIconRotation(bikeMarkerRef.current, bearing);
                }
              );
              
              // Reset progress when route changes
              lastProgressRef.current = 0;
              
              // Also initialize legacy controller for backward compatibility
              if (!animationControllerRef.current) {
                animationControllerRef.current = new RouteBasedAnimationController(
                  bikeMarkerRef.current,
                  polylinePoints
                );
              }
              
              console.log('✅ Strict polyline controller initialized - marker will stay on polyline center');
            }
          }

          // Clear existing custom polyline if any
          if (routePolylineRef.current) {
            routePolylineRef.current.setMap(null);
            routePolylineRef.current = null;
          }

        } else {
          // Silently handle errors - don't log UNKNOWN_ERROR as it's often a temporary API issue
          if (status !== 'UNKNOWN_ERROR') {
            console.warn('Directions request failed:', status);
          }
        }
      });
    } catch (error) {
      console.warn('Error calling Directions API:', error);
    }
  }, []);

  // Check if delivery partner is assigned (memoized to avoid dependency issues)
  // MUST be defined BEFORE any useEffect that uses it
  const hasDeliveryPartner = useMemo(() => {
    const deliveryStateStatus = order?.deliveryState?.status;
    const currentPhase = order?.deliveryState?.currentPhase;

    // Check if delivery partner has accepted (key condition)
    const hasAccepted = deliveryStateStatus === 'accepted';
    const hasPartner = !!(order?.deliveryPartnerId ||
      order?.deliveryPartner ||
      order?.assignmentInfo?.deliveryPartnerId ||
      hasAccepted ||
      (deliveryStateStatus && deliveryStateStatus !== 'pending') ||
      (currentPhase && currentPhase !== 'assigned' && currentPhase !== 'pending') ||
      (currentPhase === 'en_route_to_pickup') ||
      (currentPhase === 'at_pickup') ||
      (currentPhase === 'en_route_to_delivery'));

    console.log('🔍 hasDeliveryPartner check:', {
      hasPartner,
      hasAccepted,
      deliveryPartnerId: order?.deliveryPartnerId,
      deliveryPartner: !!order?.deliveryPartner,
      assignmentInfo: order?.assignmentInfo,
      deliveryStateStatus,
      deliveryStatePhase: currentPhase
    });

    return hasPartner;
  }, [order?.deliveryPartnerId, order?.deliveryPartner, order?.assignmentInfo?.deliveryPartnerId, order?.deliveryState?.status, order?.deliveryState?.currentPhase]);

  // Remove any pre-acceptance customer->restaurant arc (UX: never show this)
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current) return;

    if (mapInstance.current._customerToRestaurantArc) {
      mapInstance.current._customerToRestaurantArc.setMap(null);
      mapInstance.current._customerToRestaurantArc = null;
    }
  }, [
    isMapLoaded,
    // Keep these in deps to maintain stable dependency array size/order across fast refresh
    // (prevents: "final argument passed to useEffect changed size between renders")
    hasDeliveryPartner,
    restaurantCoords?.lat,
    restaurantCoords?.lng,
    customerCoords?.lat,
    customerCoords?.lng,
    buildCurvedArcPath,
  ]);

  // Determine if order is in "Picked Up" phase
  const isPickedUp = useMemo(() => {
    if (!order) return false;
    const currentPhase = String(order.deliveryState?.currentPhase || 'assigned').toLowerCase();
    const status = String(order.deliveryState?.status || 'pending').toLowerCase();
    const orderStatus = String(order.status || '').toLowerCase();

    return (
      currentPhase === 'en_route_to_delivery' || 
      currentPhase === 'at_delivery' ||
      status === 'en_route_to_delivery' || 
      status === 'order_confirmed' ||
      status === 'picked_up' ||
      status === 'pickedup' ||
      status === 'reached_delivery' ||
      orderStatus === 'out_for_delivery' ||
      orderStatus === 'picked_up'
    );
  }, [order?.deliveryState?.currentPhase, order?.deliveryState?.status, order?.status]);

  // Determine which route to show based on order phase
  const getRouteToShow = useCallback(() => {
    if (!order) {
      // No order yet, show restaurant to customer as fallback
      return { start: restaurantCoords, end: customerCoords };
    }

    const currentPhase = String(order.deliveryState?.currentPhase || 'assigned').toLowerCase();
    const status = String(order.deliveryState?.status || 'pending').toLowerCase();

    const route = (() => {
      // Phase 1: Delivery boy going to restaurant
      if (currentPhase === 'en_route_to_pickup' || status === 'accepted' || status === 'assigned') {
        if (deliveryBoyLocation) {
          console.log('🛣️ Route selection: Rider to Restaurant', { rider: deliveryBoyLocation, restaurant: restaurantCoords });
          return {
            start: { lat: deliveryBoyLocation.lat, lng: deliveryBoyLocation.lng },
            end: restaurantCoords
          };
        }
        console.log('🛣️ Route selection fallback: Restaurant to Customer (Phase is pickup but no rider loc)', { restaurant: restaurantCoords, customer: customerCoords });
        return { start: restaurantCoords, end: customerCoords };
      }

      // Phase 2: Delivery boy at restaurant - show static route to customer
      if (currentPhase === 'at_pickup' || status === 'reached_pickup' || status === 'at_pickup') {
        console.log('🛣️ Route selection: Restaurant to Customer (At Pickup)', { restaurant: restaurantCoords, customer: customerCoords });
        return {
          start: restaurantCoords,
          end: customerCoords
        };
      }

      if (isPickedUp) {
        if (deliveryBoyLocation) {
          console.log('🛣️ Route selection: Rider to Customer (Picked Up)', { rider: deliveryBoyLocation, customer: customerCoords });
          return {
            start: { lat: deliveryBoyLocation.lat, lng: deliveryBoyLocation.lng },
            end: customerCoords
          };
        }
        console.log('🛣️ Route selection fallback: Restaurant to Customer (Picked up but no rider loc)', { restaurant: restaurantCoords, customer: customerCoords });
        return {
          start: restaurantCoords,
          end: customerCoords
        };
      }

      // Default: Show restaurant to customer
      console.log('🛣️ Route selection: Default (Restaurant to Customer)', { restaurant: restaurantCoords, customer: customerCoords });
      return { start: restaurantCoords, end: customerCoords };
    })();

    return route;
  }, [
    order?.deliveryState?.currentPhase, 
    order?.deliveryState?.status, 
    order?.status, 
    deliveryBoyLocation?.lat, 
    deliveryBoyLocation?.lng, 
    restaurantCoords?.lat, 
    restaurantCoords?.lng, 
    customerCoords?.lat, 
    customerCoords?.lng,
    isPickedUp
  ]);



  // Initialize Socket.io connection
  useEffect(() => {
    if (!orderId) return;

    const connectWithCandidate = (idx) => {
      const c = socketCandidates[idx]
      if (!c) return null
      socketCandidateIdxRef.current = idx
      console.log("🔌 Connecting socket:", { url: c.url, path: c.path })
      return io(c.url, {
        path: c.path,
        // Prefer WebSockets for instant tracking updates, fallback to polling
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 10000
      })
    }

    socketRef.current = connectWithCandidate(0)
    if (!socketRef.current) return

    socketRef.current.on('connect', () => {
      console.log('✅ Socket connected for order:', orderId);
      // When socket connects, default follow is ON (unless user already interacted)
      if (!userHasInteractedRef.current) {
        followRiderRef.current = true;
        setFollowRiderUI(true);
      }
      effectiveTrackingIds.forEach((id) => {
        console.log(`📡 Joining tracking room: order:${id}`);
        socketRef.current.emit('join-order-tracking', id);
        socketRef.current.emit('request-current-location', id);
      })
      console.log('📡 Requested current location for order ids:', effectiveTrackingIds);

      // Also request location updates periodically
      const locationRequestInterval = setInterval(() => {
        // Once we have live push updates, stop polling to prevent duplicate jitter/blink.
        if (hasLivePushRef.current) return;
        if (socketRef.current && socketRef.current.connected) {
          effectiveTrackingIds.forEach((id) => {
            socketRef.current.emit('request-current-location', id);
          })
        }
      }, 8000); // Light polling until push starts (then it becomes a no-op)

      // Store interval ID for cleanup
      socketRef.current._locationRequestInterval = locationRequestInterval;
    });

    socketRef.current.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });

    // If socket fails to connect in production (common with reverse proxies),
    // retry with the next candidate path.
    socketRef.current.on('connect_error', (err) => {
      console.warn('⚠️ Socket connect_error:', err?.message || err)
      const nextIdx = (socketCandidateIdxRef.current || 0) + 1
      if (nextIdx >= socketCandidates.length) return
      try {
        socketRef.current?.removeAllListeners?.()
        socketRef.current?.disconnect?.()
      } catch {}
      socketRef.current = connectWithCandidate(nextIdx)
    })

    const handleLocationReceive = (data) => {
      console.log('📍📍📍 Received REAL-TIME location update via socket:', data);
      const incomingTs = Number(data?.timestamp || 0);
      if (incomingTs && incomingTs <= lastProcessedSocketTsRef.current) return;
      // Production payloads sometimes use latitude/longitude or nested location fields
      const rawLat =
        data?.lat ??
        data?.latitude ??
        data?.location?.lat ??
        data?.location?.latitude ??
        data?.coords?.lat ??
        data?.coords?.latitude
      const rawLng =
        data?.lng ??
        data?.longitude ??
        data?.location?.lng ??
        data?.location?.longitude ??
        data?.coords?.lng ??
        data?.coords?.longitude
      const norm = normalizeIncomingLatLng(rawLat, rawLng);
      if (norm) {
        if (incomingTs) lastProcessedSocketTsRef.current = incomingTs;
        hasLivePushRef.current = true; // We got actual rider push update
        lastLocationUpdateTsRef.current = Date.now();

        // IMPORTANT: never toggle marker visibility based on "near restaurant" checks.
        // That causes blinking when updates repeat or phase briefly desyncs on refresh.

        // Skip noisy repeats (prevents jitter/blink)
        if (lastIncomingPosRef.current) {
          const d = calculateHaversineDistance(
            lastIncomingPosRef.current.lat,
            lastIncomingPosRef.current.lng,
            norm.lat,
            norm.lng,
          );
          if (d < 3) return;
        }
        lastIncomingPosRef.current = norm;

        const location = { lat: norm.lat, lng: norm.lng, heading: data.heading || data.bearing || 0 };
        console.log('✅✅✅ Updating bike to REAL delivery boy location:', location);
        setCurrentLocation(location);
        setDeliveryBoyLocation(location);
        try {
          const key = `tracking:lastRiderLoc:${String(orderId)}`;
          localStorage.setItem(key, JSON.stringify({ lat: location.lat, lng: location.lng, heading: location.heading || 0, ts: Date.now() }));
        } catch {}

        // STRICT POLYLINE TRACKING: Marker always on polyline center
        if (isMapLoaded && mapInstance.current) {
          // Ensure strict controller is initialized if we have polyline
          if (!strictPolylineControllerRef.current && routePolylinePointsRef.current && routePolylinePointsRef.current.length > 0 && bikeMarkerRef.current) {
            strictPolylineControllerRef.current = new StrictPolylineController(
              bikeMarkerRef.current,
              routePolylinePointsRef.current,
              (bearing) => updateMarkerIconRotation(bikeMarkerRef.current, bearing)
            );
          }

          // Priority 1: Use strict polyline controller (marker always on polyline center)
          if (strictPolylineControllerRef.current && routePolylinePointsRef.current && routePolylinePointsRef.current.length > 0) {
            strictPolylineControllerRef.current.updateFromGPS({ lat: norm.lat, lng: norm.lng }, 3500); // Gliding duration
          }
          // Priority 2: Use backend progress if available
          else if (data.progress !== undefined && animationControllerRef.current && routePolylinePointsRef.current) {
            // Backend sent progress - use route-based animation
            console.log('🛵 Using route-based animation with progress:', data.progress);
            animationControllerRef.current.updatePosition(data.progress, data.bearing || data.heading || 0);
          }
          // Priority 3: Fallback to moveBikeSmoothly (will use strict polyline if available)
          else {
            console.log('🚴 Moving bike to location:', location);
            moveBikeSmoothly(norm.lat, norm.lng, data.heading || data.bearing || 0);
          }
        } else {
          // Store for when map loads
          console.log('⏳ Map not loaded yet, storing location for later:', location);
          setCurrentLocation(location);
        }
      } else {
        console.warn('⚠️ Invalid location data received:', data);
      }
    }

    const handleCurrentLocation = (data) => {
      console.log('📍📍📍 Received CURRENT location via socket:', data);
      const incomingTs = Number(data?.timestamp || 0);
      if (incomingTs && incomingTs <= lastProcessedSocketTsRef.current) return;
      const rawLat =
        data?.lat ??
        data?.latitude ??
        data?.location?.lat ??
        data?.location?.latitude ??
        data?.coords?.lat ??
        data?.coords?.latitude
      const rawLng =
        data?.lng ??
        data?.longitude ??
        data?.location?.lng ??
        data?.location?.longitude ??
        data?.coords?.lng ??
        data?.coords?.longitude
      const norm = normalizeIncomingLatLng(rawLat, rawLng);
      if (norm) {
        const currentPhase = orderRef.current?.deliveryState?.currentPhase;
        const deliveryStatus = orderRef.current?.deliveryState?.status;
        const allowPulledLocationForBike =
          deliveryStatus === 'accepted' ||
          currentPhase === 'en_route_to_pickup' ||
          currentPhase === 'at_pickup' ||
          currentPhase === 'en_route_to_delivery' ||
          currentPhase === 'at_delivery' ||
          deliveryStatus === 'reached_pickup' ||
          deliveryStatus === 'order_confirmed' ||
          deliveryStatus === 'en_route_to_delivery' ||
          String(orderRef.current?.status || '').toLowerCase() === 'out_for_delivery';

        const canUseThisForBike = hasLivePushRef.current || allowPulledLocationForBike;
        const location = { lat: norm.lat, lng: norm.lng, heading: data.heading || data.bearing || 0 };

        if (!canUseThisForBike) return;
        if (incomingTs) lastProcessedSocketTsRef.current = incomingTs;

        // Skip noisy repeats for pulled updates too
        if (lastIncomingPosRef.current) {
          const d = calculateHaversineDistance(
            lastIncomingPosRef.current.lat,
            lastIncomingPosRef.current.lng,
            norm.lat,
            norm.lng,
          );
          if (d < 3) return;
        }
        lastIncomingPosRef.current = norm;
        lastLocationUpdateTsRef.current = Date.now();

        setCurrentLocation(location);
        setDeliveryBoyLocation(location);
        try {
          const key = `tracking:lastRiderLoc:${String(orderId)}`;
          localStorage.setItem(key, JSON.stringify({ lat: location.lat, lng: location.lng, heading: location.heading || 0, ts: Date.now() }));
        } catch {}
      }
    }

    effectiveTrackingIds.forEach((id) => {
      console.log(`📡 Attaching listeners for tracking ID: ${id}`);
      socketRef.current.on(`location-receive-${id}`, handleLocationReceive);
      socketRef.current.on(`current-location-${id}`, handleCurrentLocation);
      
      // Ensure rooms are joined and location requested if socket is already connected
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('join-order-tracking', id);
        socketRef.current.emit('request-current-location', id);
      }
    })

    // Listen for route initialization from backend
    socketRef.current.on(`route-initialized-${orderId}`, (data) => {
      console.log('🛣️ Route initialized from backend:', data);
      if (data.points && Array.isArray(data.points) && data.points.length > 0) {
        routePolylinePointsRef.current = data.points;

        // Initialize STRICT polyline controller (marker always on polyline center)
        if (bikeMarkerRef.current) {
          strictPolylineControllerRef.current = new StrictPolylineController(
            bikeMarkerRef.current,
            data.points,
            (bearing) => {
              updateMarkerIconRotation(bikeMarkerRef.current, bearing);
            }
          );
          
          lastProgressRef.current = 0;
          
          // Also initialize legacy controller for backward compatibility
          if (!animationControllerRef.current) {
            animationControllerRef.current = new RouteBasedAnimationController(
              bikeMarkerRef.current,
              data.points
            );
          } else {
            // Update existing controller with new polyline
            animationControllerRef.current.updatePolyline(data.points);
          }
          
          // Update strict controller polyline
          if (strictPolylineControllerRef.current) {
            strictPolylineControllerRef.current.updatePolyline(data.points);
          }
          
          console.log('✅ Strict polyline controller initialized from backend route');
        }
      }
    });

    // Listen for order status updates (e.g., "Delivery partner on the way")
    socketRef.current.on('order_status_update', (data) => {
      console.log('📢 Received order status update:', data);

      // Trigger custom event so OrderTracking component can handle notification
      // This avoids circular dependencies and keeps notification logic in OrderTracking
      if (window.dispatchEvent && data.message) {
        window.dispatchEvent(new CustomEvent('orderStatusNotification', {
          detail: data
        }));
      }
    });

    // BFCache Optimization: Disconnect socket when page is hidden/unloaded
    const handlePageHide = () => {
      if (socketRef.current) {
        console.log('Detecting page hide - closing socket for BFCache eligibility');
        socketRef.current.disconnect();
      }
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (socketRef.current) {
        // Clear location request interval if it exists
        if (socketRef.current._locationRequestInterval) {
          clearInterval(socketRef.current._locationRequestInterval);
        }
        effectiveTrackingIds.forEach((id) => {
          socketRef.current.off(`location-receive-${id}`);
          socketRef.current.off(`current-location-${id}`);
        })
        socketRef.current.off('order_status_update');
        socketRef.current.disconnect();
      }
      
      // Cleanup strict polyline controller
      if (strictPolylineControllerRef.current) {
        strictPolylineControllerRef.current.cancel();
      }
    };
  }, [orderId, moveBikeSmoothly, effectiveTrackingIds, socketCandidates]);

  // Initialize Google Map (only once - prevent re-initialization)
  useEffect(() => {
    // Restaurant coords can be null (we don't want default/fake location).
    // Map should still render based on customer coords, and restaurant marker will appear once coords arrive.
    if (!mapRef.current || !customerCoords || mapInitializedRef.current) return;

    const loadGoogleMapsIfNeeded = async () => {
      // Ensure Google Maps is ready (preload-first; Loader fallback).
      if (!window.google?.maps?.Map) {
        const ready = await ensureGoogleMapsReady();
        if (!ready) {
          try {
            const { getGoogleMapsApiKey } = await import('@/lib/utils/googleMapsApiKey.js');
            const { Loader } = await import('@googlemaps/js-api-loader');
            const apiKey = await getGoogleMapsApiKey();
            if (!apiKey) {
              console.error('❌ No Google Maps API key found');
              return;
            }
            const loader = new Loader({ apiKey, version: 'weekly' });
            await loader.load();
          } catch (error) {
            console.error('❌ Error loading Google Maps:', error);
            return;
          }
        }
      }

      // Initialize map once Google Maps is loaded
      if (window.google && window.google.maps) {
        // Wait for MapTypeId to be available (sometimes it loads slightly after maps)
        let mapTypeIdAttempts = 0;
        const checkMapTypeId = () => {
          // Check if component is still mounted before proceeding
          if (!isMountedRef.current || !mapRef.current) {
            console.log('⚠️ Component unmounted or map container removed, skipping map initialization');
            return;
          }

          if (window.google?.maps?.MapTypeId) {
            initializeMap();
          } else if (mapTypeIdAttempts < 20) {
            mapTypeIdAttempts++;
            setTimeout(checkMapTypeId, 100);
          } else {
            console.warn('⚠️ Google Maps MapTypeId not available, using string fallback');
            // Use fallback - initialize with string instead of enum
            initializeMap();
          }
        };
        checkMapTypeId();
      } else {
        console.error('❌ Google Maps API still not available');
      }
    };

    loadGoogleMapsIfNeeded();

    // Cleanup (do not mark unmounted here; this effect can re-run when coords change)
    return () => {
      if (mapLoadTimeoutRef.current) {
        clearTimeout(mapLoadTimeoutRef.current);
        mapLoadTimeoutRef.current = null;
      }
    };

    function initializeMap() {
      try {
        // Verify Google Maps is fully loaded
        if (!window.google || !window.google.maps || !window.google.maps.Map) {
          console.error('❌ Google Maps API not fully loaded');
          return;
        }

        // CRITICAL: Check if mapRef.current is still available (component might have unmounted)
        if (!mapRef.current) {
          console.warn('⚠️ Map container element not available (component may have unmounted)');
          return;
        }

        // Verify customer coordinates are available
        if (!customerCoords) {
          console.warn('⚠️ Customer coordinates not available');
          return;
        }

        // Normalize coordinates (avoid string concatenation -> NaN center on refresh)
        const cLat = Number(customerCoords.lat);
        const cLng = Number(customerCoords.lng);

        if ([cLat, cLng].some((n) => Number.isNaN(n))) {
          console.warn('⚠️ Invalid customer coordinates for map init:', {
            customerCoords,
          });
          return;
        }

        // Center map on customer by default (restaurant may be unknown initially)
        const centerLng = cLng;
        const centerLat = cLat;

        // Get MapTypeId safely (default to terrain; fallback-safe if MapTypeId isn't ready)
        const mapTypeId = window.google.maps.MapTypeId?.TERRAIN || 'terrain';

        // Initialize map - center between user and restaurant, stable view
        mapInstance.current = new window.google.maps.Map(mapRef.current, {
          center: { lat: centerLat, lng: centerLng },
          zoom: 15,
          minZoom: 13,
          maxZoom: 18,
          mapTypeId: mapTypeId,
          tilt: 0, // Flat 2D view for stability
          heading: 0,
          mapTypeControl: false, // Hide Map/Satellite selector
          fullscreenControl: false, // Hide fullscreen button
          streetViewControl: false, // Hide street view control
          zoomControl: false, // Hide zoom controls
          scrollwheel: true, // Allow mouse wheel zoom
          disableDoubleClickZoom: false, // Allow double click zoom
          disableDefaultUI: true, // Hide all default UI controls
          gestureHandling: 'greedy', // Allow single-finger panning on mobile
          // Prevent automatic viewport changes
          restriction: null,
          // Keep map stable - no auto-fit bounds
          noClear: false,
          // Hide all default labels, POIs, and location markers
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi',
              elementType: 'geometry',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.business',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.attraction',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.place_of_worship',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.school',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.sports_complex',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit.station',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.locality',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.neighborhood',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.land_parcel',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'road',
              elementType: 'labels.text',
              stylers: [{ visibility: 'on' }] // Keep road numbers visible
            },
            {
              featureType: 'road',
              elementType: 'labels.icon',
              stylers: [{ visibility: 'on' }] // Keep road icons visible
            }
          ]
        });

        // If `tilesloaded` never fires, Google Maps likely failed to load (ex: missing/bad API key).
        // Show a friendly overlay instead of leaving a blank map.
        if (mapLoadTimeoutRef.current) {
          clearTimeout(mapLoadTimeoutRef.current);
        }
        setMapLoadTimeoutError(false);
        mapLoadTimeoutRef.current = setTimeout(() => {
          if (!isMapLoadedRef.current && isMountedRef.current) {
            setMapLoadTimeoutError(true);
          }
        }, 8000); // 8s timeout for tiles to load

        // Track user interaction to prevent automatic zoom/pan interference
        mapInstance.current.addListener('dragstart', () => {
          userHasInteractedRef.current = true;
          followRiderRef.current = false;
          setFollowRiderUI(false);
        });

        mapInstance.current.addListener('zoom_changed', () => {
          if (!isProgrammaticChangeRef.current) {
            userHasInteractedRef.current = true;
            followRiderRef.current = false;
            setFollowRiderUI(false);
          }
        });

        // Initialize Directions Service and Renderer
        directionsServiceRef.current = new window.google.maps.DirectionsService();
        directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
          map: mapInstance.current,
          suppressMarkers: true, // We'll add custom markers
          preserveViewport: true, // CRITICAL: Don't auto-adjust viewport when route is set - keep map stable
          polylineOptions: {
            strokeColor: '#ef4444',
            strokeWeight: 4, // Thin, premium look
            strokeOpacity: 0.8
          }
        });

        // Ensure viewport never changes automatically - map stays stable
        directionsRendererRef.current.setOptions({ preserveViewport: true });

        // Restaurant marker:
        // Do NOT remove it from the map based on status, because delivery status can briefly jitter
        // during refresh/socket updates and make the pin "disappear".
        // Instead, keep the marker instance and just toggle visibility.
        const maybeRestaurantLat = Number(restaurantCoords?.lat)
        const maybeRestaurantLng = Number(restaurantCoords?.lng)
        const hasRestaurantCoords = !Number.isNaN(maybeRestaurantLat) && !Number.isNaN(maybeRestaurantLng)

        if (hasRestaurantCoords && !mapInstance.current._restaurantMarker) {
          const restaurantHomeIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
              <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0 Z" fill="#22c55e" stroke="#ffffff" stroke-width="2"/>
              <path d="M20 12 L12 18 L12 28 L16 28 L16 24 L24 24 L24 24 L24 28 L28 28 L28 18 Z" fill="white" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16 24 L16 20 L20 17 L24 20 L24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `);

          mapInstance.current._restaurantMarker = new window.google.maps.Marker({
            position: { lat: maybeRestaurantLat, lng: maybeRestaurantLng },
            map: mapInstance.current,
            icon: {
              url: restaurantHomeIconUrl,
              scaledSize: new window.google.maps.Size(40, 50),
              anchor: new window.google.maps.Point(20, 50),
              origin: new window.google.maps.Point(0, 0)
            },
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 10
          });
        }
        try {
          if (mapInstance.current._restaurantMarker) {
            mapInstance.current._restaurantMarker.setVisible(!isOrderDelivered && hasRestaurantCoords);
          }
        } catch {
          // ignore
        }

        // Customer pin marker hide: customerCoords used for route calculations,
        // Customer marker (fixed): show where order was placed (NOT user's live device location)
        try {
          const ccLat = Number(customerCoords?.lat);
          const ccLng = Number(customerCoords?.lng);
          const hasCustomerCoords = !Number.isNaN(ccLat) && !Number.isNaN(ccLng);

          if (hasCustomerCoords && !mapInstance.current._customerMarker) {
            const customerPinIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
                <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0 Z" fill="#4285F4" stroke="#ffffff" stroke-width="2"/>
                <circle cx="20" cy="20" r="7" fill="white"/>
              </svg>
            `);

            mapInstance.current._customerMarker = new window.google.maps.Marker({
              position: { lat: ccLat, lng: ccLng },
              map: mapInstance.current,
              icon: {
                url: customerPinIconUrl,
                scaledSize: new window.google.maps.Size(30, 38),
                anchor: new window.google.maps.Point(15, 38),
                origin: new window.google.maps.Point(0, 0)
              },
              zIndex: window.google.maps.Marker.MAX_ZINDEX + 2,
              optimized: false,
              title: "Delivery location"
            });
          }

          // Subtle radius ring (static) to make it discoverable on bright maps
          if (hasCustomerCoords) {
            if (customerCircleRef.current) {
              customerCircleRef.current.setMap(null);
              customerCircleRef.current = null;
            }
            customerCircleRef.current = new window.google.maps.Circle({
              strokeColor: '#4285F4',
              strokeOpacity: 0.35,
              strokeWeight: 2,
              fillColor: '#4285F4',
              fillOpacity: 0.10,
              map: mapInstance.current,
              center: { lat: ccLat, lng: ccLng },
              radius: 45,
              zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
            });
          }
        } catch {
          // ignore
        }

        // Draw route based on order phase
        mapInstance.current.addListener('tilesloaded', () => {
          if (mapLoadTimeoutRef.current) {
            clearTimeout(mapLoadTimeoutRef.current);
            mapLoadTimeoutRef.current = null;
          }
          setMapLoadTimeoutError(false);
          setIsMapLoaded(true);

          // Ensure restaurant marker is present (can get detached on some rerenders)
          try {
            if (!isOrderDelivered && restaurantCoords && restaurantCoords.lat && restaurantCoords.lng) {
              const rrLat = Number(restaurantCoords.lat);
              const rrLng = Number(restaurantCoords.lng);
              if (!Number.isNaN(rrLat) && !Number.isNaN(rrLng)) {
                if (!mapInstance.current._restaurantMarker) {
                  const restaurantHomeIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
                      <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0 Z" fill="#22c55e" stroke="#ffffff" stroke-width="2"/>
                      <path d="M20 12 L12 18 L12 28 L16 28 L16 24 L24 24 L24 28 L28 28 L28 18 Z" fill="white" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M16 24 L16 20 L20 17 L24 20 L24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  `);
                  mapInstance.current._restaurantMarker = new window.google.maps.Marker({
                    position: { lat: rrLat, lng: rrLng },
                    map: mapInstance.current,
                    icon: {
                      url: restaurantHomeIconUrl,
                      scaledSize: new window.google.maps.Size(30, 38),
                      anchor: new window.google.maps.Point(15, 38),
                      origin: new window.google.maps.Point(0, 0)
                    },
                    zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
                  });
                } else {
                  if (mapInstance.current._restaurantMarker.getMap() == null) {
                    mapInstance.current._restaurantMarker.setMap(mapInstance.current);
                  }
                  mapInstance.current._restaurantMarker.setPosition({ lat: rrLat, lng: rrLng });
                }
              }
            }
          } catch {
            // ignore
          }

          // Initial focus: show fixed delivery location; if restaurant is present and far, fit bounds.
          // Do it only once, and only if user hasn't interacted with the map yet.
          try {
            if (
              customerCoords &&
              typeof customerCoords.lat === 'number' &&
              typeof customerCoords.lng === 'number' &&
              !userHasInteractedRef.current
            ) {
              const rrLat = Number(restaurantCoords?.lat)
              const rrLng = Number(restaurantCoords?.lng)
              const hasRestaurant =
                !Number.isNaN(rrLat) &&
                !Number.isNaN(rrLng) &&
                rrLat >= -90 &&
                rrLat <= 90 &&
                rrLng >= -180 &&
                rrLng <= 180
              const distanceToRestaurant = hasRestaurant
                ? calculateHaversineDistance(
                    customerCoords.lat,
                    customerCoords.lng,
                    rrLat,
                    rrLng,
                  )
                : 0

              isProgrammaticChangeRef.current = true;

              // Always pan to customer location and maintain fixed zoom 15
              mapInstance.current.panTo({ lat: customerCoords.lat, lng: customerCoords.lng });

              setTimeout(() => {
                isProgrammaticChangeRef.current = false;
              }, 250);
            }
          } catch {
            // ignore
          }

          // Hide Google Maps footer elements (Keyboard shortcuts, Map data, Terms)
          const hideGoogleFooter = () => {
            const footerElements = mapRef.current?.querySelectorAll?.('.gm-style-cc, a[href*="keyboard"], a[href*="terms"]');
            footerElements?.forEach(el => {
              if (el instanceof HTMLElement) {
                el.style.display = 'none';
              }
            });
          };

          // Hide immediately and also set interval to catch dynamically added elements
          hideGoogleFooter();
          const footerHideInterval = setInterval(() => {
            hideGoogleFooter();
          }, 500);

          // Clear interval after 5 seconds
          setTimeout(() => clearInterval(footerHideInterval), 5000);

          // Check if delivery partner is assigned and show bike immediately
          const currentPhase = order?.deliveryState?.currentPhase;
          const deliveryStateStatus = order?.deliveryState?.status;
          const hasDeliveryPartnerOnLoad = currentPhase === 'en_route_to_pickup' ||
            currentPhase === 'at_pickup' ||
            currentPhase === 'en_route_to_delivery' ||
            deliveryStateStatus === 'accepted' ||
            (deliveryStateStatus && deliveryStateStatus !== 'pending');

          console.log('🚴 Map tiles loaded - Checking for delivery partner:', {
            currentPhase,
            deliveryStateStatus,
            hasDeliveryPartnerOnLoad,
            hasBikeMarker: !!bikeMarkerRef.current
          });

          // Ensure bike is created if we have ANY location
          if (!bikeMarkerRef.current && currentLocation) {
            console.log('🚴 Map tiles loaded - Creating bike from current state:', currentLocation);
            moveBikeSmoothly(currentLocation.lat, currentLocation.lng, currentLocation.heading || 0);
          } else if (hasDeliveryPartnerOnLoad && !bikeMarkerRef.current) {
            console.log('🚴 Map loaded - Waiting for location from socket...');
            // Request current location immediately
            if (socketRef.current && socketRef.current.connected) {
              effectiveTrackingIds.forEach((id) => {
                socketRef.current.emit('request-current-location', id);
              })
            }
          }

          // DO NOT draw default route - only draw when delivery partner is assigned
          // Route will be drawn when delivery partner accepts or when location updates arrive
        });

        console.log('✅ Google Map initialized successfully');
        mapInitializedRef.current = true; // Mark map as initialized
      } catch (error) {
        console.error('❌ Map initialization error:', error);
      }
    }
  }, [restaurantCoords, customerCoords, ensureGoogleMapsReady]); // Removed dependencies that cause re-initialization

  // Memoize restaurant and customer coordinates to avoid dependency issues
  const restaurantLat = restaurantCoords?.lat;
  const restaurantLng = restaurantCoords?.lng;
  const deliveryBoyLat = deliveryBoyLocation?.lat;
  const deliveryBoyLng = deliveryBoyLocation?.lng;
  const deliveryBoyHeading = deliveryBoyLocation?.heading;

  // Update route when delivery boy location or order phase changes
  useEffect(() => {
    if (!isMapLoaded) return;

    // Check if delivery partner is assigned based on phase
    const currentPhase = order?.deliveryState?.currentPhase;
    const hasDeliveryPartnerByPhase = currentPhase === 'en_route_to_pickup' ||
      currentPhase === 'at_pickup' ||
      currentPhase === 'en_route_to_delivery';

    // If delivery partner is assigned but bike marker doesn't exist, create it
    if (hasDeliveryPartnerByPhase && !bikeMarkerRef.current && mapInstance.current) {
      console.log('🚴 Delivery partner detected by phase, creating bike marker:', currentPhase);
      // DO NOT show bike at restaurant - wait for real location from socket
      // Bike will be created when real location is received via socket
      console.log('⏳ Waiting for real location from socket - NOT showing at restaurant');
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('request-current-location', orderId);
      }
    }

    const now = Date.now();
    const route = getRouteToShow();
    if (!route || !route.start || !route.end) return;

    // Only draw if coordinates changed meaningfully (approx > 5 meters)
    // We reduced sensitivity here to prevent flickering during minor GPS jitter
    const last = lastRouteRequestRef.current;
    const startChanged = !last.start || 
      Math.abs(last.start.lat - route.start.lat) > 0.00005 || 
      Math.abs(last.start.lng - route.start.lng) > 0.00005;
    const endChanged = !last.end || 
      Math.abs(last.end.lat - route.end.lat) > 0.00005 || 
      Math.abs(last.end.lng - route.end.lng) > 0.00005;

    const lastPhase = lastRouteRequestRef.current.phase;
    const currentRoutePhase = isPickedUp ? 'picked_up' : currentPhase;

    if (startChanged || endChanged || lastPhase !== currentRoutePhase) {
      // Throttle Directions API: don't call more than once every 10s unless phase changed
      const lastApiCall = lastRouteRequestRef.current.timestamp;
      
      // Force immediate redraw if phase changed (e.g. just picked up)
      const forceRedraw = lastPhase !== currentRoutePhase;
      
      if (now - lastApiCall > 10000 || startChanged || forceRedraw) {
         lastRouteUpdateRef.current = now;
         lastRouteRequestRef.current.phase = currentRoutePhase;
         drawRoute(route.start, route.end);
      }
    }
  }, [
    isMapLoaded, 
    order?.deliveryState?.currentPhase, 
    order?.deliveryState?.status, 
    restaurantLat, 
    restaurantLng, 
    customerCoords?.lat, 
    customerCoords?.lng, 
    drawRoute, 
    deliveryBoyLat,
    deliveryBoyLng,
    hasDeliveryPartner,
    order?.status,
    isPickedUp
  ]);


  // Create bike marker when map loads if we have stored location
  useEffect(() => {
    if (isMapLoaded && mapInstance.current && currentLocation && !bikeMarkerRef.current) {
      // If we restored a recent location from storage (or already have push), create bike immediately.
      // Fresh restored locations (less than 30 mins) are allowed to skip the phase-check
      // to ensure the bike is visible IMMEDIATELY after refresh.
      const isFreshRestored = currentLocation.isRestored && (Date.now() - (currentLocation.ts || 0) < 30 * 60 * 1000);
      
      if (!hasLivePushRef.current && !allowPulledLocationForBike && !isFreshRestored) return;

      console.log('🚴 Creating bike marker from stored/current location on map load:', currentLocation);
      moveBikeSmoothly(currentLocation.lat, currentLocation.lng, currentLocation.heading || 0);
    }
  }, [isMapLoaded, currentLocation, moveBikeSmoothly, allowPulledLocationForBike]);

  // Show bike marker when delivery partner is assigned (even without location yet)
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current) {
      console.log('⏳ Map not loaded yet, waiting...');
      return;
    }

    // Also check phase directly as fallback
    const currentPhase = order?.deliveryState?.currentPhase;
    const deliveryStateStatus = order?.deliveryState?.status;

    // Key check: If status is 'accepted', definitely show bike
    const isAccepted = deliveryStateStatus === 'accepted';
    const hasPartnerByPhase = isAccepted ||
      currentPhase === 'en_route_to_pickup' ||
      currentPhase === 'at_pickup' ||
      currentPhase === 'en_route_to_delivery' ||
      deliveryStateStatus === 'reached_pickup' ||
      deliveryStateStatus === 'order_confirmed' ||
      deliveryStateStatus === 'en_route_to_delivery';

    const isFreshRestored = currentLocation?.isRestored && (Date.now() - (currentLocation.ts || 0) < 30 * 60 * 1000);
    const shouldShowBike = hasDeliveryPartner || hasPartnerByPhase || isFreshRestored;

    console.log('🚴🚴🚴 BIKE VISIBILITY CHECK:', {
      shouldShowBike,
      isAccepted,
      hasDeliveryPartner,
      hasPartnerByPhase,
      deliveryStateStatus,
      currentPhase,
      hasBikeMarker: !!bikeMarkerRef.current
    });

    console.log('🔍 Checking delivery partner assignment:', {
      hasDeliveryPartner,
      hasPartnerByPhase,
      shouldShowBike,
      currentPhase,
      deliveryStateStatus,
      deliveryPartnerId: order?.deliveryPartnerId,
      deliveryPartner: order?.deliveryPartner,
      assignmentInfo: order?.assignmentInfo,
      deliveryState: order?.deliveryState,
      hasBikeMarker: !!bikeMarkerRef.current,
      deliveryBoyLocation: { lat: deliveryBoyLat, lng: deliveryBoyLng, heading: deliveryBoyHeading },
      restaurantCoords: { lat: restaurantLat, lng: restaurantLng },
      mapInstance: !!mapInstance.current,
      isMapLoaded
    });

    if (shouldShowBike && !bikeMarkerRef.current) {
      console.log('🚴🚴🚴 CREATING BIKE MARKER - Delivery partner accepted!');
      console.log('🚴 Full order state:', JSON.stringify(order?.deliveryState, null, 2));

      // Priority: ONLY create bike when we have REAL live delivery location.
      // Otherwise, do NOT show near restaurant/customer by default.
      if (deliveryBoyLat && deliveryBoyLng) {
        console.log('✅✅✅ Creating bike at REAL delivery boy location:', {
          lat: deliveryBoyLat,
          lng: deliveryBoyLng,
          heading: deliveryBoyHeading
        });
        moveBikeSmoothly(deliveryBoyLat, deliveryBoyLng, deliveryBoyHeading || 0);
      } else {
        console.log('⏳ Waiting for live delivery boy location from socket (bike hidden until then)');
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('request-current-location', orderId);
          console.log('📡 Requested current location from backend immediately');
        }
      }

      // Verify marker was created after a short delay
      setTimeout(() => {
        if (bikeMarkerRef.current) {
          const marker = bikeMarkerRef.current;
          const markerPosition = marker.getPosition();
          const markerVisible = marker.getVisible();
          const markerMap = marker.getMap();

          console.log('✅✅✅ BIKE MARKER VERIFICATION:', {
            exists: true,
            visible: markerVisible,
            onMap: !!markerMap,
            position: markerPosition ? {
              lat: markerPosition.lat(),
              lng: markerPosition.lng()
            } : null,
          });

          // Force visibility if needed
          if (!markerVisible) {
            marker.setVisible(true);
          }
          if (!markerMap) {
            marker.setMap(mapInstance.current);
          }
        }
      }, 500);
    } else if (shouldShowBike && bikeMarkerRef.current) {
      // If we are NOT receiving live push updates (socket), update from state (polling).
      if (!hasLivePushRef.current && deliveryBoyLat && deliveryBoyLng) {
        moveBikeSmoothly(deliveryBoyLat, deliveryBoyLng, deliveryBoyHeading || 0);
      }
    } else {
      // Bike marker exists. Ensure visibility without redundant setMap calls
      if (bikeMarkerRef.current) {
        try {
          if (!bikeMarkerRef.current.getVisible()) {
            bikeMarkerRef.current.setVisible(true);
          }
          if (bikeMarkerRef.current.getMap() == null) {
            bikeMarkerRef.current.setMap(mapInstance.current);
          }
        } catch {}
      }
    }
  }, [
    isMapLoaded,
    hasDeliveryPartner,
    deliveryBoyLat,
    deliveryBoyLng,
    deliveryBoyHeading,
    restaurantLat,
    restaurantLng,
    moveBikeSmoothly,
    order?.deliveryState?.status,
    order?.deliveryState?.currentPhase,
    order?.status,
    order?.deliveryPartnerId,
    order?.assignmentInfo?.deliveryPartnerId,
  ]);

  // Update user's live location marker and circle when location changes (OPTIONAL)
  useEffect(() => {
    if (!showUserLiveLocation) {
      // Ensure any previously-created live location overlays are removed.
      try {
        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setMap(null);
          userLocationMarkerRef.current = null;
        }
        if (userLocationCircleRef.current) {
          userLocationCircleRef.current.setMap(null);
          userLocationCircleRef.current = null;
        }
      } catch {
        // ignore
      }
      return;
    }

    if (isMapLoaded && userLiveCoords && userLiveCoords.lat && userLiveCoords.lng && mapInstance.current) {
      const userPos = { lat: userLiveCoords.lat, lng: userLiveCoords.lng };
      const radiusMeters = Math.max(userLocationAccuracy || 50, 20);

      // Update or create user location marker
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.setPosition(userPos);
      } else {
        const userPinIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
            <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0 Z" fill="#4285F4" stroke="#ffffff" stroke-width="2"/>
            <circle cx="20" cy="20" r="7" fill="white"/>
          </svg>
        `);

        userLocationMarkerRef.current = new window.google.maps.Marker({
          position: userPos,
          map: mapInstance.current,
          icon: {
            url: userPinIconUrl,
            scaledSize: new window.google.maps.Size(30, 38),
            anchor: new window.google.maps.Point(15, 38),
            origin: new window.google.maps.Point(0, 0)
          },
          zIndex: window.google.maps.Marker.MAX_ZINDEX + 2,
          optimized: false,
          title: "Your live location"
        });
      }

      // Update or create radius circle
      if (userLocationCircleRef.current) {
        userLocationCircleRef.current.setCenter(userPos);
        userLocationCircleRef.current.setRadius(radiusMeters);
      } else {
        userLocationCircleRef.current = new window.google.maps.Circle({
          strokeColor: '#4285F4',
          strokeOpacity: 0.4,
          strokeWeight: 2,
          fillColor: '#4285F4',
          fillOpacity: 0.15,
          map: mapInstance.current,
          center: userPos,
          radius: radiusMeters,
          zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
        });
      }
    }
  }, [showUserLiveLocation, isMapLoaded, userLiveCoords, userLocationAccuracy]);

  // Keep customer (fixed delivery location) marker in sync when coordinates arrive/change
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current) return;
    const ccLat = Number(customerCoords?.lat);
    const ccLng = Number(customerCoords?.lng);
    if (Number.isNaN(ccLat) || Number.isNaN(ccLng)) return;

    const pos = { lat: ccLat, lng: ccLng };
    try {
      if (!mapInstance.current._customerMarker) {
        const customerPinIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
            <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0 Z" fill="#4285F4" stroke="#ffffff" stroke-width="2"/>
            <circle cx="20" cy="20" r="7" fill="white"/>
          </svg>
        `);

        mapInstance.current._customerMarker = new window.google.maps.Marker({
          position: pos,
          map: mapInstance.current,
          icon: {
            url: customerPinIconUrl,
            scaledSize: new window.google.maps.Size(30, 38),
            anchor: new window.google.maps.Point(15, 38),
            origin: new window.google.maps.Point(0, 0)
          },
          zIndex: window.google.maps.Marker.MAX_ZINDEX + 2,
          optimized: false,
          title: "Delivery location"
        });
      } else {
        if (mapInstance.current._customerMarker.getMap() == null) {
          mapInstance.current._customerMarker.setMap(mapInstance.current);
        }
        mapInstance.current._customerMarker.setPosition(pos);

        // Ensure icon is also updated if needed
        const customerPinIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
            <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0 Z" fill="#4285F4" stroke="#ffffff" stroke-width="2"/>
            <circle cx="20" cy="20" r="7" fill="white"/>
          </svg>
        `);
        mapInstance.current._customerMarker.setIcon({
          url: customerPinIconUrl,
          scaledSize: new window.google.maps.Size(30, 38),
          anchor: new window.google.maps.Point(15, 38),
          origin: new window.google.maps.Point(0, 0)
        });
      }
    } catch {}

    try {
      if (customerCircleRef.current) {
        customerCircleRef.current.setCenter(pos);
      } else {
        customerCircleRef.current = new window.google.maps.Circle({
          strokeColor: '#4285F4',
          strokeOpacity: 0.35,
          strokeWeight: 2,
          fillColor: '#4285F4',
          fillOpacity: 0.10,
          map: mapInstance.current,
          center: pos,
          radius: 45,
          zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
        });
      }
    } catch {}
  }, [isMapLoaded, customerCoords?.lat, customerCoords?.lng]);

  // Keep restaurant marker position in sync when coordinates change (and ensure it exists after refresh)
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current) return;
    if (!restaurantCoords?.lat || !restaurantCoords?.lng) return;

    // Never detach the restaurant marker from the map (prevents "disappearing" on jitter).
    // Just toggle visibility.
    try {
      if (mapInstance.current._restaurantMarker) {
        mapInstance.current._restaurantMarker.setVisible(!isOrderDelivered)
      }
      if (restaurantCircleRef.current) {
        restaurantCircleRef.current.setVisible(!isOrderDelivered)
      }
    } catch {}

    const lat = Number(restaurantCoords.lat)
    const lng = Number(restaurantCoords.lng)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return

    const effectivePos = { lat, lng }

    if (!mapInstance.current._restaurantMarker) {
      const restaurantHomeIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
          <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0 Z" fill="#22c55e" stroke="#ffffff" stroke-width="2"/>
          <path d="M20 12 L12 18 L12 28 L16 28 L16 24 L24 24 L24 28 L28 28 L28 18 Z" fill="white" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 24 L16 20 L20 17 L24 20 L24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `);

      mapInstance.current._restaurantMarker = new window.google.maps.Marker({
        position: effectivePos,
        map: mapInstance.current,
        icon: {
          url: restaurantHomeIconUrl,
          scaledSize: new window.google.maps.Size(30, 38),
          anchor: new window.google.maps.Point(15, 38),
          origin: new window.google.maps.Point(0, 0)
        },
        zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
      });
      // Also add a subtle ring so restaurant is visible even if bike overlaps exactly.
      try {
        if (restaurantCircleRef.current) {
          restaurantCircleRef.current.setMap(null)
          restaurantCircleRef.current = null
        }
        restaurantCircleRef.current = new window.google.maps.Circle({
          strokeColor: "#22c55e",
          strokeOpacity: 0.9,
          strokeWeight: 3,
          fillColor: "#22c55e",
          fillOpacity: 0.08,
          map: mapInstance.current,
          center: effectivePos,
          radius: 55,
          zIndex: window.google.maps.Marker.MAX_ZINDEX
        })
      } catch {}
      return
    }

    // If marker exists but got detached, re-attach it.
    try {
      if (mapInstance.current._restaurantMarker.getMap() == null) {
        mapInstance.current._restaurantMarker.setMap(mapInstance.current)
      }
    } catch {
      // ignore
    }

    mapInstance.current._restaurantMarker.setPosition(effectivePos);
    try {
      if (restaurantCircleRef.current) {
        restaurantCircleRef.current.setCenter(effectivePos)
      } else {
        restaurantCircleRef.current = new window.google.maps.Circle({
          strokeColor: "#22c55e",
          strokeOpacity: 0.9,
          strokeWeight: 3,
          fillColor: "#22c55e",
          fillOpacity: 0.08,
          map: mapInstance.current,
          center: effectivePos,
          radius: 55,
          zIndex: window.google.maps.Marker.MAX_ZINDEX
        })
      }
    } catch {}
  }, [isMapLoaded, isOrderDelivered, restaurantCoords?.lat, restaurantCoords?.lng]);

  // Periodic check to ensure bike marker is created if it should be visible
  // DISABLED - prevents duplicate marker creation
  // useEffect(() => {
  //   if (!isMapLoaded || !mapInstance.current) return;
  //   
  //   const checkInterval = setInterval(() => {
  //     const currentPhase = order?.deliveryState?.currentPhase;
  //     const deliveryStateStatus = order?.deliveryState?.status;
  //     const shouldHaveBike = deliveryStateStatus === 'accepted' ||
  //                            currentPhase === 'en_route_to_pickup' ||
  //                            currentPhase === 'at_pickup' ||
  //                            currentPhase === 'en_route_to_delivery' ||
  //                            (deliveryStateStatus && deliveryStateStatus !== 'pending');
  //     
  //     if (shouldHaveBike && !bikeMarkerRef.current && restaurantCoords && restaurantCoords.lat && restaurantCoords.lng) {
  //       console.log('🔄 Periodic check: Bike should be visible but missing, creating now...');
  //       try {
  //         const position = new window.google.maps.LatLng(restaurantCoords.lat, restaurantCoords.lng);
  //         bikeMarkerRef.current = new window.google.maps.Marker({
  //           position: position,
  //           map: mapInstance.current,
  //           icon: {
  //             url: bikeLogo,
  //             scaledSize: new window.google.maps.Size(50, 50),
  //             anchor: new window.google.maps.Point(25, 25),
  //             rotation: 0
  //           },
  //           optimized: false,
  //           zIndex: window.google.maps.Marker.MAX_ZINDEX + 3,
  //           title: 'Delivery Partner',
  //           visible: true
  //         });
  //         console.log('✅✅✅ BIKE MARKER CREATED via periodic check!');
  //       } catch (err) {
  //         console.error('❌ Periodic bike creation failed:', err);
  //       }
  //     }
  //   }, 2000); // Check every 2 seconds
  //   
  //   return () => clearInterval(checkInterval);
  // }, [isMapLoaded, order?.deliveryState?.currentPhase, order?.deliveryState?.status, restaurantCoords, bikeLogo]);

  // Cleanup animation controller on unmount
  useEffect(() => {
    return () => {
      if (animationControllerRef.current) {
        animationControllerRef.current.destroy();
        animationControllerRef.current = null;
      }
      try {
        if (customerCircleRef.current) {
          customerCircleRef.current.setMap(null);
          customerCircleRef.current = null;
        }
      } catch {
        // ignore
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {mapLoadTimeoutError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(255, 255, 255, 0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, color: '#111827' }}>
            Live tracking unavailable
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', lineHeight: 1.4 }}>
            Google Maps did not load in time. Please check internet/API key and try again.
          </div>
        </div>
      )}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Recenter / Follow button (Zomato-like) */}
      {isMapLoaded && (
        <button
          type="button"
          onClick={() => {
            followRiderRef.current = true;
            setFollowRiderUI(true);
            userHasInteractedRef.current = false;
            try {
              const p = bikeMarkerRef.current?.getPosition?.();
              if (p && mapInstance.current) {
                isProgrammaticChangeRef.current = true;
                mapInstance.current.panTo({ lat: p.lat(), lng: p.lng() });
                const z = mapInstance.current.getZoom();
                setTimeout(() => {
                  isProgrammaticChangeRef.current = false;
                }, 200);
              }
            } catch {
              // ignore
            }
          }}
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            zIndex: 50,
            background: followRiderUI ? "#16a34a" : "#ffffff",
            color: followRiderUI ? "#ffffff" : "#111827",
            border: followRiderUI ? "1px solid rgba(0,0,0,0.05)" : "1px solid rgba(17,24,39,0.14)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
            borderRadius: 14,
            padding: "10px 12px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {followRiderUI ? "Following" : "Recenter"}
        </button>
      )}
    </div>
  );
};

export default React.memo(DeliveryTrackingMap);
