import { useState, useEffect } from "react"
import { IndianRupee, TrendingUp, Percent, Building2, Loader2 } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

export default function DiningEarnings() {
  const [summary, setSummary] = useState(null)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const fetchEarnings = async () => {
    setLoading(true)
    try {
      const params = {}
      if (restaurantId) params.restaurantId = restaurantId
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const res = await adminAPI.getDiningEarnings(params)
      if (res.data?.success && res.data?.data) {
        setSummary(res.data.data.summary || null)
        setData(res.data.data.data || [])
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load earnings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEarnings()
  }, [])

  const handleFilter = (e) => {
    e?.preventDefault?.()
    fetchEarnings()
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Dining Earnings</h1>
          <form onSubmit={handleFilter} className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Restaurant ID</label>
              <input
                type="text"
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
                placeholder="Filter by restaurant ID"
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-48"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              Apply
            </button>
          </form>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#FD0134]/10 rounded-xl text-[#FD0134]">
                      <IndianRupee className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 font-medium">Total Dining Revenue</p>
                      <p className="text-xl font-bold text-slate-900">₹{(summary.totalDiningRevenue ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-100 rounded-xl text-amber-600">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 font-medium">Total Discount Given</p>
                      <p className="text-xl font-bold text-slate-900">₹{(summary.totalDiscountGiven ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
                      <Percent className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 font-medium">Total Commission Earned</p>
                      <p className="text-xl font-bold text-slate-900">₹{(summary.totalCommissionEarned ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-violet-100 rounded-xl text-violet-600">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 font-medium">Restaurant Earnings</p>
                      <p className="text-xl font-bold text-slate-900">₹{(summary.totalRestaurantEarnings ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <h2 className="text-lg font-bold text-slate-900 p-4 border-b border-slate-100">Transactions</h2>
              {data.length === 0 ? (
                <div className="text-center py-12 text-slate-500">No paid dining transactions in this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Booking ID</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Restaurant</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">User</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Paid at</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Final amount</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Commission</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Restaurant earning</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map((row) => (
                        <tr key={row._id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-sm">#{row.bookingId ?? row._id?.slice(-8)}</td>
                          <td className="px-4 py-3 text-sm">{row.restaurant?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-sm">{row.user?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-sm">{row.paidAt ? new Date(row.paidAt).toLocaleString() : "—"}</td>
                          <td className="px-4 py-3 text-sm font-medium">₹{(row.finalAmount ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm text-blue-600">₹{(row.commissionAmount ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm">₹{(row.restaurantEarning ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
