import { useEffect, useMemo, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { formatRestaurantId } from "@/lib/utils/formatId"
import {
  Building2,
  IndianRupee,
  Loader2,
  Search,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock3,
  Eye,
  Download,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ViewOrderDialog from "../../components/orders/ViewOrderDialog"
import { exportTransactionsToPDF } from "../../components/transactions/transactionsExportUtils"

const formatCurrency = (amount) => {
  if (amount == null) return "₹0.00"
  return `₹${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const cleanDescription = (description) => {
  if (!description) return "—"
  
  // Strip 24-character hexadecimal MongoDB ObjectIds along with common prefixes
  const mongoIdPattern = /(?:Order|Booking|Request\s+ID|Request|ID|Refund|Payment)?\s*[:#\s-]*\b[0-9a-fA-F]{24}\b/gi;
  
  let cleaned = description.replace(mongoIdPattern, "").trim();
  
  // Clean up any remaining leading/trailing punctuation or spacing
  cleaned = cleaned
    .replace(/^[-:#\s~+]+/, "")
    .replace(/[-:#\s~+]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
    
  return cleaned || "Order Payment";
}


export default function RestaurantFinance() {
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const limit = 10

  const [adjustOpen, setAdjustOpen] = useState(false)
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [adjustType, setAdjustType] = useState("bonus")
  const [adjustAmount, setAdjustAmount] = useState("")
  const [adjustNote, setAdjustNote] = useState("")
  const [adjustSaving, setAdjustSaving] = useState(false)

  // History dialog state
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyItems, setHistoryItems] = useState([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPages, setHistoryPages] = useState(1)
  const [deliveredCount, setDeliveredCount] = useState(0)
  const [orderedCount, setOrderedCount] = useState(0)
  const [historyFilter, setHistoryFilter] = useState("all")

  // View Order dialog state
  const [viewOrderOpen, setViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [loadingOrderId, setLoadingOrderId] = useState(null)

  const handleViewOrderDetails = async (orderId) => {
    if (!orderId) return
    try {
      setLoadingOrderId(orderId)
      const res = await adminAPI.getOrderById(orderId)
      if (res?.data?.success) {
        setSelectedOrder(res.data.data.order)
        setViewOrderOpen(true)
      } else {
        toast.error(res?.data?.message || "Failed to fetch order details")
      }
    } catch (err) {
      console.error("Error fetching order details:", err)
      toast.error(err?.response?.data?.message || "Failed to fetch order details")
    } finally {
      setLoadingOrderId(null)
    }
  }

  const fetchData = async (overrides = {}) => {
    const p = overrides.page ?? page
    const q = overrides.search ?? search

    try {
      setLoading(true)
      const res = await adminAPI.getRestaurantWalletOverview({
        search: q?.trim() || undefined,
        page: p,
        limit,
      })

      if (res?.data?.success) {
        const data = res.data.data || {}
        const mapped = (data.restaurants || []).map((r) => ({
          ...r,
          restaurantId: formatRestaurantId(r.restaurantId),
        }))
        setRestaurants(mapped)
        const pg = data.pagination || {}
        setTotal(pg.total ?? (data.restaurants || []).length ?? 0)
        setPages(pg.pages ?? 1)
      } else {
        setRestaurants([])
        toast.error(res?.data?.message || "Failed to load restaurant finance overview")
      }
    } catch (err) {
      console.error("Error fetching restaurant finance overview:", err)
      setRestaurants([])
      toast.error(err?.response?.data?.message || "Failed to load restaurant finance overview")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData({ page })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      fetchData({ page: 1, search })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const filtered = useMemo(() => {
    // Backend already searches, but keep a fast client filter too.
    if (!search.trim()) return restaurants
    const q = search.toLowerCase().trim()
    return restaurants.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.restaurantId?.toLowerCase().includes(q) ||
        (r.phone && !r.phone.startsWith('9199999999') && r.phone.toLowerCase().includes(q)) ||
        (r.ownerPhone && !r.ownerPhone.startsWith('9199999999') && r.ownerPhone.toLowerCase().includes(q)),
    )
  }, [restaurants, search])

  const openAdjust = (restaurant) => {
    setSelectedRestaurant(restaurant)
    setAdjustType("bonus")
    setAdjustAmount("")
    setAdjustNote("")
    setAdjustOpen(true)
  }

  const openHistory = (restaurant) => {
    setSelectedRestaurant(restaurant)
    setHistoryItems([])
    setHistoryPage(1)
    setHistoryPages(1)
    setHistoryFilter("all")
    setDeliveredCount(0)
    setOrderedCount(0)
    setHistoryOpen(true)
  }

  const scrollContainerRef = useRef(null)

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 25) {
      if (!historyLoading && historyPage < historyPages && selectedRestaurant?._id) {
        fetchHistory(selectedRestaurant._id, historyPage + 1, historyFilter, true)
      }
    }
  }

  const fetchHistory = async (restaurantId, p = 1, filterType = historyFilter, append = false) => {
    try {
      setHistoryLoading(true)
      const res = await adminAPI.getRestaurantWalletHistory(restaurantId, {
        page: p,
        limit: 20,
        onlyAdjustments: false,
        type: filterType,
      })
      if (res?.data?.success) {
        const data = res.data.data || {}
        setHistoryItems(prev => append ? [...prev, ...(data.transactions || [])] : (data.transactions || []))
        setDeliveredCount(data.deliveredCount || 0)
        setOrderedCount(data.orderedCount || 0)
        const pg = data.pagination || {}
        setHistoryPage(pg.page ?? p)
        setHistoryPages(pg.pages ?? 1)
      } else {
        toast.error(res?.data?.message || "Failed to fetch restaurant wallet history")
      }
    } catch (err) {
      console.error("Error fetching restaurant wallet history:", err)
      toast.error(err?.response?.data?.message || "Failed to fetch restaurant wallet history")
    } finally {
      setHistoryLoading(false)
    }
  }

  const closeAdjust = () => {
    if (adjustSaving) return
    setAdjustOpen(false)
    setSelectedRestaurant(null)
    setAdjustAmount("")
    setAdjustNote("")
    setAdjustType("bonus")
  }

  const handleAdjustSave = async () => {
    if (!selectedRestaurant?._id) return

    const amt = Number(adjustAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Please enter a valid positive amount")
      return
    }
    if (!["bonus", "deduction"].includes(adjustType)) {
      toast.error("Please select a valid adjustment type")
      return
    }

    try {
      setAdjustSaving(true)
      await adminAPI.adjustRestaurantWallet(selectedRestaurant._id, {
        amount: amt,
        type: adjustType,
        description: adjustNote?.trim() || undefined,
      })
      toast.success("Wallet adjusted successfully")
      closeAdjust()
      // refresh current page with current search
      await fetchData({ page, search })
    } catch (err) {
      console.error("Failed to adjust restaurant wallet:", err)
      toast.error(err?.response?.data?.message || "Failed to adjust wallet")
    } finally {
      setAdjustSaving(false)
    }
  }

  const handleExport = async () => {
    if (filtered.length === 0) {
      toast.error("No data to export.")
      return
    }
    const headers = [
      { key: "sl", label: "SI" },
      { key: "restaurantName", label: "Restaurant Name" },
      { key: "restaurantId", label: "Restaurant ID" },
      { key: "totalEarned", label: "Total Earned" },
      { key: "totalWithdrawn", label: "Total Withdrawn" },
      { key: "availableBalance", label: "Available Balance" },
    ]
    const exportData = filtered.map((r, index) => ({
      sl: index + 1,
      restaurantName: r.name || 'N/A',
      restaurantId: r.restaurantId || 'N/A',
      totalEarned: formatCurrency(r.totalEarned),
      totalWithdrawn: formatCurrency(r.totalWithdrawn),
      availableBalance: formatCurrency(r.totalBalance),
    }))

    try {
      await exportTransactionsToPDF(exportData, headers, "restaurant_finance_overview", "Restaurant Finance Overview Report")
    } catch (err) {
      console.error("Error exporting to PDF:", err)
      toast.error("Failed to generate PDF report")
    }
  }

  useEffect(() => {
    if (!historyOpen || !selectedRestaurant?._id) return
    fetchHistory(selectedRestaurant._id, 1, historyFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, selectedRestaurant?._id, historyFilter])

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Restaurant Finance</h1>
              <p className="text-sm text-slate-600 mt-1">
                View restaurant wallet balances and adjust earnings/deductions.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Wallet Overview</h2>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                {total}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search by name, ID or phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              <button
                type="button"
                onClick={handleExport}
                className="w-full sm:w-auto px-4 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-2 transition-all shadow-xs"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
              <p className="text-slate-600 text-sm">Loading restaurant wallets…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Restaurant
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Restaurant ID
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Total Earned
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Total Withdrawn
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Available Balance
                    </th>
                    <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                          <p className="text-sm font-medium text-slate-600">No restaurants found.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => (
                      <tr key={r._id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-500" />
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{r.name || "N/A"}</p>
                              <p className="text-[11px] text-slate-500">
                                {(() => {
                                  const phone = r.phone || r.ownerPhone;
                                  if (!phone || phone.startsWith('9199999999')) return "—";
                                  return phone;
                                })()}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">
                          {r.restaurantId || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">
                          {formatCurrency(r.totalEarned)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">
                          {formatCurrency(r.totalWithdrawn)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-700">
                          {formatCurrency(r.totalBalance)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openHistory(r)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Clock3 className="w-3 h-3" />
                              History
                            </button>
                            <button
                              type="button"
                              onClick={() => openAdjust(r)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Adjust
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Adjust Dialog */}
      <Dialog open={adjustOpen} onOpenChange={(open) => (open ? setAdjustOpen(true) : closeAdjust())}>
        <DialogContent className="max-w-md bg-white rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-200 bg-slate-50/80">
            <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                <IndianRupee className="w-4 h-4" />
              </span>
              <span className="font-semibold text-slate-900">Adjust Restaurant Wallet</span>
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4">
            {selectedRestaurant && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs md:text-sm text-slate-700 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 truncate">
                    {selectedRestaurant.name || "Restaurant"}
                  </p>
                  <span className="text-[11px] text-slate-500">
                    {selectedRestaurant.restaurantId || ""}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Current balance:{" "}
                  <span className="font-semibold text-emerald-700">
                    {formatCurrency(selectedRestaurant.totalBalance)}
                  </span>
                </p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustType("bonus")}
                  className={`h-10 rounded-lg border px-3 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${adjustType === "bonus"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Credit
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType("deduction")}
                  className={`h-10 rounded-lg border px-3 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${adjustType === "deduction"
                      ? "border-rose-600 bg-rose-50 text-rose-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  Deduct
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Amount</p>
              <Input
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="Enter amount"
                inputMode="decimal"
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Note (optional)</p>
              <Input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="Reason / note"
                className="h-10"
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-slate-200 bg-white flex gap-2">
            <Button
              variant="outline"
              onClick={closeAdjust}
              disabled={adjustSaving}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdjustSave}
              disabled={adjustSaving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              {adjustSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg bg-white rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-200 bg-slate-50/80">
            <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <Clock3 className="w-4 h-4" />
              </span>
              <span className="font-semibold text-slate-900">Wallet History</span>
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4">
            {selectedRestaurant && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs md:text-sm text-slate-700 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 truncate">
                    {selectedRestaurant.name || "Restaurant"}
                  </p>
                  <span className="text-[11px] text-slate-500">
                    {selectedRestaurant.restaurantId || ""}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-1.5 text-xs text-slate-600">
                  <span>Delivered: <strong className="text-emerald-700 font-semibold">{deliveredCount}</strong></span>
                  <span>Total Ordered: <strong className="text-indigo-700 font-semibold">{orderedCount}</strong></span>
                  <span className="text-right">Total Revenue: <strong className="text-slate-900 font-bold">{formatCurrency(selectedRestaurant.totalEarned)}</strong></span>
                </div>
              </div>
            )}

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 border-b border-slate-100 scrollbar-none md:scrollbar-thin">
              {[
                { label: "All", value: "all" },
                { label: "Ordered / Delivered", value: "payment" },
                { label: "Credits", value: "credit" },
                { label: "Deductions", value: "deduction" },
                { label: "Withdrawals", value: "withdrawal" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setHistoryFilter(tab.value)
                    setHistoryPage(1)
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all duration-200 ${
                    historyFilter === tab.value
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {historyLoading && historyPage === 1 ? (
              <div className="py-10 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">Loading history…</p>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-slate-700 font-semibold">No history</p>
                <p className="text-slate-500 text-sm">No transactions found.</p>
              </div>
            ) : (
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="space-y-2.5 max-h-[380px] overflow-auto pr-1"
              >
                {historyItems.map((t, index) => {
                  const sNo = index + 1
                  const isCredit = ["payment", "bonus", "refund"].includes(t?.type)
                  const title = t?.type === "payment"
                    ? "Order Payment"
                    : t?.type === "bonus"
                      ? "Credit"
                      : t?.type === "deduction"
                        ? "Deduction"
                        : t?.type === "refund"
                          ? "Refund"
                          : t?.type === "withdrawal"
                            ? "Withdrawal"
                            : (t?.type || "Transaction")
                  const when = t?.date ? new Date(t.date).toLocaleString("en-IN") : "—"
                  return (
                    <div key={t.id || index} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-500 shadow-3xs" title={`Serial Number: ${sNo}`}>
                              {sNo}
                            </span>
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${t?.type === "payment"
                                ? "bg-emerald-50 text-emerald-700"
                                : t?.type === "bonus"
                                  ? "bg-blue-50 text-blue-700"
                                  : t?.type === "refund"
                                    ? "bg-amber-50 text-amber-700"
                                    : t?.type === "withdrawal"
                                      ? "bg-purple-50 text-purple-700"
                                      : "bg-rose-50 text-rose-700"
                              }`}>
                              {title}
                            </span>
                            {t?.orderId && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={loadingOrderId !== null}
                                  onClick={() => handleViewOrderDetails(t.orderId)}
                                  className="inline-flex items-center justify-center p-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors disabled:opacity-50"
                                  title="View Order Details"
                                >
                                  {loadingOrderId === t.orderId ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Eye className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">{cleanDescription(t.description)}</p>
                          {t?.processedBy?.name && (
                            <p className="text-[11px] text-slate-500">
                              By: <span className="font-medium text-slate-700">{t.processedBy.name}</span>
                            </p>
                          )}
                          <p className="text-[11px] font-medium text-slate-500 mt-1">
                            Wallet Balance: <span className="text-slate-900 font-semibold">{formatCurrency(t.balanceAfter)}</span>
                          </p>
                        </div>
                        <div className="text-right flex flex-col justify-between h-full min-h-[40px]">
                          <p className={`text-sm font-bold ${isCredit ? "text-emerald-700" : "text-rose-700"}`}>
                            {t?.amount != null ? `${isCredit ? "+" : "−"}${formatCurrency(Math.abs(Number(t.amount)))}` : "—"}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1">{when}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {historyLoading && historyPage > 1 && (
                  <div className="py-4 text-center flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                    <span className="text-xs text-slate-500">Loading more...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 pb-5 pt-3 border-t border-slate-200 flex items-center justify-end bg-slate-50/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setHistoryOpen(false)
                setHistoryItems([])
              }}
              className="h-9 px-4 text-sm"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ViewOrderDialog
        isOpen={viewOrderOpen}
        onOpenChange={setViewOrderOpen}
        order={selectedOrder}
        onPaymentApproved={() => { }}
      />
    </div>
  )
}

