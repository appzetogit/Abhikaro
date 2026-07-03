import { useState, useEffect, useMemo, useRef } from "react"
import { Eye, Printer, ArrowUpDown, Loader2 } from "lucide-react"

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
    "Cancelled by System": "bg-slate-100 text-slate-700",
    "Payment Failed": "bg-red-100 text-red-700",
    "Refunded": "bg-sky-100 text-sky-700",
    "Dine In": "bg-indigo-100 text-indigo-700",
    "Offline Payments": "bg-slate-100 text-slate-700",
  }
  return colors[orderStatus] || "bg-slate-100 text-slate-700"
}

const getPaymentStatusColor = (paymentStatus) => {
  if (paymentStatus === "Paid") return "text-emerald-600"
  if (paymentStatus === "Unpaid" || paymentStatus === "Failed") return "text-red-600"
  return "text-slate-600"
}

const isPlaceholder = (str) => {
  if (!str) return true;
  const s = String(str).toLowerCase().trim();
  return (
    s === "select location" ||
    s === "updating location..." ||
    s === "detecting..." ||
    s === "live" ||
    s === "live address"
  );
};

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

export default function OrdersTable({ 
  orders, 
  visibleColumns, 
  onViewOrder, 
  onPrintOrder, 
  onRefund,
  selectedOrderIds = [],
  onToggleSelectOrder,
  onToggleSelectAllOrders,
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15
  const totalPages = Math.ceil(orders.length / itemsPerPage)
  const [issueDialog, setIssueDialog] = useState({ open: false, order: null })
  const selectAllRef = useRef(null)
  
  // Reset to page 1 when orders change
  useEffect(() => {
    setCurrentPage(1)
  }, [orders.length])
  
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    const end = start + itemsPerPage
    return orders.slice(start, end)
  }, [orders, currentPage])

  const getOrderKey = (order) => order?.id || order?._id || order?.orderId
  const allKeys = useMemo(() => orders.map(getOrderKey).filter(Boolean), [orders])
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedOrderIds.includes(k))
  const someSelected = allKeys.some((k) => selectedOrderIds.includes(k))

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allSelected && someSelected
    }
  }, [allSelected, someSelected])

  const formatRestaurantName = (name) => {
    if (name === "Cafe Monarch") return "Café Monarch"
    return name
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-32 h-32 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
            <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center shadow-md">
              <span className="text-5xl text-orange-500 font-bold">!</span>
            </div>
          </div>
          <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
          <p className="text-sm text-slate-500">There are no orders matching your criteria</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full max-w-full">
      <div className="overflow-x-auto">
        <table className="w-full min-w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider w-[52px]">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleSelectAllOrders?.()}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  aria-label="Select all orders"
                />
              </th>
              {visibleColumns.si && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>SI</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.orderId && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Order ID</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.orderDate && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Order Date</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.customer && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Customer Information</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.deliveryAddress && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Delivery Address</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.deliveryPartner && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Delivery Partner</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.restaurant && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Restaurant</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.hotel && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Hotel</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.foodItems && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span>Food Items</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.totalAmount && (
                <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center justify-end gap-2">
                    <span>Total Amount</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {(visibleColumns.paymentType !== false) && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Payment Type</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {(visibleColumns.paymentCollectionStatus !== false) && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Payment Status</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.orderStatus && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Order Status</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.actions && (
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {paginatedOrders.map((order, index) => (
              <tr 
                key={order.orderId} 
                className="hover:bg-slate-50 transition-colors"
              >
                <td className="px-4 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedOrderIds.includes(getOrderKey(order))}
                    onChange={() => onToggleSelectOrder?.(order)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    aria-label={`Select order ${order.orderId || ""}`}
                  />
                </td>
                {visibleColumns.si && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{(currentPage - 1) * itemsPerPage + index + 1}</span>
                  </td>
                )}
                {visibleColumns.orderId && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-900">{order.orderId}</span>
                  </td>
                )}
                {visibleColumns.orderDate && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{order.date}, {order.time}</span>
                  </td>
                )}
                {visibleColumns.customer && (
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700">{order.userName || order.customerName}</span>
                      <span className="text-xs text-slate-500 mt-0.5">{order.userPhone || order.customerPhone}</span>
                    </div>
                  </td>
                )}
                {visibleColumns.deliveryAddress && (
                  <td className="px-6 py-4 max-w-xs">
                    <span className="text-sm text-slate-700 block truncate" title={formatAddress(order.address)}>
                      {formatAddress(order.address)}
                    </span>
                  </td>
                )}
                {visibleColumns.deliveryPartner && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {order.deliveryPartnerName ? (
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-700">{order.deliveryPartnerName}</span>
                        {order.deliveryPartnerPhone && (
                          <span className="text-xs text-slate-500 mt-0.5">{order.deliveryPartnerPhone}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400 italic">Not Assigned</span>
                    )}
                  </td>
                )}
                {visibleColumns.restaurant && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{formatRestaurantName(order.restaurant)}</span>
                  </td>
                )}
                {visibleColumns.hotel && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{order.hotelName || order.hotelReference || '—'}</span>
                  </td>
                )}
                {visibleColumns.foodItems && (
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2 min-w-[200px] max-w-md">
                      {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                        order.items.map((item, idx) => (
                          <div key={idx || item.itemId || idx} className="flex items-center gap-2 text-sm">
                            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded min-w-[2.5rem] text-center">
                              {item.quantity || 1}x
                            </span>
                            <span className="text-slate-800 font-medium flex-1">
                              {item.name || 'Unknown Item'}
                            </span>
                            {item.price && (
                              <span className="text-xs text-slate-500">
                                ₹{item.price}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400 italic">No items found</span>
                      )}
                    </div>
                  </td>
                )}
                {visibleColumns.totalAmount && (
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-slate-900">
                      ₹{order.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs mt-0.5 ${getPaymentStatusColor(order.paymentStatus)}`}>
                      {order.paymentStatus}
                    </div>
                  </td>
                )}
                {(visibleColumns.paymentType !== false) && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                      // Determine payment type display
                      let paymentTypeDisplay = order.paymentType;
                      
                      const rawMethod = (order.payment?.method || order.paymentMethod || '').toLowerCase();
                      const isPayAtHotelMethod = rawMethod === 'pay_at_hotel';
                      const isPayAtHotelRazorpay =
                        isPayAtHotelMethod &&
                        (order.payment?.razorpayOrderId || order.payment?.razorpayPaymentId);

                      if (!paymentTypeDisplay) {
                        if (rawMethod === 'cash' || rawMethod === 'cod') {
                          paymentTypeDisplay = 'Cash on Delivery';
                        } else if (rawMethod === 'wallet') {
                          paymentTypeDisplay = 'Wallet';
                        } else if (isPayAtHotelRazorpay) {
                          paymentTypeDisplay = 'Pay at Hotel (Razorpay)';
                        } else if (isPayAtHotelMethod) {
                          paymentTypeDisplay = 'Pay at Hotel (Cash)';
                        } else {
                          paymentTypeDisplay = 'Online';
                        }
                      }
                      
                      // Override if payment method is wallet / pay_at_hotel but paymentType is not set correctly
                      if (rawMethod === 'wallet' && paymentTypeDisplay !== 'Wallet') {
                        paymentTypeDisplay = 'Wallet';
                      } else if (isPayAtHotelRazorpay && paymentTypeDisplay !== 'Pay at Hotel (Razorpay)') {
                        paymentTypeDisplay = 'Pay at Hotel (Razorpay)';
                      } else if (isPayAtHotelMethod && !isPayAtHotelRazorpay && !paymentTypeDisplay?.toLowerCase?.().startsWith('pay at hotel')) {
                        // Default to explicit Cash label when backend didn't provide a specific one
                        paymentTypeDisplay = 'Pay at Hotel (Cash)';
                      }
                      
                      const isCod = paymentTypeDisplay === 'Cash on Delivery';
                      const isWallet = paymentTypeDisplay === 'Wallet';
                      const isPayAtHotel = paymentTypeDisplay === 'Pay at Hotel' || paymentTypeDisplay === 'Pay at Hotel (Cash)';
                      const isPayAtHotelRazor = paymentTypeDisplay === 'Pay at Hotel (Razorpay)';
                      const isHotelOnline = paymentTypeDisplay === 'Hotel (Online)';
                      const showHotelNameUnderPaymentType =
                        (isPayAtHotel || isPayAtHotelRazor || isHotelOnline) && Boolean(order.hotelName);
                      
                      return (
                        <div className="flex flex-col leading-tight">
                          <span className={`text-sm font-medium ${
                            isCod ? 'text-amber-600' : 
                            isWallet ? 'text-purple-600' : 
                            (isPayAtHotel || isPayAtHotelRazor || isHotelOnline) ? 'text-orange-600' :
                            'text-emerald-600'
                          }`}>
                            {paymentTypeDisplay}
                          </span>
                          {showHotelNameUnderPaymentType && (
                            <span className="text-xs text-slate-500 mt-1">
                              {order.hotelName}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                )}
                {(visibleColumns.paymentCollectionStatus !== false) && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                      const method = (order.payment?.method || '').toLowerCase();
                      const isCod = order.paymentType === 'Cash on Delivery' || method === 'cash' || method === 'cod';
                      const isPayAtHotel = order.paymentType === 'Pay at Hotel' || method === 'pay_at_hotel';
                      const paymentCompleted = order.payment?.status === 'completed';
                      const cashCollected = order.cashCollected === true;

                      // Prefer backend-provided status; otherwise compute conservatively
                      const status = order.paymentCollectionStatus ?? (
                        (isCod || isPayAtHotel)
                          ? ((paymentCompleted || cashCollected) ? 'Collected' : 'Not Collected')
                          : (paymentCompleted ? 'Collected' : 'Not Collected')
                      );
                      return (
                        <span className={`text-sm font-medium ${status === 'Collected' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {status}
                        </span>
                      )
                    })()}
                  </td>
                )}
                {visibleColumns.orderStatus && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus)}`}>
                          {order.orderStatus}
                        </span>
                        {(order.orderStatus === "Cancelled by Restaurant" || order.orderStatus === "Cancelled by User") && order.cancellationReason && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setIssueDialog({ open: true, order })
                            }}
                            className="p-1 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="View issue"
                            aria-label="View issue"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <span className="text-xs text-slate-500">{order.deliveryType}</span>
                      </div>
                      {/* Cancellation reason is shown via the eye icon dialog (keep table clean) */}
                    </div>
                  </td>
                )}
                {visibleColumns.actions && (
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => onViewOrder(order)}
                        className="p-1.5 rounded text-orange-600 hover:bg-orange-50 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => onPrintOrder(order)}
                        className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Print Order"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {/* Show Refund button or Refunded status for cancelled orders with Online/Wallet payment (restaurant or user cancelled) */}
                      {(() => {
                        // Check if order is cancelled by restaurant or user
                        const cancelledLabels = new Set([
                          "Cancelled by Restaurant",
                          "Cancelled",
                          "Cancelled by User",
                          // Some APIs/UI use single-L "Canceled"
                          "Canceled",
                          "Canceled by User",
                          "Canceled by Restaurant",
                          "Cancelled by System",
                          "Canceled by System",
                        ]);

                        const isCancelled =
                          cancelledLabels.has(order.orderStatus) ||
                          (order.status === "cancelled" &&
                            (order.cancelledBy === "user" ||
                              order.cancelledBy === "restaurant" ||
                              order.cancelledBy === "admin"));
                        
                        // Check if payment type is Online or Wallet (not Cash on Delivery)
                        const paymentMethod = order.payment?.method || order.paymentMethod;
                        const isOnlinePayment = order.paymentType === "Online" ||
                                              order.paymentType === "Hotel (Online)" ||
                                              (order.paymentType !== "Cash on Delivery" && 
                                               order.payment?.method !== "cash" && 
                                               order.payment?.method !== "cod" &&
                                               (order.paymentMethod === "razorpay" || 
                                                order.paymentMethod === "online" || 
                                                order.payment?.paymentMethod === "razorpay" || 
                                                order.payment?.method === "razorpay" ||
                                                order.payment?.method === "online"));
                        
                        const isWalletPayment = order.paymentType === "Wallet" || paymentMethod === "wallet";

                        // Only show refund button if money was actually collected
                        const paymentCompleted =
                          order.payment?.status === "completed" ||
                          order.paymentStatus === "Paid" ||
                          order.paymentCollectionStatus === "Collected";
                        
                        return isCancelled && paymentCompleted && (isOnlinePayment || isWalletPayment);
                      })() && (
                        <>
                          {order.refundStatus === 'processed' || order.refundStatus === 'initiated' ? (
                            <span className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                              order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {order.paymentType === "Wallet" || order.payment?.method === "wallet" 
                                ? "Wallet Refunded" 
                                : "Refunded"}
                            </span>
                          ) : onRefund ? (
                            <button 
                              onClick={() => onRefund(order)}
                              className={`px-3 py-1.5 rounded-md text-white text-xs font-medium hover:opacity-90 transition-colors shadow-sm flex items-center gap-1.5 ${
                                order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                  ? "bg-purple-600 hover:bg-purple-700"
                                  : "bg-blue-600 hover:bg-blue-700"
                              }`}
                              title={order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                ? "Process Wallet Refund (Add to user wallet)"
                                : "Process Refund via Razorpay"}
                            >
                              <span className="text-sm">₹</span>
                              <span>Refund</span>
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Issue dialog: Cancelled by Restaurant */}
      {issueDialog.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setIssueDialog({ open: false, order: null })}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {issueDialog?.order?.orderStatus === "Cancelled by User"
                    ? "Cancelled by User"
                    : "Cancelled by Restaurant"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Order: {issueDialog?.order?.orderId || issueDialog?.order?._id || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIssueDialog({ open: false, order: null })}
                className="px-2 py-1 text-xs font-semibold rounded-md border border-slate-200 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700 mb-1">Issue</p>
              <p className="text-sm text-slate-900">
                {issueDialog?.order?.cancellationReason || "No issue provided."}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing <span className="font-semibold">{(currentPage - 1) * itemsPerPage + 1}</span> to{" "}
            <span className="font-semibold">{Math.min(currentPage * itemsPerPage, orders.length)}</span> of{" "}
            <span className="font-semibold">{orders.length}</span> orders
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                      currentPage === pageNum
                        ? "bg-emerald-500 text-white shadow-md"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

