import { useMemo, useState, useEffect, useRef } from "react"
import { FileText, Calendar, Package } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import OrdersTopbar from "../../components/orders/OrdersTopbar"
import OrdersTable from "../../components/orders/OrdersTable"
import FilterPanel from "../../components/orders/FilterPanel"
import ViewOrderDialog from "../../components/orders/ViewOrderDialog"
import SettingsDialog from "../../components/orders/SettingsDialog"
import RefundModal from "../../components/orders/RefundModal"
import io from "socket.io-client"
import { useOrdersManagement } from "../../components/orders/useOrdersManagement"
import { getOrdersCache, setOrdersCache, clearOrdersCache, updateOrderInCache } from "../../utils/ordersCache"
import { exportToCSV, exportToExcel, exportToPDF, exportToJSON } from "../../components/orders/ordersExportUtils"

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
      if (statusKey === "all") return allCache.slice(0, 20)
      const filtered = allCache.filter(o => {
        const rawStatus = (o.status || "").toLowerCase()
        const displayStatus = (o.orderStatus || "").toLowerCase()
        const isCancelled =
          rawStatus === "cancelled" ||
          displayStatus.includes("cancel") ||
          Boolean(o.cancelledAt) ||
          Boolean(o.cancelledBy) ||
          Boolean(o.cancellationReason)

        const isDelivered = rawStatus === "delivered" || displayStatus === "delivered"
        const isActuallyAccepted =
          !isCancelled &&
          !isDelivered &&
          (rawStatus === "preparing" ||
            o.acceptedByAdmin === true ||
            o.adminAccepted === true ||
            o.tracking?.preparing?.status === true)

        if (statusKey === "pending") {
          return !isCancelled && !isDelivered && (rawStatus === "pending" || (rawStatus === "confirmed" && !isActuallyAccepted))
        }
        if (statusKey === "accepted") {
          return isActuallyAccepted
        }
        if (statusKey === "processing") return !isCancelled && (rawStatus === "preparing" || displayStatus === "processing")
        if (statusKey === "food-on-the-way") return !isCancelled && (rawStatus === "out_for_delivery" || displayStatus.includes("way"))
        if (statusKey === "delivered") return isDelivered
        if (statusKey === "canceled") return isCancelled
        if (statusKey === "restaurant-cancelled") return o.cancelledBy === "restaurant" || (o.cancellationReason && /restaurant/i.test(o.cancellationReason))
        if (statusKey === "scheduled") return rawStatus === "scheduled" || displayStatus === "scheduled"
        if (statusKey === "payment-failed") return !isCancelled && (o.paymentStatus === "Failed" || o.payment?.status === "failed")
        if (statusKey === "refunded") return Boolean(o.refundStatus)
        if (statusKey === "offline-payments") return o.paymentType === "Cash on Delivery" || o.payment?.method === "cash" || o.payment?.method === "cod"
        return false
      })
      if (filtered.length > 0) return filtered.slice(0, 20)
    }
    return []
  }

  const initialOrders = resolveInitialOrders()
  const [orders, setOrders] = useState(initialOrders)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)
  const [serverTotal, setServerTotal] = useState(() => initialOrders.length)
  const [serverPages, setServerPages] = useState(1)
  const [isLoading, setIsLoading] = useState(() => initialOrders.length === 0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedOrderIds, setSelectedOrderIds] = useState([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [processingRefund, setProcessingRefund] = useState(null)
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [selectedOrderForRefund, setSelectedOrderForRefund] = useState(null)
  const [allRestaurantNames, setAllRestaurantNames] = useState([])
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // useOrdersManagement for UI helpers (columns, modals, filters)
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
    setSelectedOrder,
    filters,
    setFilters,
    visibleColumns,
    activeFiltersCount,
    restaurants,
    hotels,
    handleApplyFilters,
    handleResetFilters,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  } = useOrdersManagement(orders, statusKey, config.title)

  // Fetch all restaurant names once for the filter dropdown
  useEffect(() => {
    let isMounted = true
    adminAPI.getRestaurants({ limit: 1000 })
      .then(res => {
        if (!isMounted) return
        const list = res.data?.data?.restaurants || res.data?.data || []
        const names = list.map(r => r.name || r.restaurantName).filter(Boolean)
        if (names.length > 0) {
          setAllRestaurantNames([...new Set(names)].sort())
        }
      })
      .catch(() => {})
    return () => { isMounted = false }
  }, [])

  // Fetch orders from backend with server-side pagination & filters
  const fetchOrders = async (targetPage = 1, isSilent = false, searchVal = undefined, filtersVal = undefined) => {
    try {
      if (!isSilent) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }

      const activeSearch = searchVal !== undefined ? searchVal : searchQuery
      const activeFilters = filtersVal !== undefined ? filtersVal : filters

      const params = {
        page: targetPage,
        limit: pageSize,
        status: statusKey === "all" ? undefined : 
               statusKey === "restaurant-cancelled" ? "cancelled" : statusKey,
        cancelledBy: statusKey === "restaurant-cancelled" ? "restaurant" : undefined
      }

      if (activeSearch && activeSearch.trim()) {
        params.search = activeSearch.trim()
      }

      if (activeFilters?.restaurant) {
        params.restaurant = activeFilters.restaurant
      }
      if (activeFilters?.fromDate) {
        params.fromDate = activeFilters.fromDate
      }
      if (activeFilters?.toDate) {
        params.toDate = activeFilters.toDate
      }
      if (activeFilters?.paymentStatus) {
        params.paymentStatus = activeFilters.paymentStatus
      }

      const response = await adminAPI.getOrders(params)

      if (response.data?.success && response.data?.data?.orders) {
        const fetchedOrders = response.data.data.orders
        setOrders(fetchedOrders)
        const total = response.data.data.pagination?.total ?? fetchedOrders.length
        const pages = response.data.data.pagination?.pages ?? Math.ceil(total / pageSize)
        setServerTotal(total)
        setServerPages(pages)
        setCurrentPage(targetPage)

        if (targetPage === 1 && !activeSearch && (!activeFilters || Object.values(activeFilters).every(v => !v || (Array.isArray(v) && v.length === 0)))) {
          setOrdersCache(cacheKey, fetchedOrders)
        }
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

  // 0ms Optimistic local state + cache updater for instant response
  const handleOrderOptimisticUpdate = (orderId, patch) => {
    if (!orderId || !patch) return
    const targetId = String(orderId)

    setOrders((prev) =>
      prev.map((o) => {
        const id = String(o._id || o.id || o.orderId || "")
        const oOrderId = String(o.orderId || "")
        if (id === targetId || oOrderId === targetId || (patch.orderId && oOrderId === String(patch.orderId))) {
          return { ...o, ...patch }
        }
        return o
      })
    )

    setSelectedOrder((prev) => {
      if (!prev) return prev
      const id = String(prev._id || prev.id || prev.orderId || "")
      const oOrderId = String(prev.orderId || "")
      if (id === targetId || oOrderId === targetId || (patch.orderId && oOrderId === String(patch.orderId))) {
        return { ...prev, ...patch }
      }
      return prev
    })

    updateOrderInCache(orderId, patch)
  }

  // Connect to realtime Socket.IO to receive live updates
  useEffect(() => {
    let socket = null
    try {
      const backendOrigin = (import.meta.env.VITE_BACKEND_URL || window.location.origin).replace(/\/api\/?$/, "")
      socket = io(backendOrigin, {
        path: "/socket.io/",
        transports: ["websocket", "polling"],
      })

      const handleSocketUpdate = (data) => {
        if (!data) return
        const targetId = data.orderMongoId || data.orderId || data.id || data._id
        if (!targetId) return

        const orderStatusMap = {
          pending: "Pending",
          confirmed: "Accepted",
          preparing: "Accepted",
          ready: "Ready",
          out_for_delivery: "Food On The Way",
          delivered: "Delivered",
          cancelled: "Canceled",
        }
        const paymentStatusMap = {
          completed: "Paid",
          pending: "Pending",
          processing: "Processing",
          failed: "Failed",
          refunded: "Refunded",
        }

        const patch = {
          ...(data.status ? { 
            status: data.status, 
            orderStatus: orderStatusMap[data.status] || data.status 
          } : {}),
          ...(data.paymentStatus ? { 
            paymentStatus: paymentStatusMap[data.paymentStatus] || data.paymentStatus 
          } : {}),
        }

        handleOrderOptimisticUpdate(targetId, patch)
      }

      socket.on("admin_order_updated", handleSocketUpdate)
      socket.on("order_status_update", handleSocketUpdate)
    } catch (e) {
      console.warn("Admin socket connection error:", e?.message || e)
    }

    return () => {
      if (socket) {
        socket.off("admin_order_updated")
        socket.off("order_status_update")
        socket.disconnect()
      }
    }
  }, [])

  // Initial fetch and statusKey changes
  useEffect(() => {
    setCurrentPage(1)
    const currentCached = resolveInitialOrders()
    if (currentCached.length > 0) {
      setOrders(currentCached)
      setIsLoading(false)
      fetchOrders(1, true)
    } else {
      setIsLoading(true)
      fetchOrders(1, false)
    }
  }, [statusKey, refreshTrigger])

  // Debounced server-side search
  const isInitialSearchMount = useRef(true)
  useEffect(() => {
    if (isInitialSearchMount.current) {
      isInitialSearchMount.current = false
      return
    }
    const timer = setTimeout(() => {
      fetchOrders(1, true, searchQuery, filters)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Clear selection on page/filter change
  useEffect(() => {
    setSelectedOrderIds([])
  }, [statusKey, refreshTrigger, orders.length, currentPage])

  // Apply filter handler
  const onApplyFilterHandler = () => {
    handleApplyFilters()
    fetchOrders(1, false, searchQuery, filters)
  }

  // Reset filter handler
  const onResetFilterHandler = () => {
    const emptyFilters = {
      paymentStatus: "",
      deliveryType: "",
      minAmount: "",
      maxAmount: "",
      fromDate: "",
      toDate: "",
      restaurant: "",
      paymentType: [],
      hotel: "",
    }
    handleResetFilters()
    fetchOrders(1, false, searchQuery, emptyFilters)
  }

  // Dedicated export handler: fetches matching records on demand without slowing down regular page load
  const handleExportWithFetch = async (format) => {
    const toastId = toast.loading(`Preparing ${format.toUpperCase()} export...`)
    try {
      const params = {
        page: 1,
        limit: 5000,
        status: statusKey === "all" ? undefined : 
               statusKey === "restaurant-cancelled" ? "cancelled" : statusKey,
        cancelledBy: statusKey === "restaurant-cancelled" ? "restaurant" : undefined
      }
      if (searchQuery && searchQuery.trim()) params.search = searchQuery.trim()
      if (filters?.restaurant) params.restaurant = filters.restaurant
      if (filters?.fromDate) params.fromDate = filters.fromDate
      if (filters?.toDate) params.toDate = filters.toDate
      if (filters?.paymentStatus) params.paymentStatus = filters.paymentStatus

      const res = await adminAPI.getOrders(params)
      const exportOrders = res.data?.data?.orders || orders
      const filename = `${config.title.toLowerCase().replace(/\s+/g, "_")}`

      if (format === "csv") exportToCSV(exportOrders, filename)
      else if (format === "excel") exportToExcel(exportOrders, filename)
      else if (format === "pdf") exportToPDF(exportOrders, filename)
      else if (format === "json") exportToJSON(exportOrders, filename)

      toast.success(`${exportOrders.length} orders exported successfully!`, { id: toastId })
    } catch (err) {
      console.error("Export error:", err)
      toast.error("Failed to export orders", { id: toastId })
    }
  }

  // Handle refund
  const handleRefund = (order) => {
    const isWalletPayment = order.paymentType === "Wallet" || order.payment?.method === "wallet"
    
    if (isWalletPayment) {
      setSelectedOrderForRefund(order)
      setRefundModalOpen(true)
    } else {
      const confirmMessage = `Are you sure you want to process refund for order ${order.orderId}?\n\nThis will initiate a Razorpay refund to the customer's original payment method.`
      if (!confirm(confirmMessage)) return
      processRefund(order, null)
    }
  }

  // Process refund with amount
  const processRefund = async (order, refundAmount = null) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found. Please refresh the page and try again.")
      return
    }

    try {
      setProcessingRefund(orderIdToUse)
      const requestData = refundAmount !== null ? { refundAmount: parseFloat(refundAmount) } : {}
      const response = await adminAPI.processRefund(orderIdToUse, requestData)
      
      if (response.data?.success) {
        const isWalletPayment = order.paymentType === "Wallet" || order.payment?.method === "wallet"
        toast.success(response.data?.message || (isWalletPayment 
          ? `Wallet refund of ₹${refundAmount || order.totalAmount} processed successfully for order ${order.orderId}`
          : `Refund initiated successfully for order ${order.orderId}`))
        
        setOrders(prevOrders => 
          prevOrders.map(o => 
            (o.id === order.id || o.orderId === order.orderId)
              ? { ...o, refundStatus: "processed" }
              : o
          )
        )
        // Refresh current page
        fetchOrders(currentPage, true)
      } else {
        toast.error(response.data?.message || "Failed to process refund")
      }
    } catch (error) {
      console.error("Error processing refund:", error)
      toast.error(error.response?.data?.message || "Failed to process refund")
    } finally {
      setProcessingRefund(null)
      setRefundModalOpen(false)
      setSelectedOrderForRefund(null)
    }
  }

  const handleRefundConfirm = (amount) => {
    if (selectedOrderForRefund) {
      processRefund(selectedOrderForRefund, amount)
    }
  }

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
    return (orders || []).map(getOrderKey).filter(Boolean)
  }, [orders])

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
        fetchOrders(currentPage, false)
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
        count={serverTotal || orders.length} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        onExport={handleExportWithFetch}
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
        onApply={onApplyFilterHandler}
        onReset={onResetFilterHandler}
        restaurants={allRestaurantNames.length > 0 ? allRestaurantNames : restaurants}
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
        onOrderUpdated={handleOrderOptimisticUpdate}
      />
      <RefundModal
        isOpen={refundModalOpen}
        onOpenChange={setRefundModalOpen}
        order={selectedOrderForRefund}
        onConfirm={handleRefundConfirm}
        isProcessing={processingRefund !== null}
      />
      <OrdersTable 
        orders={orders} 
        visibleColumns={visibleColumns}
        onViewOrder={handleViewOrder}
        onPrintOrder={handlePrintOrder}
        onRefund={handleRefund}
        selectedOrderIds={selectedOrderIds}
        onToggleSelectOrder={toggleSelectOrder}
        onToggleSelectAllOrders={toggleSelectAllFiltered}
        pagination={{
          currentPage,
          totalPages: serverPages,
          totalCount: serverTotal,
          limit: pageSize,
          onPageChange: (newPage) => fetchOrders(newPage, false)
        }}
      />
    </div>
  )
}
