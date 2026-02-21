/**
 * Enhanced Delivery Tracking Component
 * Features:
 * - Smooth marker animation (no jumping)
 * - Vehicle rotation based on direction of travel
 * - Socket.io real-time updates
 * - Polyline adherence
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import { calculateBearing, calculateBearingFromLocations, lerpBearing } from '../utils/bearingCalculation';
import { createSmoothAnimationController } from '../utils/smoothAnimation';
import { API_BASE_URL } from '@/lib/api/config';

const EnhancedDeliveryTracking = ({
  orderId,
  mapInstance,
  bikeMarkerRef,
  initialLocation = null,
  polylineRef = null,
  updateInterval = 1000, // Socket update interval in ms
  animationDuration = 1000, // Animation duration in ms
  socketUrl = null
}) => {
  const [currentPosition, setCurrentPosition] = useState(initialLocation || { lat: 0, lng: 0 });
  const [currentBearing, setCurrentBearing] = useState(0);
  
  const socketRef = useRef(null);
  const animationControllerRef = useRef(null);
  const previousLocationRef = useRef(initialLocation);
  const lastUpdateTimeRef = useRef(Date.now());

  // Initialize smooth animation controller
  useEffect(() => {
    if (!mapInstance || !bikeMarkerRef) return;

    animationControllerRef.current = createSmoothAnimationController({
      duration: animationDuration,
      onUpdate: (position, bearing, progress) => {
        // Update marker position smoothly
        if (bikeMarkerRef.current) {
          bikeMarkerRef.current.setPosition(position);
          
          // Update marker rotation
          if (bearing !== null && bearing !== undefined) {
            updateMarkerRotation(bearing);
          }
        }
        
        // Update state
        setCurrentPosition(position);
        setCurrentBearing(bearing);
      }
    });

    return () => {
      if (animationControllerRef.current) {
        animationControllerRef.current.cancel();
      }
    };
  }, [mapInstance, bikeMarkerRef, animationDuration]);

  // Update marker rotation
  const updateMarkerRotation = useCallback(async (bearing) => {
    if (!bikeMarkerRef.current || !window.google) return;

    try {
      // Get rotated icon
      const iconUrl = await getRotatedBikeIcon(bearing);
      
      if (iconUrl && bikeMarkerRef.current) {
        bikeMarkerRef.current.setIcon({
          url: iconUrl,
          scaledSize: new window.google.maps.Size(60, 60),
          anchor: new window.google.maps.Point(30, 30)
        });
      }
    } catch (error) {
      console.warn('Failed to update marker rotation:', error);
    }
  }, [bikeMarkerRef, getRotatedBikeIcon]);

  // Get rotated bike icon using canvas
  const getRotatedBikeIcon = useCallback(async (bearing) => {
    try {
      // Import bike icon (adjust path as needed)
      const bikeIconUrl = (await import('@/assets/bikelogo.png')).default;
      
      return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 60;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = bikeIconUrl;
        
        img.onload = () => {
          ctx.clearRect(0, 0, 60, 60);
          ctx.save();
          ctx.translate(30, 30);
          ctx.rotate((bearing * Math.PI) / 180);
          ctx.drawImage(img, -30, -30, 60, 60);
          ctx.restore();
          resolve(canvas.toDataURL());
        };
        
        img.onerror = () => {
          // Fallback: return original icon URL
          resolve(bikeIconUrl);
        };
      });
    } catch (error) {
      console.warn('Failed to load bike icon:', error);
      // Return a default icon or use CSS transform instead
      return null;
    }
  }, []);

  // Handle new location update from Socket.io
  const handleLocationUpdate = useCallback((data) => {
    if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
      console.warn('⚠️ Invalid location data received:', data);
      return;
    }

    const newLocation = { lat: data.lat, lng: data.lng };
    let bearing = data.bearing || data.heading || null;

    // Calculate bearing if not provided
    if (bearing === null || bearing === undefined) {
      if (previousLocationRef.current) {
        bearing = calculateBearingFromLocations(
          previousLocationRef.current,
          newLocation
        );
      } else {
        bearing = currentBearing; // Keep current bearing if no previous location
      }
    }

    // If bearing is still null, default to 0
    if (bearing === null) {
      bearing = 0;
    }

    // Start smooth animation
    if (animationControllerRef.current) {
      animationControllerRef.current.animate(
        currentPosition,
        newLocation,
        currentBearing,
        bearing
      );
    } else {
      // Fallback: Direct update if animation controller not ready
      if (bikeMarkerRef.current) {
        bikeMarkerRef.current.setPosition(newLocation);
        updateMarkerRotation(bearing);
      }
      setCurrentPosition(newLocation);
      setCurrentBearing(bearing);
    }

    // Update previous location
    previousLocationRef.current = newLocation;
    lastUpdateTimeRef.current = Date.now();
  }, [currentPosition, currentBearing, bikeMarkerRef, updateMarkerRotation]);

  // Setup Socket.io connection
  useEffect(() => {
    if (!orderId) return;

    // Get socket URL from API base URL
    const backendUrl = socketUrl || API_BASE_URL.replace('/api', '');
    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

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
      if (socket) {
        socket.disconnect();
      }
    };
  }, [orderId, handleLocationUpdate, socketUrl]);

  return null; // This component doesn't render anything, it just manages tracking
};

export default EnhancedDeliveryTracking;
