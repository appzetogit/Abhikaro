import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowDownCircle, ArrowUpCircle, IndianRupee, RefreshCw, Wallet as WalletIcon } from "lucide-react"
import BottomNavigation from "../components/BottomNavigation"
import { hotelAPI } from "@/lib/api"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"

function formatCurrency(amount) {
  const num = Number(amount || 0)
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num)
}

export default function HotelWallet() {
  const navigate = useNavigate()
  const [wallet, setWallet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [stats, setStats] = useState(null)
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [creatingWithdrawal, setCreatingWithdrawal] = useState(false)

  const fetchWallet = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)

      setError("")

      // Fetch wallet + hotel request stats (for earnings like dashboard)
      const [walletRes, statsRes] = await Promise.all([
        hotelAPI.getWallet(),
        hotelAPI.getRequestStats(),
      ])

      const walletData =
        walletRes?.data?.data?.wallet || walletRes?.data?.wallet || null
      setWallet(walletData)

      const statsData = statsRes?.data?.data || statsRes?.data || null
      setStats(statsData)
    } catch (err) {
      console.error("Error fetching hotel wallet:", err)
      setWallet(null)
      setError(err?.response?.data?.message || "Failed to load wallet")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Load business settings (title and favicon)
  useEffect(() => {
    loadBusinessSettings().catch(() => {
      // Silently fail - not critical
    })
  }, [])

  useEffect(() => {
    if (!isModuleAuthenticated("hotel")) {
      navigate("/hotel", { replace: true })
      return
    }
    fetchWallet(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  // Prefer stats (same as dashboard) for earnings numbers,
  // fallback to wallet aggregates if stats are not available.
  const statsTotalEarned = stats?.totalHotelRevenue ?? null

  const totalEarned = statsTotalEarned ?? wallet?.totalEarned ?? 0
  const totalWithdrawn = wallet?.totalWithdrawn ?? 0

  // Withdrawable = totalEarned - totalWithdrawn (dashboard-aligned),
  // clamp to 0 minimum. Fallback to wallet.pendingPayout / balance if needed.
  const withdrawableAmountRaw = totalEarned - totalWithdrawn
  const withdrawableAmount =
    withdrawableAmountRaw >= 0
      ? withdrawableAmountRaw
      : wallet?.pendingPayout ?? wallet?.balance ?? 0
  // pendingPayout is currently not shown in UI; kept for potential future use
  const pendingPayout = wallet?.pendingPayout || 0

  const transactions = wallet?.transactions || []

  const recentTransactions = useMemo(() => {
    return [...transactions].slice(0, 10)
  }, [transactions])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#ff8100] mx-auto" />
          <p className="mt-3 text-gray-600">Loading wallet...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Wallet</h1>
            <p className="text-xs text-gray-500 mt-1">Your earnings from hotel QR orders</p>
          </div>
          <button
            onClick={() => fetchWallet(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Summary + Withdraw */}
        <div className="bg-gradient-to-br from-[#ff8100] to-[#ff9b3a] rounded-2xl p-5 text-white shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide opacity-80">Available to Withdraw</p>
              <p className="text-3xl font-extrabold">{formatCurrency(withdrawableAmount)}</p>
              <p className="text-[11px] opacity-80">
                Last updated: {wallet?.updatedAt ? new Date(wallet.updatedAt).toLocaleString() : "—"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="bg-white/15 rounded-xl p-3">
                <WalletIcon className="h-6 w-6" />
              </div>
              <button
                onClick={() => {
                  setWithdrawAmount("")
                  setWithdrawDialogOpen(true)
                }}
                className="mt-auto inline-flex items-center justify-center rounded-xl bg-white text-[#ff8100] px-4 py-2 text-sm font-semibold shadow-sm hover:bg-orange-50 transition-colors"
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-green-50">
                <ArrowUpCircle className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-xs text-gray-500">Total Earnings</span>
            </div>
            <p className="mt-3 text-lg font-bold text-gray-900">{formatCurrency(totalEarned)}</p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-red-50">
                <ArrowDownCircle className="h-5 w-5 text-red-600" />
              </div>
              <span className="text-xs text-gray-500">Withdrawn</span>
            </div>
            <p className="mt-3 text-lg font-bold text-gray-900">{formatCurrency(totalWithdrawn)}</p>
          </div>
        </div>

        {/* Transactions */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="px-4 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Transaction History</h2>
              <p className="text-xs text-gray-500 mt-1">
                Shows commission and cash collection per order
              </p>
            </div>
          </div>

          {error ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={() => fetchWallet(true)}
                className="mt-3 inline-flex items-center justify-center px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50"
              >
                Try again
              </button>
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <WalletIcon className="h-6 w-6 text-gray-500" />
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-900">No transactions yet</p>
              <p className="mt-1 text-xs text-gray-500">
                When your hotel earns commission from QR orders, you’ll see it here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {recentTransactions.map((t, idx) => {
                const isCredit =
                  t.type === "commission" ||
                  t.type === "bonus" ||
                  t.type === "refund" ||
                  t.type === "cash_collection"

                const amountLabel = formatCurrency(t?.amount || 0)
                const profitLabel =
                  typeof t?.profitAmount === "number"
                    ? formatCurrency(t.profitAmount)
                    : amountLabel
                const orderTotalLabel =
                  typeof t?.orderTotal === "number"
                    ? formatCurrency(t.orderTotal)
                    : null
                const orderIdLabel =
                  t?.orderNumber ||
                  (typeof t?.orderId === "string" ? t.orderId : "")

                return (
                  <div key={t?._id || idx} className="px-4 py-4 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            t.type === "commission"
                              ? "bg-green-50 text-green-700"
                              : t.type === "cash_collection"
                              ? "bg-orange-50 text-orange-700"
                              : t.type === "withdrawal"
                              ? "bg-red-50 text-red-700"
                              : "bg-slate-50 text-slate-700"
                          }`}
                        >
                          {t.type === "cash_collection"
                            ? "Cash Collection"
                            : t.type.charAt(0).toUpperCase() + t.type.slice(1)}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {t.status || "Completed"}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {t.userName || t.userPhone
                          ? `${t.userName || t.userPhone}${
                              orderIdLabel ? ` · ${orderIdLabel}` : ""
                            }`
                          : t.description || "Order payout"}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {orderIdLabel ? `Order: ${orderIdLabel}` : ""}
                        {orderTotalLabel
                          ? `${orderIdLabel ? " · " : ""}Total: ${orderTotalLabel}`
                          : ""}
                        {profitLabel
                          ? `${orderIdLabel || orderTotalLabel ? " · " : ""}Profit: ${profitLabel}`
                          : ""}
                        {t.createdAt
                          ? ` · ${new Date(t.createdAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-bold text-right ${
                        isCredit ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {amountLabel}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Withdraw dialog (simple overlay) */}
      {withdrawDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Request Withdrawal</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Enter the amount you want to withdraw. Request will go to admin for approval.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">
                Amount (max {formatCurrency(withdrawableAmount)})
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff8100] focus:border-[#ff8100]"
                placeholder="Enter amount"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  if (creatingWithdrawal) return
                  setWithdrawDialogOpen(false)
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                disabled={creatingWithdrawal}
                onClick={async () => {
                  if (creatingWithdrawal) return

                  const amountNum = Number(withdrawAmount)
                  if (!amountNum || amountNum <= 0) {
                    alert("Please enter a valid withdrawal amount")
                    return
                  }
                  if (amountNum > withdrawableAmount) {
                    alert("Withdrawal amount cannot be more than withdrawable balance")
                    return
                  }

                  try {
                    setCreatingWithdrawal(true)
                    await hotelAPI.createWithdrawalRequest(amountNum)
                    alert("Withdrawal request sent to admin successfully")
                    setWithdrawDialogOpen(false)
                    fetchWallet(true)
                  } catch (err) {
                    console.error("Error creating withdrawal request:", err)
                    alert(
                      err?.response?.data?.message ||
                        "Failed to create withdrawal request. Please try again.",
                    )
                  } finally {
                    setCreatingWithdrawal(false)
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#ff8100] text-white hover:bg-[#ff8100]/90 disabled:opacity-60"
              >
                {creatingWithdrawal ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNavigation />
    </div>
  )
}

