import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UtensilsCrossed, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrdersContext';
import { orderAPI } from '@/lib/api';

export default function OrderTrackingCard() {
  const navigate = useNavigate();
  const { orders: contextOrders } = useOrders();
  const [activeOrder, setActiveOrder] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [apiOrders, setApiOrders] = useState([]);
  const [apiCalled, setApiCalled] = useState(false); // Track if API has been called

  // Fetch orders from API (optional - only if endpoint exists)
  // For now, we'll rely primarily on localStorage orders from OrdersContext
  useEffect(() => {
    // Only try API if user is authenticated
    const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken');
    if (!userToken) {
      // No token, skip API call - use context orders
      setApiCalled(true); // Mark as called so we know to use context orders
      return;
    }

    const fetchOrders = async () => {
      try {
        const response = await orderAPI.getOrders({ limit: 10, page: 1 });
        let orders = [];
        
        if (response?.data?.success && response?.data?.data?.orders) {
          orders = response.data.data.orders;
        } else if (response?.data?.orders) {
          orders = response.data.orders;
        } else if (response?.data?.data && Array.isArray(response.data.data)) {
          orders = response.data.data;
        }
        
        // IMPORTANT: Set orders even if empty array - this means database has no orders
        setApiOrders(orders);
        setApiCalled(true);
        
        console.log('📡 OrderTrackingCard - API orders fetched:', {
          count: orders.length,
          orders: orders.map(o => ({ id: o.id || o._id || o.orderId, status: o.status }))
        });
      } catch (error) {
        // API call failed - fall back to context orders
        console.warn('OrderTrackingCard: API call failed, will use context orders:', error?.response?.status || error?.message);
        setApiOrders([]);
        setApiCalled(true); // Still mark as called so we know API failed
      }
    };

    // Try once on mount, but don't retry if it fails
    fetchOrders();
  }, []);

  // Get active order (not delivered)
  useEffect(() => {
    // IMPORTANT: Merge both API orders and context orders to ensure we catch newly placed orders
    // Context orders might have just-placed orders that haven't synced to API yet
    // API orders have the latest status from backend
    const mergedOrders = [...apiOrders];
    
    // Add context orders that aren't already in apiOrders (by ID)
    contextOrders.forEach(contextOrder => {
      const contextOrderId = contextOrder.id || contextOrder._id || contextOrder.orderId;
      const existsInApi = mergedOrders.some(apiOrder => 
        (apiOrder.id || apiOrder._id || apiOrder.orderId) === contextOrderId
      );
      
      if (!existsInApi) {
        // This is a new order from context that hasn't been synced to API yet
        mergedOrders.push(contextOrder);
        console.log('➕ Added context order to merged list:', contextOrderId);
      }
    });
    
    const sourceOrders = mergedOrders;
    
    console.log('📊 OrderTrackingCard - Merged orders:', {
      apiOrdersCount: apiOrders.length,
      contextOrdersCount: contextOrders.length,
      mergedCount: sourceOrders.length
    });

    // Remove duplicates by ID (safety)
    const uniqueOrders = sourceOrders.filter((order, index, self) =>
      index === self.findIndex((o) => (o.id || o._id || o.orderId) === (order.id || order._id || order.orderId))
    );

    console.log('🔍 OrderTrackingCard - Checking for active orders:', {
      contextOrdersCount: contextOrders.length,
      apiOrdersCount: apiOrders.length,
      uniqueOrdersCount: uniqueOrders.length,
      orders: uniqueOrders.map(o => ({
        id: o.id || o._id || o.orderId,
        status: o.status || o.deliveryState?.status,
        restaurant: o.restaurant || o.restaurantName
      }))
    });

    // Find active order - any order that is NOT delivered, cancelled, or completed
    const active = uniqueOrders.find(order => {
      const status = (order.status || order.deliveryState?.status || '').toLowerCase();
      const isInactive = status === 'delivered' ||
        status === 'cancelled' ||
        status === 'completed' ||
        status === 'restaurant_cancelled' ||
        status === '';

      if (isInactive) {
        return false;
      }

      // If status exists and is not inactive, it's active
      return true;
    });

    console.log('✅ OrderTrackingCard - Active order found:', active ? {
      id: active.id || active._id,
      status: active.status || active.deliveryState?.status,
      restaurant: active.restaurant || active.restaurantName
    } : 'No active order');

    if (active) {
      // Calculate remaining time based on elapsed time
      const orderTime = new Date(active.createdAt || active.orderDate || active.created_at || active.date || Date.now());
      const now = new Date();
      const elapsedMinutes = Math.floor((now - orderTime) / (1000 * 60));
      
      // Get max ETA (use eta.max if available, otherwise estimatedDeliveryTime)
      const maxETA = active.eta?.max || active.estimatedDeliveryTime || active.estimatedTime || active.estimated_delivery_time || 30;
      const estimatedMinutes = typeof maxETA === 'number' ? maxETA : parseInt(String(maxETA).match(/\d+/)?.[0] || '30', 10);
      
      // Calculate remaining time
      let remainingMinutes = estimatedMinutes - elapsedMinutes;
      
      // If remaining time is 0 or negative, but order is still active (not delivered), 
      // show at least 1 minute or use estimated time as fallback
      if (remainingMinutes <= 0) {
        // If order is still preparing/confirmed/out_for_delivery, show estimated time
        const orderStatus = (active.status || active.deliveryState?.status || '').toLowerCase();
        if (orderStatus !== 'delivered' && orderStatus !== 'completed' && orderStatus !== 'cancelled') {
          // Order is still active but time calculation shows 0 - use estimated time as fallback
          remainingMinutes = estimatedMinutes;
          console.log('⚠️ OrderTrackingCard - Time calculation resulted in 0 or negative, using estimated time as fallback:', estimatedMinutes);
        }
      }
      
      // Ensure minimum of 1 minute if order is still active
      if (remainingMinutes <= 0) {
        remainingMinutes = 1;
      }
      
      console.log('⏰ OrderTrackingCard - Time calculation:', {
        orderTime: orderTime.toISOString(),
        now: now.toISOString(),
        elapsedMinutes,
        estimatedMinutes,
        remainingMinutes,
        status: active.status || active.deliveryState?.status,
        hasEta: !!active.eta,
        etaMax: active.eta?.max,
        estimatedDeliveryTime: active.estimatedDeliveryTime
      });
      
      // Show card if order is active (not delivered/cancelled)
      const orderStatus = (active.status || active.deliveryState?.status || '').toLowerCase();
      if (orderStatus !== 'delivered' && orderStatus !== 'completed' && orderStatus !== 'cancelled' && orderStatus !== 'restaurant_cancelled') {
        setActiveOrder(active);
        setTimeRemaining(remainingMinutes);
        console.log('✅ OrderTrackingCard - Setting active order with time:', remainingMinutes, 'minutes');
      } else {
        // Order is delivered/cancelled - hide card
        console.log('❌ OrderTrackingCard - Order is delivered/cancelled, hiding card');
        setActiveOrder(null);
        setTimeRemaining(null);
      }
    } else {
      setActiveOrder(null);
      setTimeRemaining(null);
    }
  }, [contextOrders, apiOrders, apiCalled]);

  // Countdown timer
  useEffect(() => {
    if (!activeOrder || timeRemaining === null) return;

    // Update more frequently when time is running out (every second if <= 1 minute, otherwise every minute)
    const updateInterval = timeRemaining <= 1 ? 1000 : 60000;

    const interval = setInterval(() => {
      // Merge both API and context orders (same logic as above)
      const mergedOrders = [...apiOrders];
      contextOrders.forEach(contextOrder => {
        const contextOrderId = contextOrder.id || contextOrder._id || contextOrder.orderId;
        const existsInApi = mergedOrders.some(apiOrder => 
          (apiOrder.id || apiOrder._id || apiOrder.orderId) === contextOrderId
        );
        if (!existsInApi) {
          mergedOrders.push(contextOrder);
        }
      });
      const allOrders = mergedOrders;
      const currentActive = allOrders.find(order => {
        const orderId = order.id || order._id;
        const activeOrderId = activeOrder.id || activeOrder._id;
        return orderId === activeOrderId;
      });

      if (!currentActive) {
        setActiveOrder(null);
        setTimeRemaining(null);
        return;
      }

      const status = (currentActive.status || currentActive.deliveryState?.status || '').toLowerCase();
      if (status === 'delivered' || status === 'cancelled' || status === 'completed' || status === 'restaurant_cancelled') {
        setActiveOrder(null);
        setTimeRemaining(null);
        return;
      }

      // Calculate remaining time based on elapsed time
      const orderTime = new Date(currentActive.createdAt || currentActive.orderDate || currentActive.created_at || Date.now());
      const now = new Date();
      const elapsedMinutes = Math.floor((now - orderTime) / (1000 * 60));
      
      // Get max ETA (use eta.max if available, otherwise estimatedDeliveryTime)
      const maxETA = currentActive.eta?.max || currentActive.estimatedDeliveryTime || currentActive.estimatedTime || currentActive.estimated_delivery_time || 30;
      const estimatedMinutes = typeof maxETA === 'number' ? maxETA : parseInt(String(maxETA).match(/\d+/)?.[0] || '30', 10);
      
      // Calculate remaining time
      let remaining = estimatedMinutes - elapsedMinutes;
      
      // If remaining is 0 or negative but order is still active, use estimated time as fallback
      if (remaining <= 0) {
        const orderStatus = (currentActive.status || currentActive.deliveryState?.status || '').toLowerCase();
        if (orderStatus !== 'delivered' && orderStatus !== 'completed' && orderStatus !== 'cancelled') {
          remaining = estimatedMinutes; // Use full estimated time as fallback
        }
      }
      
      // Ensure minimum of 1 minute if order is still active
      if (remaining <= 0) {
        remaining = 1;
      }
      
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        setActiveOrder(null);
        setTimeRemaining(null);
      }
    }, updateInterval);

    return () => clearInterval(interval);
  }, [activeOrder, timeRemaining, contextOrders, apiOrders, apiCalled]);

  // Listen for order updates (localStorage or custom events) and refresh API orders
  useEffect(() => {
    const handleStorageChange = async () => {
      console.log('🔄 OrderTrackingCard - orderStatusUpdated event received, refreshing...');
      
      try {
        const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
        if (!userToken) {
          console.log('⚠️ No token, will use context orders');
          // Even without token, context orders should be checked
          return
        }

        const response = await orderAPI.getOrders({ limit: 10, page: 1 })
        let orders = [];
        
        if (response?.data?.success && response?.data?.data?.orders) {
          orders = response.data.data.orders;
        } else if (response?.data?.orders) {
          orders = response.data.orders;
        } else if (response?.data?.data && Array.isArray(response.data.data)) {
          orders = response.data.data;
        }
        
        // Set orders even if empty (means database has no orders)
        setApiOrders(orders);
        setApiCalled(true);
        
        console.log('✅ OrderTrackingCard - API orders refreshed after event:', orders.length);
      } catch (error) {
        // Silently fail - just log for debugging
        console.warn('OrderTrackingCard: Failed to refresh orders after storage/event change:', error?.response?.status || error?.message)
        // Even if API fails, context orders should still work
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('orderStatusUpdated', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('orderStatusUpdated', handleStorageChange)
    }
  }, [])

  // Debug: Log when component renders
  useEffect(() => {
    console.log('🎯 OrderTrackingCard render:', {
      hasActiveOrder: !!activeOrder,
      timeRemaining,
      contextOrdersCount: contextOrders.length,
      apiOrdersCount: apiOrders.length
    });
  }, [activeOrder, timeRemaining, contextOrders.length, apiOrders.length]);

  if (!activeOrder) {
    // console.log('OrderTrackingCard - No active order, not rendering');
    return null;
  }

  // Check if order is delivered or time remaining is 0 or negative - hide card
  const orderStatus = (activeOrder.status || activeOrder.deliveryState?.status || 'preparing').toLowerCase();
  if (orderStatus === 'delivered' || orderStatus === 'completed' || orderStatus === 'cancelled' || orderStatus === 'restaurant_cancelled' || timeRemaining === null || timeRemaining <= 0) {
    console.log('❌ OrderTrackingCard - Order delivered/cancelled or time is 0, hiding card', {
      status: orderStatus,
      timeRemaining
    });
    return null;
  }

  const restaurantName = activeOrder.restaurant || activeOrder.restaurantName || activeOrder.restaurantName || 'Restaurant';
  
  // Show correct status text based on order status
  let statusText = 'Preparing your order';
  if (orderStatus === 'out_for_delivery' || orderStatus === 'outfordelivery' || orderStatus === 'on_way' || orderStatus === 'out for delivery') {
    statusText = 'On the way';
  } else if (orderStatus === 'ready') {
    statusText = 'Ready for pickup';
  } else if (orderStatus === 'preparing' || orderStatus === 'confirmed' || orderStatus === 'pending') {
    statusText = 'Preparing your order';
  }

  console.log('✅ OrderTrackingCard - Rendering card:', {
    restaurantName,
    orderStatus,
    statusText,
    timeRemaining
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed bottom-20 left-4 right-4 z-[60] md:hidden"
        onClick={() => navigate(`/user/orders/${activeOrder.id || activeOrder._id}`)}
      >
        <div className="bg-gray-800 rounded-xl p-4 shadow-2xl border border-gray-700">
          <div className="flex items-center gap-3">
            {/* Left Side - Icon and Text */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                <UtensilsCrossed className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{restaurantName}</p>
                <div className="flex items-center gap-1">
                  <p className="text-gray-300 text-xs truncate">{statusText}</p>
                  <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </div>
            </div>

            {/* Right Side - Time Pill */}
            <div className="bg-green-600 rounded-lg px-3 py-2 flex-shrink-0">
              <p className="text-white text-[10px] font-medium uppercase leading-tight">arriving in</p>
              <p className="text-white text-sm font-bold leading-tight">
                {timeRemaining !== null ? `${timeRemaining} mins` : '-- mins'}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

