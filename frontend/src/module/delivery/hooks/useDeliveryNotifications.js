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
  // NOTE: Do NOT add new hooks above existing state hooks lightly.
  // HMR can surface "hook order changed" errors. For in-flight fetch dedupe, we store
  // the Map on the existing `socketRef` object (no new hooks required).
  
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

  const normalizeOrderId = useCallback((payload) => {
    return (
      payload?.orderId?.toString?.() ||
      payload?._id?.toString?.() ||
      payload?.orderMongoId?.toString?.() ||
      payload?.mongoId?.toString?.() ||
      null
    );
  }, []);

  const isResendSignal = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.isResend === true) return true;
    const assignedBy =
      payload.assignedBy ||
      payload.assignmentInfo?.assignedBy ||
      payload.fullOrder?.assignmentInfo?.assignedBy ||
      null;
    return assignedBy === 'manual_resend' || assignedBy === 'admin_manual_resend';
  }, []);

  const unmarkOrderRejected = useCallback((orderId) => {
    if (!orderId) return;
    const idStr = orderId.toString();
    rejectedOrderIdsRef.current.delete(idStr);
    try {
      const arr = Array.from(rejectedOrderIdsRef.current);
      localStorage.setItem('deliveryRejectedOrders', JSON.stringify(arr));
    } catch (e) {
      // ignore
    }
  }, []);
  
  const fetchOrderDetailsForPopup = useCallback(async (orderId) => {
    if (!orderId) return null;
    const oid = orderId.toString();

    // Dedup: if already fetching this order, reuse promise
    const inFlightMap =
      socketRef.__inFlightOrderFetchMap ||
      (socketRef.__inFlightOrderFetchMap = new Map());

    const existing = inFlightMap.get(oid);
    if (existing) return existing;

    const p = (async () => {
      try {
        const res = await deliveryAPI.getOrderDetails(oid);
        const payload = res?.data?.data?.order || res?.data?.data || null;
        if (!payload) return null;

        // Normalize API order shape -> socket notification shape used by DeliveryHome mapper
        const restaurant = payload.restaurantId || payload.restaurant || {};
        const restaurantLoc = restaurant.location || payload.restaurantLocation || {};
        const restCoords = restaurantLoc.coordinates;
        const restLat = Array.isArray(restCoords) ? restCoords[1] : restaurantLoc.latitude;
        const restLng = Array.isArray(restCoords) ? restCoords[0] : restaurantLoc.longitude;
        const restaurantAddress =
          restaurantLoc.formattedAddress ||
          restaurantLoc.address ||
          restaurant.address ||
          payload.restaurantAddress ||
          'Restaurant address';

        const customerLoc = payload.address?.location || payload.customerLocation || {};
        const custCoords = customerLoc.coordinates;
        const custLat = Array.isArray(custCoords) ? custCoords[1] : customerLoc.latitude;
        const custLng = Array.isArray(custCoords) ? custCoords[0] : customerLoc.longitude;
        const customerAddress =
          payload.address?.formattedAddress ||
          payload.address?.address ||
          customerLoc.address ||
          'Customer address';

        return {
          orderId: payload.orderId || oid,
          orderMongoId: payload._id?.toString?.() || payload.orderMongoId?.toString?.(),
          restaurantId: payload.restaurantId?._id?.toString?.() || payload.restaurantId,
          restaurantName: payload.restaurantName || restaurant.name || restaurant.restaurantName,
          resendVersion: payload.assignmentInfo?.resendVersion ?? payload.resendVersion ?? 0,
          assignedBy: payload.assignmentInfo?.assignedBy ?? payload.assignedBy ?? null,
          isResend: payload.isResend === true || ['manual_resend', 'admin_manual_resend'].includes(payload.assignmentInfo?.assignedBy),
          restaurantLocation: (restLat != null && restLng != null) ? {
            latitude: restLat,
            longitude: restLng,
            address: restaurantAddress,
            formattedAddress: restaurantAddress
          } : null,
          customerLocation: (custLat != null && custLng != null) ? {
            latitude: custLat,
            longitude: custLng,
            address: customerAddress
          } : null,
          items: Array.isArray(payload.items) ? payload.items : [],
          total: payload.pricing?.total ?? payload.total ?? 0,
          deliveryFee: payload.pricing?.deliveryFee ?? payload.deliveryFee ?? 0,
          customerName: payload.userId?.name || payload.customerName || 'Customer',
          customerPhone: payload.userId?.phone || payload.customerPhone || '',
          status: payload.status,
          createdAt: payload.createdAt,
          estimatedDeliveryTime: payload.estimatedDeliveryTime || 30,
          note: payload.note || '',
          pickupDistance: payload.pickupDistance || 'Calculating...',
          deliveryDistance: payload.deliveryDistance || 'Calculating...',
          estimatedEarnings: payload.estimatedEarnings || null,
          assignmentInfo: payload.assignmentInfo || null,
        };
      } catch (e) {
        return null;
      } finally {
        inFlightMap.delete(oid);
      }
    })();

    inFlightMap.set(oid, p);
    return p;
  }, []);

  const playNotificationSound = useCallback((dedupeKey = null) => {
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
      document.removeEventListener('click', handleUserInteraction, { capture: true });
      document.removeEventListener('touchstart', handleUserInteraction, { capture: true });
      document.removeEventListener('keydown', handleUserInteraction, { capture: true });
    };

    // Capture: controls that call stopPropagation() (e.g. Online toggle) still unlock autoplay.
    const gestureOpts = { once: true, capture: true };
    document.addEventListener('click', handleUserInteraction, gestureOpts);
    document.addEventListener('touchstart', handleUserInteraction, gestureOpts);
    document.addEventListener('keydown', handleUserInteraction, gestureOpts);

    return () => {
      document.removeEventListener('click', handleUserInteraction, { capture: true });
      document.removeEventListener('touchstart', handleUserInteraction, { capture: true });
      document.removeEventListener('keydown', handleUserInteraction, { capture: true });
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
            const id =
              deliveryPartner.id?.toString() ||
              deliveryPartner._id?.toString() ||
              null;

            // Store alternate identifier for socket room join (legacy setups may use deliveryId)
            const altDeliveryId = deliveryPartner.deliveryId?.toString?.() || null;
            socketRef.__altDeliveryId = altDeliveryId;

            // Fallback: if API response doesn't include _id/id (rare), decode JWT to get userId
            let finalId = id;
            if (!finalId) {
              try {
                const token =
                  localStorage.getItem('delivery_accessToken') ||
                  localStorage.getItem('accessToken');
                if (token && token.includes('.')) {
                  const payloadPart = token.split('.')[1];
                  const json = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
                  finalId = (json.userId || json.id || json.sub || null)?.toString?.() || null;
                }
              } catch {
                // ignore decode issues
              }
            }

            // Final fallback: use deliveryId only if we have absolutely nothing else
            if (!finalId && altDeliveryId) {
              finalId = altDeliveryId;
            }
            if (finalId) {
              setDeliveryPartnerId(finalId);
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
        // Also join a legacy room variation if present (some backends/clients used deliveryId)
        const alt = socketRef.__altDeliveryId;
        if (alt && alt !== deliveryPartnerId) {
          socketRef.current.emit('join-delivery', alt);
        }
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
      const orderId = normalizeOrderId(orderData);

      // If it's a resend, allow it even if previously rejected
      if (orderId && isResendSignal(orderData)) {
        unmarkOrderRejected(orderId);
      }

      if (orderId && rejectedOrderIdsRef.current.has(orderId)) {
        return;
      }

      // If payload is minimal (no coords/address), enrich via API before setting
      const hasUsefulPayload =
        !!orderData?.restaurantLocation ||
        !!orderData?.customerLocation ||
        !!orderData?.restaurantLat ||
        !!orderData?.restaurantLng ||
        !!orderData?.restaurantAddress ||
        !!orderData?.deliveryDistance;

      if (orderId && !hasUsefulPayload) {
        (async () => {
          const normalized = await fetchOrderDetailsForPopup(orderId);
          if (!normalized) return;
          const normalizedId =
            normalized?.orderId?.toString?.() ||
            normalized?._id?.toString?.() ||
            normalized?.orderMongoId?.toString?.();
          if (normalizedId && rejectedOrderIdsRef.current.has(normalizedId)) return;
          setNewOrder(normalized);
          // Sound is handled by DeliveryHome popup loop (plays while popup is open).
        })();
      } else {
        setNewOrder(orderData);
        // Sound is handled by DeliveryHome popup loop (plays while popup is open).
      }
    });

    // Listen for priority-based order notifications (new_order_available)
    socketRef.current.on('new_order_available', (orderData) => {
      const orderId = normalizeOrderId(orderData);

      // If it's a resend, allow it even if previously rejected
      if (orderId && isResendSignal(orderData)) {
        unmarkOrderRejected(orderId);
      }

      if (orderId && rejectedOrderIdsRef.current.has(orderId)) {
        return;
      }

      const hasUsefulPayload =
        !!orderData?.restaurantLocation ||
        !!orderData?.customerLocation ||
        !!orderData?.restaurantLat ||
        !!orderData?.restaurantLng ||
        !!orderData?.restaurantAddress ||
        !!orderData?.deliveryDistance;

      if (orderId && !hasUsefulPayload) {
        (async () => {
          const normalized = await fetchOrderDetailsForPopup(orderId);
          if (!normalized) return;
          const normalizedId =
            normalized?.orderId?.toString?.() ||
            normalized?._id?.toString?.() ||
            normalized?.orderMongoId?.toString?.();
          if (normalizedId && rejectedOrderIdsRef.current.has(normalizedId)) return;
          setNewOrder(normalized);
          // Sound is handled by DeliveryHome popup loop (plays while popup is open).
        })();
      } else {
        // Treat it the same as new_order for now - delivery boy can accept it
        setNewOrder(orderData);
        // Sound is handled by DeliveryHome popup loop (plays while popup is open).
      }
    });

    socketRef.current.on('play_notification_sound', (data) => {
      // Admin/manual resend flows sometimes emit only a "play sound" event.
      // If payload includes order info / orderId, treat it as a new order notification
      // so the UI can open the accept popup (DeliveryHome listens to `newOrder`).
      try {
        const orderId = normalizeOrderId(data) || data?.id?.toString?.();
        const type = (data?.type || '').toString();

        // Strict allowlist: sound should only play for delivery "new order" style events
        const allowedTypes = new Set(['new_order', 'new_order_available']);
        if (type && !allowedTypes.has(type)) {
          return;
        }

        // If it's a resend, allow it even if previously rejected
        if (orderId && isResendSignal(data)) {
          unmarkOrderRejected(orderId);
        }

        if (orderId && rejectedOrderIdsRef.current.has(orderId)) {
          // Do not re-notify for rejected orders
          return;
        }

        // IMPORTANT:
        // Some resend flows emit ONLY this event (no `new_order` / `new_order_available`).
        // DeliveryHome plays looping audio only when its popup opens, which depends on `newOrder`
        // changing. If we dedupe same-order state, resend becomes silent.
        // So we (a) force a state bump and (b) trigger a one-shot sound attempt here.
        const eventTs = Date.now();
        // eslint-disable-next-line no-console
        console.log('[DeliverySocket] play_notification_sound → ring', { orderId, type, isResend: isResendSignal(data) });
        playNotificationSound(`${orderId || 'order'}:${eventTs}`);

        // If backend sends order details here, use them; otherwise fetch details by orderId
        if (orderId) {
          const hasUsefulPayload =
            !!data?.restaurantLocation ||
            !!data?.customerLocation ||
            !!data?.restaurantName ||
            !!data?.items;

          if (hasUsefulPayload && typeof data === 'object') {
            // Force update even if orderId matches (resend needs to re-open popup + audio)
            setNewOrder({ ...data, _clientEventTs: eventTs });
          } else {
            // Fetch order details and set a normalized payload so popup always has data.
            (async () => {
              const normalized = await fetchOrderDetailsForPopup(orderId);
              if (!normalized) return;
              const normalizedId =
                normalized?.orderId?.toString?.() ||
                normalized?._id?.toString?.() ||
                normalized?.orderMongoId?.toString?.();
              // If this is a resend, clear local rejection so popup can show again.
              if (normalizedId && isResendSignal(normalized)) {
                unmarkOrderRejected(normalizedId);
              }
              if (normalizedId && rejectedOrderIdsRef.current.has(normalizedId)) return;
              // Force update even if orderId matches (resend needs to re-open popup + audio)
              setNewOrder({ ...normalized, _clientEventTs: eventTs });
            })();
          }
        }
      } catch (e) {
        // ignore
      }
    });

    socketRef.current.on('order_ready', (orderData) => {
      setOrderReady(orderData);
      // Intentionally do NOT play sound for "order_ready".
      // Keep push notification / UI state updates only.
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
  }, [deliveryPartnerId, fetchOrderDetailsForPopup, playNotificationSound]);

  // Helper functions
  const clearNewOrder = () => {
    setNewOrder(null);
  };

  // Stop/pause any currently playing notification sound
  const stopNotificationSound = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch (e) {
      // Silently ignore audio stop errors
    }
  }, []);

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
    playNotificationSound,
    stopNotificationSound
  };
};
