import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL } from '@/lib/api/config';
import { deliveryAPI } from '@/lib/api';
import alertSound from '@/assets/audio/alert.mp3';
import originalSound from '@/assets/audio/original.mp3';

export const useDeliveryNotifications = () => {
  // CRITICAL: All hooks must be called unconditionally and in the same order every render
  // Order: useRef -> useState -> useEffect -> useCallback
  
  // Step 1: All refs first (unconditional)
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  
  // Step 2: All state hooks (unconditional)
  const [newOrder, setNewOrder] = useState(null);
  const [orderReady, setOrderReady] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [deliveryPartnerId, setDeliveryPartnerId] = useState(null);

  // Step 3: All callbacks/refs before effects (unconditional)
  // Track user interaction for autoplay policy
  const userInteractedRef = useRef(false);
  // Track orders that this delivery partner has explicitly rejected (to avoid re-notifying)
  const rejectedOrderIdsRef = useRef(new Set());
  
  const playNotificationSound = useCallback(() => {
    try {
      // Get current selected sound preference from localStorage
      const selectedSound = localStorage.getItem('delivery_alert_sound') || 'zomato_tone';
      const soundFile = selectedSound === 'original' ? originalSound : alertSound;
      
      // Update audio source if preference changed or initialize if not exists
      if (audioRef.current) {
        const currentSrc = audioRef.current.src;
        const newSrc = soundFile;
        // Check if source needs to be updated
        if (!currentSrc.includes(newSrc.split('/').pop())) {
          audioRef.current.pause();
          audioRef.current.src = newSrc;
          audioRef.current.load();
        }
      } else {
        // Initialize audio if not exists
        audioRef.current = new Audio(soundFile);
        audioRef.current.volume = 0.7;
      }
      
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
  }, []);

  // Step 4: All effects (unconditional hook calls, conditional logic inside)
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
  
  // Initialize audio on mount - use selected preference from localStorage
  useEffect(() => {
    // Get selected alert sound preference from localStorage
    const selectedSound = localStorage.getItem('delivery_alert_sound') || 'zomato_tone';
    const soundFile = selectedSound === 'original' ? originalSound : alertSound;
    
    if (!audioRef.current) {
      audioRef.current = new Audio(soundFile);
      audioRef.current.volume = 0.7;
    } else {
      // Update audio source if preference changed
      const currentSrc = audioRef.current.src;
      const newSrc = soundFile;
      if (!currentSrc.includes(newSrc.split('/').pop())) {
        audioRef.current.pause();
        audioRef.current.src = newSrc;
        audioRef.current.load();
      }
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []); // Note: This runs once on mount. To update dynamically, we'd need to listen to storage events

  // Fetch delivery partner ID
  useEffect(() => {
    const fetchDeliveryPartnerId = async () => {
      try {
        const response = await deliveryAPI.getCurrentDelivery();
        if (response.data?.success && response.data.data) {
          const deliveryPartner = response.data.data.user || response.data.data.deliveryPartner;
          if (deliveryPartner) {
            const id = deliveryPartner.id?.toString() || 
                      deliveryPartner._id?.toString() || 
                      deliveryPartner.deliveryId;
            if (id) {
              setDeliveryPartnerId(id);
            }
          }
        }
      } catch (error) {
        // Error fetching delivery partner
      }
    };
    fetchDeliveryPartnerId();
  }, []);

  // Load rejected order IDs from localStorage once on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('deliveryRejectedOrders');
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          rejectedOrderIdsRef.current = new Set(arr.map(id => id.toString()));
        }
      }
    } catch (e) {
      // Ignore parse errors – we can safely start with an empty set
      rejectedOrderIdsRef.current = new Set();
    }
  }, []);

  // Socket connection effect
  useEffect(() => {
    if (!deliveryPartnerId) {
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
    
    const socketUrl = `${backendUrl}/delivery`;
    
    // Warn if trying to connect to localhost in production
    if (import.meta.env.MODE === 'production' && backendUrl.includes('localhost')) {
      // Don't try to connect to localhost in production - it will fail
      setIsConnected(false);
      return;
    }
    
    // Validate backend URL format
    if (!backendUrl || !backendUrl.startsWith('http')) {
      return; // Don't try to connect with invalid URL
    }
    
    // Validate socket URL format
    try {
      new URL(socketUrl); // This will throw if URL is invalid
    } catch (urlError) {
      return; // Don't try to connect with invalid URL
    }

    socketRef.current = io(socketUrl, {
      path: '/socket.io/',
      transports: ['polling'], // Start with polling only
      upgrade: false, // Disable WebSocket upgrade to prevent WebSocket connection errors
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      forceNew: false,
      autoConnect: true,
      auth: {
        token: localStorage.getItem('delivery_accessToken') || localStorage.getItem('accessToken')
      }
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      
      if (deliveryPartnerId) {
        socketRef.current.emit('join-delivery', deliveryPartnerId);
      }
    });

    socketRef.current.on('delivery-room-joined', (data) => {
      // Delivery room joined successfully
    });

    socketRef.current.on('connect_error', (error) => {
      // Only log if it's not a network/polling/websocket error (backend might be down or WebSocket not available)
      // Socket.IO will automatically retry connection and fall back to polling
      const isTransportError = error.type === 'TransportError' || 
                               error.message === 'xhr poll error' ||
                               error.message?.includes('WebSocket') ||
                               error.message?.includes('websocket') ||
                               error.description === 0; // WebSocket upgrade failures
      
      // Silently handle transport errors - backend might not be running or WebSocket not available
      // Socket.IO will automatically retry with exponential backoff and fall back to polling
      setIsConnected(false);
    });

    socketRef.current.on('disconnect', (reason) => {
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        socketRef.current.connect();
      }
    });

    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      // Reconnection attempt
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      setIsConnected(true);
      
      if (deliveryPartnerId) {
        socketRef.current.emit('join-delivery', deliveryPartnerId);
      }
    });

    socketRef.current.on('new_order', (orderData) => {
      const orderId =
        orderData?.orderId?.toString?.() ||
        orderData?._id?.toString?.() ||
        orderData?.orderMongoId?.toString?.();

      if (orderId && rejectedOrderIdsRef.current.has(orderId)) {
        return;
      }

      setNewOrder(orderData);
      playNotificationSound();
    });

    // Listen for priority-based order notifications (new_order_available)
    socketRef.current.on('new_order_available', (orderData) => {
      const orderId =
        orderData?.orderId?.toString?.() ||
        orderData?._id?.toString?.() ||
        orderData?.orderMongoId?.toString?.();

      if (orderId && rejectedOrderIdsRef.current.has(orderId)) {
        return;
      }

      // Treat it the same as new_order for now - delivery boy can accept it
      setNewOrder(orderData);
      playNotificationSound();
    });

    socketRef.current.on('play_notification_sound', (data) => {
      playNotificationSound();
    });

    socketRef.current.on('order_ready', (orderData) => {
      setOrderReady(orderData);
      playNotificationSound();
    });

    // FIXED: Listen for wallet update events to refresh wallet state immediately
    socketRef.current.on('wallet_updated', (data) => {
      // Dispatch custom event to trigger wallet refresh in all components
      window.dispatchEvent(new CustomEvent('deliveryWalletStateUpdated', { detail: data }));
      // Also trigger storage event for cross-tab sync
      window.dispatchEvent(new Event('storage'));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [deliveryPartnerId, playNotificationSound]);

  // Helper functions
  const clearNewOrder = () => {
    setNewOrder(null);
  };

  // Mark an order as explicitly rejected by this delivery partner (client-side)
  const markOrderRejected = (orderId) => {
    if (!orderId) return;

    const idStr = orderId.toString();
    rejectedOrderIdsRef.current.add(idStr);

    try {
      const arr = Array.from(rejectedOrderIdsRef.current);
      localStorage.setItem('deliveryRejectedOrders', JSON.stringify(arr));
    } catch (e) {
      // Ignore storage errors
    }

    // If the currently visible newOrder matches this order, clear it
    if (
      newOrder &&
      (newOrder.orderId?.toString?.() === idStr ||
        newOrder._id?.toString?.() === idStr ||
        newOrder.orderMongoId?.toString?.() === idStr)
    ) {
      setNewOrder(null);
    }
  };

  const clearOrderReady = () => {
    setOrderReady(null);
  };

  return {
    newOrder,
    clearNewOrder,
    markOrderRejected,
    orderReady,
    clearOrderReady,
    isConnected,
    playNotificationSound
  };
};
