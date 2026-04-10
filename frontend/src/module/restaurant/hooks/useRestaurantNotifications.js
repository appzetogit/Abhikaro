import { useCallback, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL } from '@/lib/api/config';
import { restaurantAPI } from '@/lib/api';
import alertSound from '@/assets/audio/alert.mp3';

/**
 * Hook for restaurant to receive real-time order notifications with sound
 * @returns {object} - { newOrder, playSound, isConnected }
 */
export const useRestaurantNotifications = () => {
  // Read persisted unlock flag once, synchronously, to avoid a race where the first socket event
  // arrives before our effects run (causing first order sound to be missed).
  const initialUnlocked = (() => {
    try {
      return localStorage.getItem('restaurant_sound_unlocked') === '1';
    } catch {
      return false;
    }
  })();

  const socketRef = useRef(null);
  const [newOrder, setNewOrder] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const audioRef = useRef(null);
  const userInteractedRef = useRef(initialUnlocked); // Track user interaction for autoplay policy
  // Ring loop (repeat sound for up to 5 minutes, stop on accept/reject/cancel/close)
  const ringIntervalRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const ringingOrderIdRef = useRef(null);
  const ringEndedHandlerRef = useRef(null);
  const ringPauseHandlerRef = useRef(null);
  const ringActiveUntilMsRef = useRef(null);
  const [isSoundUnlocked, setIsSoundUnlocked] = useState(initialUnlocked);
  const [restaurantId, setRestaurantId] = useState(null);
  const lastConnectErrorLogRef = useRef(0);
  const CONNECT_ERROR_LOG_THROTTLE_MS = 10000;
  // Dedupe sound so it never plays twice for the same order/event burst
  const lastSoundRef = useRef({ orderId: null, ts: 0 });
  // If an order arrives before audio is unlocked, remember it and ring right after unlock.
  const pendingRingPayloadRef = useRef(null);

  const playNotificationSound = (payload) => {
    try {
      // Lazy init: if the first event arrives before Audio is created, create it now.
      if (!audioRef.current) {
        try {
          audioRef.current = new Audio(alertSound);
          audioRef.current.volume = 0.7;
          audioRef.current.preload = 'auto';
          audioRef.current.load?.();
        } catch (_) {
          // ignore
        }
      }

      if (audioRef.current) {
        // Only play if user has interacted with the page (browser autoplay policy)
        if (!userInteractedRef.current) {
          return;
        }

        // Dedupe: if we just played for this order within a short window, skip
        const now = Date.now();
        const orderId =
          payload?.orderId?.toString?.() ||
          payload?.orderMongoId?.toString?.() ||
          payload?._id?.toString?.() ||
          null;
        if (
          orderId &&
          lastSoundRef.current.orderId === orderId &&
          now - lastSoundRef.current.ts < 1500
        ) {
          return;
        }
        if (orderId) {
          lastSoundRef.current = { orderId, ts: now };
        }

        audioRef.current.currentTime = 0;
        // Ensure audio is loaded before play to reduce first-play delay on some devices
        try {
          audioRef.current.load?.();
        } catch (_) {}
        audioRef.current.play().catch(() => {
          // Don't log autoplay policy errors as they're expected
        });
      }
    } catch (error) {
      // Don't log autoplay policy errors
    }
  };

  const stopNotificationSound = useCallback(() => {
    try {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
      if (ringTimeoutRef.current) {
        clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = null;
      }
      // Remove any ended listener used for loop fallback
      try {
        if (audioRef.current && ringEndedHandlerRef.current) {
          audioRef.current.removeEventListener('ended', ringEndedHandlerRef.current);
        }
      } catch {
        // ignore
      }
      ringEndedHandlerRef.current = null;
      ringPauseHandlerRef.current = null;
      ringingOrderIdRef.current = null;
      ringActiveUntilMsRef.current = null;
    } catch {
      // ignore
    }

    try {
      if (audioRef.current) {
        // Ensure loop is disabled after we stop ringing
        try {
          audioRef.current.loop = false;
        } catch {
          // ignore
        }
        // Remove listeners used for resilience while ringing
        try {
          if (ringEndedHandlerRef.current) {
            audioRef.current.removeEventListener('ended', ringEndedHandlerRef.current);
          }
          if (ringPauseHandlerRef.current) {
            audioRef.current.removeEventListener('pause', ringPauseHandlerRef.current);
          }
        } catch {
          // ignore
        }
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch (_) {
      // ignore
    }
  }, []);

  const startRingingForOrder = useCallback(
    (payload, { durationMs = 5 * 60 * 1000 } = {}) => {
      // Only ring if user has unlocked audio (autoplay policy)
      if (!userInteractedRef.current) {
        pendingRingPayloadRef.current = payload || null;
        return;
      }

      const orderId =
        payload?.orderId?.toString?.() ||
        payload?.orderMongoId?.toString?.() ||
        payload?._id?.toString?.() ||
        null;

      // If already ringing for this order, don't restart timers.
      if (orderId && ringingOrderIdRef.current === orderId) return;

      // Stop any previous ringing (different order or stale timers)
      stopNotificationSound();

      ringingOrderIdRef.current = orderId || 'unknown';
      ringActiveUntilMsRef.current = Date.now() + durationMs;

      // Ensure audio instance exists
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio(alertSound);
          audioRef.current.volume = 0.7;
          audioRef.current.preload = 'auto';
          audioRef.current.load?.();
        }
      } catch {
        // ignore
      }

      // Prefer native looping: restarts exactly when the MP3 ends (e.g., 28s)
      if (audioRef.current) {
        try {
          audioRef.current.loop = true;
        } catch {
          // ignore
        }

        // Fallback: if loop doesn't work in a WebView, re-play on 'ended'
        try {
          if (ringEndedHandlerRef.current) {
            audioRef.current.removeEventListener('ended', ringEndedHandlerRef.current);
          }
          ringEndedHandlerRef.current = () => {
            try {
              if (!userInteractedRef.current) return;
              if (!ringingOrderIdRef.current) return;
              if (ringActiveUntilMsRef.current && Date.now() > ringActiveUntilMsRef.current) return;
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            } catch {
              // ignore
            }
          };
          audioRef.current.addEventListener('ended', ringEndedHandlerRef.current);
        } catch {
          // ignore
        }

        // Resilience: some WebViews pause looping audio after a while. If we're still in the ring window,
        // and audio pauses unexpectedly, try to resume.
        try {
          if (ringPauseHandlerRef.current) {
            audioRef.current.removeEventListener('pause', ringPauseHandlerRef.current);
          }
          ringPauseHandlerRef.current = () => {
            try {
              if (!userInteractedRef.current) return;
              if (!ringingOrderIdRef.current) return;
              if (ringActiveUntilMsRef.current && Date.now() > ringActiveUntilMsRef.current) return;
              // If the popup is still active, keep ringing
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            } catch {
              // ignore
            }
          };
          audioRef.current.addEventListener('pause', ringPauseHandlerRef.current);
        } catch {
          // ignore
        }

        // Start play (will loop)
        try {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        } catch {
          // ignore
        }
      } else {
        // As a last resort, do a one-shot play (no loop)
        playNotificationSound(payload);
      }

      ringTimeoutRef.current = setTimeout(() => {
        stopNotificationSound();
      }, durationMs);
    },
    [stopNotificationSound],
  );

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
    // Prefer websocket (more reliable through proxies/LB); fall back to polling when needed.
    socketRef.current = io(socketUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
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

    // Initialize + preload notification sound ASAP so the first socket event can play instantly
    // (If `new_order` arrives before we create Audio, the first sound can be missed.)
    if (!audioRef.current) {
      try {
        audioRef.current = new Audio(alertSound);
        audioRef.current.volume = 0.7;
        audioRef.current.preload = 'auto';
        // Fire-and-forget preload
        audioRef.current.load?.();
      } catch (_) {
        // ignore
      }
    }

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
      // If audio isn't unlocked yet, this will be queued and auto-start after first user interaction.
      startRingingForOrder(orderData, { durationMs: 5 * 60 * 1000 });
    });

    // IMPORTANT:
    // Backend also emits a generic 'play_notification_sound' alongside 'new_order'.
    // If we listen to it here, sound will double-play. For restaurant, 'new_order' is the
    // single source of truth for when sound is allowed to play.

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
          stopNotificationSound();
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

    // Audio is initialized above; keep this section for backward compatibility if init failed.
    if (!audioRef.current) {
      try {
        audioRef.current = new Audio(alertSound);
        audioRef.current.volume = 0.7;
        audioRef.current.preload = 'auto';
        audioRef.current.load?.();
      } catch (_) {
        // ignore
      }
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      stopNotificationSound();
      audioRef.current = null;
    };
  }, [restaurantId, startRingingForOrder, stopNotificationSound]);

  const unlockSound = useCallback(async () => {
    // Explicitly unlock sound via a user gesture (button click/tap)
    userInteractedRef.current = true;
    try {
      localStorage.setItem('restaurant_sound_unlocked', '1');
    } catch {
      // ignore
    }
    setIsSoundUnlocked(true);

    // Initialize Audio if needed and attempt a best-effort unlock play (can be silent/low volume)
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(alertSound);
        audioRef.current.preload = 'auto';
      }
      if (audioRef.current) {
        const prevVolume = audioRef.current.volume ?? 0.7;
        // Keep it near-silent to avoid surprising the user
        audioRef.current.volume = 0.01;
        audioRef.current.currentTime = 0;
        await audioRef.current.play().catch(() => {});
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch {
          // ignore
        }
        audioRef.current.volume = prevVolume;
      }
    } catch {
      // ignore unlock errors
    }

    return true;
  }, []);

  // Track user interaction for autoplay policy
  useEffect(() => {
    const handleUserInteraction = () => {
      userInteractedRef.current = true;
      try {
        localStorage.setItem('restaurant_sound_unlocked', '1');
      } catch {
        // ignore
      }
      setIsSoundUnlocked(true);

      // Best-effort: actually "prime" the audio element on first gesture so later plays are allowed.
      // Some browsers/WebViews require a real play() call within the gesture handler.
      try {
        unlockSound?.();
      } catch {
        // ignore
      }

      // If an order arrived while locked, start ringing immediately after unlock.
      try {
        const pending = pendingRingPayloadRef.current;
        if (pending) {
          pendingRingPayloadRef.current = null;
          startRingingForOrder(pending, { durationMs: 5 * 60 * 1000 });
        }
      } catch {
        // ignore
      }

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
  }, [startRingingForOrder, unlockSound]);

  // (playNotificationSound / stopNotificationSound / startRingingForOrder are defined above)

  // Flutter bridge: allow wrapper to call into web to unlock audio on first gesture.
  useEffect(() => {
    try {
      window.__ABHIKARO_UNLOCK_SOUND__ = unlockSound;
      return () => {
        // Only delete if we set it
        if (window.__ABHIKARO_UNLOCK_SOUND__ === unlockSound) {
          delete window.__ABHIKARO_UNLOCK_SOUND__;
        }
      };
    } catch {
      return undefined;
    }
  }, [unlockSound]);

  // If we already persisted "unlocked", honor it (still best-effort; some WebViews need a gesture anyway).
  useEffect(() => {
    if (isSoundUnlocked) {
      userInteractedRef.current = true;
    }
  }, [isSoundUnlocked]);

  const clearNewOrder = () => {
    setNewOrder(null);
  };

  return {
    newOrder,
    clearNewOrder,
    isConnected,
    playNotificationSound,
    stopNotificationSound,
    isSoundUnlocked,
    unlockSound,
    startRingingForOrder
  };
};

