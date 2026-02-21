/**
 * Enhanced Delivery Tracking Map Component
 * 
 * Features:
 * - GPS drift correction with map matching
 * - Smooth polyline-based animation (no cutting through buildings)
 * - Dynamic bearing calculation along curves
 * - Off-route detection with re-routing
 * - 60fps smooth animation using requestAnimationFrame
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL } from '@/lib/api/config';
import bikeLogo from '@/assets/bikelogo.png';
import {
  snapToPolyline,
  detectOffRoute,
  PolylineAnimationController
} from '@/module/delivery/utils/enhancedMapMatching';
import { extractPolylineFromDirections } from '@/module/delivery/utils/liveTrackingPolyline';
import { updateMarkerIconRotation } from '@/module/user/utils/routeBasedAnimation';
import './DeliveryTrackingMap.css';

const EnhancedDeliveryTrackingMap = ({
  orderId,
  restaurantCoords,
  customerCoords,
  mapRef,
  mapInstance,
  directionsService,
  directionsRenderer
}) => {
  const bikeMarkerRef = useRef(null);
  const polylineAnimationControllerRef = useRef(null);
  const routePolylinePointsRef = useRef(null);
  const lastSnappedPositionRef = useRef(null);
  const isReRoutingRef = useRef(false);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isOffRoute, setIsOffRoute] = useState(false);

  const backendUrl = API_BASE_URL.replace('/api', '');

  /**
   * Initialize bike marker
   */
  const initializeBikeMarker = useCallback((position) => {
    if (!mapInstance || bikeMarkerRef.current) return;

    bikeMarkerRef.current = new window.google.maps.Marker({
      position: position,
      map: mapInstance,
      icon: {
        url: bikeLogo,
        scaledSize: new window.google.maps.Size(60, 60),
        anchor: new window.google.maps.Point(30, 30)
      },
      optimized: false,
      zIndex: window.google.maps.Marker.MAX_ZINDEX + 3,
      title: 'Delivery Partner',
      visible: true
    });

    console.log('✅ Bike marker initialized');
  }, [mapInstance]);

  /**
   * Draw route and extract polyline
   */
  const drawRoute = useCallback(async (start, end) => {
    if (!directionsService || !directionsRenderer) return;

    return new Promise((resolve) => {
      directionsService.route(
        {
          origin: start,
          destination: end,
          travelMode: window.google.maps.TravelMode.DRIVING
        },
        (result, status) => {
          if (status === 'OK' && result) {
            directionsRenderer.setDirections(result);

            // Extract polyline points
            const polylinePoints = extractPolylineFromDirections(result);
            routePolylinePointsRef.current = polylinePoints;

            // Initialize animation controller
            if (bikeMarkerRef.current && polylinePoints.length > 0) {
              polylineAnimationControllerRef.current = new PolylineAnimationController(
                bikeMarkerRef.current,
                polylinePoints,
                (bearing) => {
                  // Update marker rotation when bearing changes
                  updateMarkerIconRotation(bikeMarkerRef.current, bearing);
                }
              );
            }

            console.log('✅ Route drawn, polyline extracted:', polylinePoints.length, 'points');
            resolve(polylinePoints);
          } else {
            console.error('❌ Route calculation failed:', status);
            resolve(null);
          }
        }
      );
    });
  }, [directionsService, directionsRenderer]);

  /**
   * Handle new location update from Socket.io
   * This is the core function that prevents GPS drift
   */
  const handleLocationUpdate = useCallback((data) => {
    if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
      console.warn('⚠️ Invalid location data:', data);
      return;
    }

    const rawGPS = { lat: data.lat, lng: data.lng };

    // If no polyline available, wait for route
    if (!routePolylinePointsRef.current || routePolylinePointsRef.current.length < 2) {
      console.warn('⚠️ No polyline available, waiting for route...');
      return;
    }

    // Step 1: Detect if driver is off-route
    const offRouteCheck = detectOffRoute(rawGPS, routePolylinePointsRef.current, 50);
    
    if (offRouteCheck.isOffRoute) {
      console.warn('⚠️ Driver is off-route! Distance:', offRouteCheck.distance, 'm');
      setIsOffRoute(true);
      
      // Trigger re-routing if too far off
      if (offRouteCheck.distance > 100 && !isReRoutingRef.current) {
        isReRoutingRef.current = true;
        console.log('🔄 Triggering re-route...');
        
        // Re-route from current position to destination
        drawRoute(rawGPS, customerCoords).then(() => {
          isReRoutingRef.current = false;
          setIsOffRoute(false);
        });
      }
      
      // Use nearest point as fallback
      rawGPS = offRouteCheck.nearestPoint;
    } else {
      setIsOffRoute(false);
    }

    // Step 2: Snap GPS to polyline (map matching)
    const lastSnap = lastSnappedPositionRef.current || {
      segmentIndex: 0,
      t: 0,
      snappedPoint: routePolylinePointsRef.current[0]
    };

    const endSnap = snapToPolyline(
      routePolylinePointsRef.current,
      rawGPS,
      lastSnap.segmentIndex,
      50 // max snap distance
    );

    // Step 3: Animate smoothly along polyline (not straight line!)
    if (polylineAnimationControllerRef.current) {
      polylineAnimationControllerRef.current.animate(
        lastSnap,
        endSnap,
        2000 // 2 second animation duration
      );
    } else {
      // Fallback: Direct update if animation controller not ready
      if (bikeMarkerRef.current) {
        bikeMarkerRef.current.setPosition(endSnap.snappedPoint);
        const bearing = calculateBearingForSegment(endSnap.segmentIndex);
        updateMarkerIconRotation(bikeMarkerRef.current, bearing);
      }
    }

    // Update last snapped position
    lastSnappedPositionRef.current = endSnap;
    setCurrentLocation(endSnap.snappedPoint);
  }, [routePolylinePointsRef, customerCoords, drawRoute]);

  /**
   * Calculate bearing for a segment
   */
  const calculateBearingForSegment = useCallback((segmentIndex) => {
    if (!routePolylinePointsRef.current || segmentIndex >= routePolylinePointsRef.current.length - 1) {
      return 0;
    }

    const start = routePolylinePointsRef.current[segmentIndex];
    const end = routePolylinePointsRef.current[segmentIndex + 1];

    const dLng = (end.lng - start.lng) * Math.PI / 180;
    const lat1Rad = start.lat * Math.PI / 180;
    const lat2Rad = end.lat * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }, []);

  /**
   * Setup Socket.io connection
   */
  useEffect(() => {
    if (!orderId) return;

    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected for order tracking:', orderId);
      socket.emit('join-order-tracking', orderId);
      socket.emit('request-current-location', orderId);
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });

    // Listen for location updates
    socket.on(`location-receive-${orderId}`, handleLocationUpdate);
    socket.on('update-location', (data) => {
      if (data.orderId === orderId) {
        handleLocationUpdate(data);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [orderId, backendUrl, handleLocationUpdate]);

  /**
   * Initialize map and draw route
   */
  useEffect(() => {
    if (!mapInstance || !restaurantCoords || !customerCoords) return;

    setIsMapLoaded(true);

    // Draw initial route
    drawRoute(restaurantCoords, customerCoords).then((polylinePoints) => {
      if (polylinePoints && polylinePoints.length > 0) {
        // Initialize bike marker at restaurant
        initializeBikeMarker(restaurantCoords);
        lastSnappedPositionRef.current = {
          segmentIndex: 0,
          t: 0,
          snappedPoint: polylinePoints[0]
        };
      }
    });
  }, [mapInstance, restaurantCoords, customerCoords, drawRoute, initializeBikeMarker]);

  /**
   * Cleanup
   */
  useEffect(() => {
    return () => {
      if (polylineAnimationControllerRef.current) {
        polylineAnimationControllerRef.current.cancel();
      }
    };
  }, []);

  return null; // This component manages tracking, doesn't render UI
};

export default EnhancedDeliveryTrackingMap;
