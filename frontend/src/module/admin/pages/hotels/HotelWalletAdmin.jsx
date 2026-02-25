import { useEffect, useMemo, useState } from "react"
import { adminAPI } from "@/lib/api"
import { Search, Wallet, Loader2, IndianRupee, Building2, Eye } from "lucide-react"

const formatCurrency = (amount) => {
  if (amount == null) return "₹0"
  return `₹${Number(amount).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`
}

export default function HotelWalletAdmin() {
  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [editingHotel, setEditingHotel] = useState(null)
  const [editCashValue, setEditCashValue] = useState("")
  const [editError, setEditError] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  const [viewHotel, setViewHotel] = useState(null)
  const [earningsLoading, setEarningsLoading] = useState(false)
  const [earningsError, setEarningsError] = useState("")
  const [earningsData, setEarningsData] = useState(null)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async (query = "") => {
    try {
      setLoading(true)
      const res = await adminAPI.getHotelWalletOverview({
        search: query || undefined,
        page: 1,
        limit: 100,
      })
      if (res?.data?.success) {
        setHotels(res.data.data?.hotels || [])
      } else {
        setHotels([])
      }
    } catch (err) {
      console.error("Error fetching hotel wallet overview:", err)
      setHotels([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return hotels
    const q = search.toLowerCase().trim()
    return hotels.filter(
      (h) =>
        h.hotelName?.toLowerCase().includes(q) ||
        h.hotelCode?.toLowerCase().includes(q) ||
        h.phone?.toLowerCase().includes(q),
    )
  }, [hotels, search])

  useEffect(() => {
    const t = setTimeout(() => {
      fetchData(search)
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const openEarningsModal = async (hotel) => {
    setViewHotel(hotel)
    setEarningsError("")
    setEarningsData(null)
    setEarningsLoading(true)

    try {
      const res = await adminAPI.getHotelWalletEarnings(hotel.hotelId)
      if (res?.data?.success) {
        setEarningsData(res.data.data)
      } else {
        setEarningsError("Failed to load order earnings for this hotel.")
      }
    } catch (err) {
      console.error("Failed to fetch hotel wallet earnings:", err)
      setEarningsError("Failed to load order earnings. Please try again.")
    } finally {
      setEarningsLoading(false)
    }
  }

  const closeEarningsModal = () => {
    if (earningsLoading) return
    setViewHotel(null)
    setEarningsData(null)
    setEarningsError("")
  }

  const openEditModal = (hotel) => {
    setEditingHotel(hotel)
    setEditError("")
    const rawValue =
      typeof hotel.totalCashCollected === "number"
        ? hotel.totalCashCollected
        : 0
    setEditCashValue(String(rawValue))
  }

  const closeEditModal = () => {
    if (savingEdit) return
    setEditingHotel(null)
    setEditCashValue("")
    setEditError("")
  }

  const handleSaveCashCollected = async () => {
    if (!editingHotel) return

    const value = Number(editCashValue)
    if (Number.isNaN(value) || value < 0) {
      setEditError("Please enter a valid non-negative amount")
      return
    }

    try {
      setSavingEdit(true)
      setEditError("")

      await adminAPI.updateHotelCashCollected(editingHotel.hotelId, value)

      // Refresh list with current search term
      await fetchData(search)

      closeEditModal()
    } catch (err) {
      console.error("Failed to update hotel cash collected:", err)
      setEditError("Failed to update cash collected. Please try again.")
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Hotel Wallet</h1>
              <p className="text-sm text-slate-600 mt-1">
                View and manage hotel wallet balances, earnings and withdrawals.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Hotel Wallet Overview</h2>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                {filtered.length}
              </span>
            </div>
            <div className="relative flex-1 sm:flex-initial min-w-[220px] max-w-xs">
              <input
                type="text"
                placeholder="Search by hotel name, ID or phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
              <p className="text-slate-600 text-sm">Loading hotel wallets…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Hotel
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Hotel ID
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Total Requests
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Total Amount
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Cash Collected
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Hotel Earnings
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
                      <td colSpan={8} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                          <p className="text-sm font-medium text-slate-600">
                            No hotels found for current filter.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((hotel) => (
                      <tr key={hotel.hotelId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-500" />
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {hotel.hotelName || "N/A"}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {hotel.phone || "N/A"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">
                          {hotel.hotelCode || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">
                          {hotel.totalRequests || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">
                          {formatCurrency(hotel.totalAmountCollected)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">
                          {formatCurrency(hotel.totalCashCollected)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">
                          <span className="inline-flex items-center gap-1">
                            <IndianRupee className="w-3 h-3 text-slate-700" />
                            <span>{formatCurrency(hotel.hotelEarnings)}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-700">
                          {formatCurrency(hotel.availableBalance)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEarningsModal(hotel)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                              title="View order-wise earnings"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(hotel)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
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
        </div>
      </div>

      {editingHotel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Edit Cash Collected
            </h3>
            <p className="text-sm text-slate-600">
              Update the total cash collected amount for{" "}
              <span className="font-semibold">
                {editingHotel.hotelName || "Selected Hotel"}
              </span>
              .
            </p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700 uppercase tracking-wide">
                Cash Collected (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editCashValue}
                onChange={(e) => setEditCashValue(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              {editError && (
                <p className="text-xs text-red-600 mt-1">{editError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeEditModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCashCollected}
                disabled={savingEdit}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingEdit && (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                )}
                <span>{savingEdit ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {viewHotel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full mx-4 p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Hotel Order Earnings
                </h3>
                <p className="text-sm text-slate-600">
                  Orders for{" "}
                  <span className="font-semibold">
                    {viewHotel.hotelName || "Selected Hotel"}
                  </span>{" "}
                  showing hotel earnings by payment method (Pay at Hotel vs
                  Razorpay / online).
                </p>
              </div>
              <button
                type="button"
                onClick={closeEarningsModal}
                className="text-sm text-slate-500 hover:text-slate-800"
                disabled={earningsLoading}
              >
                Close
              </button>
            </div>

            {earningsLoading ? (
              <div className="py-10 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
                <p className="text-sm text-slate-600">
                  Loading order-wise earnings...
                </p>
              </div>
            ) : earningsError ? (
              <p className="text-sm text-red-600">{earningsError}</p>
            ) : earningsData && earningsData.orders?.length ? (
              <div className="space-y-4">
                {earningsData.summary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-slate-500 font-medium uppercase tracking-wide">
                        Total QR Orders
                      </p>
                      <p className="text-base font-semibold text-slate-900">
                        {earningsData.summary.totalOrders || 0}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-slate-500 font-medium uppercase tracking-wide">
                        Cash Orders
                      </p>
                      <p className="text-base font-semibold text-slate-900">
                        {earningsData.summary.cashOrders || 0}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-slate-500 font-medium uppercase tracking-wide">
                        Online Orders
                      </p>
                      <p className="text-base font-semibold text-slate-900">
                        {earningsData.summary.onlineOrders || 0}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-slate-500 font-medium uppercase tracking-wide">
                        Cash Collected
                      </p>
                      <p className="text-base font-semibold text-slate-900">
                        {formatCurrency(
                          earningsData.summary.totalCashCollected || 0,
                        )}
                      </p>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto max-h-[420px] border border-slate-100 rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-slate-700">
                          Order ID
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-700">
                          Date
                        </th>
                        <th className="px-4 py-2 text-right font-semibold text-slate-700">
                          Total Amount
                        </th>
                        <th className="px-4 py-2 text-right font-semibold text-slate-700">
                          Hotel Earning
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-700">
                          Payment
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-700">
                          Cash Collected
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {earningsData.orders.map((row) => (
                        <tr key={row.orderId}>
                          <td className="px-4 py-2 whitespace-nowrap text-slate-800">
                            {row.orderId}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                            {row.createdAt
                              ? new Date(row.createdAt).toLocaleString()
                              : "-"}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-right text-slate-800">
                            {formatCurrency(row.totalAmount)}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-right text-slate-800">
                            {formatCurrency(row.hotelEarning)}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-slate-700">
                            {row.isCashPayment
                              ? "Pay at Hotel / Cash"
                              : row.isOnlinePayment
                              ? "Razorpay / Online"
                              : row.paymentMethod || "Other"}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-slate-700">
                            {row.cashCollected ? "Yes" : "No"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                No qualifying QR / hotel orders found for this hotel yet.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

