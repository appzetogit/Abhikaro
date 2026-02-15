import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, Clock, CheckCircle, XCircle, TrendingUp, CreditCard } from "lucide-react"
import BottomNavigation from "../components/BottomNavigation"
import { hotelAPI } from "@/lib/api"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"

export default function HotelDashboard() {
  const navigate = useNavigate()
  const [hotel, setHotel] = useState(null)
  const [stats, setStats] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    completedRequests: 0,
    totalRevenue: 0,
  })
  const [settlementSummary, setSettlementSummary] = useState({
    totalCashCollected: 0,
    adminCommissionDue: 0,
    settlementPaid: 0,
    remainingSettlement: 0
  })
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Load business settings (title and favicon)
  useEffect(() => {
    loadBusinessSettings().catch(() => {
      // Silently fail - not critical
    })
  }, [])

  useEffect(() => {
    // Check authentication
    if (!isModuleAuthenticated("hotel")) {
      navigate("/hotel", { replace: true })
      return
    }

    // Fetch hotel data and stats
    const fetchData = async () => {
      try {
        // Fetch hotel data
        const hotelResponse = await hotelAPI.getCurrentHotel()
        if (hotelResponse.data?.success && hotelResponse.data.data?.hotel) {
          setHotel(hotelResponse.data.data.hotel)
        }

        // Fetch request stats
        try {
          const statsResponse = await hotelAPI.getRequestStats()
          if (statsResponse.data?.success) {
            const statsData = statsResponse.data.data || statsResponse.data
            setStats({
              totalRequests: statsData.totalRequests || 0,
              pendingRequests: statsData.pendingRequests || 0,
              completedRequests: statsData.completedRequests || 0,
              totalRevenue: statsData.totalRevenue || 0,
              totalHotelRevenue: statsData.totalHotelRevenue || 0,
            })
          }
        } catch (statsError) {
          console.error("Error fetching request stats:", statsError)
          // If stats endpoint fails (401, 404, etc.), try to calculate from requests
          if (statsError.response?.status === 401 || statsError.response?.status === 403) {
            // If unauthorized, just set default stats to 0
            setStats({
              totalRequests: 0,
              pendingRequests: 0,
              completedRequests: 0,
            })
          } else {
            // For other errors, try to calculate from requests
            try {
              const requestsResponse = await hotelAPI.getRequests()
              const requests = requestsResponse.data?.data?.requests || requestsResponse.data?.data || []
              const pending = requests.filter((r) => r.status?.toLowerCase() === "pending").length
              const completed = requests.filter((r) =>
                r.status?.toLowerCase() === "completed" || r.status?.toLowerCase() === "accepted"
              ).length
              setStats({
                totalRequests: requests.length,
                pendingRequests: pending,
                completedRequests: completed,
                totalRevenue: requests
                  .filter((r) => r.status?.toLowerCase() === "delivered")
                  .reduce((sum, r) => sum + (r.pricing?.total || 0), 0),
              })
            } catch (err) {
              // If both fail, just set defaults
              console.warn("Could not fetch request stats, using defaults:", err)
              setStats({
                totalRequests: 0,
                pendingRequests: 0,
                completedRequests: 0,
              })
            }
          }
        }

        // Fetch settlement summary
        try {
          const settlementResponse = await hotelAPI.getSettlementSummary()
          if (settlementResponse.data?.success) {
            setSettlementSummary(settlementResponse.data.data);
          }
        } catch (settlementError) {
          console.error("Error fetching settlement summary:", settlementError);
        }
      } catch (error) {
        console.error("Error fetching hotel data:", error)
        // If unauthorized or forbidden, redirect to login
        if (error.response?.status === 401 || error.response?.status === 403) {
          navigate("/hotel", { replace: true })
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [navigate])

  const handleToggleStatus = async () => {
    if (updatingStatus) return

    const newStatus = !hotel.isActive
    setUpdatingStatus(true)

    try {
      const response = await hotelAPI.updateProfile({ isActive: newStatus })
      if (response.data?.success && response.data.data?.hotel) {
        setHotel(response.data.data.hotel)
      }
    } catch (error) {
      console.error("Error updating hotel status:", error)
      // Revert on error - hotel state will remain unchanged
    } finally {
      setUpdatingStatus(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!hotel) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load hotel data</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{hotel.hotelName}</h1>
              <p className="text-sm text-gray-500 mt-1">Dashboard Overview</p>
            </div>
            {/* Status Toggle */}
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${hotel.isActive ? "text-green-600" : "text-red-600"
                }`}>
                {hotel.isActive ? "Active" : "Inactive"}
              </span>
              <button
                onClick={handleToggleStatus}
                disabled={updatingStatus}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#ff8100] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${hotel.isActive ? "bg-green-500" : "bg-red-500"
                  }`}
                role="switch"
                aria-checked={hotel.isActive}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hotel.isActive ? "translate-x-6" : "translate-x-1"
                    }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Overview Section */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Overview</h2>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Total Requests */}
            <div
              onClick={() => navigate("/hotel/orders")}
              className="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-gray-400"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <FileText className="w-6 h-6 text-gray-600" />
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-1">Total Requests</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalRequests}</p>
            </div>

            {/* Total Amount (Revenue) */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-3 opacity-10">
                <TrendingUp size={48} className="text-green-500" />
              </div>
              <div className="flex flex-col">
                <div className="p-2 bg-green-50 rounded-lg w-fit mb-3">
                  <TrendingUp size={20} className="text-green-500" />
                </div>
                <p className="text-gray-500 text-sm font-medium">Total Amount</p>
                <h3 className="text-2xl font-bold text-gray-800 mt-1">
                  ₹{stats?.totalRevenue || 0}
                </h3>
              </div>
            </div>

            {/* New Card: Hotel Revenue (Commission) */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-3 opacity-10">
                <CreditCard size={48} className="text-purple-500" />
              </div>
              <div className="flex flex-col">
                <div className="p-2 bg-purple-50 rounded-lg w-fit mb-3">
                  <CreditCard size={20} className="text-purple-500" />
                </div>
                <p className="text-gray-500 text-sm font-medium">Your Earnings (Commission)</p>
                <h3 className="text-2xl font-bold text-gray-800 mt-1">
                  ₹{stats?.totalHotelRevenue || 0}
                </h3>
              </div>
            </div>

            {/* Total Cash Collected */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-3 opacity-10">
                <CheckCircle size={48} className="text-orange-500" />
              </div>
              <div className="flex flex-col">
                <div className="p-2 bg-orange-50 rounded-lg w-fit mb-3">
                  <CheckCircle size={20} className="text-orange-500" />
                </div>
                <p className="text-gray-500 text-sm font-medium">
                  Total Cash Collected
                </p>
                <h3 className="text-2xl font-bold text-gray-800 mt-1">
                  ₹{settlementSummary?.totalCashCollected || 0}
                </h3>
              </div>
            </div>

            {/* Settlement Amount (10%) */}
            <div
              onClick={() => navigate("/hotel/settlement")}
              className="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-red-500"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-red-100 rounded-lg">
                  <CreditCard className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-1">Settlement Amount</p>
              <p className="text-3xl font-bold text-red-600">₹{settlementSummary.adminCommissionDue || 0}</p>
            </div>
          </div>
        </div>

        {/* Settlement Summary Section */}
        {/* Settlement Summary Section Removed */}\n

        {/* Welcome Message */}
        {!hotel.isActive && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  Account Pending Approval
                </h3>
                <p className="text-sm text-yellow-800">
                  Your hotel account is currently pending admin approval. You will be able to access all features once your account is approved.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  )
}
