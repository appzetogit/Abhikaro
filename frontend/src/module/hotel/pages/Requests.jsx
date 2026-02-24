import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { FileText, Clock, CheckCircle, XCircle, ArrowLeft } from "lucide-react"
import BottomNavigation from "../components/BottomNavigation"
import { hotelAPI } from "@/lib/api"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"
import { useForegroundNotifications } from "@/lib/hooks/useForegroundNotifications"

export default function HotelRequests() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState(searchParams.get("filter") || "all") // all, pending, completed

  // Handle foreground push notifications on requests screen
  useForegroundNotifications({
    onNotificationClick: (data) => {
      // For any hotel request / order notification, focus pending requests
      if (data?.requestId || data?.orderId || data?.type) {
        navigate("/hotel/requests?filter=pending")
      }
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

    // Fetch requests
    const fetchRequests = async () => {
      try {
        const params = {}
        if (filter === "pending") {
          params.status = "pending"
        } else if (filter === "completed") {
          params.status = "completed"
        }

        const response = await hotelAPI.getRequests(params)
        if (response.data?.success) {
          setRequests(response.data.data?.requests || response.data.data || [])
        }
      } catch (error) {
        console.error("Error fetching requests:", error)
        if (error.response?.status === 401 || error.response?.status === 403) {
          navigate("/hotel", { replace: true })
        }
      } finally {
        setLoading(false)
      }
    }

    fetchRequests()
  }, [navigate, filter])

  // Update filter when query param changes
  useEffect(() => {
    const filterParam = searchParams.get("filter")
    if (filterParam && ["all", "pending", "completed"].includes(filterParam)) {
      setFilter(filterParam)
    }
  }, [searchParams])

  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case "pending":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        )
      case "completed":
      case "accepted":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Completed
          </span>
        )
      case "rejected":
      case "cancelled":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            {status === "rejected" ? "Rejected" : "Cancelled"}
          </span>
        )
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status || "Unknown"}
          </span>
        )
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 pb-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading requests...</p>
        </div>
        <BottomNavigation />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/hotel/dashboard")}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">Order Requests</h1>
              <p className="text-sm text-gray-500">Manage your order requests</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === "all"
                  ? "bg-[#ff8100] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("pending")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === "pending"
                  ? "bg-[#ff8100] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter("completed")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === "completed"
                  ? "bg-[#ff8100] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Completed
            </button>
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {requests.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Requests Found
            </h3>
            <p className="text-gray-500">
              {filter === "all"
                ? "You don't have any order requests yet."
                : `You don't have any ${filter} requests.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div
                key={request._id || request.id}
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <FileText className="w-5 h-5 text-[#ff8100]" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Request #{request.requestId || request._id?.slice(-6) || "N/A"}
                      </h3>
                    </div>
                    {request.orderId && (
                      <p className="text-sm text-gray-500 mb-1">
                        Order ID: {request.orderId}
                      </p>
                    )}
                    {request.createdAt && (
                      <p className="text-sm text-gray-500">
                        {new Date(request.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {getStatusBadge(request.status)}
                </div>

                {request.description && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-700">{request.description}</p>
                  </div>
                )}

                {request.items && request.items.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Items:</p>
                    <div className="space-y-1">
                      {request.items.map((item, index) => (
                        <div
                          key={index}
                          className="text-sm text-gray-600 flex justify-between"
                        >
                          <span>{item.name || item.itemName}</span>
                          <span className="font-medium">
                            {item.quantity && `Qty: ${item.quantity}`}
                            {item.price && ` - ₹${item.price}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {request.totalAmount && (
                  <div className="pt-4 border-t flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Total Amount:</span>
                    <span className="text-lg font-bold text-[#ff8100]">
                      ₹{request.totalAmount}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  )
}
