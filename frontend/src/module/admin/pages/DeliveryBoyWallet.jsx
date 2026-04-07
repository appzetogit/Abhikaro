import { useState, useEffect } from "react"
import { Search, PiggyBank, Loader2, Package, Edit2, IndianRupee, Clock3 } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

const formatCurrency = (amount) => {
  if (amount == null) return "₹0.00"
  return `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function DeliveryBoyWallet() {
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const limit = 20

  // Edit dialog state
  const [selectedWallet, setSelectedWallet] = useState(null)
  const [isAdjustOpen, setIsAdjustOpen] = useState(false)
  const [pocketAdjustType, setPocketAdjustType] = useState("credit") // credit | deduct
  const [pocketAdjustAmount, setPocketAdjustAmount] = useState("")
  const [cashAdjustType, setCashAdjustType] = useState("credit") // credit | deduct
  const [cashAdjustAmount, setCashAdjustAmount] = useState("")
  const [savingAdjustment, setSavingAdjustment] = useState(false)

  // History dialog state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyItems, setHistoryItems] = useState([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPages, setHistoryPages] = useState(1)

  const fetchWallets = async (overrides = {}) => {
    const p = overrides.page ?? page
    try {
      setLoading(true)
      const res = await adminAPI.getDeliveryBoyWallets({
        search: searchQuery.trim() || undefined,
        page: p,
        limit,
      })
      if (res?.data?.success) {
        const data = res.data.data
        setWallets(data?.wallets || [])
        setTotal(data?.pagination?.total ?? 0)
        setPages(data?.pagination?.pages ?? 1)
      } else {
        toast.error(res?.data?.message || "Failed to fetch delivery boy wallets")
        setWallets([])
      }
    } catch (err) {
      console.error("Error fetching delivery boy wallets:", err)
      toast.error(err?.response?.data?.message || "Failed to fetch delivery boy wallets")
      setWallets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWallets()
  }, [page])

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      fetchWallets({ page: 1 })
    }, 500)
    return () => clearTimeout(t)
  }, [searchQuery])

  const openAdjustDialog = (wallet) => {
    setSelectedWallet(wallet)
    setPocketAdjustType("credit")
    setPocketAdjustAmount("")
    setCashAdjustType("credit")
    setCashAdjustAmount("")
    setIsAdjustOpen(true)
  }

  const openHistoryDialog = async (wallet) => {
    setSelectedWallet(wallet)
    setHistoryItems([])
    setHistoryPage(1)
    setHistoryPages(1)
    setIsHistoryOpen(true)
  }

  const fetchHistory = async (walletId, p = 1) => {
    try {
      setHistoryLoading(true)
      const res = await adminAPI.getDeliveryBoyWalletHistory(walletId, {
        page: p,
        limit: 20,
        onlyAdjustments: true,
      })
      if (res?.data?.success) {
        const data = res.data.data
        setHistoryItems(data?.transactions || [])
        setHistoryPage(data?.pagination?.page ?? p)
        setHistoryPages(data?.pagination?.pages ?? 1)
      } else {
        toast.error(res?.data?.message || "Failed to fetch wallet history")
      }
    } catch (err) {
      console.error("Error fetching wallet history:", err)
      toast.error(err?.response?.data?.message || "Failed to fetch wallet history")
    } finally {
      setHistoryLoading(false)
    }
  }

  const getCurrentPocket = (w) => (w && Number.isFinite(Number(w.pocketBalance)) ? Number(w.pocketBalance) : 0)
  const getCurrentCash = (w) => (w && Number.isFinite(Number(w.cashCollected)) ? Number(w.cashCollected) : 0)

  const calcAdjustedValue = (current, type, amtStr) => {
    const amt = amtStr === "" ? 0 : Number(amtStr)
    if (!Number.isFinite(amt) || amt < 0) return { ok: false, value: NaN }
    const next = type === "deduct" ? current - amt : current + amt
    if (!Number.isFinite(next) || next < 0) return { ok: false, value: NaN }
    return { ok: true, value: Number(next.toFixed(2)) }
  }

  const pocketPreview =
    selectedWallet &&
    calcAdjustedValue(getCurrentPocket(selectedWallet), pocketAdjustType, pocketAdjustAmount)

  const cashPreview =
    selectedWallet &&
    calcAdjustedValue(getCurrentCash(selectedWallet), cashAdjustType, cashAdjustAmount)

  const handleSaveAdjustment = async () => {
    if (!selectedWallet) return

    const currentPocket = getCurrentPocket(selectedWallet)
    const currentCash = getCurrentCash(selectedWallet)

    const pocketRes = calcAdjustedValue(currentPocket, pocketAdjustType, pocketAdjustAmount)
    if (!pocketRes.ok) {
      toast.error("Please enter a valid Pocket adjustment (cannot make balance negative)")
      return
    }

    const cashRes = calcAdjustedValue(currentCash, cashAdjustType, cashAdjustAmount)
    if (!cashRes.ok) {
      toast.error("Please enter a valid Cash in hand adjustment (cannot make balance negative)")
      return
    }

    try {
      setSavingAdjustment(true)
      await adminAPI.updateDeliveryBoyWallet(selectedWallet.walletId, {
        pocketBalance: pocketRes.value,
        cashInHand: cashRes.value,
      })
      toast.success("Wallet balances updated successfully")
      setIsAdjustOpen(false)
      setSelectedWallet(null)
      // Refresh data
      fetchWallets()
    } catch (err) {
      console.error("Error saving wallet adjustment:", err)
      toast.error(
        err?.response?.data?.message ||
          "Failed to save wallet adjustment. Please try again.",
      )
    } finally {
      setSavingAdjustment(false)
    }
  }

  useEffect(() => {
    if (!isHistoryOpen || !selectedWallet?.walletId) return
    fetchHistory(selectedWallet.walletId, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHistoryOpen, selectedWallet?.walletId])

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <PiggyBank className="w-5 h-5 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Delivery boy Wallet</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            View each delivery boy&apos;s wallet details: name, ID, remaining cash limit, pocket balance, cash collected, total earning, bonus, total withdrawal, cash in hand.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Wallets</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {total}
              </span>
            </div>
            <div className="relative flex-1 sm:flex-initial min-w-[200px] max-w-xs">
              <input
                type="text"
                placeholder="Search by name, ID, phone"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading wallets…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">#</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Remaining cash limit</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Pocket balance</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Cash collected</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total earning</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Bonus</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total withdrawal</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Cash in hand</th>
                    <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {wallets.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Package className="w-16 h-16 text-slate-400 mb-4" />
                          <p className="text-lg font-semibold text-slate-700">No wallets</p>
                          <p className="text-sm text-slate-500">No delivery boys found.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    wallets.map((w, i) => (
                    <tr key={w.walletId || w.deliveryId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{(page - 1) * limit + i + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{w.name || "—"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{w.deliveryIdString || "—"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(w.remainingCashLimit)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(w.pocketBalance)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(w.cashCollected)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(w.totalEarning)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(w.bonus)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(w.totalWithdrawn)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(w.cashCollected)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-slate-700">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openHistoryDialog(w)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Clock3 className="w-3 h-3" />
                            History
                          </button>
                          <button
                            type="button"
                            onClick={() => openAdjustDialog(w)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Edit2 className="w-3 h-3" />
                            Edit
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
                Page {page} of {pages} · {total} total
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

      {/* Wallet Adjustment Dialog */}
      <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
        <DialogContent className="max-w-md bg-white rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-200 bg-slate-50/80">
            <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <IndianRupee className="w-4 h-4" />
              </span>
              <span className="font-semibold text-slate-900">Edit Delivery boy Wallet</span>
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 space-y-5">
            {selectedWallet && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs md:text-sm text-slate-700 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 truncate">
                    {selectedWallet.name || "Delivery Partner"}
                  </p>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                    ID: <span className="ml-1 font-mono">{selectedWallet.deliveryIdString}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 mt-1.5 text-[11px] md:text-xs">
                  <p>
                    Current pocket:&nbsp;
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(selectedWallet.pocketBalance)}
                    </span>
                  </p>
                  <p>
                    Current cash in hand:&nbsp;
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(selectedWallet.cashCollected)}
                    </span>
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs md:text-sm font-medium text-slate-700">
                  Pocket balance adjust (₹) <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPocketAdjustType("credit")}
                    className={`flex-1 h-9 rounded-lg border text-xs font-semibold ${
                      pocketAdjustType === "credit"
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Credit (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPocketAdjustType("deduct")}
                    className={`flex-1 h-9 rounded-lg border text-xs font-semibold ${
                      pocketAdjustType === "deduct"
                        ? "bg-rose-600 border-rose-600 text-white"
                        : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Deduct (−)
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pocketAdjustAmount}
                  onChange={(e) => setPocketAdjustAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Enter amount to credit/deduct"
                />
                <p className="text-[11px] text-slate-500">
                  New pocket:&nbsp;
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(
                      selectedWallet
                        ? pocketPreview?.ok
                          ? pocketPreview.value
                          : getCurrentPocket(selectedWallet)
                        : 0,
                    )}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs md:text-sm font-medium text-slate-700">
                  Cash in hand adjust (₹) <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCashAdjustType("credit")}
                    className={`flex-1 h-9 rounded-lg border text-xs font-semibold ${
                      cashAdjustType === "credit"
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Credit (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashAdjustType("deduct")}
                    className={`flex-1 h-9 rounded-lg border text-xs font-semibold ${
                      cashAdjustType === "deduct"
                        ? "bg-rose-600 border-rose-600 text-white"
                        : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Deduct (−)
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cashAdjustAmount}
                  onChange={(e) => setCashAdjustAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Enter amount to credit/deduct"
                />
                <p className="text-[11px] text-slate-500">
                  New cash in hand:&nbsp;
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(
                      selectedWallet
                        ? cashPreview?.ok
                          ? cashPreview.value
                          : getCurrentCash(selectedWallet)
                        : 0,
                    )}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 pb-5 pt-3 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAdjustOpen(false)
                setSelectedWallet(null)
              }}
              className="h-9 px-4 text-sm"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveAdjustment}
              disabled={savingAdjustment}
              className="h-9 px-5 text-sm bg-emerald-600 hover:bg-emerald-700"
            >
              {savingAdjustment ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wallet History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
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
            {selectedWallet && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs md:text-sm text-slate-700 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 truncate">
                    {selectedWallet.name || "Delivery Partner"}
                  </p>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                    ID: <span className="ml-1 font-mono">{selectedWallet.deliveryIdString}</span>
                  </span>
                </div>
              </div>
            )}

            {historyLoading ? (
              <div className="py-10 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">Loading history…</p>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-slate-700 font-semibold">No history</p>
                <p className="text-slate-500 text-sm">No adjustments found.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                {historyItems.map((t) => {
                  const md = t?.metadata || {}
                  const isEdit = t?.type === "admin_balance_edit"
                  const title =
                    t?.type === "bonus"
                      ? "Bonus"
                      : t?.type === "deduction"
                        ? "Deduction"
                        : isEdit
                          ? "Balance edit"
                          : t?.type || "Transaction"

                  const when = t?.date ? new Date(t.date).toLocaleString("en-IN") : "—"
                  const oldPocket = Number(md?.oldPocket)
                  const newPocket = Number(md?.newPocket)
                  const oldCashInHand = Number(md?.oldCashInHand)
                  const newCashInHand = Number(md?.newCashInHand)
                  const deltaPocket =
                    Number.isFinite(oldPocket) && Number.isFinite(newPocket) ? newPocket - oldPocket : NaN
                  const deltaCash =
                    Number.isFinite(oldCashInHand) && Number.isFinite(newCashInHand)
                      ? newCashInHand - oldCashInHand
                      : NaN
                  const deltaTotal =
                    Number.isFinite(deltaPocket) && Number.isFinite(deltaCash)
                      ? Number((deltaPocket + deltaCash).toFixed(2))
                      : NaN
                  const editAmountText =
                    Number.isFinite(deltaTotal) && deltaTotal !== 0
                      ? `${deltaTotal > 0 ? "+" : "−"}${formatCurrency(Math.abs(deltaTotal))}`
                      : "—"

                  return (
                    <div
                      key={t.id}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{title}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{t.description || "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">
                            {isEdit ? editAmountText : t?.amount != null ? formatCurrency(t.amount) : "—"}
                          </p>
                          <p className="text-[11px] text-slate-500">{when}</p>
                        </div>
                      </div>

                      {isEdit && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                          <p>
                            Pocket: <span className="font-semibold text-slate-900">{formatCurrency(md.oldPocket)}</span>{" "}
                            → <span className="font-semibold text-slate-900">{formatCurrency(md.newPocket)}</span>
                          </p>
                          <p>
                            Cash in hand:{" "}
                            <span className="font-semibold text-slate-900">{formatCurrency(md.oldCashInHand)}</span>{" "}
                            → <span className="font-semibold text-slate-900">{formatCurrency(md.newCashInHand)}</span>
                          </p>
                        </div>
                      )}

                      {t?.processedBy?.name && (
                        <p className="mt-2 text-[11px] text-slate-500">
                          By: <span className="font-medium text-slate-700">{t.processedBy.name}</span>
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 pb-5 pt-3 border-t border-slate-200 flex items-center justify-between gap-3 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={historyLoading || historyPage <= 1 || !selectedWallet?.walletId}
                onClick={() => {
                  const next = Math.max(1, historyPage - 1)
                  setHistoryPage(next)
                  fetchHistory(selectedWallet.walletId, next)
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={historyLoading || historyPage >= historyPages || !selectedWallet?.walletId}
                onClick={() => {
                  const next = Math.min(historyPages, historyPage + 1)
                  setHistoryPage(next)
                  fetchHistory(selectedWallet.walletId, next)
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <p className="text-xs text-slate-600 ml-2">
                Page {historyPage} of {historyPages}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsHistoryOpen(false)
                setHistoryItems([])
              }}
              className="h-9 px-4 text-sm"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
