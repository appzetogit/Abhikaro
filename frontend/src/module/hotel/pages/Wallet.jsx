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

  const fetchWallet = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)

      setError("")
      const res = await hotelAPI.getWallet()
      const walletData = res?.data?.data?.wallet || res?.data?.wallet || null
      setWallet(walletData)
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

  const balance = wallet?.balance || 0
  const totalEarned = wallet?.totalEarned || 0
  const totalWithdrawn = wallet?.totalWithdrawn || 0
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
            <p className="text-xs text-gray-500 mt-1">Track earnings and payouts</p>
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
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-[#ff8100] to-[#ff9b3a] rounded-2xl p-5 text-white shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm/5 opacity-90">Available Balance</p>
              <p className="text-3xl font-extrabold mt-1">{formatCurrency(balance)}</p>
              <p className="text-xs opacity-90 mt-2">
                Last updated: {wallet?.updatedAt ? new Date(wallet.updatedAt).toLocaleString() : "—"}
              </p>
            </div>
            <div className="bg-white/15 rounded-xl p-3">
              <WalletIcon className="h-6 w-6" />
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
              <span className="text-xs text-gray-500">Earned</span>
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
          <div className="bg-white rounded-xl border shadow-sm p-4 col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-50">
                  <IndianRupee className="h-5 w-5 text-yellow-700" />
                </div>
                <p className="text-sm font-semibold text-gray-900">Pending Payout</p>
              </div>
              <p className="text-sm font-bold text-gray-900">{formatCurrency(pendingPayout)}</p>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              This is a placeholder for now. Backend hotel wallet will be connected later.
            </p>
          </div>
        </div>

        {/* Transactions */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="px-4 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Recent Transactions</h2>
              <p className="text-xs text-gray-500 mt-1">Latest 10 entries</p>
            </div>
            <button
              onClick={() => navigate("/hotel/requests")}
              className="text-sm font-medium text-[#ff8100] hover:underline"
            >
              View requests
            </button>
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
                When you receive order payouts, you’ll see them here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {recentTransactions.map((t, idx) => (
                <div key={t?._id || idx} className="px-4 py-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {t?.title || t?.type || "Transaction"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {t?.createdAt ? new Date(t.createdAt).toLocaleString() : "—"}
                    </p>
                  </div>
                  <p className={`text-sm font-bold ${t?.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                    {formatCurrency(t?.amount || 0)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNavigation />
    </div>
  )
}

