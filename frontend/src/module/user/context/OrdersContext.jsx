import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react"

const OrdersContext = createContext(null)

export function OrdersProvider({ children }) {
  const [orders, setOrders] = useState(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = localStorage.getItem("userOrders")
      const parsed = saved ? JSON.parse(saved) : []
      const arr = Array.isArray(parsed) ? parsed : []

      // Normalize legacy orders so missing dates can't resurrect old tracking banners.
      const normalized = arr.map((o) => {
        const createdAt =
          o?.createdAt ||
          o?.orderDate ||
          o?.created_at ||
          o?.date ||
          "1970-01-01T00:00:00.000Z";
        return { ...o, createdAt };
      });

      // Optional cleanup: drop terminal orders from local tracking cache.
      const terminal = new Set(["delivered", "cancelled", "completed", "restaurant_cancelled"]);
      return normalized.filter((o) => {
        const s1 = String(o?.status || "").trim().toLowerCase();
        const s2 = String(o?.deliveryState?.status || "").trim().toLowerCase();
        return !(terminal.has(s1) || terminal.has(s2));
      });
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem("userOrders", JSON.stringify(orders))
    } catch {
      // ignore storage errors
    }
  }, [orders])

  const createOrder = useCallback((orderData = {}) => {
    const now = new Date().toISOString()

    // Prefer backend IDs when available so tracking links work correctly
    const newOrderId =
      orderData.id ||
      orderData.orderId ||
      (orderData._id && String(orderData._id)) ||
      `ORD-${Date.now()}`

    const defaultTracking = {
      confirmed: { status: true, timestamp: now },
      preparing: { status: false, timestamp: null },
      outForDelivery: { status: false, timestamp: null },
      delivered: { status: false, timestamp: null }
    }

    const newOrder = {
      id: newOrderId,
      ...orderData,
      status: orderData.status || "confirmed",
      createdAt: orderData.createdAt || now,
      tracking: orderData.tracking || defaultTracking
    }

    setOrders((prev) => [newOrder, ...prev])
    return newOrder.id
  }, [])

  const getOrderById = useCallback((orderId) => {
    return orders.find(order => order.id === orderId)
  }, [orders])

  const getAllOrders = useCallback(() => {
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [orders])

  const updateOrderStatus = useCallback((orderId, status) => {
    setOrders((prev) => prev.map(order => {
      if (order.id === orderId) {
        const updatedTracking = { ...order.tracking }
        if (status === "preparing") {
          updatedTracking.preparing = { status: true, timestamp: new Date().toISOString() }
        } else if (status === "outForDelivery") {
          updatedTracking.outForDelivery = { status: true, timestamp: new Date().toISOString() }
        } else if (status === "delivered") {
          updatedTracking.delivered = { status: true, timestamp: new Date().toISOString() }
        }
        return {
          ...order,
          status,
          tracking: updatedTracking
        }
      }
      return order
    }))
  }, [])

  const value = useMemo(() => ({
    orders,
    createOrder,
    getOrderById,
    getAllOrders,
    updateOrderStatus
  }), [orders, createOrder, getOrderById, getAllOrders, updateOrderStatus])

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders() {
  const context = useContext(OrdersContext)
  if (!context) {
    // Fallback to a safe default to avoid crashes if provider is missing
    console.warn("useOrders called outside of OrdersProvider. Returning default no-op implementation.")
    return {
      orders: [],
      createOrder: () => null,
      getOrderById: () => undefined,
      getAllOrders: () => [],
      updateOrderStatus: () => {}
    }
  }
  return context
}

