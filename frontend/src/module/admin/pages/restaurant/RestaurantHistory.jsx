import { useEffect, useMemo, useState } from "react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { Search, Wallet, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import RestaurantOrderHistoryTable from "../../components/restaurants/RestaurantOrderHistoryTable"
import ViewOrderDialog from "../../components/orders/ViewOrderDialog"

const formatCurrency = (amount) => {
  if (amount == null) return "₹0.00"
  return `₹${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export default function RestaurantHistory() {
  // Left panel: restaurants
  const [restaurants, setRestaurants] = useState([])
  const [restSearch, setRestSearch] = useState("")
  const [restPage, setRestPage] = useState(1)
  const [restPages, setRestPages] = useState(1)
  const [restTotal, setRestTotal] = useState(0)
  const [loadingRestaurants, setLoadingRestaurants] = useState(true)
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)

  // Right panel: orders for selected restaurant
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orderSearch, setOrderSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")

  // View dialog
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)

  const limit = 12

  // Fetch restaurants
  const fetchRestaurants = async (overrides = {}) => {
    const p = overrides.page ?? restPage
    const q = overrides.search ?? restSearch
    try {
      setLoadingRestaurants(true)
      const res = await adminAPI.getRestaurantWalletOverview({
        page: p,
        limit,
        search: q?.trim() || undefined,
      })
      if (res?.data?.success) {
        const data = res.data.data || {}
        setRestaurants(data.restaurants || [])
        const pg = data.pagination || {}
        setRestTotal(pg.total ?? (data.restaurants || []).length ?? 0)
        setRestPages(pg.pages ?? 1)
        // Auto-select first on initial load
        if (!selectedRestaurant && (data.restaurants || []).length > 0) {
          setSelectedRestaurant(data.restaurants[0])
        }
      } else {
        setRestaurants([])
        toast.error(res?.data?.message || "Failed to load restaurants")
      }
    } catch (err) {
      console.error("Failed to load restaurants:", err)
      setRestaurants([])
      toast.error(err?.response?.data?.message || "Failed to load restaurants")
    } finally {
      setLoadingRestaurants(false)
    }
  }

  useEffect(() => {
    fetchRestaurants({ page: restPage })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restPage])

  useEffect(() => {
    const t = setTimeout(() => {
      setRestPage(1)
      fetchRestaurants({ page: 1, search: restSearch })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restSearch])

  // Fetch orders for selected restaurant
  const fetchOrders = async () => {
    if (!selectedRestaurant?._id && !selectedRestaurant?.restaurantId) return
    try {
      setOrdersLoading(true)
      const params = {
        page: 1,
        limit: 10000,
        restaurant: selectedRestaurant._id || selectedRestaurant.restaurantId,
        status: statusFilter === "all" ? undefined : statusFilter,
        paymentStatus: paymentFilter || undefined,
        search: orderSearch?.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }
      const res = await adminAPI.getOrders(params)
      if (res?.data?.success) {
        setOrders(res.data.data?.orders || [])
      } else {
        setOrders([])
        toast.error(res?.data?.message || "Failed to load order history")
      }
    } catch (err) {
      console.error("Failed to load order history:", err)
      setOrders([])
      toast.error(err?.response?.data?.message || "Failed to load order history")
    } finally {
      setOrdersLoading(false)
    }
  }

  // When selection or filters change
  useEffect(() => {
    fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRestaurant, statusFilter, paymentFilter, fromDate, toDate])

  useEffect(() => {
    const t = setTimeout(() => {
      fetchOrders()
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSearch])

  const stats = useMemo(() => {
    let totalOrders = orders?.length || 0
    let orderTotal = 0
    let restaurantTotal = 0
    let adminTotal = 0
    for (const o of orders || []) {
      const isDelivered =
        String(o.orderStatus || o.status || "").toLowerCase() === "delivered"
      const isPaid = String(o.paymentStatus || "").toLowerCase() === "paid"
      // For "Revenue/Earnings" tiles, count only delivered + paid orders.
      if (!isDelivered || !isPaid) continue
      const e = o.earnings || {}
      orderTotal += Number(o.totalAmount ?? e.orderTotal ?? 0)
      restaurantTotal += Number(e.restaurantEarning ?? 0)
      adminTotal += Number(e.adminEarning ?? 0)
    }
    return {
      totalOrders,
      orderTotal,
      restaurantTotal,
      adminTotal,
    }
  }, [orders])

  const onViewOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOpen(true)
  }

  const onPrintOrder = (order) => {
    // Keep simple for now — reuse browser print of a small receipt layout from View dialog.
    setSelectedOrder(order)
    setIsViewOpen(true)
    // Printing can be triggered from within the dialog if needed.
  }

  const exportCSV = () => {
    const header = [
      "OrderID",
      "Date",
      "Time",
      "PaymentType",
      "PaymentStatus",
      "Total",
      "RestaurantEarning",
      "AdminEarning",
      "Status",
    ]
    const rows = (orders || []).map((o) => [
      o.orderId,
      o.date || "",
      o.time || "",
      o.paymentType || "",
      o.paymentStatus || "",
      (o.totalAmount ?? o.earnings?.orderTotal ?? 0),
      o.earnings?.restaurantEarning ?? 0,
      o.earnings?.adminEarning ?? 0,
      o.orderStatus || o.status || "",
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `restaurant-history-${selectedRestaurant?.name || "all"}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Restaurant History</h1>
              <p className="text-sm text-slate-600 mt-1">
                View per-restaurant order history with detailed earnings breakdown.
              </p>
            </div>
          </div>
        </div>

        {/* Split layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Restaurants list */}
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={restSearch}
                  onChange={(e) => setRestSearch(e.target.value)}
                  placeholder="Search restaurants..."
                  className="pl-9"
                />
              </div>

              <div className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {loadingRestaurants ? (
                  <div className="py-8 flex items-center justify-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : (restaurants || []).map((r) => {
                  const isActive = selectedRestaurant?._id === r._id
                  return (
                    <button
                      key={r._id}
                      onClick={() => setSelectedRestaurant(r)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                        isActive
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-sm font-semibold truncate">
                        {r.name || "Restaurant"}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{r.ownerPhone || r.phone || ""}</div>
                      <div className="text-xs mt-1">
                        <span className="text-slate-500">Balance:</span>{" "}
                        <span className="font-medium text-emerald-700">
                          {formatCurrency(r.totalBalance)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {restPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200">
                  <span className="text-xs text-slate-600">
                    Page {restPage} of {restPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRestPage((p) => Math.max(1, p - 1))}
                      disabled={restPage <= 1}
                      className="px-3 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setRestPage((p) => Math.min(restPages, p + 1))}
                      disabled={restPage >= restPages}
                      className="px-3 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Right: Orders + filters */}
          <main className="lg:col-span-3 space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Orders</div>
                <div className="mt-1 text-xl font-bold text-slate-900">{stats.totalOrders}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Total Revenue</div>
                <div className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(stats.orderTotal)}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Restaurant</div>
                <div className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(stats.restaurantTotal)}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Admin</div>
                <div className="mt-1 text-xl font-bold text-indigo-700">{formatCurrency(stats.adminTotal)}</div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-600">Search</label>
                  <Input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Order ID, customer, phone..." />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Status</label>
                  <select
                    className="w-[180px] mt-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Awaiting restaurant</option>
                    <option value="preparing">Accepted (preparing)</option>
                    <option value="out_for_delivery">Food On The Way</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-600">Payment</label>
                  <select
                    className="w-[180px] mt-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="completed">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-600">From</label>
                  <input type="date" className="mt-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-600">To</label>
                  <input type="date" className="mt-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <div className="md:ml-auto">
                  <label className="text-xs text-transparent select-none">.</label>
                  <button
                    onClick={exportCSV}
                    className="w-full md:w-auto mt-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Orders table */}
            <RestaurantOrderHistoryTable
              loading={ordersLoading}
              orders={orders}
              onViewOrder={onViewOrder}
              onPrintOrder={onPrintOrder}
            />
          </main>
        </div>
      </div>

      {/* View dialog */}
      <ViewOrderDialog
        isOpen={isViewOpen}
        onOpenChange={setIsViewOpen}
        order={selectedOrder}
      />
    </div>
  )
}

