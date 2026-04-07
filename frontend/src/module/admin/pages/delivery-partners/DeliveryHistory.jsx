import { useEffect, useMemo, useState } from "react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { Search, Wallet, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import ViewOrderDialog from "../../components/orders/ViewOrderDialog"
import DeliveryOrderHistoryTable from "../../components/delivery-partners/DeliveryOrderHistoryTable"

const formatCurrency = (amount) => {
  if (amount == null) return "₹0.00"
  return `₹${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const safeISODate = (value) => (value ? String(value) : "")

export default function DeliveryHistory() {
  // Left panel: delivery boys (wallets list gives us pagination + display fields)
  const [wallets, setWallets] = useState([])
  const [dpSearch, setDpSearch] = useState("")
  const [dpPage, setDpPage] = useState(1)
  const [dpPages, setDpPages] = useState(1)
  const [dpTotal, setDpTotal] = useState(0)
  const [loadingDelivery, setLoadingDelivery] = useState(true)
  const [selectedDelivery, setSelectedDelivery] = useState(null)

  // Right panel: orders for selected delivery boy
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orderSearch, setOrderSearch] = useState("")
  const [paymentFilter, setPaymentFilter] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")

  // Wallet credits for selected delivery boy (actual paid)
  const [walletCreditsMap, setWalletCreditsMap] = useState(new Map())

  // View dialog
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)

  const limit = 12

  const selectedDeliveryId = useMemo(() => {
    return (
      selectedDelivery?.deliveryId ||
      selectedDelivery?.deliveryPartnerId ||
      selectedDelivery?.deliveryIdString ||
      selectedDelivery?._id ||
      selectedDelivery?.id ||
      null
    )
  }, [selectedDelivery])

  const fetchDeliveryBoys = async (overrides = {}) => {
    const p = overrides.page ?? dpPage
    const q = overrides.search ?? dpSearch
    try {
      setLoadingDelivery(true)
      const res = await adminAPI.getDeliveryBoyWallets({
        page: p,
        limit,
        search: q?.trim() || undefined,
      })
      if (res?.data?.success) {
        const data = res.data.data || {}
        setWallets(data.wallets || [])
        const pg = data.pagination || {}
        setDpTotal(pg.total ?? (data.wallets || []).length ?? 0)
        setDpPages(pg.pages ?? 1)
        if (!selectedDelivery && (data.wallets || []).length > 0) {
          setSelectedDelivery(data.wallets[0])
        }
      } else {
        setWallets([])
        toast.error(res?.data?.message || "Failed to load delivery boys")
      }
    } catch (err) {
      console.error("Failed to load delivery boys:", err)
      setWallets([])
      toast.error(err?.response?.data?.message || "Failed to load delivery boys")
    } finally {
      setLoadingDelivery(false)
    }
  }

  useEffect(() => {
    fetchDeliveryBoys({ page: dpPage })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpPage])

  useEffect(() => {
    const t = setTimeout(() => {
      setDpPage(1)
      fetchDeliveryBoys({ page: 1, search: dpSearch })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpSearch])

  const fetchWalletCredits = async () => {
    if (!selectedDeliveryId) return
    try {
      const res = await adminAPI.getDeliveryEarnings({
        deliveryPartnerId: selectedDeliveryId,
        period: "all",
        page: 1,
        limit: 1000,
        fromDate: safeISODate(fromDate) || undefined,
        toDate: safeISODate(toDate) || undefined,
      })
      if (res?.data?.success) {
        const earnings = res.data.data?.earnings || []
        // Key by orderMongoId (preferred) then orderId string
        const m = new Map()
        for (const e of earnings) {
          const key = e.orderMongoId || e.orderId
          if (!key) continue
          // Sum multiple credits for same order if present
          const prev = m.get(String(key)) || 0
          m.set(String(key), prev + Number(e.amount || 0))
        }
        setWalletCreditsMap(m)
      } else {
        setWalletCreditsMap(new Map())
      }
    } catch (err) {
      console.error("Failed to load wallet credits:", err)
      setWalletCreditsMap(new Map())
    }
  }

  const fetchOrders = async () => {
    if (!selectedDeliveryId) return
    try {
      setOrdersLoading(true)
      const params = {
        page: 1,
        limit: 500,
        status: "delivered",
        deliveryPartnerId: selectedDeliveryId,
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
        toast.error(res?.data?.message || "Failed to load delivery history")
      }
    } catch (err) {
      console.error("Failed to load delivery history:", err)
      setOrders([])
      toast.error(err?.response?.data?.message || "Failed to load delivery history")
    } finally {
      setOrdersLoading(false)
    }
  }

  // Fetch orders + credits when selection or date filters change
  useEffect(() => {
    fetchOrders()
    fetchWalletCredits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeliveryId, paymentFilter, fromDate, toDate])

  useEffect(() => {
    const t = setTimeout(() => {
      fetchOrders()
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSearch])

  const ordersWithCredits = useMemo(() => {
    return (orders || []).map((o) => {
      const keyCandidates = [
        o._id,
        o.id,
        o.orderMongoId,
        o.orderId,
      ].filter(Boolean)
      let credit = null
      for (const k of keyCandidates) {
        const v = walletCreditsMap.get(String(k))
        if (v != null) {
          credit = v
          break
        }
      }
      return { ...o, walletCreditAmount: credit }
    })
  }, [orders, walletCreditsMap])

  const stats = useMemo(() => {
    let totalOrders = ordersWithCredits?.length || 0
    let orderTotal = 0
    let restaurantTotal = 0
    let adminTotal = 0
    let deliveryTotal = 0
    let walletCreditTotal = 0
    for (const o of ordersWithCredits || []) {
      const e = o.earnings || {}
      orderTotal += Number(o.totalAmount ?? e.orderTotal ?? 0)
      restaurantTotal += Number(e.restaurantEarning ?? 0)
      adminTotal += Number(e.adminEarning ?? 0)
      deliveryTotal += Number(e.deliveryEarning ?? 0)
      walletCreditTotal += Number(o.walletCreditAmount ?? 0)
    }
    return {
      totalOrders,
      orderTotal,
      restaurantTotal,
      adminTotal,
      deliveryTotal,
      walletCreditTotal,
    }
  }, [ordersWithCredits])

  const onViewOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOpen(true)
  }

  const onPrintOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOpen(true)
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
      "DeliveryEarning",
      "WalletCredit",
      "Diff",
      "Status",
    ]
    const rows = (ordersWithCredits || []).map((o) => {
      const deliveryE = Number(o.earnings?.deliveryEarning ?? 0)
      const walletC = o.walletCreditAmount == null ? "" : Number(o.walletCreditAmount ?? 0)
      const diff = walletC === "" ? "" : Number(walletC) - deliveryE
      return [
        o.orderId,
        o.date || "",
        o.time || "",
        o.paymentType || "",
        o.paymentStatus || "",
        o.totalAmount ?? o.earnings?.orderTotal ?? 0,
        o.earnings?.restaurantEarning ?? 0,
        o.earnings?.adminEarning ?? 0,
        deliveryE,
        walletC,
        diff,
        o.orderStatus || o.status || "",
      ]
    })
    const csv = [header, ...rows]
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `delivery-history-${selectedDelivery?.name || selectedDelivery?.deliveryIdString || "all"}.csv`
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
              <h1 className="text-2xl font-bold text-slate-900">Delivery History</h1>
              <p className="text-sm text-slate-600 mt-1">
                View per-delivery boy delivered orders with end-to-end earnings breakdown and wallet credits.
              </p>
            </div>
          </div>
        </div>

        {/* Split layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Delivery boys list */}
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={dpSearch}
                  onChange={(e) => setDpSearch(e.target.value)}
                  placeholder="Search delivery boys..."
                  className="pl-9"
                />
              </div>

              <div className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {loadingDelivery ? (
                  <div className="py-8 flex items-center justify-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : (wallets || []).map((w) => {
                  const key = w.walletId || w.deliveryId || w.deliveryIdString || w._id
                  const isActive =
                    (selectedDelivery?.walletId && selectedDelivery.walletId === w.walletId) ||
                    (selectedDelivery?.deliveryId && selectedDelivery.deliveryId === w.deliveryId) ||
                    (selectedDelivery?.deliveryIdString && selectedDelivery.deliveryIdString === w.deliveryIdString)
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDelivery(w)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                        isActive
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-sm font-semibold truncate">{w.name || "Delivery Boy"}</div>
                      <div className="text-xs text-slate-500 truncate">{w.deliveryIdString || ""}</div>
                      <div className="text-xs mt-1">
                        <span className="text-slate-500">Total earning:</span>{" "}
                        <span className="font-medium text-emerald-700">
                          {formatCurrency(w.totalEarning)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {dpPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200">
                  <span className="text-xs text-slate-600">
                    Page {dpPage} of {dpPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDpPage((p) => Math.max(1, p - 1))}
                      disabled={dpPage <= 1}
                      className="px-3 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setDpPage((p) => Math.min(dpPages, p + 1))}
                      disabled={dpPage >= dpPages}
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
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Delivery</div>
                <div className="mt-1 text-xl font-bold text-orange-700">{formatCurrency(stats.deliveryTotal)}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Wallet Credit</div>
                <div className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(stats.walletCreditTotal)}</div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-600">Search</label>
                  <Input
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Order ID, customer, phone..."
                  />
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
                  <input
                    type="date"
                    className="mt-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600">To</label>
                  <input
                    type="date"
                    className="mt-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
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
            <DeliveryOrderHistoryTable
              loading={ordersLoading}
              orders={ordersWithCredits}
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

