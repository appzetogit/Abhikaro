import { useEffect, useMemo, useState } from "react"
import { adminAPI } from "@/lib/api"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Search, Users, Store, Package, Building2, Wallet, IndianRupee } from "lucide-react"
import ViewOrderDialog from "../components/orders/ViewOrderDialog"

function formatCurrency(amount) {
  const n = Number(amount || 0)
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

function formatDate(d) {
  if (!d) return "—"
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return "—"
  return dt.toLocaleString("en-IN")
}

function defaultRange(days = 30) {
  const end = new Date()
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const toISO = (x) => x.toISOString().slice(0, 10)
  return { startDate: toISO(start), endDate: toISO(end) }
}

function EmptyState({ title, subtitle }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {subtitle ? <p className="mt-1 max-w-md text-sm text-slate-600">{subtitle}</p> : null}
    </div>
  )
}

function ListRow({ title, subtitle, meta, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group w-full rounded-xl border p-3 text-left shadow-sm transition",
        active
          ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 truncate text-xs text-slate-600">{subtitle}</p>
        </div>
        {meta ? (
          <span
            className={[
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              active ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-700",
            ].join(" ")}
          >
            {meta}
          </span>
        ) : null}
      </div>
    </button>
  )
}

function OrdersTable({ orders = [], onView, showAmount = false }) {
  if (!orders?.length) {
    return <EmptyState title="No orders found" subtitle="Try changing date range or search filters." />
  }

  const getPayLabel = (o) => {
    // Admin orders API already provides a normalized string for display.
    // Prefer it so we match backend logic exactly.
    const paymentType = typeof o?.paymentType === "string" ? o.paymentType.trim() : ""
    if (paymentType) return paymentType

    const method = String(o?.payment?.method || "").toLowerCase()
    const isHotel = !!(o?.hotelReference || o?.hotelId || o?.hotelName)

    if (method === "wallet") return "Wallet"

    if (method === "pay_at_hotel") {
      const collected = o?.cashCollected === true
      return collected ? "Pay at Hotel (Collected)" : "Pay at Hotel (Cash)"
    }

    if (method === "cash") {
      return isHotel ? "Hotel (Cash)" : "Cash"
    }

    if (method === "razorpay") {
      return isHotel ? "Hotel (Online • Razorpay)" : "Online • Razorpay"
    }

    if (method === "upi") {
      return isHotel ? "Hotel (Online • UPI)" : "Online • UPI"
    }

    if (method === "card") {
      return isHotel ? "Hotel (Online • Card)" : "Online • Card"
    }

    return method ? method.toUpperCase() : "—"
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="min-w-[820px]">
        <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">
          <div className="col-span-5">Order</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-4">Date</div>
          <div className="col-span-1 text-right">Action</div>
        </div>
        <div className="divide-y divide-slate-100">
          {orders.map((o) => (
            <div key={o._id || o.orderId} className="grid grid-cols-12 items-center px-4 py-3 text-sm">
              <div className="col-span-5 min-w-0">
                <p className="truncate font-semibold text-slate-900">{o.orderId || o._id}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {`Pay: ${getPayLabel(o)}`}
                  {o.paymentStatus ? ` • ${o.paymentStatus}` : o.payment?.status ? ` • ${o.payment.status}` : ""}
                </p>
                {showAmount ? (
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Amount:{" "}
                    <span className="font-semibold text-slate-700">
                      {formatCurrency(
                        o?.totalAmount ??
                          o?.pricing?.total ??
                          o?.amount?.total ??
                          o?.amount?.paidAmount ??
                          0,
                      )}
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="col-span-2">
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {String(o.status || "—")}
                </span>
              </div>
              <div className="col-span-4 text-xs text-slate-600">{formatDate(o.createdAt)}</div>
              <div className="col-span-1 text-right">
                <Button size="sm" variant="outline" onClick={() => onView?.(o)}>
                  View
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WalletTxTable({ title, rows = [] }) {
  if (!rows?.length) {
    return <EmptyState title={`No ${title} found`} subtitle="There are no wallet entries in this range." />
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="min-w-[820px]">
        <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">
          <div className="col-span-2">Type</div>
          <div className="col-span-6">Description</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-2 text-right">Date</div>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map((t, idx) => (
            <div key={t.id || t._id || idx} className="grid grid-cols-12 items-center px-4 py-3 text-sm">
              <div className="col-span-2">
                {(() => {
                  const raw = String(t.type || "—").toLowerCase()
                  const isCredit = raw === "bonus" || raw === "credited"
                  const isDebit = raw === "deduction" || raw === "deducted"
                  const label = raw === "bonus" ? "Credited" : raw === "deduction" ? "Deducted" : String(t.type || "—")
                  const cls = isCredit
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : isDebit
                      ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                      : "bg-slate-100 text-slate-700"
                  return (
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
                      {label}
                    </span>
                  )
                })()}
              </div>
              <div className="col-span-6 min-w-0">
                <p className="truncate text-slate-900">{t.description || "—"}</p>
                {t.orderId ? <p className="mt-0.5 truncate text-xs text-slate-500">Order: {t.orderId}</p> : null}
              </div>
              <div className="col-span-2 text-right font-semibold text-slate-900">{formatCurrency(t.amount)}</div>
              <div className="col-span-2 text-right text-xs text-slate-600">{formatDate(t.date || t.createdAt)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function History() {
  const [activeTab, setActiveTab] = useState("customers")

  // shared order view dialog
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [viewLoading, setViewLoading] = useState(false)

  const openOrder = async (o) => {
    const identifier = o?.orderId || o?.id || o?._id || null
    if (!identifier) return

    try {
      setViewLoading(true)
      // Fetch a fully transformed admin-order row so ViewOrderDialog shows complete breakdown.
      // (The /admin/orders list endpoint returns the exact shape expected by ViewOrderDialog.)
      const res = await adminAPI.getOrders({
        page: 1,
        limit: 5,
        search: String(identifier),
      })
      const orders = res?.data?.data?.orders || []
      const found =
        orders.find((x) => String(x.orderId) === String(identifier)) ||
        orders.find((x) => String(x.id) === String(identifier)) ||
        orders[0] ||
        null

      if (found) {
        setSelectedOrder(found)
        setIsViewOpen(true)
      } else {
        setSelectedOrder(o)
        setIsViewOpen(true)
      }
    } catch (e) {
      console.error(e)
      setSelectedOrder(o)
      setIsViewOpen(true)
    } finally {
      setViewLoading(false)
    }
  }

  const closeOrder = () => {
    setIsViewOpen(false)
    setSelectedOrder(null)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">History</h1>
              <p className="text-sm text-slate-600 mt-1">
                Check customer, restaurant, delivery and hotel history along with wallet credits and earnings.
              </p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
            <TabsList className="grid w-full grid-cols-4 rounded-xl bg-slate-50/70 p-1.5 ">
              <TabsTrigger
                value="customers"
                className="group h-11 gap-2 rounded-lg text-sm font-semibold text-slate-700 transition hover:bg-white/60 data-[state=active]:!bg-red-600 data-[state=active]:!text-white data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-red-200 data-[state=active]:shadow-red-100"
              >
                <Users className="h-4 w-4 text-slate-500 group-data-[state=active]:text-white" />
                Customers
              </TabsTrigger>
              <TabsTrigger
                value="restaurants"
                className="group h-11 gap-2 rounded-lg text-sm font-semibold text-slate-700 transition hover:bg-white/60 data-[state=active]:!bg-red-600 data-[state=active]:!text-white data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-red-200 data-[state=active]:shadow-red-100"
              >
                <Store className="h-4 w-4 text-slate-500 group-data-[state=active]:text-white" />
                Restaurants
              </TabsTrigger>
              <TabsTrigger
                value="delivery"
                className="group h-11 gap-2 rounded-lg text-sm font-semibold text-slate-700 transition hover:bg-white/60 data-[state=active]:!bg-red-600 data-[state=active]:!text-white data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-red-200 data-[state=active]:shadow-red-100"
              >
                <Package className="h-4 w-4 text-slate-500 group-data-[state=active]:text-white" />
                Delivery
              </TabsTrigger>
              <TabsTrigger
                value="hotels"
                className="group h-11 gap-2 rounded-lg text-sm font-semibold text-slate-700 transition hover:bg-white/60 data-[state=active]:!bg-red-600 data-[state=active]:!text-white data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-red-200 data-[state=active]:shadow-red-100"
              >
                <Building2 className="h-4 w-4 text-slate-500 group-data-[state=active]:text-white" />
                Hotels
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="customers" className="mt-4">
            <CustomerHistory onViewOrder={openOrder} />
          </TabsContent>
          <TabsContent value="restaurants" className="mt-4">
            <RestaurantHistoryTab onViewOrder={openOrder} />
          </TabsContent>
          <TabsContent value="delivery" className="mt-4">
            <DeliveryHistoryTab onViewOrder={openOrder} />
          </TabsContent>
          <TabsContent value="hotels" className="mt-4">
            <HotelHistoryTab onViewOrder={openOrder} />
          </TabsContent>
        </Tabs>
      </div>

      <ViewOrderDialog
        isOpen={isViewOpen}
        onOpenChange={(v) => {
          if (!v) closeOrder()
          else setIsViewOpen(true)
        }}
        order={selectedOrder}
        onPaymentApproved={() => {
          // No-op for this page; individual tabs refresh on selection/date changes.
        }}
      />
    </div>
  )
}

function CustomerHistory({ onViewOrder }) {
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)

  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orders, setOrders] = useState([])

  const [range, setRange] = useState(() => defaultRange(30))

  const selectedUserId = selected?._id || selected?.id || null

  const fetchUsers = async (q = "") => {
    try {
      setLoading(true)
      const res = await adminAPI.getUsers({ limit: 50, offset: 0, search: q || undefined })
      if (res?.data?.success) {
        const list = res.data.data?.users || res.data.data || []
        const normalized = (Array.isArray(list) ? list : []).map((u) => {
          // Admin users API returns `id` (string), not `_id`
          const id = u?._id || u?.id || null
          return {
            ...u,
            _id: id,
          }
        })
        setUsers(normalized)
        if (!selected && normalized.length) setSelected(normalized[0])
      } else {
        setUsers([])
      }
    } catch (e) {
      console.error(e)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchUsers(search.trim()), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const fetchOrders = async () => {
    if (!selectedUserId) return
    try {
      setOrdersLoading(true)
      const res = await adminAPI.getOrders({
        page: 1,
        limit: 200,
        userId: selectedUserId,
        fromDate: range.startDate,
        toDate: range.endDate,
      })
      if (res?.data?.success) {
        setOrders(res.data.data?.orders || [])
      } else {
        setOrders([])
      }
    } catch (e) {
      console.error(e)
      setOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, range.startDate, range.endDate])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <Card className="lg:col-span-4 shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" /> Customers
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, email"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
              <p className="text-sm text-slate-600">Loading customers…</p>
            </div>
          ) : users.length ? (
            <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
              {users.map((u) => (
                <ListRow
                  key={u._id || u.id || u.email || u.phone}
                  title={u.name || "—"}
                  subtitle={`${u.phone || "—"} • ${u.email || "—"}`}
                  active={(selected?._id || selected?.id) === (u._id || u.id)}
                  onClick={() => setSelected(u)}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No customers found" subtitle="Try a different search term." />
          )}
        </CardContent>
      </Card>

      <div className="lg:col-span-8 space-y-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Customer details</CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {selected ? `${selected.name || "—"} (${selected.phone || "—"})` : "Select a customer"}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">From</span>
                <Input
                  type="date"
                  value={range.startDate}
                  onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">To</span>
                <Input
                  type="date"
                  value={range.endDate}
                  onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Orders (range)</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{orders?.length || 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Total order value (range)</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatCurrency((orders || []).reduce((s, o) => s + (Number(o?.pricing?.total) || 0), 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-indigo-600" /> Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
                <p className="text-sm text-slate-600">Loading orders…</p>
              </div>
            ) : (
              <OrdersTable orders={orders} onView={onViewOrder} showAmount />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RestaurantHistoryTab({ onViewOrder }) {
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [range, setRange] = useState(() => defaultRange(30))
  const [detailTab, setDetailTab] = useState("settlement")

  const [reportLoading, setReportLoading] = useState(false)
  const [reportRows, setReportRows] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orders, setOrders] = useState([])
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletTx, setWalletTx] = useState([])

  const fetchList = async (q = "") => {
    try {
      setLoading(true)
      const res = await adminAPI.getRestaurantWalletOverview({ search: q || undefined, page: 1, limit: 20 })
      if (res?.data?.success) {
        const rows = res.data.data?.restaurants || []
        setItems(rows)
        if (!selected && rows.length) setSelected(rows[0])
      } else {
        setItems([])
      }
    } catch (e) {
      console.error(e)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchList(search.trim()), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const fetchWallet = async () => {
    if (!selected?._id) return
    try {
      setWalletLoading(true)
      const res = await adminAPI.getRestaurantWalletHistory(selected._id, { page: 1, limit: 50, onlyAdjustments: false })
      if (res?.data?.success) setWalletTx(res.data.data?.transactions || [])
      else setWalletTx([])
    } catch (e) {
      console.error(e)
      setWalletTx([])
    } finally {
      setWalletLoading(false)
    }
  }

  const fetchOrders = async () => {
    if (!selected?._id) return
    try {
      setOrdersLoading(true)
      const res = await adminAPI.getOrders({
        page: 1,
        limit: 200,
        restaurant: selected._id,
        fromDate: range.startDate,
        toDate: range.endDate,
      })
      if (res?.data?.success) setOrders(res.data.data?.orders || [])
      else setOrders([])
    } catch (e) {
      console.error(e)
      setOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }

  const fetchReport = async () => {
    if (!selected?._id) return
    try {
      setReportLoading(true)
      const res = await adminAPI.getRestaurantSettlementReport(selected._id, {
        startDate: range.startDate,
        endDate: range.endDate,
      })
      if (res?.data?.success) {
        const report = res.data.data?.report || {}
        const settlements = report?.settlements || report?.rows || report?.items || []
        setReportRows(Array.isArray(settlements) ? settlements : [])
      } else {
        setReportRows([])
      }
    } catch (e) {
      // Settlement report needs date range; if missing/invalid, show empty but not noisy.
      console.error(e)
      setReportRows([])
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    fetchWallet()
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?._id, range.startDate, range.endDate])

  const settlementCreditRows = useMemo(() => {
    // Primary source: settlement report (OrderSettlement) when available
    if (Array.isArray(reportRows) && reportRows.length > 0) {
      return reportRows.map((r) => ({
        id: r?._id || r?.orderNumber || r?.orderId,
        type: "order_credit",
        description: "Net earning credited",
        amount: Number(r?.netEarning ?? r?.restaurantEarning?.netEarning ?? 0) || 0,
        date: r?.orderDate || r?.createdAt || null,
        orderId: r?.orderNumber || r?.orderId || null,
      }))
    }

    // Fallback: restaurant wallet transactions (type=payment) for credited orders
    const tx = Array.isArray(walletTx) ? walletTx : []
    return tx
      .filter((t) => String(t?.type || "").toLowerCase() === "payment")
      .filter((t) => String(t?.status || "").toLowerCase() === "completed")
      .map((t) => ({
        id: t.id,
        type: "order_credit",
        description: t.description || "Order earning credited",
        amount: Number(t.amount) || 0,
        date: t.date || null,
        orderId: t.orderId || null,
      }))
  }, [reportRows, walletTx])

  const creditTotal = useMemo(() => {
    return (settlementCreditRows || []).reduce((s, r) => s + (Number(r?.amount) || 0), 0)
  }, [settlementCreditRows])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <Card className="lg:col-span-4 shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="h-4 w-4 text-indigo-600" /> Restaurants
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search restaurant" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
              <p className="text-sm text-slate-600">Loading restaurants…</p>
            </div>
          ) : items.length ? (
            <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
              {items.map((r) => (
                <ListRow
                  key={r._id}
                  title={r.name || "—"}
                  subtitle={`${r.phone || r.ownerPhone || "—"} • ID: ${r.restaurantId || "—"}`}
                  meta={formatCurrency(r.totalBalance)}
                  active={selected?._id === r._id}
                  onClick={() => setSelected(r)}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No restaurants found" subtitle="Try a different search term." />
          )}
        </CardContent>
      </Card>

      <div className="lg:col-span-8 space-y-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Restaurant earnings</CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {selected ? `${selected.name || "—"} (${selected.restaurantId || "—"})` : "Select a restaurant"}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">From</span>
                <Input type="date" value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} className="h-9" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">To</span>
                <Input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} className="h-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Orders (range)</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{orders?.length || 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Wallet balance</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(selected?.totalBalance || 0)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Credits from orders (range)</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(creditTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList className="grid w-full grid-cols-3 rounded-xl bg-slate-50/70 p-1.5">
                <TabsTrigger
                  value="settlement"
                  className="h-10 rounded-lg text-sm font-semibold text-slate-700 transition data-[state=active]:!bg-red-600 data-[state=active]:!text-white data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-red-200"
                >
                  Settlement orders
                </TabsTrigger>
                <TabsTrigger
                  value="orders"
                  className="h-10 rounded-lg text-sm font-semibold text-slate-700 transition data-[state=active]:!bg-red-600 data-[state=active]:!text-white data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-red-200"
                >
                  Orders
                </TabsTrigger>
                <TabsTrigger
                  value="wallet"
                  className="h-10 rounded-lg text-sm font-semibold text-slate-700 transition data-[state=active]:!bg-red-600 data-[state=active]:!text-white data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-red-200"
                >
                  Wallet history
                </TabsTrigger>
              </TabsList>

              <TabsContent value="settlement" className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <IndianRupee className="h-4 w-4 text-indigo-600" />
                  <p className="text-sm font-semibold text-slate-900">Settlement credits (per order)</p>
                </div>
                {reportLoading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
                    <p className="text-sm text-slate-600">Loading settlement credits…</p>
                  </div>
                ) : (
                  <WalletTxTable title="settlement rows" rows={settlementCreditRows} />
                )}
              </TabsContent>

              <TabsContent value="orders" className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <IndianRupee className="h-4 w-4 text-indigo-600" />
                  <p className="text-sm font-semibold text-slate-900">Orders</p>
                </div>
                {ordersLoading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
                    <p className="text-sm text-slate-600">Loading orders…</p>
                  </div>
                ) : (
                  <OrdersTable orders={orders} onView={onViewOrder} />
                )}
              </TabsContent>

              <TabsContent value="wallet" className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="h-4 w-4 text-indigo-600" />
                  <p className="text-sm font-semibold text-slate-900">Wallet history</p>
                </div>
                {walletLoading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
                    <p className="text-sm text-slate-600">Loading wallet history…</p>
                  </div>
                ) : (
                  <WalletTxTable title="wallet entries" rows={walletTx} />
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DeliveryHistoryTab({ onViewOrder }) {
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [range, setRange] = useState(() => defaultRange(30))
  const [detailTab, setDetailTab] = useState("settlement")

  const [reportLoading, setReportLoading] = useState(false)
  const [reportRows, setReportRows] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orders, setOrders] = useState([])
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletTx, setWalletTx] = useState([])

  const fetchList = async (q = "") => {
    try {
      setLoading(true)
      const res = await adminAPI.getDeliveryBoyWallets({ search: q || undefined, page: 1, limit: 20 })
      if (res?.data?.success) {
        const rows = res.data.data?.wallets || []
        setItems(rows)
        if (!selected && rows.length) setSelected(rows[0])
      } else {
        setItems([])
      }
    } catch (e) {
      console.error(e)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchList(search.trim()), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const fetchOrders = async () => {
    if (!selected?.deliveryId) return
    try {
      setOrdersLoading(true)
      const res = await adminAPI.getOrders({
        page: 1,
        limit: 200,
        deliveryPartnerId: selected.deliveryId,
        fromDate: range.startDate,
        toDate: range.endDate,
      })
      if (res?.data?.success) setOrders(res.data.data?.orders || [])
      else setOrders([])
    } catch (e) {
      console.error(e)
      setOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }

  const fetchWallet = async () => {
    if (!selected?.walletId) return
    try {
      setWalletLoading(true)
      const res = await adminAPI.getDeliveryBoyWalletHistory(selected.walletId, { page: 1, limit: 50, onlyAdjustments: false })
      if (res?.data?.success) setWalletTx(res.data.data?.transactions || [])
      else setWalletTx([])
    } catch (e) {
      console.error(e)
      setWalletTx([])
    } finally {
      setWalletLoading(false)
    }
  }

  const fetchReport = async () => {
    if (!selected?.deliveryId) return
    try {
      setReportLoading(true)
      const res = await adminAPI.getDeliverySettlementReport(selected.deliveryId, {
        startDate: range.startDate,
        endDate: range.endDate,
      })
      if (res?.data?.success) {
        const report = res.data.data?.report || {}
        const settlements = report?.settlements || report?.rows || report?.items || []
        setReportRows(Array.isArray(settlements) ? settlements : [])
      } else {
        setReportRows([])
      }
    } catch (e) {
      console.error(e)
      setReportRows([])
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    fetchWallet()
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.deliveryId, selected?.walletId, range.startDate, range.endDate])

  const settlementCreditRows = useMemo(() => {
    // Prefer official settlement report (credited rows). If empty, fall back to wallet "payment" tx.
    if (Array.isArray(reportRows) && reportRows.length > 0) {
      return reportRows.map((r) => ({
        id: r?._id || r?.orderNumber || r?.orderId,
        type: "order_credit",
        description: "Delivery earning credited",
        amount: Number(r?.deliveryPartnerEarning?.totalEarning ?? r?.totalEarning ?? 0) || 0,
        date: r?.orderDate || r?.createdAt || null,
        orderId: r?.orderNumber || r?.orderId || null,
      }))
    }

    const tx = Array.isArray(walletTx) ? walletTx : []
    const earningTx = tx.filter((t) => t?.type === "payment" && (t?.orderId || t?.metadata?.orderId))
    return earningTx.map((t) => ({
      id: t?.id,
      type: "order_credit",
      description: t?.description || "Delivery earning credited",
      amount: Number(t?.amount ?? 0) || 0,
      date: t?.date || null,
      orderId: t?.orderId || t?.metadata?.orderId || null,
    }))
  }, [reportRows, walletTx])

  const creditTotal = useMemo(() => {
    const rows = Array.isArray(settlementCreditRows) ? settlementCreditRows : []
    return rows.reduce((s, r) => s + (Number(r?.amount ?? 0) || 0), 0)
  }, [settlementCreditRows])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <Card className="lg:col-span-4 shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-indigo-600" /> Delivery partners
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search delivery partner" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
              <p className="text-sm text-slate-600">Loading delivery partners…</p>
            </div>
          ) : items.length ? (
            <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
              {items.map((d) => (
                <ListRow
                  key={d.walletId || d.deliveryId}
                  title={d.name || "—"}
                  subtitle={`${d.phone || "—"} • ID: ${d.deliveryIdString || d.deliveryId}`}
                  meta={formatCurrency(d.pocketBalance)}
                  active={selected?.walletId === d.walletId}
                  onClick={() => setSelected(d)}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No delivery partners found" subtitle="Try a different search term." />
          )}
        </CardContent>
      </Card>

      <div className="lg:col-span-8 space-y-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Delivery earnings</CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {selected ? `${selected.name || "—"} (${selected.deliveryIdString || selected.deliveryId || "—"})` : "Select a delivery partner"}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">From</span>
                <Input type="date" value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} className="h-9" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">To</span>
                <Input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} className="h-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Orders (range)</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{orders?.length || 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Pocket balance</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(selected?.pocketBalance || 0)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Credits from orders (range)</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(creditTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList className="grid w-full grid-cols-3 rounded-xl bg-slate-50/70 p-1.5">
                <TabsTrigger
                  value="settlement"
                  className="h-10 rounded-lg text-sm font-semibold text-slate-700 transition data-[state=active]:!bg-red-600 data-[state=active]:!text-white data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-red-200"
                >
                  Settlement orders
                </TabsTrigger>
                <TabsTrigger
                  value="orders"
                  className="h-10 rounded-lg text-sm font-semibold text-slate-700 transition data-[state=active]:!bg-red-600 data-[state=active]:!text-white data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-red-200"
                >
                  Orders
                </TabsTrigger>
                <TabsTrigger
                  value="wallet"
                  className="h-10 rounded-lg text-sm font-semibold text-slate-700 transition data-[state=active]:!bg-red-600 data-[state=active]:!text-white data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-red-200"
                >
                  Wallet history
                </TabsTrigger>
              </TabsList>

              <TabsContent value="settlement" className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <IndianRupee className="h-4 w-4 text-indigo-600" />
                  <p className="text-sm font-semibold text-slate-900">Settlement credits (per order)</p>
                </div>
                {reportLoading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
                    <p className="text-sm text-slate-600">Loading settlement credits…</p>
                  </div>
                ) : (
                  <WalletTxTable
                    title="settlement rows"
                    rows={settlementCreditRows}
                  />
                )}
              </TabsContent>

              <TabsContent value="orders" className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <IndianRupee className="h-4 w-4 text-indigo-600" />
                  <p className="text-sm font-semibold text-slate-900">Orders</p>
                </div>
                {ordersLoading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
                    <p className="text-sm text-slate-600">Loading orders…</p>
                  </div>
                ) : (
                  <OrdersTable orders={orders} onView={onViewOrder} />
                )}
              </TabsContent>

              <TabsContent value="wallet" className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="h-4 w-4 text-indigo-600" />
                  <p className="text-sm font-semibold text-slate-900">Wallet history</p>
                </div>
                {walletLoading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
                    <p className="text-sm text-slate-600">Loading wallet history…</p>
                  </div>
                ) : (
                  <WalletTxTable title="wallet entries" rows={walletTx} />
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function HotelHistoryTab({ onViewOrder }) {
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [range, setRange] = useState(() => defaultRange(30))
  const [txLoading, setTxLoading] = useState(false)
  const [txRows, setTxRows] = useState([])

  const fetchList = async (q = "") => {
    try {
      setLoading(true)
      const res = await adminAPI.getHotelWalletOverview({ search: q || undefined, page: 1, limit: 20 })
      if (res?.data?.success) {
        const rows = (res.data.data?.hotels || []).map((h) => ({
          ...h,
          // Normalize mongo id
          _id: h?._id || h?.id || h?.hotelId || null,
        }))
        setItems(rows)
        if (!selected && rows.length) setSelected(rows[0])
      } else {
        setItems([])
      }
    } catch (e) {
      console.error(e)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchList(search.trim()), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const fetchTransactions = async () => {
    const hotelMongoId = selected?._id || selected?.hotelId || null
    if (!hotelMongoId) return
    try {
      setTxLoading(true)
      const res = await adminAPI.getHotelWalletTransactions(hotelMongoId, {
        startDate: range.startDate,
        endDate: range.endDate,
        limit: 50,
      })
      if (res?.data?.success) {
        const rows = res.data.data?.transactions || []
        setTxRows(Array.isArray(rows) ? rows : [])
      } else {
        setTxRows([])
      }
    } catch (e) {
      console.error(e)
      setTxRows([])
    } finally {
      setTxLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.hotelId, range.startDate, range.endDate])

  const availableBalance = selected?.availableBalance ?? selected?.totalAvailableBalance ?? 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <Card className="lg:col-span-4 shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-600" /> Hotels
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hotel" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
              <p className="text-sm text-slate-600">Loading hotels…</p>
            </div>
          ) : items.length ? (
            <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
              {items.map((h) => (
                <ListRow
                  key={h._id || h.hotelId}
                  title={h.hotelName || "—"}
                  subtitle={`${h.phone || "—"} • ID: ${h.hotelCode || h.hotelId || "—"}`}
                  meta={formatCurrency(h.availableBalance ?? h.totalAvailableBalance ?? 0)}
                  active={String(selected?._id || selected?.hotelId || "") === String(h._id || h.hotelId || "")}
                  onClick={() => setSelected(h)}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No hotels found" subtitle="Try a different search term." />
          )}
        </CardContent>
      </Card>

      <div className="lg:col-span-8 space-y-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Hotel transactions</CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {selected ? `${selected.hotelName || "—"} (${selected.hotelCode || selected.hotelId || "—"})` : "Select a hotel"}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">From</span>
                <Input
                  type="date"
                  value={range.startDate}
                  onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">To</span>
                <Input
                  type="date"
                  value={range.endDate}
                  onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Transactions (range)</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{txRows?.length || 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Latest status</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{txRows?.[0]?.status || "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-600">Available balance</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatCurrency(availableBalance)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-indigo-600" /> Transaction history
            </CardTitle>
          </CardHeader>
          <CardContent>
            {txLoading ? (
              <div className="py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-3" />
                <p className="text-sm text-slate-600">Loading transactions…</p>
              </div>
            ) : (
              <WalletTxTable
                title="hotel tx"
                rows={(txRows || []).map((t) => ({
                  id: t?._id || t?.id,
                  type: t?.type || "—",
                  description: t?.description || "—",
                  amount: Number(t?.amount ?? 0) || 0,
                  date: t?.createdAt || t?.processedAt || null,
                  orderId: t?.orderNumber || t?.orderId || null,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

