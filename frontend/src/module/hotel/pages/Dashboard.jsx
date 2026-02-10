import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, Clock, CheckCircle, XCircle, TrendingUp } from "lucide-react"
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
            })
          }
        } catch (statsError) {
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
              <span className={`text-sm font-medium ${
                hotel.isActive ? "text-green-600" : "text-red-600"
              }`}>
                {hotel.isActive ? "Active" : "Inactive"}
              </span>
              <button
                onClick={handleToggleStatus}
                disabled={updatingStatus}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#ff8100] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  hotel.isActive ? "bg-green-500" : "bg-red-500"
                }`}
                role="switch"
                aria-checked={hotel.isActive}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    hotel.isActive ? "translate-x-6" : "translate-x-1"
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Total Requests */}
            <div 
              onClick={() => navigate("/hotel/requests")}
              className="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-[#ff8100]"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-[#ff8100]/10 rounded-lg">
                  <FileText className="w-6 h-6 text-[#ff8100]" />
                </div>
                <TrendingUp className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 mb-1">Total Order Requests</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalRequests}</p>
            </div>

            {/* Pending Requests */}
            <div 
              onClick={() => navigate("/hotel/requests?filter=pending")}
              className="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-yellow-500"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="w-6 h-6 text-yellow-600" />
                </div>
                <TrendingUp className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 mb-1">Pending Requests</p>
              <p className="text-3xl font-bold text-gray-900">{stats.pendingRequests}</p>
            </div>

            {/* Completed Requests */}
            <div 
              onClick={() => navigate("/hotel/requests?filter=completed")}
              className="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-green-500"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <TrendingUp className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 mb-1">Completed Requests</p>
              <p className="text-3xl font-bold text-gray-900">{stats.completedRequests}</p>
            </div>
          </div>
        </div>

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
