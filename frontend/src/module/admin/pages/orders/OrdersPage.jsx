import { useMemo, useState, useEffect } from "react"
import { FileText, Calendar, Package } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import OrdersTopbar from "../../components/orders/OrdersTopbar"
import OrdersTable from "../../components/orders/OrdersTable"
import FilterPanel from "../../components/orders/FilterPanel"
import ViewOrderDialog from "../../components/orders/ViewOrderDialog"
import SettingsDialog from "../../components/orders/SettingsDialog"
import RefundModal from "../../components/orders/RefundModal"
import { useOrdersManagement } from "../../components/orders/useOrdersManagement"
import { getOrdersCache, setOrdersCache, clearOrdersCache } from "../../utils/ordersCache"

// Skeleton for cold loading
function OrdersPageSkeleton({ title = "Orders" }) {
  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden animate-pulse">
      {/* Topbar Skeleton */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-44 bg-slate-200 rounded-lg"></div>
          <div className="h-6 w-12 bg-slate-200 rounded-full"></div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="h-10 w-full sm:w-64 bg-slate-200 rounded-lg"></div>
          <div className="h-10 w-24 bg-slate-200 rounded-lg"></div>
          <div className="h-10 w-24 bg-slate-200 rounded-lg"></div>
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="h-4 w-32 bg-slate-200 rounded"></div>
          <div className="h-4 w-20 bg-slate-200 rounded"></div>
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="h-4 w-8 bg-slate-100 rounded"></div>
              <div className="h-4 w-36 bg-slate-100 rounded"></div>
              <div className="h-4 w-28 bg-slate-100 rounded"></div>
              <div className="h-4 w-32 bg-slate-100 rounded"></div>
              <div className="h-4 w-40 bg-slate-100 rounded"></div>
              <div className="h-4 w-24 bg-slate-100 rounded"></div>
              <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
              <div className="h-4 w-16 bg-slate-100 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Status configuration with titles, colors, and icons
const statusConfig = {
  "all": { title: "All Orders", color: "emerald", icon: FileText },
  "scheduled": { title: "Scheduled Orders", color: "blue", icon: Calendar },
  "pending": { title: "Pending Orders", color: "amber", icon: Package },
  "accepted": { title: "Accepted Orders", color: "green", icon: Package },
  "processing": { title: "Processing Orders", color: "orange", icon: Package },
  "food-on-the-way": { title: "Food On The Way Orders", color: "amber", icon: Package },
  "delivered": { title: "Delivered Orders", color: "emerald", icon: Package },
  "canceled": { title: "Canceled Orders", color: "rose", icon: Package },
  "restaurant-cancelled": { title: "Restaurant Cancelled Orders", color: "red", icon: Package },
  "payment-failed": { title: "Payment Failed Orders", color: "red", icon: Package },
  "refunded": { title: "Refunded Orders", color: "sky", icon: Package },
  "offline-payments": { title: "Offline Payments", color: "slate", icon: Package },
}

export default function OrdersPage({ statusKey = "all" }) {
  const config = statusConfig[statusKey] || statusConfig["all"]
  const cacheKey = `admin_orders_${statusKey}`

  // Instant SWR: check direct cache or derive from admin_orders_all (0ms)
  const resolveInitialOrders = () => {
    const directCache = getOrdersCache(cacheKey)
    if (Array.isArray(directCache) && directCache.length > 0) {
      return directCache
    }
    const allCache = getOrdersCache("admin_orders_all")
    if (Array.isArray(allCache) && allCache.length > 0) {
      if (statusKey === "all") return allCache
      const filtered = allCache.filter(o => {
        const s = (o.status || o.orderStatus || "").toLowerCase()
        if (statusKey === "pending") return s === "pending"
        if (statusKey === "accepted") return s === "confirmed" || s === "accepted"
        if (statusKey === "processing") return s === "preparing" || s === "processing"
        if (statusKey === "food-on-the-way") return s === "out_for_delivery" || s.includes("way")
        if (statusKey === "delivered") return s === "delivered"
        if (statusKey === "canceled") return s === "cancelled" || s === "canceled"
        if (statusKey === "restaurant-cancelled") return o.cancelledBy === "restaurant" || (o.cancellationReason && /restaurant/i.test(o.cancellationReason))
        if (statusKey === "scheduled") return s === "scheduled"
        if (statusKey === "payment-failed") return s === "pending" && (o.paymentStatus === "Failed" || o.payment?.status === "failed")
        if (statusKey === "refunded") return Boolean(o.refundStatus)
        if (statusKey === "offline-payments") return o.paymentType === "Cash on Delivery" || o.payment?.method === "cash" || o.payment?.method === "cod"
        return false
      })
      if (filtered.length > 0) return filtered
    }
    return []
  }

  const initialOrders = resolveInitialOrders()
  const [orders, setOrders] = useState(initialOrders)
  const [totalCount, setTotalCount] = useState(() => initialOrders.length)
  const [isLoading, setIsLoading] = useState(() => initialOrders.length === 0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedOrderIds, setSelectedOrderIds] = useState([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [processingRefund, setProcessingRefund] = useState(null)
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [selectedOrderForRefund, setSelectedOrderForRefund] = useState(null)
  
  // Fetch orders from backend API
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const fetchOrders = async (isSilent = false) => {
    try {
      if (!isSilent) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      const params = {
        page: 1,
        limit: 10000,
        status: statusKey === "all" ? undefined : 
               statusKey === "restaurant-cancelled" ? "cancelled" : statusKey,
        cancelledBy: statusKey === "restaurant-cancelled" ? "restaurant" : undefined
      }
      
      const response = await adminAPI.getOrders(params)
      
      if (response.data?.success && response.data?.data?.orders) {
        const fetchedOrders = response.data.data.orders
        setOrders(fetchedOrders)
        const serverTotal = response.data.data.pagination?.total
        setTotalCount(typeof serverTotal === "number" ? serverTotal : fetchedOrders.length)
        setOrdersCache(cacheKey, fetchedOrders)
      } else {
        if (!isSilent) {
          console.error("Failed to fetch orders:", response.data)
          toast.error("Failed to fetch orders")
          setOrders([])
        }
      }
    } catch (error) {
      console.error("Error fetching orders:", error)
      if (!isSilent) {
        toast.error(error.response?.data?.message || "Failed to fetch orders")
        setOrders([])
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    const currentCached = resolveInitialOrders()
    if (currentCached.length > 0) {
      setOrders(currentCached)
      setIsLoading(false)
      fetchOrders(true) // Silent background update
    } else {
      setIsLoading(true)
      fetchOrders(false)
    }
  }, [statusKey, refreshTrigger])

  // Clear selection when list changes (status/search/filters refresh)
  useEffect(() => {
    setSelectedOrderIds([])
  }, [statusKey, refreshTrigger, orders.length])

  // Handle refund button click - show modal for wallet payments, confirm dialog for others
  const handleRefund = (order) => {
    const isWalletPayment = order.paymentType === "Wallet" || order.payment?.method === "wallet";
    
    if (isWalletPayment) {
      // Show modal for wallet refunds
      setSelectedOrderForRefund(order)
      setRefundModalOpen(true)
    } else {
      // For non-wallet payments, use the old confirm dialog flow
      const confirmMessage = `Are you sure you want to process refund for order ${order.orderId}?\n\nThis will initiate a Razorpay refund to the customer's original payment method.`;
      
      if (!confirm(confirmMessage)) {
        return
      }
      
      processRefund(order, null) // null amount means use default
    }
  }

  // Process refund with amount
  const processRefund = async (order, refundAmount = null) => {
    // Try using MongoDB _id first (more reliable for route matching), then fallback to orderId string
    // Backend accepts either MongoDB ObjectId (24 chars) or orderId string
    // Using MongoDB _id is more reliable for route matching (no dashes/special chars)
    const orderIdToUse = order.id || order._id || order.orderId
    
    if (!orderIdToUse) {
      console.error('❌ No orderId found in order object:', order)
      toast.error('Order ID not found. Please refresh the page and try again.')
      return
    }
    
    console.log('🔍 Order details for refund:', {
      orderIdString: order.orderId,
      mongoId: order.id,
      orderIdToUse,
      willUse: order.orderId ? 'orderId string' : 'MongoDB _id',
      refundAmount
    })

    try {
      setProcessingRefund(orderIdToUse)
      
      console.log('🔍 Processing refund for order:', {
        orderId: order.orderId,
        id: order.id,
        _id: order._id,
        orderIdToUse,
        refundAmount,
        url: `/api/admin/orders/${orderIdToUse}/refund`
      })
      
      // Include refundAmount in request body if provided (ensure it's a number)
      const requestData = refundAmount !== null ? { refundAmount: parseFloat(refundAmount) } : {}
      console.log('📤 Request data being sent:', requestData)
      const response = await adminAPI.processRefund(orderIdToUse, requestData)
      
      if (response.data?.success) {
        const isWalletPayment = order.paymentType === "Wallet" || order.payment?.method === "wallet";
        toast.success(response.data?.message || (isWalletPayment 
          ? `Wallet refund of ₹${refundAmount || order.totalAmount} processed successfully for order ${order.orderId}`
          : `Refund initiated successfully for order ${order.orderId}`))
        // Update the order in the local state immediately to show "Refunded" status
        setOrders(prevOrders => 
          prevOrders.map(o => 
            (o.id === order.id || o.orderId === order.orderId)
              ? { ...o, refundStatus: 'processed' } // Wallet refunds are instant, so mark as processed
              : o
          )
        )
        // Refresh the orders list to get updated data
        const params = {
          page: 1,
          limit: 10000,
          status: statusKey === "all" ? undefined : 
                 statusKey === "restaurant-cancelled" ? "cancelled" : statusKey,
          cancelledBy: statusKey === "restaurant-cancelled" ? "restaurant" : undefined
        }
        const refreshResponse = await adminAPI.getOrders(params)
        if (refreshResponse.data?.success && refreshResponse.data?.data?.orders) {
          setOrders(refreshResponse.data.data.orders)
          const serverTotal = refreshResponse.data.data.pagination?.total
          setTotalCount(typeof serverTotal === "number" ? serverTotal : refreshResponse.data.data.orders.length)
          setOrdersCache(cacheKey, refreshResponse.data.data.orders)
          clearOrdersCache("admin_order_detect_delivery")
        }
      } else {
        toast.error(response.data?.message || "Failed to process refund")
      }
    } catch (error) {
      console.error("❌ Error processing refund:", error)
      
      // Log full error details for debugging
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: error.config?.baseURL + error.config?.url,
        orderId: orderIdToUse,
        refundAmount: refundAmount,
        order: {
          id: order.id,
          orderId: order.orderId,
          _id: order._id
        },
        stack: error.stack
      }
      console.error("❌ Error details:", JSON.stringify(errorDetails, null, 2))
      
      // Show more specific error message
      let errorMessage = "Failed to process refund"
      
      if (error.response) {
        // Server responded with error
        if (error.response.status === 404) {
          // Prefer backend-provided message (e.g., "Settlement not found for this order")
          errorMessage = error.response.data?.message || `Order not found (ID: ${orderIdToUse}). Please check if the order exists.`
        } else if (error.response.status === 400) {
          errorMessage = error.response.data?.message || "Invalid request. Please check the refund amount."
        } else if (error.response.status === 500) {
          errorMessage = error.response.data?.message || "Server error. Please try again later."
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message
        } else {
          errorMessage = `Error ${error.response.status}: ${error.response.statusText || "Unknown error"}`
        }
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = "Network error. Please check your internet connection and try again."
      } else {
        // Error in setting up the request
        errorMessage = error.message || "Failed to process refund"
      }
      
      console.error("❌ Final error message:", errorMessage)
      toast.error(errorMessage)
    } finally {
      setProcessingRefund(null)
      setRefundModalOpen(false)
      setSelectedOrderForRefund(null)
    }
  }

  // Handle refund confirmation from modal
  const handleRefundConfirm = (amount) => {
    if (selectedOrderForRefund) {
      processRefund(selectedOrderForRefund, amount)
    }
  }

  const {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    visibleColumns,
    filteredOrders,
    count,
    activeFiltersCount,
    restaurants,
    hotels,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  } = useOrdersManagement(orders, statusKey, config.title)

  // Handle URL query parameter for viewing order on load
  const [lastCheckedOrderId, setLastCheckedOrderId] = useState(null)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const orderIdParam = searchParams.get("orderId") || searchParams.get("id")
    
    if (orderIdParam && orderIdParam !== lastCheckedOrderId) {
      setLastCheckedOrderId(orderIdParam)
      
      if (orders.length > 0) {
        const match = orders.find(
          (o) => o.orderId === orderIdParam || o.id === orderIdParam || o._id === orderIdParam
        )
        if (match) {
          handleViewOrder(match)
          return
        }
      }
      
      // Load directly from backend if not currently in the fetched list
      const loadAndShowOrder = async () => {
        try {
          const res = await adminAPI.getOrderById(orderIdParam)
          if (res.data?.success && res.data?.data) {
            const fetchedOrder = res.data.data.order || res.data.data
            handleViewOrder(fetchedOrder)
          }
        } catch (err) {
          console.error("Error loading order from URL param:", err)
        }
      }
      loadAndShowOrder()
    }
  }, [orders, lastCheckedOrderId, handleViewOrder])

  const getOrderKey = (order) => order?.id || order?._id || order?.orderId

  const allFilteredKeys = useMemo(() => {
    return (filteredOrders || []).map(getOrderKey).filter(Boolean)
  }, [filteredOrders])

  const toggleSelectOrder = (order) => {
    const key = getOrderKey(order)
    if (!key) return
    setSelectedOrderIds((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    )
  }

  const toggleSelectAllFiltered = () => {
    setSelectedOrderIds((prev) => {
      const allSelected = allFilteredKeys.length > 0 && allFilteredKeys.every((k) => prev.includes(k))
      return allSelected ? [] : Array.from(new Set([...prev, ...allFilteredKeys]))
    })
  }

  const clearSelection = () => setSelectedOrderIds([])

  const handleBulkDelete = async () => {
    if (selectedOrderIds.length === 0) return
    const ok = confirm(
      `Delete ${selectedOrderIds.length} selected order(s)?\n\nThis will permanently delete orders from the database.`,
    )
    if (!ok) return

    try {
      setBulkDeleting(true)
      const res = await adminAPI.bulkDeleteOrders(selectedOrderIds)
      if (res.data?.success) {
        toast.success(res.data?.message || `Successfully deleted ${selectedOrderIds.length} orders`)
        clearOrdersCache("admin_orders_")
        clearOrdersCache("admin_order_detect_delivery")
        clearSelection()
        setRefreshTrigger((t) => t + 1)
      } else {
        toast.error(res?.data?.message || "Failed to delete orders")
      }
    } catch (e) {
      console.error("Bulk delete failed:", e)
      toast.error(e?.response?.data?.message || "Failed to delete orders")
    } finally {
      setBulkDeleting(false)
    }
  }

  // Loading state (shown only on cold start without cache)
  if (isLoading && orders.length === 0) {
    return <OrdersPageSkeleton title={config.title} />
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden">
      <OrdersTopbar 
        title={config.title} 
        count={activeFiltersCount > 0 || (searchQuery && searchQuery.trim()) ? count : (totalCount || count)} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        onExport={handleExport}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      {selectedOrderIds.length > 0 && (
        <div className="mt-3 mb-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">{selectedOrderIds.length}</span> selected
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              disabled={bulkDeleting}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="px-3 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={bulkDeleting}
            >
              {bulkDeleting ? "Deleting..." : "Delete Selected"}
            </button>
          </div>
        </div>
      )}
      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        setFilters={setFilters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        restaurants={restaurants}
        hotels={hotels}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        visibleColumns={visibleColumns}
        toggleColumn={toggleColumn}
        resetColumns={resetColumns}
      />
      <ViewOrderDialog
        isOpen={isViewOrderOpen}
        onOpenChange={setIsViewOrderOpen}
        order={selectedOrder}
        onPaymentApproved={() => setRefreshTrigger((t) => t + 1)}
      />
      <RefundModal
        isOpen={refundModalOpen}
        onOpenChange={setRefundModalOpen}
        order={selectedOrderForRefund}
        onConfirm={handleRefundConfirm}
        isProcessing={processingRefund !== null}
      />
      <OrdersTable 
        orders={filteredOrders} 
        visibleColumns={visibleColumns}
        onViewOrder={handleViewOrder}
        onPrintOrder={handlePrintOrder}
        onRefund={handleRefund}
        selectedOrderIds={selectedOrderIds}
        onToggleSelectOrder={toggleSelectOrder}
        onToggleSelectAllOrders={toggleSelectAllFiltered}
      />
    </div>
  )
}
