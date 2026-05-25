import { useEffect, useMemo, useState } from "react"
import { Eye, MapPin, Package, User, Phone, Mail, Calendar, Clock, Truck, CreditCard, X, Receipt, CheckCircle, Loader2 } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

const getStatusColor = (orderStatus) => {
  const colors = {
    "Delivered": "bg-emerald-100 text-emerald-700",
    "Pending": "bg-blue-100 text-blue-700",
    "Scheduled": "bg-blue-100 text-blue-700",
    "Accepted": "bg-green-100 text-green-700",
    "Processing": "bg-orange-100 text-orange-700",
    "Food On The Way": "bg-yellow-100 text-yellow-700",
    "Canceled": "bg-rose-100 text-rose-700",
    "Cancelled by Restaurant": "bg-red-100 text-red-700",
    "Cancelled by User": "bg-orange-100 text-orange-700",
    "Payment Failed": "bg-red-100 text-red-700",
    "Refunded": "bg-sky-100 text-sky-700",
    "Dine In": "bg-indigo-100 text-indigo-700",
    "Offline Payments": "bg-slate-100 text-slate-700",
  }
  return colors[orderStatus] || "bg-slate-100 text-slate-700"
}

const getPaymentStatusColor = (paymentStatus) => {
  if (paymentStatus === "Paid" || paymentStatus === "Collected") return "text-emerald-600"
  if (paymentStatus === "Not Collected") return "text-amber-600"
  if (paymentStatus === "Unpaid" || paymentStatus === "Failed") return "text-red-600"
  return "text-slate-600"
}

const formatMoney = (n) => {
  const num = Number(n || 0)
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ViewOrderDialog({ isOpen, onOpenChange, order: orderProp, onPaymentApproved }) {
  const [approvingPayment, setApprovingPayment] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [resending, setResending] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [fullOrder, setFullOrder] = useState(null)

  const orderIdToUse = orderProp?.id || orderProp?._id || orderProp?.orderId

  // Fetch full order details on open so earnings/hotel fields are reliable.
  // List rows may not contain settlement-derived earnings or populated hotel info.
  useEffect(() => {
    let cancelled = false
    if (!isOpen || !orderIdToUse) {
      setFullOrder(orderProp || null)
      return
    }

    setFullOrder(orderProp || null)
    ;(async () => {
      try {
        const resp = await adminAPI.getOrderById(orderIdToUse)
        const fetched = resp?.data?.data?.order || null
        if (!cancelled && fetched) {
          setFullOrder((prev) => ({ ...(prev || {}), ...(fetched || {}) }))
        }
      } catch (_) {
        // Non-blocking
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, orderIdToUse])

  // Use merged order everywhere below (prevents crashes when orderProp is null).
  const order = fullOrder || orderProp

  // Backend should provide a consistent orderStatus, but guard against legacy/inconsistent data:
  // if cancellation fields are present, never show Delivered/other non-cancelled statuses in the UI.
  const isEffectivelyCancelled =
    order?.status === "cancelled" ||
    order?.orderStatus === "Canceled" ||
    order?.orderStatus === "Cancelled by Restaurant" ||
    order?.orderStatus === "Cancelled by User" ||
    !!order?.cancelledAt ||
    !!order?.cancelledBy ||
    !!order?.cancellationReason

  const effectiveOrderStatus = isEffectivelyCancelled
    ? (order?.cancelledBy === "restaurant"
        ? "Cancelled by Restaurant"
        : order?.cancelledBy === "user"
        ? "Cancelled by User"
        : "Canceled")
    : order?.orderStatus

  const isOfflinePayment =
    order?.paymentType === "Cash on Delivery" ||
    order?.payment?.method === "cash" ||
    order?.payment?.method === "cod"
  const paymentPending =
    order?.paymentStatus === "Pending" ||
    order?.paymentStatus === "Unpaid" ||
    order?.paymentCollectionStatus === "Not Collected"
  const showMarkAsPaid = isOfflinePayment && paymentPending && !isEffectivelyCancelled

  const canReassignToRestaurant =
    isEffectivelyCancelled &&
    (order?.cancelledBy === "restaurant" ||
      /order not accepted within time limit|restaurant did not respond|rejected by restaurant|restaurant cancelled/i.test(
        order?.cancellationReason || ""
      ))

  const handleReassignToRestaurant = async () => {
    if (!order?.id && !order?.orderId) return
    try {
      setReassigning(true)
      const orderIdToUse = order.id || order._id || order.orderId
      const resp = await adminAPI.reassignOrderToRestaurant(orderIdToUse)
      if (resp?.data?.success) {
        toast.success("Order reassigned to restaurant and notification sent")
        onOpenChange(false)
      } else {
        toast.error(resp?.data?.message || "Failed to reassign order")
      }
    } catch (err) {
      console.error("Error reassigning to restaurant:", err)
      toast.error(err?.response?.data?.message || "Failed to reassign order")
    } finally {
      setReassigning(false)
    }
  }

  const handleResendToRestaurant = async () => {
    if (!order?.id && !order?.orderId) return
    try {
      setResending(true)
      const orderIdToUse = order.id || order._id || order.orderId
      const resp = await adminAPI.resendRestaurantNotification(orderIdToUse)
      if (resp?.data?.success) {
        toast.success("Notification sent to restaurant")
      } else {
        toast.error(resp?.data?.message || "Failed to send notification")
      }
    } catch (err) {
      console.error("Error resending to restaurant:", err)
      toast.error(err?.response?.data?.message || "Failed to send notification")
    } finally {
      setResending(false)
    }
  }

  const handleMarkAsPaid = async () => {
    if (!order?.id && !order?.orderId) return
    try {
      setApprovingPayment(true)
      const orderIdToUse = order.id || order._id || order.orderId
      const response = await adminAPI.approveOfflinePayment(orderIdToUse)
      if (response?.data?.success) {
        toast.success("Payment marked as paid successfully")
        onPaymentApproved?.()
        onOpenChange(false)
      } else {
        toast.error(response?.data?.message || "Failed to mark payment as paid")
      }
    } catch (err) {
      console.error("Error approving offline payment:", err)
      toast.error(err?.response?.data?.message || "Failed to mark payment as paid")
    } finally {
      setApprovingPayment(false)
    }
  }

  // Backend: restaurant "accept" sets status `preparing`, not `confirmed` (`confirmed` = paid / awaiting restaurant tap).
  const statusOptions = useMemo(
    () => [
      { value: "pending", label: "Pending" },
      { value: "confirmed", label: "Awaiting restaurant (paid)" },
      { value: "preparing", label: "Accepted" },
      { value: "ready", label: "Ready" },
      { value: "out_for_delivery", label: "Food On The Way" },
      { value: "delivered", label: "Delivered" },
      { value: "cancelled", label: "Canceled" },
    ],
    [],
  )

  const paymentStatusOptions = useMemo(
    () => [
      { value: "pending", label: "Pending" },
      { value: "processing", label: "Processing" },
      { value: "completed", label: "Paid" },
      { value: "failed", label: "Failed" },
      { value: "refunded", label: "Refunded" },
    ],
    [],
  )

  const initialOrderStatusValue = useMemo(() => {
    const raw = (order?.status || "").toString().toLowerCase()
    return raw || "pending"
  }, [order?.status])

  const initialPaymentStatusValue = useMemo(() => {
    const raw = (order?.payment?.status || "").toString().toLowerCase()
    return raw || "pending"
  }, [order?.payment?.status])

  const [editOrderStatus, setEditOrderStatus] = useState("pending")
  const [editPaymentStatus, setEditPaymentStatus] = useState("pending")

  // Keep editable fields in sync when opening/selecting a new order
  useEffect(() => {
    setEditOrderStatus(initialOrderStatusValue)
    setEditPaymentStatus(initialPaymentStatusValue)
  }, [initialOrderStatusValue, initialPaymentStatusValue, orderIdToUse, isOpen])

  const hasStatusChanges =
    editOrderStatus !== initialOrderStatusValue ||
    editPaymentStatus !== initialPaymentStatusValue

  const handleUpdateStatuses = async () => {
    if (!orderIdToUse) return
    try {
      setUpdatingStatus(true)
      const resp = await adminAPI.updateOrderStatusAndPaymentStatus(orderIdToUse, {
        orderStatus: editOrderStatus,
        paymentStatus: editPaymentStatus,
      })
      if (resp?.data?.success) {
        toast.success("Order updated")
        onPaymentApproved?.() // refresh orders list
        onOpenChange(false)
      } else {
        toast.error(resp?.data?.message || "Failed to update order")
      }
    } catch (err) {
      console.error("Error updating statuses:", err)
      toast.error(err?.response?.data?.message || "Failed to update order")
    } finally {
      setUpdatingStatus(false)
    }
  }

  // NOTE: Do not return early before all hooks run.
  // `order` can be null on the first render while the dialog state resolves.
  // If we return early before useMemo/useEffect hooks, React will detect hook order changes.

  const isPlaceholder = (str) => {
    if (!str) return true;
    const s = String(str).toLowerCase().trim();
    return s === "select location" || s === "updating location..." || s === "detecting...";
  };

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return "N/A"
    
    const parts = []
    if (address.label && !isPlaceholder(address.label)) parts.push(address.label)
    if (address.street && !isPlaceholder(address.street)) parts.push(address.street)
    if (address.additionalDetails && !isPlaceholder(address.additionalDetails)) parts.push(address.additionalDetails)
    if (address.formattedAddress && !isPlaceholder(address.formattedAddress)) {
      parts.push(address.formattedAddress)
    } else {
      if (address.city && !isPlaceholder(address.city)) parts.push(address.city)
      if (address.state && !isPlaceholder(address.state)) parts.push(address.state)
      if (address.zipCode && !isPlaceholder(address.zipCode)) parts.push(address.zipCode)
    }
    
    return parts.length > 0 ? parts.join(", ") : "Address not available"
  }

  // Get coordinates if available
  const getCoordinates = (address) => {
    if (address?.location?.coordinates && Array.isArray(address.location.coordinates) && address.location.coordinates.length === 2) {
      const [lng, lat] = address.location.coordinates
      if (lng === 0 && lat === 0) return "Not available"
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }
    return null
  }

  const viewOrder = fullOrder || order
  const method = String(viewOrder?.payment?.method || "").toLowerCase()
  const isHotelOrder = Boolean(
    viewOrder?.orderType === "QR" ||
      viewOrder?.hotelReference ||
      viewOrder?.hotelId ||
      viewOrder?.hotelName ||
      method === "pay_at_hotel",
  )

  const total = Number(viewOrder?.totalAmount ?? viewOrder?.pricing?.total ?? viewOrder?.total ?? 0)
  const rawEarnings = viewOrder?.earnings || {}
  const estimated = viewOrder?.estimatedEarnings
  const estimatedDeliveryEarning = (() => {
    if (!estimated) return 0
    if (typeof estimated === "number") return Number(estimated) || 0
    if (typeof estimated === "object") {
      return Number(estimated.totalEarning ?? estimated.basePayout ?? 0) || 0
    }
    return 0
  })()
  const earnings = {
    orderTotal: Number(rawEarnings.orderTotal ?? total ?? 0) || 0,
    restaurantEarning:
      Number(rawEarnings.restaurantEarning ?? rawEarnings.restaurant ?? 0) ||
      0,
    deliveryEarning:
      // Prefer backend earnings (which now uses DeliveryWallet as source of truth for completed deliveries).
      Number(rawEarnings.deliveryEarning ?? rawEarnings.delivery ?? 0) ||
      estimatedDeliveryEarning ||
      0,
    adminEarning:
      Number(rawEarnings.adminEarning ?? rawEarnings.admin ?? 0) ||
      0,
    hotelEarning:
      Number(rawEarnings.hotelEarning ?? rawEarnings.hotel ?? 0) ||
      Number(viewOrder?.commissionBreakdown?.hotel ?? 0) ||
      Number(viewOrder?.hotelCommission ?? 0) ||
      0,
  }

  // Cancelled orders should not show any earnings/split.
  if (isEffectivelyCancelled) {
    earnings.restaurantEarning = 0
    earnings.deliveryEarning = 0
    earnings.adminEarning = 0
    earnings.hotelEarning = 0
  }

  if (!viewOrder) return null

  const displayDate = viewOrder?.date || (viewOrder?.createdAt ? new Date(viewOrder.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).toUpperCase() : "—")

  const displayTime = viewOrder?.time || (viewOrder?.createdAt ? new Date(viewOrder.createdAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).toUpperCase() : "")

  const customerName = viewOrder?.userName || viewOrder?.customerName || viewOrder?.userId?.fullName || viewOrder?.userId?.name || "N/A"
  const customerPhone = viewOrder?.userPhone || viewOrder?.customerPhone || viewOrder?.userId?.phone || "N/A"
  const customerEmail = viewOrder?.customerEmail || viewOrder?.userId?.email || "N/A"
  const restaurantName = viewOrder?.restaurant || viewOrder?.restaurantName || viewOrder?.restaurantId?.name || "N/A"

  // Pricing breakdown safe fallbacks
  const subtotal = viewOrder?.totalItemAmount ?? viewOrder?.pricing?.subtotal ?? 0
  const discount = viewOrder?.itemDiscount ?? viewOrder?.pricing?.discount ?? 0
  const couponDiscount = viewOrder?.couponDiscount ?? viewOrder?.pricing?.couponDiscount ?? 0
  const deliveryCharge = viewOrder?.deliveryCharge ?? viewOrder?.pricing?.deliveryFee ?? 0
  const platformFee = viewOrder?.platformFee ?? viewOrder?.pricing?.platformFee ?? 0
  const tax = viewOrder?.vatTax ?? viewOrder?.pricing?.tax ?? 0
  const totalAmount = viewOrder?.totalAmount ?? viewOrder?.pricing?.total ?? viewOrder?.total ?? 0

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-white p-0 overflow-y-auto">
        <DialogHeader className="relative px-6 pt-6 pb-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2 pr-10">
            <Eye className="w-5 h-5 text-orange-600" />
            Order Details
          </DialogTitle>
          <DialogDescription>
            View complete information about this order
          </DialogDescription>
          <button
            onClick={() => onOpenChange?.(false)}
            className="absolute right-4 top-5 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
            type="button"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </DialogHeader>
        <div className="px-6 py-6 space-y-6">
          {/* Basic Order Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Order ID
                </p>
                <p className="text-sm font-medium text-slate-900">{order.orderId || order.id || order.subscriptionId}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Order Date
                </p>
                <p className="text-sm font-medium text-slate-900">{displayDate}{displayTime ? `, ${displayTime}` : ""}</p>
              </div>
              {order.estimatedDeliveryTime && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Estimated Delivery Time
                  </p>
                  <p className="text-sm font-medium text-slate-900">
                    {order.estimatedDeliveryTime > 90 ? 45 : order.estimatedDeliveryTime} minutes
                  </p>
                </div>
              )}
              {order.deliveredAt && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Delivered At
                  </p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(order.deliveredAt).toLocaleString('en-GB', { 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).toUpperCase()}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {order.orderStatus && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Status</p>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(effectiveOrderStatus)}`}>
                    {effectiveOrderStatus}
                  </span>
                  {order.cancellationReason && (
                    <p className="text-xs text-red-600 mt-1">
                      <span className="font-medium">
                        {order.cancelledBy === 'user' ? 'Cancelled by User - ' : 
                         order.cancelledBy === 'restaurant' ? 'Cancelled by Restaurant - ' : 
                         'Cancellation '}Reason:
                      </span> {order.cancellationReason}
                    </p>
                  )}
                  {canReassignToRestaurant && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={handleReassignToRestaurant}
                        disabled={reassigning}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60"
                      >
                        {reassigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {reassigning ? "Reassigning..." : "Reassign to Restaurant"}
                      </button>
                    </div>
                  )}
                  {!isEffectivelyCancelled && ['pending','confirmed','preparing'].includes((order.status||'').toLowerCase?.() || order.status) && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={handleResendToRestaurant}
                        disabled={resending}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {resending ? "Sending..." : "Resend to Restaurant"}
                      </button>
                    </div>
                  )}
                  {order.cancelledAt && (
                    <p className="text-xs text-slate-500 mt-1">
                      Cancelled: {new Date(order.cancelledAt).toLocaleString('en-GB', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }).toUpperCase()}
                    </p>
                  )}
                </div>
              )}
              {(order.paymentStatus || order.paymentCollectionStatus != null) && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Payment Status
                  </p>
                  <div className="flex items-center gap-3">
                    <p className={`text-sm font-medium ${getPaymentStatusColor(
                      order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                        ? (order.paymentCollectionStatus ?? (order.status === 'delivered' ? 'Collected' : 'Not Collected'))
                        : order.paymentStatus
                    )}`}>
                      {order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                        ? (order.paymentCollectionStatus ?? (order.status === 'delivered' ? 'Collected' : 'Not Collected'))
                        : order.paymentStatus}
                    </p>
                    {showMarkAsPaid && (
                      <button
                        onClick={handleMarkAsPaid}
                        disabled={approvingPayment}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {approvingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {approvingPayment ? "Processing..." : "Mark as Paid"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Admin controls: update order/payment status */}
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">Admin Controls</p>
                  {isEffectivelyCancelled && (
                    <span className="text-xs px-2 py-1 rounded border bg-amber-50 text-amber-800 border-amber-200">
                      Cancelled — pick a new status and Update to reopen
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Change Order Status</p>
                    <select
                      className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                      value={editOrderStatus}
                      onChange={(e) => setEditOrderStatus(e.target.value)}
                      disabled={updatingStatus}
                    >
                      {statusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Change Payment Status</p>
                    <select
                      className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                      value={editPaymentStatus}
                      onChange={(e) => setEditPaymentStatus(e.target.value)}
                      disabled={updatingStatus}
                    >
                      {paymentStatusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleUpdateStatuses}
                    disabled={updatingStatus || !hasStatusChanges}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {updatingStatus ? "Updating..." : "Update"}
                  </button>
                </div>
              </div>
              {order.deliveryType && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Delivery Type
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.deliveryType}</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Information */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Name</p>
                <p className="text-sm font-medium text-slate-900">{customerName}</p>
              </div>
              {customerPhone && customerPhone !== "N/A" && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone
                  </p>
                  <p className="text-sm font-medium text-slate-900">{customerPhone}</p>
                </div>
              )}
              {customerEmail && customerEmail !== "N/A" && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </p>
                  <p className="text-sm font-medium text-slate-900">{customerEmail}</p>
                </div>
              )}
            </div>
          </div>

          {/* Restaurant Information */}
          {restaurantName && restaurantName !== "N/A" && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Restaurant Information</h3>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Restaurant Name</p>
                <p className="text-sm font-medium text-slate-900">{restaurantName}</p>
              </div>
            </div>
          )}

          {/* Order Items */}
          {order.items && Array.isArray(order.items) && order.items.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Order Items ({order.items.length})
              </h3>
              <div className="space-y-3">
                {order.items.map((item, index) => (
                  <div key={index} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded">
                          {item.quantity || 1}x
                        </span>
                        <p className="text-sm font-medium text-slate-900">{item.name || "Unknown Item"}</p>
                        {item.isVeg !== undefined && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${item.isVeg ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {item.isVeg ? 'Veg' : 'Non-Veg'}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-1 ml-8">{item.description}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      ₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bill Image (Captured by Delivery Boy) */}
          {(order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-orange-600" />
                Bill Image (Captured by Delivery Boy)
              </h3>
              <div className="space-y-3">
                <div className="relative w-full max-w-xl border-2 border-slate-300 rounded-xl overflow-hidden bg-white shadow-sm">
                  <img
                    src={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    alt="Order Bill"
                    className="w-full h-auto object-contain max-h-[360px] mx-auto block"
                    loading="lazy"
                    onError={(e) => {
                      console.error('❌ Failed to load bill image:', e.target.src)
                      e.target.style.display = 'none';
                      const errorDiv = e.target.parentElement.querySelector('.error-message');
                      if (errorDiv) errorDiv.style.display = 'block';
                    }}
                    onLoad={() => {
                      console.log('✅ Bill image loaded successfully')
                    }}
                  />
                  <div className="error-message hidden p-6 text-center text-slate-500 text-sm bg-slate-50">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    Failed to load bill image
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                  >
                    <Eye className="w-4 h-4" />
                    View Full Size
                  </a>
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <Package className="w-4 h-4" />
                    Download
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Delivery Address */}
          {order.address && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Delivery Address
              </h3>
              <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-900">{formatAddress(order.address)}</p>
                {getCoordinates(order.address) && (
                  <p className="text-xs text-slate-500 mt-2">
                    <span className="font-medium">Coordinates:</span> {getCoordinates(order.address)}
                  </p>
                )}
                {order.address.label && (
                  <p className="text-xs text-slate-500">
                    <span className="font-medium">Label:</span> {order.address.label}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Delivery Partner Information */}
          {(order.deliveryPartnerName || order.deliveryPartnerPhone) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Delivery Partner
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {order.deliveryPartnerName && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</p>
                    <p className="text-sm font-medium text-slate-900">{order.deliveryPartnerName}</p>
                  </div>
                )}
                {order.deliveryPartnerPhone && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</p>
                    <p className="text-sm font-medium text-slate-900">{order.deliveryPartnerPhone}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing Breakdown */}
          <div className="border-t border-slate-200 pt-4">
            {/* Earnings / Split (shown above pricing) */}
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800 mb-3">Order Split</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Order total</span>
                  <span className="font-semibold text-slate-900">{formatMoney(earnings.orderTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Restaurant</span>
                  <span className="font-semibold text-slate-900">{formatMoney(earnings.restaurantEarning)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Delivery boy </span>
                  <span className="font-semibold text-slate-900">{formatMoney(earnings.deliveryEarning)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Admin</span>
                  <span className="font-semibold text-slate-900">{formatMoney(earnings.adminEarning)}</span>
                </div>
                {isHotelOrder ? (
                  <div className="flex justify-between md:col-span-2">
                    <span className="text-slate-600">Hotel</span>
                    <span className="font-semibold text-slate-900">{formatMoney(earnings.hotelEarning)}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <h3 className="text-sm font-semibold text-slate-700 mb-4">Pricing Breakdown</h3>
            <div className="space-y-2">
              {(subtotal > 0 || viewOrder?.pricing?.subtotal !== undefined) && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-900">₹{subtotal.toFixed(2)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-medium text-emerald-600">-₹{discount.toFixed(2)}</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Coupon Discount</span>
                  <span className="font-medium text-emerald-600">-₹{couponDiscount.toFixed(2)}</span>
                </div>
              )}
              {(deliveryCharge !== undefined || viewOrder?.pricing?.deliveryFee !== undefined) && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Delivery Charge</span>
                  <span className="font-medium text-slate-900">
                    {deliveryCharge > 0 ? `₹${deliveryCharge.toFixed(2)}` : <span className="text-emerald-600">Free delivery</span>}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Platform Fee</span>
                <span className="font-medium text-slate-900">
                  {platformFee > 0 ? `₹${platformFee.toFixed(2)}` : <span className="text-slate-400">₹0.00</span>}
                </span>
              </div>
              {tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tax (GST)</span>
                  <span className="font-medium text-slate-900">₹{tax.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-slate-700">Total Amount</span>
                  <span className="text-xl font-bold text-emerald-600">
                    ₹{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

