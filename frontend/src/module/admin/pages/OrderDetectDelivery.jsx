import { useMemo, useState, useEffect } from "react"
import { Package, Truck, CheckCircle, Clock, XCircle, Loader2 } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import OrdersTopbar from "../components/orders/OrdersTopbar"
import OrderDetectDeliveryTable from "../components/orders/OrderDetectDeliveryTable"
import ViewOrderDetectDeliveryDialog from "../components/orders/ViewOrderDetectDeliveryDialog"
import SettingsDialog from "../components/orders/SettingsDialog"
import { useGenericTableManagement } from "../components/orders/useGenericTableManagement"

// Function to map backend order status to frontend display status
const mapOrderStatus = (order) => {
  const { status, deliveryPartnerName, deliveryState, cancelledAt } = order

  // If cancelled, show as Rejected
  if (status === 'cancelled' || cancelledAt) {
    return "Rejected"
  }

  // If delivered, show as Ordered Delivered
  if (status === 'delivered') {
    return "Ordered Delivered"
  }

  // Check delivery state phases
  if (deliveryState?.currentPhase === 'at_delivery') {
    return "Reached Drop"
  }

  if (deliveryState?.currentPhase === 'at_pickup') {
    return "Delivery Boy Reached Pickup"
  }

  // Order ID Accepted
  if (deliveryState?.status === 'order_confirmed' || deliveryState?.currentPhase === 'en_route_to_delivery' || deliveryState?.orderIdConfirmedAt) {
    return "Order ID Accepted"
  }

  // If delivery boy is assigned
  if (deliveryPartnerName) {
    return "Delivery Boy Assigned"
  }

  // Map backend status to frontend status
  const statusMap = {
    'pending': 'Ordered',
    'confirmed': 'Restaurant Accepted',
    'preparing': 'Restaurant Accepted',
    'ready': 'Restaurant Accepted',
    'out_for_delivery': 'Order ID Accepted',
  }

  return statusMap[status] || 'Ordered'
}

// Function to build status history from order data
const buildStatusHistory = (order) => {
  const history = []
  const { createdAt, tracking, deliveryState, deliveryPartnerName, deliveryPartnerPhone, status, cancelledAt } = order

  // Format timestamp helper
  const formatTimestamp = (date) => {
    if (!date) return null
    const d = new Date(date)
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  // Ordered - always first
  history.push({
    status: "Ordered",
    timestamp: formatTimestamp(createdAt) || "N/A"
  })

  // Rejected (if cancelled)
  if (status === 'cancelled' || cancelledAt) {
    history.push({
      status: "Rejected",
      timestamp: formatTimestamp(cancelledAt) || formatTimestamp(order.updatedAt) || "N/A"
    })
    return history
  }

  // Restaurant Accepted (confirmed)
  if (tracking?.confirmed?.status && tracking?.confirmed?.timestamp) {
    history.push({
      status: "Restaurant Accepted",
      timestamp: formatTimestamp(tracking.confirmed.timestamp)
    })
  } else if (status === 'confirmed' || status === 'preparing' || status === 'ready') {
    history.push({
      status: "Restaurant Accepted",
      timestamp: formatTimestamp(order.updatedAt) || "N/A"
    })
  }

  // Delivery Boy Assigned
  if (deliveryPartnerName) {
    history.push({
      status: "Delivery Boy Assigned",
      timestamp: formatTimestamp(deliveryState?.acceptedAt) || formatTimestamp(order.updatedAt) || "N/A",
      deliveryBoy: deliveryPartnerName || "Delivery Boy",
      deliveryBoyNumber: deliveryPartnerPhone || "N/A"
    })
  }

  // Delivery Boy Reached Pickup
  if (deliveryState?.reachedPickupAt) {
    history.push({
      status: "Delivery Boy Reached Pickup",
      timestamp: formatTimestamp(deliveryState.reachedPickupAt)
    })
  } else if (deliveryState?.currentPhase === 'at_pickup') {
    history.push({
      status: "Delivery Boy Reached Pickup",
      timestamp: formatTimestamp(order.updatedAt) || "N/A"
    })
  }

  // Order ID Accepted
  if (deliveryState?.orderIdConfirmedAt) {
    history.push({
      status: "Order ID Accepted",
      timestamp: formatTimestamp(deliveryState.orderIdConfirmedAt)
    })
  } else if (deliveryState?.status === 'order_confirmed' || deliveryState?.currentPhase === 'en_route_to_delivery') {
    history.push({
      status: "Order ID Accepted",
      timestamp: formatTimestamp(order.updatedAt) || "N/A"
    })
  }

  // Reached Drop - must come before Ordered Delivered
  // Check multiple conditions to ensure we catch it even if order is already delivered
  if (deliveryState?.reachedDropAt) {
    // First priority: use reachedDropAt timestamp if available
    history.push({
      status: "Reached Drop",
      timestamp: formatTimestamp(deliveryState.reachedDropAt)
    })
  } else if (deliveryState?.currentPhase === 'at_delivery' || deliveryState?.status === 'en_route_to_delivery') {
    // Second priority: check if currently at delivery phase
    history.push({
      status: "Reached Drop",
      timestamp: formatTimestamp(order.updatedAt) || "N/A"
    })
  } else if (status === 'delivered' && deliveryPartnerName) {
    // Third priority: if order is delivered and delivery boy was assigned,
    // it means reached drop must have happened (can't deliver without reaching drop)
    // Only add if not already added above
    const hasReachedDrop = history.some(h => h.status === "Reached Drop")
    if (!hasReachedDrop) {
      history.push({
        status: "Reached Drop",
        timestamp: formatTimestamp(order.deliveredAt) || formatTimestamp(order.updatedAt) || "N/A"
      })
    }
  }

  // Ordered Delivered - must come after Reached Drop
  if (status === 'delivered' && tracking?.delivered?.timestamp) {
    history.push({
      status: "Ordered Delivered",
      timestamp: formatTimestamp(tracking.delivered.timestamp)
    })
  } else if (status === 'delivered') {
    history.push({
      status: "Ordered Delivered",
      timestamp: formatTimestamp(order.deliveredAt) || formatTimestamp(order.updatedAt) || "N/A"
    })
  }

  return history
}

// Transform backend order to frontend format
const transformOrder = (order, index) => {
  const orderDate = new Date(order.createdAt)
  const dateStr = orderDate.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  }).toUpperCase()
  const timeStr = orderDate.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  }).toUpperCase()

  const displayStatus = mapOrderStatus(order)
  const statusHistory = buildStatusHistory(order)

  return {
    sl: index + 1,
    orderId: order.orderId,
    userName: order.customerName || order.userId?.name || 'Unknown',
    userNumber: order.customerPhone || order.userId?.phone || 'N/A',
    restaurantName: order.restaurant || order.restaurantName || 'Unknown Restaurant',
    deliveryBoyName: order.deliveryPartnerName || order.deliveryPartnerId?.name || null,
    deliveryBoyNumber: order.deliveryPartnerPhone || order.deliveryPartnerId?.phone || null,
    status: displayStatus,
    statusHistory: statusHistory,
    orderDate: dateStr,
    orderTime: timeStr,
    // Earnings breakdown for this order (if provided by backend)
    earnings: order.earnings || null,
    // Keep original order data for detail view
    originalOrder: order,
    deniedCount: Array.isArray(order?.assignmentInfo?.rejections) ? order.assignmentInfo.rejections.length : 0,
  }
}

export default function OrderDetectDelivery() {
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    orderId: true,
    userInfo: true,
    restaurantName: true,
    deliveryBoy: true,
    status: true,
    actions: true,
  })

  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [resendLoadingByOrderId, setResendLoadingByOrderId] = useState({})

  // Fetch orders from backend
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const params = {
          page: 1,
          limit: 1000, // Fetch all orders for now
        }
        
        const response = await adminAPI.getOrders(params)
        
        if (response.data?.success && response.data?.data?.orders) {
          const transformedOrders = response.data.data.orders.map((order, index) => 
            transformOrder(order, index)
          )
          setOrders(transformedOrders)
        } else {
          console.error("Failed to fetch orders:", response.data)
          setError(response.data?.message || "Failed to fetch orders")
          toast.error("Failed to fetch orders")
          setOrders([])
        }
      } catch (error) {
        console.error("Error fetching orders:", error)
        setError(error.response?.data?.message || "Failed to fetch orders")
        toast.error(error.response?.data?.message || "Failed to fetch orders")
        setOrders([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrders()
  }, [])

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
    filteredData,
    count,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
  } = useGenericTableManagement(
    orders,
    "Order Detect Delivery",
    ["orderId", "userName", "userNumber", "restaurantName", "deliveryBoyName", "status"]
  )

  const handleResend = async (order) => {
    const orderId = order?.orderId
    if (!orderId) {
      toast.error("Order ID is missing")
      return
    }

    if (resendLoadingByOrderId[orderId]) return

    try {
      setResendLoadingByOrderId((prev) => ({ ...prev, [orderId]: true }))
      const response = await adminAPI.resendDeliveryNotification(orderId)
      const notifiedCount =
        response?.data?.data?.notifiedCount ??
        response?.data?.notifiedCount ??
        null

      toast.success(
        typeof notifiedCount === "number"
          ? `Resent delivery notification to ${notifiedCount} partner(s)`
          : "Resent delivery notification",
      )
    } catch (error) {
      console.error("Error resending delivery notification:", error)
      toast.error(error?.response?.data?.message || "Failed to resend delivery notification")
    } finally {
      setResendLoadingByOrderId((prev) => ({ ...prev, [orderId]: false }))
    }
  }

  // Statistics
  const stats = useMemo(() => {
    const total = orders.length
    const ordered = filteredData.filter(o => o.status === "Ordered").length
    const restaurantAccepted = filteredData.filter(o => o.status === "Restaurant Accepted" || o.status === "Accepted").length
    const rejected = filteredData.filter(o => o.status === "Rejected").length
    const deliveryBoyAssigned = filteredData.filter(o => o.status === "Delivery Boy Assigned").length
    const reachedPickup = filteredData.filter(o => o.status === "Delivery Boy Reached Pickup" || o.status === "Reached Pickup").length
    const orderIdAccepted = filteredData.filter(o => o.status === "Order ID Accepted").length
    const reachedDrop = filteredData.filter(o => o.status === "Reached Drop").length
    const delivered = filteredData.filter(o => o.status === "Ordered Delivered").length
    
    return { total, ordered, restaurantAccepted, rejected, deliveryBoyAssigned, reachedPickup, orderIdAccepted, reachedDrop, delivered }
  }, [filteredData, orders.length])

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      orderId: true,
      userInfo: true,
      restaurantName: true,
      deliveryBoy: true,
      status: true,
      actions: true,
    })
  }

  const statCards = [
    { key: "total", label: "Total Orders", value: stats.total, valueClass: "text-slate-900", Icon: Package, iconClass: "text-blue-600", iconBgClass: "bg-blue-50" },
    { key: "ordered", label: "Ordered", value: stats.ordered, valueClass: "text-blue-600", Icon: Clock, iconClass: "text-blue-600", iconBgClass: "bg-blue-50" },
    { key: "restaurantAccepted", label: "Restaurant Accepted", value: stats.restaurantAccepted, valueClass: "text-emerald-600", Icon: CheckCircle, iconClass: "text-emerald-600", iconBgClass: "bg-emerald-50" },
    { key: "rejected", label: "Rejected", value: stats.rejected, valueClass: "text-red-600", Icon: XCircle, iconClass: "text-red-600", iconBgClass: "bg-red-50" },
    { key: "deliveryBoyAssigned", label: "Delivery Boy Assigned", value: stats.deliveryBoyAssigned, valueClass: "text-purple-600", Icon: Truck, iconClass: "text-purple-600", iconBgClass: "bg-purple-50" },
    { key: "reachedPickup", label: "Delivery Boy Reached Pickup", value: stats.reachedPickup, valueClass: "text-orange-600", Icon: Package, iconClass: "text-orange-600", iconBgClass: "bg-orange-50" },
    { key: "orderIdAccepted", label: "Order ID Accepted", value: stats.orderIdAccepted, valueClass: "text-indigo-600", Icon: CheckCircle, iconClass: "text-indigo-600", iconBgClass: "bg-indigo-50" },
    { key: "reachedDrop", label: "Reached Drop", value: stats.reachedDrop, valueClass: "text-amber-600", Icon: Truck, iconClass: "text-amber-600", iconBgClass: "bg-amber-50" },
    { key: "delivered", label: "Delivered", value: stats.delivered, valueClass: "text-emerald-600", Icon: CheckCircle, iconClass: "text-emerald-600", iconBgClass: "bg-emerald-50" },
  ]

  // Loading state
  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          <p className="text-slate-600 font-medium">Loading orders...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error && orders.length === 0) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Error Loading Orders</h3>
          <p className="text-sm text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <OrdersTopbar 
        title="Order Detect Delivery" 
        count={count} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        onExport={handleExport}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {statCards.map(({ key, label, value, valueClass, Icon, iconClass, iconBgClass }) => (
          <div key={key} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
              </div>
              <div className={`p-2.5 rounded-lg ${iconBgClass}`}>
                <Icon className={`w-5 h-5 ${iconClass}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <SettingsDialog
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        visibleColumns={visibleColumns}
        toggleColumn={toggleColumn}
        resetColumns={resetColumns}
        columnsConfig={{
          si: "Serial Number",
          orderId: "Order ID",
          userInfo: "User Name & Number",
          restaurantName: "Restaurant Name",
          deliveryBoy: "Delivery Boy Name & Number",
          status: "Status",
          actions: "Actions",
        }}
      />
      <ViewOrderDetectDeliveryDialog
        isOpen={isViewOrderOpen}
        onOpenChange={setIsViewOrderOpen}
        order={selectedOrder}
      />
      <OrderDetectDeliveryTable 
        orders={filteredData} 
        visibleColumns={visibleColumns}
        onViewOrder={handleViewOrder}
        onPrintOrder={handlePrintOrder}
        onResend={handleResend}
        resendLoadingByOrderId={resendLoadingByOrderId}
      />
    </div>
  )
}

