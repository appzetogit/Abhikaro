import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Building2, Phone, Mail, MapPin, Upload, X, LogOut, QrCode, Download, Loader2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import BottomNavigation from "../components/BottomNavigation"
import { hotelAPI } from "@/lib/api"
import { isModuleAuthenticated, clearModuleAuth } from "@/lib/utils/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { uploadToCloudinary } from "@/lib/utils/cloudinary"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { toast } from "sonner"
import qrPosterTemplate from "@/assets/qrcode.png"

export default function HotelProfile() {
  const navigate = useNavigate()
  const companyName = useCompanyName()
  const [hotel, setHotel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    hotelName: "",
    email: "",
    address: "",
  })
  const [uploading, setUploading] = useState(false)
  const [profileImage, setProfileImage] = useState(null)
  const [qrCodeData, setQrCodeData] = useState(null)
  const [loadingQR, setLoadingQR] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [downloadingQR, setDownloadingQR] = useState(false)
  const [standRequestStatus, setStandRequestStatus] = useState("none")

  // QR code is generated only once and stored in database

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

    const fetchHotel = async () => {
      try {
        const response = await hotelAPI.getCurrentHotel()
        if (response.data?.success && response.data.data?.hotel) {
          const hotelData = response.data.data.hotel
          setHotel(hotelData)
          setFormData({
            hotelName: hotelData.hotelName || "",
            email: hotelData.email || "",
            address: hotelData.address || "",
          })
          setProfileImage(hotelData.profileImage)
          setStandRequestStatus(hotelData.standRequestStatus || "none")
          
          // Check if QR code already exists
          if (hotelData.qrCode) {
            setQrCodeData(hotelData.qrCode)
            // Also fetch latest QR code from API to ensure it's updated (backend will auto-update localhost URLs)
            hotelAPI.getQRCode()
              .then(response => {
                if (response.data?.success) {
                  const updatedQrData = response.data.data?.qrData || response.data.data?.qrCode
                  if (updatedQrData && updatedQrData !== hotelData.qrCode) {
                    setQrCodeData(updatedQrData)
                    // Update hotel state with updated QR code
                    setHotel(prev => prev ? { ...prev, qrCode: updatedQrData } : null)
                  }
                }
              })
              .catch(error => {
                console.error("Error fetching updated QR code:", error)
                // Don't show error to user, just use existing QR code
              })
          }
        }
      } catch (error) {
        console.error("Error fetching hotel data:", error)
        if (error.response?.status === 401) {
          navigate("/hotel/signup", { replace: true })
        }
      } finally {
        setLoading(false)
      }
    }

    fetchHotel()
  }, [navigate])

  const handleImageUpload = async (file) => {
    if (!file) return

    setUploading(true)
    try {
      const result = await uploadToCloudinary(file)
      setProfileImage(result)
    } catch (error) {
      console.error("Error uploading image:", error)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    try {
      setUploading(true)
      const updateData = {
        ...formData,
        profileImage,
      }
      await hotelAPI.updateProfile(updateData)
      setEditing(false)
      // Refresh hotel data
      const response = await hotelAPI.getCurrentHotel()
      if (response.data?.success && response.data.data?.hotel) {
        setHotel(response.data.data.hotel)
      }
    } catch (error) {
      console.error("Error updating profile:", error)
    } finally {
      setUploading(false)
    }
  }

  const handleLogout = async () => {
    if (isLoggingOut) return // Prevent multiple clicks

    setIsLoggingOut(true)

    try {
      // Remove FCM token from backend (stop push notifications for this device)
      try {
        const { removeFcmToken } = await import("@/lib/fcmService.js")
        await removeFcmToken()
      } catch (fcmError) {
        console.warn("FCM token removal failed:", fcmError)
      }

      // Call backend logout API to invalidate refresh token
      try {
        await hotelAPI.logout()
      } catch (apiError) {
        // Continue with logout even if API call fails (network issues, etc.)
        console.warn("Logout API call failed, continuing with local cleanup:", apiError)
      }

      // Clear hotel module authentication data using utility function
      clearModuleAuth("hotel")

      // Clear all hotel-related localStorage items
      localStorage.removeItem("hotel_accessToken")
      localStorage.removeItem("hotel_authenticated")
      localStorage.removeItem("hotel_user")
      localStorage.removeItem("hotel")

      // Clear sessionStorage
      sessionStorage.removeItem("hotelAuthData")

      // Clear any other hotel-related data
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith("hotel_")) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))

      // Dispatch auth change event to notify other components
      window.dispatchEvent(new Event("hotelAuthChanged"))

      // Immediately navigate to hotel signup page
      navigate("/hotel", { replace: true })
    } catch (error) {
      // Even if there's an error, we should still clear local data and logout
      console.error("Error during logout:", error)
      clearModuleAuth("hotel")
      localStorage.removeItem("hotel_accessToken")
      localStorage.removeItem("hotel_authenticated")
      localStorage.removeItem("hotel_user")
      sessionStorage.removeItem("hotelAuthData")
      window.dispatchEvent(new Event("hotelAuthChanged"))
      // Immediately navigate to hotel signup page
      navigate("/hotel", { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleStandRequest = async () => {
    if (!hotel) return
    if (standRequestStatus === "approved") return

    try {
      const response = await hotelAPI.requestStand()
      if (response.data?.success) {
        const status =
          response.data.data?.standRequestStatus ||
          response.data.data?.status ||
          "requested"
        setStandRequestStatus(status)
        toast.success(
          status === "approved"
            ? "Stand request approved"
            : "Stand request submitted",
        )
      } else {
        toast.error("Failed to submit stand request")
      }
    } catch (error) {
      console.error("Error requesting stand:", error)
      toast.error(
        error.response?.data?.message ||
          "Failed to submit stand request. Please try again.",
      )
    }
  }

  const handleGenerateQR = async () => {
    setLoadingQR(true)
    try {
      // Always fetch latest QR code from backend (backend will update localhost URLs automatically)
      const response = await hotelAPI.getQRCode()
      if (response.data?.success) {
        const qrData = response.data.data?.qrData || response.data.data?.qrCode
        setQrCodeData(qrData)
        // Update hotel state with QR code
        if (hotel) {
          setHotel({ ...hotel, qrCode: qrData })
        }
        // Show success message if QR code was updated
        if (qrCodeData && qrCodeData !== qrData) {
          toast.success("QR code updated with production URL")
        }
      }
    } catch (error) {
      console.error("Error generating QR code:", error)
      alert("Failed to generate QR code. Please try again.")
    } finally {
      setLoadingQR(false)
    }
  }

  const handleDownloadQR = async () => {
    if (!qrCodeData || !hotel) return

    setDownloadingQR(true)
    try {
      // Get the SVG element (current QR)
      const qrElement = document.getElementById("hotel-qr-code")
      if (!qrElement) {
        throw new Error("QR code element not found")
      }

      const svg = qrElement.querySelector("svg")
      if (!svg) {
        throw new Error("QR code SVG not found")
      }

      // Convert SVG to data URL
      const svgData = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
      const svgUrl = URL.createObjectURL(svgBlob)

      // Create an image element to convert SVG to PNG
      const qrImage = new Image()
      
      await new Promise((resolve, reject) => {
        qrImage.onload = resolve
        qrImage.onerror = reject
        qrImage.src = svgUrl
      })

      // Load poster template image
      const templateImage = new Image()
      templateImage.src = qrPosterTemplate

      await new Promise((resolve, reject) => {
        templateImage.onload = resolve
        templateImage.onerror = reject
      })

      // Create canvas with same size as template image
      const canvas = document.createElement("canvas")
      const posterWidth = templateImage.width
      const posterHeight = templateImage.height
      canvas.width = posterWidth
      canvas.height = posterHeight
      const ctx = canvas.getContext("2d")

      // Draw the template image as background
      ctx.drawImage(templateImage, 0, 0, posterWidth, posterHeight)

      // Top white section me hotel ka naam - proper formatting with bold
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "#DC2626"
      
      // "Welcome To" text - smaller, bold, positioned higher
      ctx.font = "bold " + Math.round(posterHeight * 0.032) + "px Arial, sans-serif"
      const welcomeY = posterHeight * 0.09
      ctx.fillText("Welcome To", posterWidth / 2, welcomeY)
      
      // Hotel name - larger, bold, positioned higher with less spacing
      ctx.font = "bold " + Math.round(posterHeight * 0.055) + "px Arial, sans-serif"
      const hotelNameY = welcomeY + (posterHeight * 0.06)
      ctx.fillText(hotel.hotelName || "Hotel", posterWidth / 2, hotelNameY)

      // Calculate QR placement inside white box area of template
      // (Approximate based on template layout: left-centre big white area)
      const qrSize = posterWidth * 0.45
      const qrX = posterWidth * 0.1
      const qrY = posterHeight * 0.45 // Moved down from 0.33 to 0.38

      // Optional white box behind QR for extra clarity
      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40)

      // Draw QR code on top
      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize)

      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (!blob) {
          throw new Error("Failed to create image blob")
        }
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `${hotel.hotelName || "hotel"}-qr-code-poster-${hotel.hotelId || hotel._id}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        URL.revokeObjectURL(svgUrl)
        
        // Show success message
        toast.success("QR code poster downloaded successfully!")
      }, "image/png")
    } catch (error) {
      console.error("Error downloading QR code poster:", error)
      toast.error("Failed to download QR code poster. Please try again.")
    } finally {
      setDownloadingQR(false)
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
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
            {!editing ? (
              <Button
                onClick={() => setEditing(true)}
                className="bg-primary-orange hover:bg-primary-orange/90"
              >
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setEditing(false)
                    setFormData({
                      hotelName: hotel.hotelName || "",
                      email: hotel.email || "",
                      address: hotel.address || "",
                    })
                    setProfileImage(hotel.profileImage)
                  }}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={uploading}
                  className="bg-primary-orange hover:bg-primary-orange/90"
                >
                  {uploading ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Profile Image */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Profile Image
          </Label>
          <div className="flex items-center gap-4">
            {profileImage?.url ? (
              <div className="relative">
                <img
                  src={profileImage.url}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover"
                />
                {editing && (
                  <button
                    onClick={() => setProfileImage(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
                <Building2 className="h-12 w-12 text-gray-400" />
              </div>
            )}
            {editing && (
              <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <Upload className="h-4 w-4" />
                <span className="text-sm">Upload</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files[0] && handleImageUpload(e.target.files[0])
                  }
                  disabled={uploading}
                />
              </label>
            )}
          </div>
        </div>

        {/* Hotel Information */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Hotel Information</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="hotelName">Hotel Name</Label>
              {editing ? (
                <Input
                  id="hotelName"
                  value={formData.hotelName}
                  onChange={(e) =>
                    setFormData({ ...formData, hotelName: e.target.value })
                  }
                  className="mt-1"
                />
              ) : (
                <div className="flex items-start gap-3 mt-2">
                  <Building2 className="h-5 w-5 text-gray-400 mt-0.5" />
                  <p className="text-base font-medium text-gray-900">{hotel.hotelName}</p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              {editing ? (
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="mt-1"
                />
              ) : (
                <div className="flex items-start gap-3 mt-2">
                  <Mail className="h-5 w-5 text-gray-400 mt-0.5" />
                  <p className="text-base font-medium text-gray-900">{hotel.email || "N/A"}</p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <div className="flex items-start gap-3 mt-2">
                <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                <p className="text-base font-medium text-gray-900">{hotel.phone}</p>
              </div>
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              {editing ? (
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  className="mt-1"
                />
              ) : (
                <div className="flex items-start gap-3 mt-2">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  <p className="text-base font-medium text-gray-900">{hotel.address || "N/A"}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Hotel QR Code</h2>
          <div className="space-y-4">
            {!qrCodeData ? (
              <div className="text-center py-8">
                <QrCode className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-600 mb-4">
                  Generate a unique QR code for your hotel
                </p>
                <Button
                  onClick={handleGenerateQR}
                  disabled={loadingQR}
                  className="bg-[#ff8100] hover:bg-[#ff8100]/90 text-white"
                >
                  {loadingQR ? "Generating..." : "Generate QR Code"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4">
                <div
                  id="hotel-qr-code"
                  className="bg-white p-4 rounded-lg border-2 border-gray-200"
                >
                  <QRCodeSVG
                    value={qrCodeData}
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {hotel.hotelName}
                  </p>
                  <p className="text-xs text-gray-500">
                    Hotel ID: {hotel.hotelId || hotel._id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleDownloadQR}
                    variant="outline"
                    className="flex items-center gap-2"
                    disabled={downloadingQR}
                  >
                    {downloadingQR ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hotel Stand Request */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Request Hotel Stand
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Request a branded stand for your hotel to display the QR code and promote orders.
          </p>
          <Button
            onClick={handleStandRequest}
            disabled={standRequestStatus === "requested" || standRequestStatus === "approved"}
            className={`w-full max-w-xs ${
              standRequestStatus === "approved"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-[#ff8100] hover:bg-[#ff8100]/90"
            } text-white`}
          >
            {standRequestStatus === "approved"
              ? "Approved"
              : standRequestStatus === "requested"
              ? "Requested"
              : "Request Stand"}
          </Button>
        </div>

        {/* Logout */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <Button
            onClick={handleLogout}
            disabled={isLoggingOut}
            variant="outline"
            className="w-full text-red-600 border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Logging out...
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  )
}
