import { useState, useEffect } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Building2, Phone, Mail, MapPin, Loader2, XCircle } from "lucide-react"
import { hotelPublicAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"

export default function ViewHotel() {
  const { hotelId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [hotel, setHotel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchHotel = async () => {
      if (!hotelId) {
        setError("Hotel ID is required")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        console.log("🔍 Fetching hotel with ID:", hotelId)
        const response = await hotelPublicAPI.getHotelByHotelId(hotelId)
        console.log("📦 Hotel API response:", response)
        
        if (response.data?.success && response.data.data?.hotel) {
          const hotelData = response.data.data.hotel
          setHotel(hotelData)
          
          // Store hotel reference for order tracking
          // Get hotelRef from URL params or use hotelId
          const hotelRef = searchParams.get("hotelRef") || hotelId || hotelData.hotelId
          if (hotelRef) {
            // Store in localStorage so it persists across sessions
            localStorage.setItem("hotelReference", hotelRef)
            localStorage.setItem("hotelReferenceName", hotelData.hotelName || "")
            localStorage.setItem("hotelReferenceTimestamp", Date.now().toString())
            console.log("✅ Hotel reference stored:", {
              hotelRef,
              hotelName: hotelData.hotelName,
              timestamp: new Date().toISOString()
            })
          }
        } else {
          console.error("❌ Hotel not found in response:", response.data)
          setError("Hotel not found")
        }
      } catch (err) {
        console.error("❌ Error fetching hotel:", {
          error: err,
          message: err.message,
          response: err.response?.data,
          status: err.response?.status,
          hotelId: hotelId
        })
        setError(err.response?.data?.message || err.message || "Failed to load hotel details")
      } finally {
        setLoading(false)
      }
    }

    fetchHotel()
  }, [hotelId, searchParams])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#ff8100] mx-auto" />
          <p className="mt-4 text-gray-600">Loading hotel details...</p>
        </div>
      </div>
    )
  }

  if (error || !hotel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-4">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Hotel Not Found</h1>
          <p className="text-gray-600 mb-6">{error || "The hotel you're looking for doesn't exist."}</p>
          <Button
            onClick={() => navigate("/")}
            className="bg-[#ff8100] hover:bg-[#ff8100]/90 text-white"
          >
            Go to Home
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Hotel Details</h1>
            <Button
              onClick={() => navigate("/")}
              variant="outline"
            >
              Close
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Hotel Card */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
          {/* Profile Image */}
          {hotel.profileImage?.url ? (
            <div className="flex justify-center mb-6">
              <img
                src={hotel.profileImage.url}
                alt={hotel.hotelName}
                className="w-32 h-32 rounded-full object-cover border-4 border-[#ff8100]"
              />
            </div>
          ) : (
            <div className="flex justify-center mb-6">
              <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center border-4 border-[#ff8100]">
                <Building2 className="h-16 w-16 text-gray-400" />
              </div>
            </div>
          )}

          {/* Hotel Name */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">{hotel.hotelName}</h2>
            {hotel.hotelId && (
              <p className="text-sm text-gray-500">Hotel ID: {hotel.hotelId}</p>
            )}
          </div>

          {/* Hotel Information */}
          <div className="space-y-6">
            {hotel.email && (
              <div className="flex items-start gap-4">
                <Mail className="h-6 w-6 text-[#ff8100] mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Email</p>
                  <p className="text-lg text-gray-900">{hotel.email}</p>
                </div>
              </div>
            )}

            {hotel.phone && (
              <div className="flex items-start gap-4">
                <Phone className="h-6 w-6 text-[#ff8100] mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Phone</p>
                  <p className="text-lg text-gray-900">{hotel.phone}</p>
                </div>
              </div>
            )}

            {hotel.address && (
              <div className="flex items-start gap-4">
                <MapPin className="h-6 w-6 text-[#ff8100] mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Address</p>
                  <p className="text-lg text-gray-900">{hotel.address}</p>
                </div>
              </div>
            )}

            {/* Status */}
            <div className="flex items-center gap-4 pt-4 border-t">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Status</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  hotel.isActive
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}>
                  {hotel.isActive ? "Active" : "Pending Approval"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="bg-[#ff8100] rounded-lg shadow-sm p-6 text-center text-white">
          <h3 className="text-xl font-bold mb-2">Order Food from {hotel.hotelName}</h3>
          <p className="mb-4 opacity-90">
            {localStorage.getItem("hotelReference") === hotelId 
              ? "✅ Hotel reference active - Your orders will be linked to this hotel"
              : "Your orders will be linked to this hotel"}
          </p>
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="bg-white text-[#ff8100] hover:bg-gray-100"
          >
            Browse Restaurants & Order
          </Button>
        </div>
      </div>
    </div>
  )
}
