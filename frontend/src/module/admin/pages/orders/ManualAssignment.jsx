import { useState, useEffect } from "react"
import { Package, User, MapPin, Clock, Loader2, CheckCircle, X, Utensils, IndianRupee, Lock, Settings, Info, ChevronDown } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useNavigate } from "react-router-dom"

export default function ManualAssignment() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [deliveryPartners, setDeliveryPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showDeliveryPartnerModal, setShowDeliveryPartnerModal] = useState(false)
  const [deliveryPartnerWallets, setDeliveryPartnerWallets] = useState({})
  const [loadingWallets, setLoadingWallets] = useState(false)
  const [deliveryAssignmentMode, setDeliveryAssignmentMode] = useState("automatic")
  const [loadingMode, setLoadingMode] = useState(true)
  const [selectedDeliveryPartnerId, setSelectedDeliveryPartnerId] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [zones, setZones] = useState([])

  // Fetch delivery assignment mode
  const fetchAssignmentMode = async () => {
    try {
      const response = await adminAPI.getBusinessSettings()
      if (response.data?.success && response.data.data) {
        const mode = response.data.data.deliveryAssignmentMode || "automatic"
        setDeliveryAssignmentMode(mode)
      }
    } catch (error) {
      console.error("Error fetching assignment mode:", error)
    } finally {
      setLoadingMode(false)
    }
  }

  // Fetch zones
  const fetchZones = async () => {
    try {
      const response = await adminAPI.getZones({ limit: 1000, isActive: true })
      if (response.data?.success && response.data.data?.zones) {
        setZones(response.data.data.zones)
      }
    } catch (error) {
      console.error("Error fetching zones:", error)
    }
  }

  // Fetch orders ready for assignment (status: ready, no deliveryPartnerId)
  const fetchOrders = async () => {
    try {
      const response = await adminAPI.getOrders({
        page: 1,
        limit: 1000,
        status: "ready",
      })

      if (response.data?.success && response.data.data?.orders) {
        // Filter orders without delivery partner
        const unassignedOrders = response.data.data.orders.filter(
          (order) => !order.deliveryPartnerId
        )
        setOrders(unassignedOrders)
      }
    } catch (error) {
      console.error("Error fetching orders:", error)
      toast.error("Failed to fetch orders")
    }
  }

  // Fetch available delivery partners
  const fetchDeliveryPartners = async () => {
    try {
      const response = await adminAPI.getDeliveryPartners({
        limit: 1000,
        status: "approved",
        isActive: true,
        includeAvailability: true,
      })

      if (response.data?.success && response.data.data?.deliveryPartners) {
        // Filter only online delivery partners
        const onlinePartners = response.data.data.deliveryPartners.filter(
          (partner) => partner.availability?.isOnline === true
        )
        setDeliveryPartners(onlinePartners)
      }
    } catch (error) {
      console.error("Error fetching delivery partners:", error)
      toast.error("Failed to fetch delivery partners")
    }
  }

  // Fetch wallet info for all delivery partners
  const fetchDeliveryPartnerWallets = async () => {
    if (deliveryPartners.length === 0) return
    
    setLoadingWallets(true)
    const walletPromises = deliveryPartners.map(async (partner) => {
      try {
        const response = await adminAPI.getDeliveryPartnerWallet(partner._id || partner.id)
        if (response.data?.success) {
          return {
            partnerId: partner._id || partner.id,
            wallet: response.data.data
          }
        }
      } catch (error) {
        console.error(`Error fetching wallet for partner ${partner._id}:`, error)
      }
      return null
    })

    const results = await Promise.all(walletPromises)
    const walletMap = {}
    results.forEach(result => {
      if (result) {
        walletMap[result.partnerId] = result.wallet
      }
    })
    setDeliveryPartnerWallets(walletMap)
    setLoadingWallets(false)
  }

  useEffect(() => {
    fetchAssignmentMode()
    fetchZones()
  }, [])

  useEffect(() => {
    // Only fetch orders and delivery partners if mode is manual
    if (deliveryAssignmentMode === "manual" && !loadingMode) {
      const loadData = async () => {
        setLoading(true)
        await Promise.all([fetchOrders(), fetchDeliveryPartners()])
        setLoading(false)
      }
      loadData()

      // Refresh every 10 seconds
      const interval = setInterval(loadData, 10000)
      return () => clearInterval(interval)
    } else if (deliveryAssignmentMode === "automatic" && !loadingMode) {
      setLoading(false)
    }
  }, [deliveryAssignmentMode, loadingMode])

  // Fetch wallet for selected delivery partner
  const fetchSelectedPartnerWallet = async (partnerId) => {
    if (!partnerId) return
    
    setLoadingWallets(true)
    try {
      const response = await adminAPI.getDeliveryPartnerWallet(partnerId)
      if (response.data?.success) {
        setDeliveryPartnerWallets(prev => ({
          ...prev,
          [partnerId]: response.data.data
        }))
      }
    } catch (error) {
      console.error(`Error fetching wallet for partner ${partnerId}:`, error)
    } finally {
      setLoadingWallets(false)
    }
  }

  useEffect(() => {
    if (selectedDeliveryPartnerId) {
      fetchSelectedPartnerWallet(selectedDeliveryPartnerId)
    }
  }, [selectedDeliveryPartnerId])

  // Handle assign button click
  const handleAssignClick = async (order) => {
    setSelectedOrder(order)
    setSelectedDeliveryPartnerId(null)
    setShowDropdown(false)
    setShowDeliveryPartnerModal(true)
    // Ensure delivery partners are fetched when modal opens
    if (deliveryPartners.length === 0) {
      await fetchDeliveryPartners()
    }
  }

  // Handle assignment
  const handleAssign = async (orderId, deliveryPartnerId) => {
    try {
      setAssigning(deliveryPartnerId)
      const response = await adminAPI.assignOrderToDeliveryPartner(orderId, deliveryPartnerId)
      
      if (response.data?.success) {
        toast.success("Order request sent to delivery partner successfully")
        setShowDeliveryPartnerModal(false)
        setSelectedOrder(null)
        setSelectedDeliveryPartnerId(null)
        fetchOrders()
      } else {
        toast.error(response.data?.message || "Failed to assign order")
      }
    } catch (error) {
      console.error("Error assigning order:", error)
      toast.error(error.response?.data?.message || "Failed to assign order")
    } finally {
      setAssigning(null)
    }
  }

  // Format currency
  const formatCurrency = (amount) => {
    return `₹${Number(amount || 0).toLocaleString('en-IN')}`
  }

  // Get user location from order
  const getUserLocation = (order) => {
    if (order.address?.location?.formattedAddress) {
      return order.address.location.formattedAddress
    }
    if (order.address?.address) {
      return order.address.address
    }
    if (order.deliveryAddress) {
      return order.deliveryAddress
    }
    return "Location not available"
  }

  // Get restaurant location from order
  const getRestaurantLocation = (order) => {
    if (order.restaurantId?.location?.formattedAddress) {
      return order.restaurantId.location.formattedAddress
    }
    if (order.restaurantId?.address) {
      return order.restaurantId.address
    }
    if (order.restaurantAddress) {
      return order.restaurantAddress
    }
    return "Location not available"
  }

  if (loadingMode || loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  // Show locked state if mode is automatic
  if (deliveryAssignmentMode === "automatic") {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Manual Assignment</h1>
                <p className="text-sm text-slate-600 mt-1">
                  Manual assignment is currently disabled
                </p>
              </div>
            </div>
          </div>

          {/* Locked State */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Manual Assignment is Locked</h2>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              Manual assignment is currently disabled because the delivery assignment mode is set to <strong>Automatic</strong>.
              Orders are being automatically assigned to nearby delivery partners.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-blue-900 mb-1">To enable Manual Assignment:</p>
                  <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Go to Order Setting page</li>
                    <li>Change the toggle from "Automatic" to "Manual"</li>
                    <li>Save the settings</li>
                    <li>This page will then be accessible</li>
                  </ol>
                </div>
              </div>
            </div>
            <Button
              onClick={() => navigate("/admin/order-setting")}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 mx-auto"
            >
              <Settings className="w-4 h-4" />
              Go to Order Setting
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Manual Assignment</h1>
            <p className="text-sm text-slate-600 mt-1">
              Assign delivery partners to orders manually ({orders.length} orders waiting)
            </p>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 text-lg">No orders ready for assignment</p>
            <p className="text-slate-500 text-sm mt-2">Orders will appear here when restaurants mark them as ready</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {orders.map((order) => (
              <div key={order._id || order.id} className="p-6 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-bold text-slate-900">Order ID: {order.orderId}</h3>
                      <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                        Ready
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {/* User Info */}
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <User className="w-4 h-4 text-slate-500 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-slate-500">Customer Name</p>
                            <p className="text-sm font-medium text-slate-900">
                              {order.customerName || order.userId?.name || "N/A"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-slate-500 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-slate-500">Delivery Location</p>
                            <p className="text-sm text-slate-700">{getUserLocation(order)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Restaurant Info */}
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Utensils className="w-4 h-4 text-slate-500 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-slate-500">Restaurant</p>
                            <p className="text-sm font-medium text-slate-900">
                              {order.restaurant || order.restaurantId?.name || "N/A"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-slate-500 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-slate-500">Restaurant Location</p>
                            <p className="text-sm text-slate-700">{getRestaurantLocation(order)}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="mb-4">
                      <p className="text-xs text-slate-500 mb-2">Order Items</p>
                      <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                        {order.items && order.items.length > 0 ? (
                          order.items.map((item, index) => (
                            <div key={index} className="flex items-center justify-between text-sm">
                              <span className="text-slate-700">
                                {item.name || item.foodName || "Item"} 
                                {item.variant && ` (${item.variant})`}
                              </span>
                              <span className="font-medium text-slate-900">
                                Qty: {item.quantity || 1}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">Items not available</p>
                        )}
                      </div>
                    </div>

                    {/* Order Total */}
                    <div className="flex items-center gap-2 text-sm">
                      <IndianRupee className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-600">Total Amount:</span>
                      <span className="font-bold text-slate-900">{formatCurrency(order.totalAmount)}</span>
                    </div>
                  </div>

                  {/* Assign Button */}
                  <div className="ml-6">
                    <Button
                      onClick={() => handleAssignClick(order)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delivery Partner Selection Modal */}
      {showDeliveryPartnerModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => {
          setShowDeliveryPartnerModal(false)
          setSelectedOrder(null)
          setSelectedDeliveryPartnerId(null)
          setShowDropdown(false)
        }}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Select Delivery Partner</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Order: <span className="font-semibold">{selectedOrder.orderId}</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {deliveryPartners.length} delivery partner{deliveryPartners.length !== 1 ? 's' : ''} available
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDeliveryPartnerModal(false)
                  setSelectedOrder(null)
                  setSelectedDeliveryPartnerId(null)
                  setShowDropdown(false)
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Delivery Partners List */}
            <div className="flex-1 overflow-y-auto p-5">
              {deliveryPartners.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-3" />
                  <span className="text-slate-600">Loading delivery partners...</span>
                </div>
              ) : (() => {
                // Filter delivery partners by zone if manual mode
                let filteredPartners = deliveryPartners
                
                if (deliveryAssignmentMode === "manual" && selectedOrder) {
                  // Find restaurant's zone
                  const restaurantId = selectedOrder.restaurantId?._id || selectedOrder.restaurantId
                  const restaurantZone = zones.find(z => 
                    z.restaurantId?.toString() === restaurantId?.toString() || 
                    z.restaurantId === restaurantId
                  )
                  
                  if (restaurantZone) {
                    // Filter to only show delivery partners assigned to this zone
                    filteredPartners = deliveryPartners.filter(partner => {
                      const partnerZones = partner.fullData?.availability?.zones || partner.availability?.zones || []
                      return partnerZones.some(z => 
                        z.toString() === restaurantZone._id.toString() || 
                        z._id?.toString() === restaurantZone._id.toString()
                      )
                    })
                    
                    if (filteredPartners.length === 0) {
                      return (
                        <div className="text-center py-12">
                          <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                          <p className="text-slate-600 font-medium">No delivery partners assigned to this zone</p>
                          <p className="text-sm text-slate-500 mt-2">
                            Restaurant zone: {restaurantZone.name || restaurantZone.zoneName}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Please assign delivery partners to this zone in Deliveryman List
                          </p>
                        </div>
                      )
                    }
                  }
                }
                
                return (
                  <div className="space-y-3">
                    {filteredPartners.map((partner) => {
                    const isSelected = selectedDeliveryPartnerId === (partner._id || partner.id)
                    const wallet = deliveryPartnerWallets[partner._id || partner.id] || {}
                    const totalCashLimit = wallet.totalCashLimit || 0
                    const cashInHand = wallet.cashInHand || 0
                    const availableCashLimit = wallet.availableCashLimit || 0
                    const orderAmount = Number(selectedOrder.totalAmount) || 0
                    const canTakeOrder = availableCashLimit >= orderAmount || orderAmount === 0

                    return (
                      <div
                        key={partner._id || partner.id}
                        onClick={() => {
                          setSelectedDeliveryPartnerId(partner._id || partner.id)
                          if (!wallet.totalCashLimit) {
                            fetchSelectedPartnerWallet(partner._id || partner.id)
                          }
                        }}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-50 shadow-md"
                            : canTakeOrder
                            ? "border-slate-200 hover:border-blue-400 hover:shadow-md bg-white"
                            : "border-amber-300 bg-amber-50"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-lg font-bold text-slate-900">
                                {partner.name || "Delivery Partner"}
                              </h3>
                              <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Online
                              </span>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-slate-700">
                                📞 {partner.phone || "Phone not available"}
                              </p>
                              {partner.zone && (
                                <p className="text-xs text-slate-500">📍 Zone: {partner.zone}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Cash Limit Info */}
                        {isSelected && (
                          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-3 mb-3 border border-slate-200">
                            <p className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                              <IndianRupee className="w-4 h-4" />
                              Cash Limit Information
                            </p>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between items-center py-1.5 border-b border-slate-200">
                                <span className="text-slate-700 font-medium">Total Limit:</span>
                                <span className="font-bold text-slate-900">{formatCurrency(totalCashLimit)}</span>
                              </div>
                              <div className="flex justify-between items-center py-1.5 border-b border-slate-200">
                                <span className="text-slate-700 font-medium">Cash in Hand:</span>
                                <span className="font-bold text-slate-900">{formatCurrency(cashInHand)}</span>
                              </div>
                              <div className="flex justify-between items-center py-1.5">
                                <span className="text-slate-700 font-medium">Available Limit:</span>
                                <span className={`font-bold text-lg ${
                                  canTakeOrder ? "text-green-600" : "text-red-600"
                                }`}>
                                  {formatCurrency(availableCashLimit)}
                                </span>
                              </div>
                              {!canTakeOrder && (
                                <div className="mt-3 p-2 bg-amber-100 border border-amber-300 rounded text-xs text-amber-800">
                                  ⚠️ Insufficient cash limit. Order amount: {formatCurrency(orderAmount)}
                                </div>
                              )}
                              {canTakeOrder && orderAmount > 0 && (
                                <div className="mt-2 text-xs text-slate-600">
                                  Order amount: {formatCurrency(orderAmount)} | Remaining after assignment: {formatCurrency(availableCashLimit - orderAmount)}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Assign Button - Only show when selected */}
                        {isSelected && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAssign(
                                selectedOrder._id || selectedOrder.id,
                                partner._id || partner.id
                              )
                            }}
                            disabled={assigning === (partner._id || partner.id) || !canTakeOrder}
                            className={`w-full py-2.5 font-semibold ${
                              canTakeOrder
                                ? "bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg"
                                : "bg-slate-300 cursor-not-allowed opacity-60"
                            } text-white transition-all`}
                          >
                            {assigning === (partner._id || partner.id) ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2 inline" />
                                Sending Request...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-2 inline" />
                                Send Request to Delivery Boy
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                  </div>
                )
              })()}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
