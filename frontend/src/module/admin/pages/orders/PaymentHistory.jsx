import { useEffect, useMemo, useState } from "react"
import { adminAPI } from "@/lib/api"
import { Search, Loader2, Receipt, ChevronLeft, ChevronRight } from "lucide-react"

const formatCurrency = (amount, currency = "INR") => {
  const n = Number(amount) || 0
  if (currency === "INR") {
    return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
  }
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

const statusBadge = (status) => {
  const s = String(status || "").toLowerCase()
  const base = "px-2 py-0.5 rounded-full text-[11px] font-semibold"
  if (s === "completed") return `${base} bg-emerald-50 text-emerald-700 border border-emerald-200`
  if (s === "failed" || s === "cancelled") return `${base} bg-rose-50 text-rose-700 border border-rose-200`
  if (s === "refunded") return `${base} bg-amber-50 text-amber-700 border border-amber-200`
  if (s === "processing") return `${base} bg-blue-50 text-blue-700 border border-blue-200`
  return `${base} bg-slate-50 text-slate-700 border border-slate-200`
}

const orderStatusBadge = (status) => {
  const s = String(status || "").toLowerCase()
  const base = "px-2 py-0.5 rounded-full text-[11px] font-semibold"
  if (s === "delivered") return `${base} bg-emerald-50 text-emerald-700 border border-emerald-200`
  if (s === "cancelled") return `${base} bg-rose-50 text-rose-700 border border-rose-200`
  if (s === "out_for_delivery") return `${base} bg-indigo-50 text-indigo-700 border border-indigo-200`
  if (s === "ready" || s === "preparing" || s === "confirmed") return `${base} bg-blue-50 text-blue-700 border border-blue-200`
  return `${base} bg-slate-50 text-slate-700 border border-slate-200`
}

const orderStatusLabel = (row) => {
  const s = String(row?.orderStatus || "").toLowerCase()
  if (!s) return "-"

  if (s === "pending") return "Pending"
  if (s === "confirmed") return "Accepted / Confirmed"
  if (s === "preparing") return "Preparing"
  if (s === "ready") return "Ready"
  if (s === "out_for_delivery") return "Food on the way"
  if (s === "delivered") return "Delivered"

  if (s === "cancelled") {
    const by = String(row?.cancelledBy || "").toLowerCase()
    if (by === "user") return "Cancelled by User"
    if (by === "restaurant") return "Cancelled by Restaurant"
    // Keep consistent with All Orders screen:
    // if cancelledBy is missing/unknown/admin, infer from reason; default to user.
    const reason = String(row?.cancellationReason || "").toLowerCase()
    const isRestaurantCancelled =
      /rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue/i.test(
        reason,
      )
    return isRestaurantCancelled ? "Cancelled by Restaurant" : "Cancelled by User"
  }

  return row?.orderStatus
}

const flowLabel = (flow) => {
  switch (flow) {
    case "HOTEL_PAY_AT_HOTEL":
      return "Hotel / Pay at Hotel"
    case "HOTEL_CASH":
      return "Hotel / Cash"
    case "HOTEL_ONLINE":
      return "Hotel / Online"
    case "COD":
      return "COD"
    case "ONLINE":
      return "Online"
    default:
      return flow || "Other"
  }
}

export default function PaymentHistory() {
  const ITEMS_PER_PAGE = 25
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: ITEMS_PER_PAGE })

  const [search, setSearch] = useState("")
  const [paymentStatus, setPaymentStatus] = useState("all")
  const [paymentMethod, setPaymentMethod] = useState("all")
  const [orderType, setOrderType] = useState("all")
  const [page, setPage] = useState(1)

  const fetchRows = async (nextPage = 1) => {
    try {
      setLoading(true)
      setError("")
      const res = await adminAPI.getPaymentHistory({
        page: nextPage,
        limit: ITEMS_PER_PAGE,
        search: search.trim() || undefined,
        paymentStatus: paymentStatus !== "all" ? paymentStatus : undefined,
        paymentMethod: paymentMethod !== "all" ? paymentMethod : undefined,
        orderType: orderType !== "all" ? orderType : undefined,
      })
      if (res?.data?.success) {
        setRows(res.data.data?.rows || [])
        setPagination(res.data.data?.pagination || { page: nextPage, pages: 1, total: 0, limit: ITEMS_PER_PAGE })
      } else {
        setRows([])
        setPagination({ page: nextPage, pages: 1, total: 0, limit: ITEMS_PER_PAGE })
        setError("Failed to load payment history.")
      }
    } catch (err) {
      console.error("PaymentHistory fetch failed:", err)
      setRows([])
      setPagination({ page: nextPage, pages: 1, total: 0, limit: ITEMS_PER_PAGE })
      setError("Failed to load payment history. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRows(1)
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentStatus, paymentMethod, orderType])

  useEffect(() => {
    const t = setTimeout(() => {
      fetchRows(1)
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const safePage = useMemo(() => Math.min(Math.max(1, page), pagination.pages || 1), [page, pagination.pages])

  useEffect(() => {
    if (safePage !== page) setPage(safePage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage])

  const handlePageChange = (next) => {
    const nextPage = Math.min(Math.max(1, next), pagination.pages || 1)
    setPage(nextPage)
    fetchRows(nextPage)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Payment History</h1>
              <p className="text-sm text-slate-600 mt-1">
                End-to-end payment status for all orders (success / failure), including Hotel (QR/Pay at Hotel) vs Normal online/wallet.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-xl">
              <input
                type="text"
                placeholder="Search by Order ID / Razorpay IDs / Transaction ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="refunded">Refunded</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white"
              >
                <option value="all">All Methods</option>
                <option value="razorpay">Razorpay</option>
                <option value="wallet">Wallet</option>
                <option value="cash">Cash</option>
                <option value="pay_at_hotel">Pay at Hotel</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </select>

              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
                className="px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white"
              >
                <option value="all">All Order Types</option>
                <option value="QR">Hotel (QR)</option>
                <option value="DIRECT">Direct</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
              <p className="text-slate-600 text-sm">Loading payments…</p>
            </div>
          ) : error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Order ID</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Order Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Method</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Flow</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Hotel</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Gateway IDs</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-12 text-center text-sm text-slate-600">
                        No payments found for current filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const dt = r.createdAt ? new Date(r.createdAt) : null
                      const payment = r.payment || {}
                      const amount = r.amount || {}
                      return (
                        <tr key={String(r.orderMongoId || r.orderId)} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                            {dt ? dt.toLocaleString() : "-"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-900">
                            {r.orderId || "-"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={orderStatusBadge(r.orderStatus)}>{orderStatusLabel(r)}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={statusBadge(payment.status)}>{payment.status || "pending"}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                            {payment.method || "-"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                            {flowLabel(payment.flow)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-right text-slate-900 font-semibold">
                            {formatCurrency(amount.paidAmount ?? amount.total, amount.currency)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900">{r.user?.name || "N/A"}</span>
                              <span className="text-[11px] text-slate-500">{r.user?.phone || r.user?.email || ""}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900">{r.restaurant?.name || "N/A"}</span>
                              <span className="text-[11px] text-slate-500">{r.restaurant?.id || ""}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                            {r.hotel ? (
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-900">{r.hotel.name || "Hotel"}</span>
                                <span className="text-[11px] text-slate-500">{r.hotel.hotelId || ""}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[11px] text-slate-600">
                            <div className="flex flex-col gap-0.5">
                              <span>tx: {payment.paymentCollection?.transactionId || payment.orderTransactionId || "-"}</span>
                              <span>rpay_order: {payment.paymentCollection?.razorpayOrderId || payment.orderRazorpayOrderId || "-"}</span>
                              <span>rpay_pay: {payment.paymentCollection?.razorpayPaymentId || payment.orderRazorpayPaymentId || "-"}</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && (pagination?.pages || 1) > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                Page {pagination.page} of {pagination.pages} • Total {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange((pagination.page || 1) - 1)}
                  disabled={(pagination.page || 1) <= 1}
                  className="px-3 py-1.5 text-sm rounded border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange((pagination.page || 1) + 1)}
                  disabled={(pagination.page || 1) >= (pagination.pages || 1)}
                  className="px-3 py-1.5 text-sm rounded border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

