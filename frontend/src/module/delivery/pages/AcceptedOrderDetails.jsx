import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { 
  ArrowLeft,
  MessageCircle,
  Phone,
  MapPin,
  Utensils,
  ChefHat,
  DollarSign,
  Home,
  FileText,
  UtensilsCrossed,
  User,
  Loader2
} from "lucide-react"
import { deliveryAPI } from "@/lib/api"
import { 
  getDeliveryOrderStatus, 
  getDeliveryStatusMessage,
  saveDeliveryOrderStatus,
  normalizeDeliveryStatus,
  DELIVERY_ORDER_STATUS
} from "../utils/deliveryOrderStatus"
import { 
  getDeliveryOrderPaymentStatus 
} from "../utils/deliveryWalletState"

export default function AcceptedOrderDetails() {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const [orderStatus, setOrderStatus] = useState(() => getDeliveryOrderStatus(orderId))
  const [paymentStatus, setPaymentStatus] = useState(() => getDeliveryOrderPaymentStatus(orderId))
  const [order, setOrder] = useState(null)
  const [loadingOrder, setLoadingOrder] = useState(true)

  // Fetch order details for price breakdown and real data
  useEffect(() => {
    if (!orderId) {
      setLoadingOrder(false)
      return
    }
    let cancelled = false
    const fetchOrder = async () => {
      try {
        setLoadingOrder(true)
        const res = await deliveryAPI.getOrderDetails(orderId)
        if (cancelled) return
        const data = res?.data?.data?.order || res?.data?.order
        if (data) setOrder(data)
      } catch (e) {
        if (!cancelled) console.error('Failed to fetch order details:', e)
      } finally {
        if (!cancelled) setLoadingOrder(false)
      }
    }
    fetchOrder()
    return () => { cancelled = true }
  }, [orderId])

  // Listen for order status updates
  useEffect(() => {
    const handleStatusUpdate = () => {
      setOrderStatus(getDeliveryOrderStatus(orderId))
      setPaymentStatus(getDeliveryOrderPaymentStatus(orderId))
    }

    handleStatusUpdate()

    window.addEventListener('deliveryOrderStatusUpdated', handleStatusUpdate)
    window.addEventListener('deliveryWalletStateUpdated', handleStatusUpdate)
    window.addEventListener('storage', handleStatusUpdate)

    return () => {
      window.removeEventListener('deliveryOrderStatusUpdated', handleStatusUpdate)
      window.removeEventListener('deliveryWalletStateUpdated', handleStatusUpdate)
      window.removeEventListener('storage', handleStatusUpdate)
    }
  }, [orderId])

  const statusMessage = getDeliveryStatusMessage(orderStatus)

  // Build orderData from API order or fallback to defaults for display
  const pricing = order?.pricing || {}
  const subtotal = pricing.subtotal ?? 0
  const discount = pricing.discount ?? 0
  const deliveryFee = pricing.deliveryFee ?? 0
  const tax = pricing.tax ?? 0
  const platformFee = pricing.platformFee ?? 0
  const total = pricing.total ?? subtotal - discount + deliveryFee + tax + platformFee
  const items = order?.items || []
  const customerName = order?.userId?.name || (typeof order?.userId === 'object' && order?.userId?.name) || 'Customer'
  const customerAddress = order?.address?.formattedAddress || [order?.address?.street, order?.address?.city, order?.address?.state].filter(Boolean).join(', ') || '—'
  // Prefer onboarding.step1.restaurantName if available (more accurate)
  const restaurantName = order?.restaurantName
    || order?.restaurantId?.onboarding?.step1?.restaurantName
    || order?.restaurantId?.name 
    || (typeof order?.restaurantId === 'object' && order?.restaurantId?.onboarding?.step1?.restaurantName)
    || (typeof order?.restaurantId === 'object' && order?.restaurantId?.name) 
    || 'Restaurant'
  const restaurantAddress = order?.restaurantId?.address ? (typeof order.restaurantId.address === 'string' ? order.restaurantId.address : [order.restaurantId.address?.street, order.restaurantId.address?.city].filter(Boolean).join(', ')) : '—'
  const paymentMethodDisplay = order?.paymentMethod === 'cash' || order?.payment?.method === 'cash' ? 'Cash' : 'Online'

  const orderData = {
    id: order?.orderId || orderId || "—",
    status: orderStatus,
    deliveryTime: "1 - 5 Min",
    customer: {
      name: customerName,
      address: customerAddress,
      image: order?.userId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(customerName)}&background=random`
    },
    restaurant: {
      name: restaurantName,
      address: restaurantAddress,
      rating: 3.3
    },
    items: items.length > 0 ? items.map((it, i) => ({
      id: it._id || it.itemId || i,
      name: it.name || 'Item',
      price: it.price ?? 0,
      variation: it.selectedVariantName || it.variation || '—',
      quantity: it.quantity ?? 1,
      type: it.isVeg === false ? 'Non Veg' : 'Veg',
      image: it.image || it.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop'
    })) : [
      { id: 1, name: "—", price: 0, variation: "—", quantity: 0, type: "—", image: "" }
    ],
    cutlery: order?.sendCutlery ? "Yes" : "No",
    paymentMethod: {
      status: paymentStatus,
      method: paymentMethodDisplay
    },
    billing: {
      subtotal,
      discount,
      deliveryFee,
      tax,
      platformFee,
      deliverymanTips: 0,
      total
    },
    statusMessage: statusMessage.message,
    statusDescription: statusMessage.description
  }

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center justify-between rounded-b-3xl md:rounded-b-none sticky top-0 z-10">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 -ml-2"
        >
          <ArrowLeft className="w-6 h-6 text-gray-900" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-gray-900 font-medium">Order #{orderData.id}</p>
          <p className="text-[#ff8100] text-sm font-medium">{orderData.status}</p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Delivery Time Estimate */}
      <div className="px-4 py-4 bg-transparent">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-14 h-14 bg-red-100 rounded-lg flex items-center justify-center relative overflow-hidden">
              <Utensils className="w-7 h-7 text-red-600 z-10" />
              {/* Flames effect */}
              <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-orange-400 to-red-500 opacity-60"></div>
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
          </div>
          <div>
            <p className="text-gray-500 text-sm">Food need to deliver within</p>
            <p className="text-[#ff8100] font-bold text-lg">{orderData.deliveryTime}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-4 space-y-6">
        {/* Customer Contact Details */}
        <div>
          <h3 className="text-gray-900 font-semibold mb-3">Customer Contact Details</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <img 
                src={orderData.customer.image}
                alt="Food"
                className="w-12 h-12 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium mb-1">{orderData.customer.name}</p>
                <p className="text-gray-600 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{orderData.customer.address}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button 
                  onClick={() => {
                    navigate("/delivery/profile/conversation")
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#ff8100] flex items-center justify-center hover:bg-[#e67300] transition-colors flex-shrink-0"
                >
                  <MessageCircle className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </button>
                <button 
                  onClick={() => {
                    window.open(`tel:+8801700000000`, '_self')
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600 transition-colors flex-shrink-0"
                >
                  <Phone className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </button>
                <button 
                  onClick={() => {
                    const address = encodeURIComponent(orderData.restaurant.address)
                    window.open(`https://www.google.com/maps/search/?api=1&query=${address}`, '_blank')
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gray-300 flex items-center justify-center hover:bg-gray-400 transition-colors flex-shrink-0"
                >
                  <MapPin className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Restaurant Details */}
        <div>
          <h3 className="text-gray-900 font-semibold mb-3">Restaurant Details</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#ff8100] rounded-lg flex items-center justify-center">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium mb-1">{orderData.restaurant.name}</p>
                <p className="text-gray-600 text-sm mb-1 whitespace-nowrap overflow-hidden text-ellipsis">{orderData.restaurant.address}</p>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-[#ff8100] rounded-full flex items-center justify-center">
                    <span className="text-white text-[8px]">★</span>
                  </div>
                  <span className="text-gray-600 text-sm">({orderData.restaurant.rating})</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button 
                  onClick={() => {
                    navigate("/delivery/profile/conversation")
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#ff8100] flex items-center justify-center hover:bg-[#e67300] transition-colors flex-shrink-0"
                >
                  <MessageCircle className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </button>
                <button 
                  onClick={() => {
                    window.open(`tel:+8801700000000`, '_self')
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600 transition-colors flex-shrink-0"
                >
                  <Phone className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </button>
                <button 
                  onClick={() => {
                    const address = encodeURIComponent(orderData.restaurant.address)
                    window.open(`https://www.google.com/maps/search/?api=1&query=${address}`, '_blank')
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gray-300 flex items-center justify-center hover:bg-gray-400 transition-colors flex-shrink-0"
                >
                  <MapPin className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Item Info */}
        <div>
          <h3 className="text-gray-900 font-semibold mb-3">Item Info ({orderData.items.length})</h3>
          <div className="space-y-4">
            {orderData.items.map((item) => (
              <div key={item.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <img 
                    src={item.image}
                    alt={item.name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium mb-1">{item.name}</p>
                    <p className="text-gray-900 font-semibold mb-1">₹ {item.price.toFixed(2)}</p>
                    <p className="text-gray-600 text-sm">Variations: {item.variation}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-900 font-medium mb-2">Quantity: {item.quantity}</p>
                    <span className="inline-block bg-[#ff8100] text-white text-xs font-medium px-3 py-1 rounded">
                      {item.type}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cutlery */}
        <div className="flex items-center justify-between py-2">
          <span className="text-gray-900 font-medium">Cutlery:</span>
          <span className="text-gray-900 font-medium">{orderData.cutlery}</span>
        </div>

        {/* Payment Method */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-900 font-medium">Payment Method</span>
            <span className="text-red-600 font-medium">{orderData.paymentMethod.status}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <span className="text-gray-900 font-medium">{orderData.paymentMethod.method}</span>
          </div>
        </div>

        {/* Billing Info - full price breakdown */}
        <div>
          <h3 className="text-gray-900 font-semibold mb-3">Billing Info</h3>
          {loadingOrder ? (
            <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-center gap-2 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Item Subtotal</span>
                <span className="text-gray-900 font-medium">₹ {Number(orderData.billing.subtotal).toFixed(2)}</span>
              </div>
              {Number(orderData.billing.discount) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Discount</span>
                  <span className="text-green-600 font-medium">- ₹ {Number(orderData.billing.discount).toFixed(2)}</span>
                </div>
              )}
              {Number(orderData.billing.deliveryFee) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Delivery Charge</span>
                  <span className="text-gray-900 font-medium">₹ {Number(orderData.billing.deliveryFee).toFixed(2)}</span>
                </div>
              )}
              {Number(orderData.billing.tax) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Tax</span>
                  <span className="text-gray-900 font-medium">₹ {Number(orderData.billing.tax).toFixed(2)}</span>
                </div>
              )}
              {Number(orderData.billing.platformFee) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Platform Fee</span>
                  <span className="text-gray-900 font-medium">₹ {Number(orderData.billing.platformFee).toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Deliveryman Tips</span>
                <span className="text-gray-900 font-medium">(+) ₹ {Number(orderData.billing.deliverymanTips || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-300">
                <span className="text-[#ff8100] font-semibold">Total Amount</span>
                <span className="text-[#ff8100] font-bold text-lg">₹ {Number(orderData.billing.total).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation Bar - Mobile Only */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="flex items-center justify-around py-2 px-4">
          <button 
            onClick={() => navigate("/delivery")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600"
          >
            <Home className="w-6 h-6" />
            <span className="text-[10px] text-gray-600 font-medium">Home</span>
          </button>
          <button 
            onClick={() => navigate("/delivery/requests")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600 relative"
          >
            <div className="relative">
              <FileText className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                5
              </span>
            </div>
            <span className="text-[10px] text-gray-600 font-medium">Request</span>
          </button>
          <button 
            onClick={() => navigate("/delivery/orders")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600"
          >
            <UtensilsCrossed className="w-6 h-6" />
            <span className="text-[10px] text-gray-600 font-medium">Orders</span>
          </button>
          <button 
            onClick={() => navigate("/delivery/profile")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600"
          >
            <User className="w-6 h-6" />
            <span className="text-[10px] text-gray-600 font-medium">Profile</span>
          </button>
        </div>
      </div>

      {/* Status Update Buttons - Above Status Bar */}
      {(() => {
        const normalizedStatus = normalizeDeliveryStatus(orderStatus)
        const isDelivered = normalizedStatus === DELIVERY_ORDER_STATUS.DELIVERED
        const isCancelled = normalizedStatus === DELIVERY_ORDER_STATUS.CANCELLED
        
        // Don't show buttons if order is delivered or cancelled
        if (isDelivered || isCancelled) return null
        
        return (
          <div className="fixed bottom-28 md:bottom-12 left-0 right-0 px-4 z-[60]">
            <div className="bg-white rounded-lg shadow-lg p-3 space-y-2">
              {normalizedStatus === DELIVERY_ORDER_STATUS.ACCEPTED && (
                <button
                  onClick={() => {
                    saveDeliveryOrderStatus(orderId, DELIVERY_ORDER_STATUS.PICKED_UP)
                    setOrderStatus(DELIVERY_ORDER_STATUS.PICKED_UP)
                  }}
                  className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Mark as Picked Up
                </button>
              )}
              
              {normalizedStatus === DELIVERY_ORDER_STATUS.PICKED_UP && (
                <button
                  onClick={() => {
                    saveDeliveryOrderStatus(orderId, DELIVERY_ORDER_STATUS.ON_THE_WAY)
                    setOrderStatus(DELIVERY_ORDER_STATUS.ON_THE_WAY)
                  }}
                  className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Mark as On the Way
                </button>
              )}
              
              {normalizedStatus === DELIVERY_ORDER_STATUS.ON_THE_WAY && (
                <button
                  onClick={() => {
                    saveDeliveryOrderStatus(orderId, DELIVERY_ORDER_STATUS.DELIVERED)
                    setOrderStatus(DELIVERY_ORDER_STATUS.DELIVERED)
                    // Remove from activeOrder when delivered
                    const activeOrder = localStorage.getItem('activeOrder')
                    if (activeOrder) {
                      const activeOrderData = JSON.parse(activeOrder)
                      if (activeOrderData.orderId === orderId) {
                        localStorage.removeItem('activeOrder')
                        window.dispatchEvent(new CustomEvent('activeOrderUpdated'))
                      }
                    }
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Mark as Delivered
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* Bottom Status Bar - Above Navigation */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-[#ff8100]/80 backdrop-blur-md px-4 py-4 z-[60] shadow-lg md:pb-4">
        <p className="text-gray-900 font-bold text-center mb-1">{orderData.statusMessage}</p>
        <p className="text-gray-600 text-sm text-center">{orderData.statusDescription}</p>
      </div>
    </div>
  )
}

