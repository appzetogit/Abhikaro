import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL } from '@/lib/api/config';
import { restaurantAPI } from '@/lib/api';
import alertSound from '@/assets/audio/alert.mp3';

/**
 * Hook for restaurant to receive real-time order notifications with sound
 * @returns {object} - { newOrder, playSound, isConnected }
 */
export const useRestaurantNotifications = () => {
  const socketRef = useRef(null);
  const [newOrder, setNewOrder] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const audioRef = useRef(null);
  const userInteractedRef = useRef(false); // Track user interaction for autoplay policy
  const [restaurantId, setRestaurantId] = useState(null);
  const lastConnectErrorLogRef = useRef(0);
  const CONNECT_ERROR_LOG_THROTTLE_MS = 10000;

  // Get restaurant ID from API
  useEffect(() => {
    const fetchRestaurantId = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant();
        if (response.data?.success && response.data.data?.restaurant) {
          const restaurant = response.data.data.restaurant;
          const id = restaurant._id?.toString() || restaurant.restaurantId;
          setRestaurantId(id);
        }
      } catch (error) {
        // Error fetching restaurant
      }
    };
    fetchRestaurantId();
  }, []);

  useEffect(() => {
    if (!restaurantId) {
      return;
    }

    // Normalize backend URL - use simpler, more robust approach
    let backendUrl = API_BASE_URL;
    
    // Step 1: Extract protocol and hostname using URL parsing if possible
    try {
      const urlObj = new URL(backendUrl);
      // Remove /api from pathname
      let pathname = urlObj.pathname.replace(/^\/api\/?$/, '');
      // Reconstruct clean URL
      backendUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ''}${pathname}`;
    } catch (e) {
      // If URL parsing fails, use regex-based normalization
      // Remove /api suffix first
      backendUrl = backendUrl.replace(/\/api\/?$/, '');
      backendUrl = backendUrl.replace(/\/+$/, ''); // Remove trailing slashes
      
      // Normalize protocol - ensure exactly two slashes after protocol
      // Fix patterns: https:/, https:///, https://https://
      if (backendUrl.startsWith('https:') || backendUrl.startsWith('http:')) {
        // Extract protocol
        const protocolMatch = backendUrl.match(/^(https?):/i);
        if (protocolMatch) {
          const protocol = protocolMatch[1].toLowerCase();
          // Remove everything up to and including the first valid domain part
          const afterProtocol = backendUrl.substring(protocol.length + 1);
          // Remove leading slashes
          const cleanPath = afterProtocol.replace(/^\/+/, '');
          // Reconstruct with exactly two slashes
          backendUrl = `${protocol}://${cleanPath}`;
        }
      }
    }
    
    // Final cleanup: ensure exactly two slashes after protocol
    backendUrl = backendUrl.replace(/^(https?):\/+/gi, '$1://');
    backendUrl = backendUrl.replace(/\/+$/, ''); // Remove trailing slashes
    
    // CRITICAL: Check for localhost in production BEFORE creating socket
    // Detect production environment more reliably
    const frontendHostname = window.location.hostname;
    const isLocalhost = frontendHostname === 'localhost' || 
                        frontendHostname === '127.0.0.1' ||
                        frontendHostname === '';
    const isProductionBuild = import.meta.env.MODE === 'production' || import.meta.env.PROD;
    // Production deployment: not localhost AND (HTTPS OR has domain name with dots)
    const isProductionDeployment = !isLocalhost && (
      window.location.protocol === 'https:' || 
      (frontendHostname.includes('.') && !frontendHostname.startsWith('192.168.') && !frontendHostname.startsWith('10.'))
    );
    
    // If backend URL is localhost but we're not running locally, BLOCK connection
    const backendIsLocalhost = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
    // Block if: backend is localhost AND (production build OR production deployment)
    // Allow if: frontend is also localhost (development scenario)
    const shouldBlockConnection = backendIsLocalhost && (isProductionBuild || isProductionDeployment) && !isLocalhost;
    
    if (shouldBlockConnection) {
      // Try to infer backend URL from frontend URL (common pattern: api.domain.com or domain.com/api)
      const frontendHost = window.location.hostname;
      const frontendProtocol = window.location.protocol;
      let suggestedBackendUrl = null;
      
      // Common patterns:
      // - If frontend is on foods.fooddelivery.com, backend might be api.foods.fooddelivery.com or foods.fooddelivery.com
      if (frontendHost.includes('foods.fooddelivery.com')) {
        suggestedBackendUrl = `${frontendProtocol}//api.foods.fooddelivery.com/api`;
      } else if (frontendHost.includes('fooddelivery.com')) {
        suggestedBackendUrl = `${frontendProtocol}//api.${frontendHost}/api`;
      }
      
      // Clean up any existing socket connection
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      // Don't try to connect to localhost in production - it will fail
      setIsConnected(false);
      return; // CRITICAL: Exit early to prevent socket creation
    }
    
    // Validate backend URL format
    if (!backendUrl || !backendUrl.startsWith('http')) {
      setIsConnected(false);
      return; // Don't try to connect with invalid URL
    }
    
    // Construct Socket.IO URL
    const socketUrl = `${backendUrl}/restaurant`;
    
    // Validate socket URL format
    try {
      const urlTest = new URL(socketUrl); // This will throw if URL is invalid
      // Additional validation: ensure it's not localhost in production
      if ((isProductionBuild || isProductionDeployment) && (urlTest.hostname === 'localhost' || urlTest.hostname === '127.0.0.1')) {
        setIsConnected(false);
        return;
      }
    } catch (urlError) {
      setIsConnected(false);
      return; // Don't try to connect with invalid URL
    }
    
    // Initialize socket connection to restaurant namespace
    // Use polling only to avoid repeated "WebSocket connection failed" when backend is down
    socketRef.current = io(socketUrl, {
      path: '/socket.io/',
      transports: ['polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      forceNew: false,
      autoConnect: true,
      auth: {
        token: localStorage.getItem('restaurant_accessToken') || localStorage.getItem('accessToken')
      }
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      
      // Join restaurant room immediately after connection with retry
      if (restaurantId) {
        const joinRoom = () => {
          socketRef.current.emit('join-restaurant', restaurantId);
          
          // Retry join after 2 seconds if no confirmation received
          setTimeout(() => {
            if (socketRef.current?.connected) {
              socketRef.current.emit('join-restaurant', restaurantId);
            }
          }, 2000);
        };
        
        joinRoom();
      }
    });

    // Listen for room join confirmation
    socketRef.current.on('restaurant-room-joined', (data) => {
      // Room joined successfully
    });

    // Listen for connection errors (throttle logs to avoid console spam on reconnect loops)
    socketRef.current.on('connect_error', (error) => {
      const now = Date.now();
      const shouldLog = now - lastConnectErrorLogRef.current >= CONNECT_ERROR_LOG_THROTTLE_MS;
      if (shouldLog) {
        lastConnectErrorLogRef.current = now;
      }
      setIsConnected(false);
    });

    // Listen for disconnection
    socketRef.current.on('disconnect', (reason) => {
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        // Server disconnected the socket, reconnect manually
        socketRef.current.connect();
      }
    });

    // Listen for reconnection attempts
    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      // Reconnection attempt
    });

    // Listen for successful reconnection
    socketRef.current.on('reconnect', (attemptNumber) => {
      setIsConnected(true);
      
      // Rejoin restaurant room after reconnection
      if (restaurantId) {
        socketRef.current.emit('join-restaurant', restaurantId);
      }
    });

    // Listen for new order notifications
    socketRef.current.on('new_order', (orderData) => {
      try {
        // Debug log to inspect payload used by popup
        // Includes hotel/QR flags and payment data if provided by backend
        // eslint-disable-next-line no-console
        console.log('[RestaurantSocket] new_order payload →', {
          orderId: orderData?.orderId,
          orderMongoId: orderData?.orderMongoId,
          paymentMethod: orderData?.paymentMethod,
          paymentStatus: orderData?.paymentStatus,
          orderType: orderData?.orderType,
          hotelReference: orderData?.hotelReference,
          hotelId: orderData?.hotelId,
          hotelName: orderData?.hotelName,
          roomNumber: orderData?.roomNumber,
          qrReferenceId: orderData?.qrReferenceId,
        });
      } catch (_) {}

      setNewOrder(orderData);
      
      // Trigger UI refresh
      window.dispatchEvent(new CustomEvent('new_order_received', { detail: orderData }));

      // Play notification sound
      playNotificationSound();
    });

    // Listen for sound notification event
    socketRef.current.on('play_notification_sound', (data) => {
      playNotificationSound();
    });

    // Listen for order status updates
    socketRef.current.on('order_status_update', (data) => {
      // Always forward status updates to the UI (e.g., cancelled) so popups/sounds can be dismissed in realtime
      try {
        window.dispatchEvent(new CustomEvent('order_status_update', { detail: data }));
      } catch (e) {
        // ignore
      }

      // If an order gets cancelled, ensure any currently playing notification sound is stopped
      try {
        const status = (data?.status || '').toString().toLowerCase();
        if (status === 'cancelled' || status === 'canceled') {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
        }
      } catch (e) {
        // ignore
      }

      // Trigger order refresh event for components to listen
      if (data.deliveryPartnerId) {
        window.dispatchEvent(new CustomEvent('order_assigned', {
          detail: {
            orderId: data.orderId || data.orderMongoId,
            orderMongoId: data.orderMongoId,
            deliveryPartnerId: data.deliveryPartnerId,
            status: data.status
          }
        }));
      }
    });

    // Listen for order assignment (when delivery boy accepts)
    socketRef.current.on('order_assigned', (data) => {
      // Trigger order refresh event for components to listen
      window.dispatchEvent(new CustomEvent('order_assigned', {
        detail: {
          orderId: data.orderId || data.orderMongoId,
          orderMongoId: data.orderMongoId,
          deliveryPartnerId: data.deliveryPartnerId,
          status: data.status
        }
      }));
    });

    // Load notification sound
    audioRef.current = new Audio(alertSound);
    audioRef.current.volume = 0.7;

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [restaurantId]);

  // Track user interaction for autoplay policy
  useEffect(() => {
    const handleUserInteraction = () => {
      userInteractedRef.current = true;
      // Remove listeners after first interaction
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
    
    // Listen for user interaction
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });
    
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, []);

  const playNotificationSound = () => {
    try {
      if (audioRef.current) {
        // Only play if user has interacted with the page (browser autoplay policy)
        if (!userInteractedRef.current) {
          return;
        }
        
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(error => {
          // Don't log autoplay policy errors as they're expected
        });
      }
    } catch (error) {
      // Don't log autoplay policy errors
    }
  };

  const clearNewOrder = () => {
    setNewOrder(null);
  };

  return {
    newOrder,
    clearNewOrder,
    isConnected,
    playNotificationSound
  };
};

