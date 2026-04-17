import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, Clock, CheckCircle, XCircle, TrendingUp, CreditCard } from "lucide-react"
import BottomNavigation from "../components/BottomNavigation"
import { hotelAPI } from "@/lib/api"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"
import { useForegroundNotifications } from "@/lib/hooks/useForegroundNotifications"

export default function HotelDashboard() {
  const navigate = useNavigate()
  const [hotel, setHotel] = useState(null)
  const [leaderboardBanners, setLeaderboardBanners] = useState([])
  const [leaderboardBannerIndex, setLeaderboardBannerIndex] = useState(0)
  const [touchStartX, setTouchStartX] = useState(null)
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

  // Handle foreground push notifications while hotel panel is open
  useForegroundNotifications({
    onNotificationClick: (data) => {
      // If notification is about a specific order, go to orders page
      if (data?.orderId) {
        navigate("/hotel/orders")
        return
      }

      // If notification is about a specific hotel request, go to requests page
      if (data?.requestId) {
        navigate("/hotel/requests?filter=pending")
        return
      }

      // Fallback: stay on / go back to dashboard
      navigate("/hotel/dashboard")
    },
    showToasts: true,
  })

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
        const hotelPayload = hotelResponse.data?.data?.hotel || null
        if (hotelResponse.data?.success && hotelPayload) {
          setHotel(hotelPayload)
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

        // Fetch settlement summary (only for active hotels).
        // Inactive hotels (awaiting admin approval) are blocked from /hotel/orders/* endpoints.
        if (hotelPayload?.isActive) {
          try {
            const settlementResponse = await hotelAPI.getSettlementSummary()
            if (settlementResponse.data?.success) {
              setSettlementSummary(settlementResponse.data.data)
            }
          } catch (settlementError) {
            // Don't spam console for expected 401 while session refresh happens.
            if (settlementError?.response?.status !== 401) {
              console.error("Error fetching settlement summary:", settlementError)
            }
          }
        } else {
          setSettlementSummary({
            totalCashCollected: 0,
            adminCommissionDue: 0,
            settlementPaid: 0,
            remainingSettlement: 0,
          })
        }

        // Fetch leaderboard banner (optional)
        try {
          const res = await hotelAPI.getLeaderboardRewards()
          const banners = res?.data?.data?.banners
          const urls = (Array.isArray(banners) ? banners : [])
            .map((b) => (typeof b?.url === "string" ? b.url.trim() : ""))
            .filter(Boolean)
          setLeaderboardBanners(urls)
          setLeaderboardBannerIndex(0)
        } catch {
          setLeaderboardBanners([])
          setLeaderboardBannerIndex(0)
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

  // Auto-slide leaderboard banner every 15 seconds
  useEffect(() => {
    if (!Array.isArray(leaderboardBanners) || leaderboardBanners.length <= 1) return
    const id = setInterval(() => {
      setLeaderboardBannerIndex((prev) => (prev + 1) % leaderboardBanners.length)
    }, 15000)
    return () => clearInterval(id)
  }, [leaderboardBanners])

  const goNextBanner = () => {
    if (!Array.isArray(leaderboardBanners) || leaderboardBanners.length <= 1) return
    setLeaderboardBannerIndex((prev) => (prev + 1) % leaderboardBanners.length)
  }

  const goPrevBanner = () => {
    if (!Array.isArray(leaderboardBanners) || leaderboardBanners.length <= 1) return
    setLeaderboardBannerIndex((prev) => (prev - 1 + leaderboardBanners.length) % leaderboardBanners.length)
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
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Leaderboard Banner (above Overview) */}
        {leaderboardBanners.length > 0 ? (
          <div
            className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm cursor-pointer select-none"
            onClick={() => navigate("/hotel/leaderboard")}
            role="button"
            onTouchStart={(e) => {
              if (!leaderboardBanners || leaderboardBanners.length <= 1) return
              setTouchStartX(e.touches?.[0]?.clientX ?? null)
            }}
            onTouchEnd={(e) => {
              if (!leaderboardBanners || leaderboardBanners.length <= 1) return
              const endX = e.changedTouches?.[0]?.clientX
              if (touchStartX == null || endX == null) return
              const dx = endX - touchStartX
              const threshold = 40
              if (dx > threshold) {
                // swipe right -> previous
                goPrevBanner()
              } else if (dx < -threshold) {
                // swipe left -> next
                goNextBanner()
              }
              setTouchStartX(null)
            }}
          >
            <img
              src={leaderboardBanners[Math.min(leaderboardBannerIndex, leaderboardBanners.length - 1)]}
              alt="Leaderboard banner"
              className="h-32 w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : null}

        {/* Overview Section */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Overview</h2>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-4">
            {/* Total Requests */}
            <div
              onClick={() => navigate("/hotel/orders")}
              className="bg-white rounded-lg shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-gray-400"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 bg-gray-100 rounded-lg">
                  <FileText className="w-5 h-5 text-gray-600" />
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mb-1">Total Requests</p>
              <p className="text-lg font-bold text-gray-900">{stats.totalRequests}</p>
            </div>

            {/* Total Amount (Revenue) */}
            <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-2.5 opacity-10">
                <TrendingUp size={38} className="text-green-500" />
              </div>
              <div className="flex flex-col">
                <div className="p-1.5 bg-green-50 rounded-lg w-fit mb-1.5">
                  <TrendingUp size={16} className="text-green-500" />
                </div>
                <p className="text-gray-500 text-[11px] font-medium">Total Amount</p>
                <h3 className="text-lg font-bold text-gray-800 mt-1">
                  ₹{stats?.totalRevenue || 0}
                </h3>
              </div>
            </div>

            {/* New Card: Hotel Revenue (Commission) */}
            <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-2.5 opacity-10">
                <CreditCard size={38} className="text-purple-500" />
              </div>
              <div className="flex flex-col">
                <div className="p-1.5 bg-purple-50 rounded-lg w-fit mb-1.5">
                  <CreditCard size={16} className="text-purple-500" />
                </div>
                <p className="text-gray-500 text-[11px] font-medium">Your Earnings (Commission)</p>
                <h3 className="text-lg font-bold text-gray-800 mt-1">
                  ₹{stats?.totalHotelRevenue || 0}
                </h3>
              </div>
            </div>

            {/* Total Cash Collected */}
            <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-2.5 opacity-10">
                <CheckCircle size={38} className="text-orange-500" />
              </div>
              <div className="flex flex-col">
                <div className="p-1.5 bg-orange-50 rounded-lg w-fit mb-1.5">
                  <CheckCircle size={16} className="text-orange-500" />
                </div>
                <p className="text-gray-500 text-[11px] font-medium">
                  Total collected amount
                </p>
                <h3 className="text-lg font-bold text-gray-800 mt-1">
                  ₹{settlementSummary?.totalCashCollected || 0}
                </h3>
              </div>
            </div>
          </div>
        </div>

        {/* Settlement Summary Section Removed */}

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
