import { useEffect, useMemo, useState } from "react"
import { adminAPI } from "@/lib/api"
import { Search, Wallet, Loader2, IndianRupee, Building2 } from "lucide-react"

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
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Total Withdrawals
                    </th>
                    <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-16 text-center">
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">
                          {hotel.totalWithdrawalCount || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                          <button className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">
                            Edit
                          </button>
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
    </div>
  )
}

