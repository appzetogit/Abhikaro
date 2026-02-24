import { useState, useEffect, useMemo } from "react"
import { Search, Wallet, Loader2, Package, Building2, CheckCircle, XCircle } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

const TABS = [
  { key: "Pending", label: "Pending" },
  { key: "Approved", label: "Approved" },
  { key: "Rejected", label: "Rejected" },
]

export default function HotelWithdrawal() {
  const [activeTab, setActiveTab] = useState("Pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)

  useEffect(() => {
    fetchRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getHotelWithdrawalRequests({
        status: activeTab,
        page: 1,
        limit: 200,
      })
      if (response?.data?.success) {
        setRequests(response.data.data?.requests || [])
      } else {
        setRequests([])
      }
    } catch (error) {
      console.error("Error fetching hotel withdrawal requests:", error)
      setRequests([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== undefined) fetchRequests()
    }, 500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests
    const q = searchQuery.toLowerCase().trim()
    return requests.filter(
      (r) =>
        r.hotelName?.toLowerCase().includes(q) ||
        r.hotelIdString?.toLowerCase().includes(q) ||
        r.hotelPhone?.toLowerCase().includes(q) ||
        r.amount?.toString().includes(q),
    )
  }, [requests, searchQuery])

  const getStatusBadge = (status) => {
    if (status === "Approved" || status === "Processed")
      return "bg-green-100 text-green-700"
    if (status === "Pending") return "bg-amber-100 text-amber-700"
    if (status === "Rejected") return "bg-red-100 text-red-700"
    return "bg-slate-100 text-slate-700"
  }

  const formatDate = (dateString) => {
    if (!dateString) return "N/A"
    try {
      return new Date(dateString).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    } catch {
      return String(dateString)
    }
  }

  const formatCurrency = (amount) => {
    if (amount == null) return "₹0.00"
    return `₹${Number(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const handleApprove = async (id) => {
    if (!window.confirm("Are you sure you want to approve this withdrawal request?")) return
    try {
      setProcessingId(id)
      const res = await adminAPI.approveHotelWithdrawal(id)
      if (res?.data?.success) {
        toast.success("Hotel withdrawal request approved")
        fetchRequests()
      } else {
        toast.error(res?.data?.message || "Failed to approve hotel withdrawal")
      }
    } catch (error) {
      console.error("Error approving hotel withdrawal:", error)
      toast.error(error?.response?.data?.message || "Failed to approve hotel withdrawal")
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (id) => {
    if (!window.confirm("Are you sure you want to reject this withdrawal request?")) return
    try {
      setProcessingId(id)
      const res = await adminAPI.rejectHotelWithdrawal(id)
      if (res?.data?.success) {
        toast.success("Hotel withdrawal request rejected & amount returned to wallet")
        fetchRequests()
      } else {
        toast.error(res?.data?.message || "Failed to reject hotel withdrawal")
      }
    } catch (error) {
      console.error("Error rejecting hotel withdrawal:", error)
      toast.error(error?.response?.data?.message || "Failed to reject hotel withdrawal")
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-purple-600" />
            <h1 className="text-2xl font-bold text-slate-900">Hotel Withdrawal</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            View hotel withdrawal requests created from the hotel wallet. Approval flow can
            be added later as needed.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex gap-2 border-b border-slate-200">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.key
                    ? "border-purple-600 text-purple-600"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Withdrawal Requests</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {filteredRequests.length}
              </span>
            </div>
            <div className="relative flex-1 sm:flex-initial min-w-[200px] max-w-xs">
              <input
                type="text"
                placeholder="Search by hotel name, ID, phone"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading withdrawal requests…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Hotel
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Hotel ID
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Request Time
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Building2 className="w-16 h-16 text-slate-400 mb-4" />
                          <p className="text-lg font-semibold text-slate-700">
                            No requests
                          </p>
                          <p className="text-sm text-slate-500">
                            No {activeTab.toLowerCase()} withdrawal requests.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((req, index) => (
                      <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {formatCurrency(req.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {req.hotelName || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {req.hotelIdString || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {req.hotelPhone || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {formatDate(req.requestedAt || req.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(
                              req.status,
                            )}`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {req.status === "Pending" ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleApprove(req.id)}
                                disabled={processingId === req.id}
                                className="p-2 rounded-lg bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Approve"
                              >
                                {processingId === req.id ? (
                                  <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                )}
                              </button>
                              <button
                                onClick={() => handleReject(req.id)}
                                disabled={processingId === req.id}
                                className="p-2 rounded-lg bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Reject"
                              >
                                <XCircle className="w-4 h-4 text-red-600" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
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

