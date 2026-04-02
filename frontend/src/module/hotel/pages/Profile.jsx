import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Building2, Phone, Mail, MapPin, Upload, X, LogOut, QrCode, Download, Loader2, ChevronDown, ChevronUp } from "lucide-react"
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
  const [uploadingDocs, setUploadingDocs] = useState({
    aadharCardFront: false,
    aadharCardBack: false,
    panCardFront: false,
    panCardBack: false,
    hotelAddressVerifyDocumentFront: false,
    bankPassbookFront: false,
  })
  const [documents, setDocuments] = useState({
    aadharCardFront: null,
    aadharCardBack: null,
    panCardFront: null,
    panCardBack: null,
    hotelAddressVerifyDocumentFront: null,
    bankPassbookFront: null,
  })
  const [documentsExpanded, setDocumentsExpanded] = useState(false)

  // QR code is generated only once and stored in database

  // Load business settings (title and favicon)
  useEffect(() => {
    loadBusinessSettings().catch(() => {
      // Silently fail - not critical
    })
  }, [])

  // Auto-open KYC section when navigated with ?kyc=open
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const kyc = params.get('kyc')
      if (kyc === 'open') {
        setDocumentsExpanded(true)
        // Smooth scroll to KYC section after expand
        setTimeout(() => {
          const el = document.getElementById('hotel-kyc-documents-section')
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 50)
      }
    } catch {
      // ignore
    }
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
          setDocuments({
            aadharCardFront: hotelData.aadharCardFront || null,
            aadharCardBack: hotelData.aadharCardBack || null,
            panCardFront: hotelData.panCardFront || null,
            panCardBack: hotelData.panCardBack || null,
            hotelAddressVerifyDocumentFront: hotelData.hotelAddressVerifyDocumentFront || null,
            bankPassbookFront: hotelData.bankPassbookFront || null,
          })
          
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
      // Upload to Cloudinary via backend Multer with proper folder structure
      const result = await uploadToCloudinary(file, {
        folder: `hotel-profiles/${hotel?.hotelId || hotel?._id || 'temp'}`,
      })
      setProfileImage(result)
    } catch (error) {
      console.error("Error uploading image:", error)
      toast.error(error?.response?.data?.message || "Failed to upload image")
    } finally {
      setUploading(false)
    }
  }

  const handleDocumentUpload = async (type, file) => {
    if (!file) return

    // Ensure documents section is expanded to show uploaded image
    if (!documentsExpanded) {
      setDocumentsExpanded(true)
    }

    setUploadingDocs((prev) => ({ ...prev, [type]: true }))
    try {
      // Upload to Cloudinary via backend Multer with proper folder structure
      const result = await uploadToCloudinary(file, {
        folder: `hotel-kyc-documents/${hotel?.hotelId || hotel?._id || 'temp'}`,
      })
      
      // Ensure result has proper structure with url and publicId
      const documentData = {
        url: result.url || result.secure_url,
        publicId: result.publicId || result.public_id || null,
      }
      
      if (!documentData.url) {
        throw new Error("No URL returned from upload service")
      }
      
      // Update state immediately to show uploaded image
      const updatedDocuments = { ...documents, [type]: documentData }
      setDocuments(updatedDocuments)
      
      // Save immediately to backend database
      const updateResponse = await hotelAPI.updateProfile({
        [type]: documentData,
      })
      
      // Verify the update was successful
      if (updateResponse.data?.success || updateResponse.data?.data?.hotel) {
        toast.success("Document uploaded successfully")
        
        // Refresh hotel data from database to ensure consistency
        const response = await hotelAPI.getCurrentHotel()
        if (response.data?.success && response.data.data?.hotel) {
          const hotelData = response.data.data.hotel
          setHotel(hotelData)
          
          // Update documents state with fresh data from database
          const freshDocuments = {
            aadharCardFront: hotelData.aadharCardFront || null,
            aadharCardBack: hotelData.aadharCardBack || null,
            panCardFront: hotelData.panCardFront || null,
            panCardBack: hotelData.panCardBack || null,
            hotelAddressVerifyDocumentFront: hotelData.hotelAddressVerifyDocumentFront || null,
            bankPassbookFront: hotelData.bankPassbookFront || null,
          }
          setDocuments(freshDocuments)
        }
      } else {
        throw new Error("Failed to save document to database")
      }
    } catch (error) {
      console.error("Error uploading document:", error)
      toast.error(error?.response?.data?.message || "Failed to upload document")
      // Revert state on error
      setDocuments(documents)
    } finally {
      setUploadingDocs((prev) => ({ ...prev, [type]: false }))
    }
  }

  const handleRemoveDocument = async (type) => {
    const previousDocument = documents[type]
    const updatedDocuments = { ...documents, [type]: null }
    setDocuments(updatedDocuments)
    
    // Save immediately to backend database
    try {
      await hotelAPI.updateProfile({
        [type]: null,
      })
      
      toast.success("Document removed successfully")
      
      // Refresh hotel data from database
      const response = await hotelAPI.getCurrentHotel()
      if (response.data?.success && response.data.data?.hotel) {
        setHotel(response.data.data.hotel)
        setDocuments({
          aadharCardFront: response.data.data.hotel.aadharCardFront || null,
          aadharCardBack: response.data.data.hotel.aadharCardBack || null,
          panCardFront: response.data.data.hotel.panCardFront || null,
          panCardBack: response.data.data.hotel.panCardBack || null,
          hotelAddressVerifyDocumentFront: response.data.data.hotel.hotelAddressVerifyDocumentFront || null,
          bankPassbookFront: response.data.data.hotel.bankPassbookFront || null,
        })
      }
    } catch (error) {
      console.error("Error removing document:", error)
      toast.error(error?.response?.data?.message || "Failed to remove document")
      // Revert on error
      setDocuments(documents)
    }
  }

  const handleSave = async () => {
    try {
      setUploading(true)
      
      // Helper function to normalize image objects to match schema
      // Schema expects: null or {url: string (valid URI), publicId?: string}
      const normalizeImage = (img) => {
        if (!img || img === null || img === undefined) return null
        
        // Handle string URLs
        if (typeof img === 'string') {
          const trimmedUrl = img.trim()
          if (trimmedUrl === '' || trimmedUrl === 'null' || trimmedUrl === 'undefined') {
            return null
          }
          // Validate it's a proper URL format
          try {
            new URL(trimmedUrl)
            return { url: trimmedUrl }
          } catch {
            // Invalid URL, return null
            return null
          }
        }
        
        // Handle object format
        if (typeof img === 'object') {
          const url = img.url || img.secure_url
          if (!url || typeof url !== 'string') {
            return null
          }
          const trimmedUrl = url.trim()
          if (trimmedUrl === '' || trimmedUrl === 'null' || trimmedUrl === 'undefined') {
            return null
          }
          // Validate URL format
          try {
            new URL(trimmedUrl)
            return {
              url: trimmedUrl,
              publicId: img.publicId || img.public_id || null
            }
          } catch {
            // Invalid URL, return null
            return null
          }
        }
        
        return null
      }
      
      // Build updateData object, only including fields with valid values
      const updateData = {}
      
      // Only include hotelName if it has at least 2 characters (matches schema min)
      if (formData.hotelName && formData.hotelName.trim().length >= 2) {
        updateData.hotelName = formData.hotelName.trim()
      }
      
      // Only include email if it's a valid email (not empty string)
      // Basic email validation (backend will do full validation)
      if (formData.email && formData.email.trim() !== '') {
        const trimmedEmail = formData.email.trim()
        // Basic check for email format (contains @ and .)
        if (trimmedEmail.includes('@') && trimmedEmail.includes('.')) {
          updateData.email = trimmedEmail
        }
      }
      
      // Only include address if it has at least 2 characters (matches schema min)
      if (formData.address && formData.address.trim().length >= 2) {
        updateData.address = formData.address.trim()
      }
      
      // Normalize and include profileImage
      const normalizedProfileImage = normalizeImage(profileImage)
      if (normalizedProfileImage !== null) {
        updateData.profileImage = normalizedProfileImage
      }
      
      // Normalize and include documents (only if they exist)
      const normalizedDocuments = {}
      Object.keys(documents).forEach(key => {
        const normalizedDoc = normalizeImage(documents[key])
        if (normalizedDoc !== null) {
          normalizedDocuments[key] = normalizedDoc
        }
      })
      
      // Merge documents into updateData
      Object.assign(updateData, normalizedDocuments)
      
      console.log('📤 Sending update data:', JSON.stringify(updateData, null, 2))
      
      await hotelAPI.updateProfile(updateData)
      setEditing(false)
      toast.success("Profile updated successfully")
      // Refresh hotel data
      const response = await hotelAPI.getCurrentHotel()
      if (response.data?.success && response.data.data?.hotel) {
        setHotel(response.data.data.hotel)
        setDocuments({
          aadharCardFront: response.data.data.hotel.aadharCardFront || null,
          aadharCardBack: response.data.data.hotel.aadharCardBack || null,
          panCardFront: response.data.data.hotel.panCardFront || null,
          panCardBack: response.data.data.hotel.panCardBack || null,
          hotelAddressVerifyDocumentFront: response.data.data.hotel.hotelAddressVerifyDocumentFront || null,
          bankPassbookFront: response.data.data.hotel.bankPassbookFront || null,
        })
      }
    } catch (error) {
      console.error("Error updating profile:", error)
      console.error("Error response:", error?.response?.data)
      
      // Extract detailed error messages from validation errors
      let errorMessage = "Failed to update profile"
      if (error?.response?.data) {
        const errorData = error.response.data
        if (errorData.errors && Array.isArray(errorData.errors)) {
          // Multiple validation errors
          const errorDetails = errorData.errors.map(e => `${e.field}: ${e.message}`).join(', ')
          errorMessage = `Validation failed: ${errorDetails}`
        } else if (errorData.message) {
          errorMessage = errorData.message
        }
      } else if (error?.message) {
        errorMessage = error.message
      }
      
      toast.error(errorMessage)
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

  // Helper function to split hotel name intelligently
  const splitHotelName = (hotelName) => {
    if (!hotelName || typeof hotelName !== 'string') {
      return [hotelName || 'Hotel']
    }

    const trimmedName = hotelName.trim()
    
    // Keywords to split on (case-insensitive)
    const splitKeywords = ['Hotel', 'Place', 'Restaurant', 'Resort', 'Lodge', 'Inn', 'Palace']
    
    // Find the first occurrence of any keyword
    for (const keyword of splitKeywords) {
      const index = trimmedName.toLowerCase().indexOf(keyword.toLowerCase())
      if (index > 0) {
        // Split before the keyword
        const firstPart = trimmedName.substring(0, index).trim()
        const secondPart = trimmedName.substring(index).trim()
        
        // Only split if first part is not empty and has at least 2 characters
        if (firstPart.length >= 2) {
          return [firstPart, secondPart]
        }
      }
    }
    
    // If no split point found, return as single line
    return [trimmedName]
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

      // Auto-fit helper: largest font size that fits within maxWidth for all lines
      const getFittedFontSize = ({
        lines,
        maxWidth,
        fontFamily = "Arial, sans-serif",
        fontWeight = "bold",
        maxFontSize,
        minFontSize,
      }) => {
        const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : []
        const finalLines = safeLines.length ? safeLines : ["Hotel"]

        for (let size = maxFontSize; size >= minFontSize; size -= 1) {
          ctx.font = `${fontWeight} ${size}px ${fontFamily}`
          const fits = finalLines.every(
            (line) => ctx.measureText(String(line)).width <= maxWidth,
          )
          if (fits) return size
        }
        return minFontSize
      }
      
      // "Welcome To" text - smaller, bold, positioned higher
      ctx.font = "bold " + Math.round(posterHeight * 0.032) + "px Arial, sans-serif"
      const welcomeY = posterHeight * 0.09
      ctx.fillText("Welcome To", posterWidth / 2, welcomeY)
      
      // Hotel name - ALWAYS single line (auto-fit by width)
      const hotelNameSingleLine = String(hotel?.hotelName || "Hotel").trim()
      const nameMaxWidth = posterWidth * 0.86 // safe padding inside the top white rounded area
      const hotelNameFontSize = getFittedFontSize({
        lines: [hotelNameSingleLine],
        maxWidth: nameMaxWidth,
        maxFontSize: Math.round(posterHeight * 0.05),
        minFontSize: Math.round(posterHeight * 0.02),
      })
      ctx.font = "bold " + hotelNameFontSize + "px Arial, sans-serif"

      const hotelNameY = welcomeY + posterHeight * 0.048
      ctx.fillText(hotelNameSingleLine, posterWidth / 2, hotelNameY)

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
                    setDocuments({
                      aadharCardFront: hotel.aadharCardFront || null,
                      aadharCardBack: hotel.aadharCardBack || null,
                      panCardFront: hotel.panCardFront || null,
                      panCardBack: hotel.panCardBack || null,
                      hotelAddressVerifyDocumentFront: hotel.hotelAddressVerifyDocumentFront || null,
                      bankPassbookFront: hotel.bankPassbookFront || null,
                    })
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

        {/* KYC Documents Section */}
        <div id="hotel-kyc-documents-section" className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <button
            onClick={() => setDocumentsExpanded(!documentsExpanded)}
            className="w-full flex items-center justify-between mb-4"
          >
            <h2 className="text-lg font-semibold text-gray-900">KYC Documents</h2>
            {documentsExpanded ? (
              <ChevronUp className="h-5 w-5 text-gray-600" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-600" />
            )}
          </button>
          {documentsExpanded && (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Please upload all required documents to enable withdrawal functionality.
              </p>
              <div className="space-y-6">
            {/* Aadhar Card Front */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Aadhar Card Front *
              </Label>
              {documents.aadharCardFront?.url ? (
                <div className="relative">
                  <img
                    src={documents.aadharCardFront.url}
                    alt="Aadhar Card Front"
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <button
                    onClick={() => handleRemoveDocument("aadharCardFront")}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 ${uploadingDocs.aadharCardFront ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {uploadingDocs.aadharCardFront ? (
                    <>
                      <Loader2 className="h-6 w-6 text-gray-400 mb-2 animate-spin" />
                      <span className="text-sm text-gray-500">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-500">Upload Aadhar Card Front</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) =>
                      e.target.files[0] &&
                      handleDocumentUpload("aadharCardFront", e.target.files[0])
                    }
                    disabled={uploadingDocs.aadharCardFront}
                  />
                </label>
              )}
            </div>

            {/* Aadhar Card Back */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Aadhar Card Back *
              </Label>
              {documents.aadharCardBack?.url ? (
                <div className="relative">
                  <img
                    src={documents.aadharCardBack.url}
                    alt="Aadhar Card Back"
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <button
                    onClick={() => handleRemoveDocument("aadharCardBack")}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 ${uploadingDocs.aadharCardBack ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {uploadingDocs.aadharCardBack ? (
                    <>
                      <Loader2 className="h-6 w-6 text-gray-400 mb-2 animate-spin" />
                      <span className="text-sm text-gray-500">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-500">Upload Aadhar Card Back</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) =>
                      e.target.files[0] &&
                      handleDocumentUpload("aadharCardBack", e.target.files[0])
                    }
                    disabled={uploadingDocs.aadharCardBack}
                  />
                </label>
              )}
            </div>

            {/* PAN Card Front */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                PAN Card Front *
              </Label>
              {documents.panCardFront?.url ? (
                <div className="relative">
                  <img
                    src={documents.panCardFront.url}
                    alt="PAN Card Front"
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <button
                    onClick={() => handleRemoveDocument("panCardFront")}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 ${uploadingDocs.panCardFront ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {uploadingDocs.panCardFront ? (
                    <>
                      <Loader2 className="h-6 w-6 text-gray-400 mb-2 animate-spin" />
                      <span className="text-sm text-gray-500">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-500">Upload PAN Card Front</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) =>
                      e.target.files[0] &&
                      handleDocumentUpload("panCardFront", e.target.files[0])
                    }
                    disabled={uploadingDocs.panCardFront}
                  />
                </label>
              )}
            </div>

            {/* PAN Card Back */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                PAN Card Back *
              </Label>
              {documents.panCardBack?.url ? (
                <div className="relative">
                  <img
                    src={documents.panCardBack.url}
                    alt="PAN Card Back"
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <button
                    onClick={() => handleRemoveDocument("panCardBack")}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 ${uploadingDocs.panCardBack ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {uploadingDocs.panCardBack ? (
                    <>
                      <Loader2 className="h-6 w-6 text-gray-400 mb-2 animate-spin" />
                      <span className="text-sm text-gray-500">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-500">Upload PAN Card Back</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) =>
                      e.target.files[0] &&
                      handleDocumentUpload("panCardBack", e.target.files[0])
                    }
                    disabled={uploadingDocs.panCardBack}
                  />
                </label>
              )}
            </div>

            {/* Hotel Address Verify Document Front */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Hotel Address Verify Document Front *
              </Label>
              {documents.hotelAddressVerifyDocumentFront?.url ? (
                <div className="relative">
                  <img
                    src={documents.hotelAddressVerifyDocumentFront.url}
                    alt="Hotel Address Verify Document"
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <button
                    onClick={() => handleRemoveDocument("hotelAddressVerifyDocumentFront")}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 ${uploadingDocs.hotelAddressVerifyDocumentFront ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {uploadingDocs.hotelAddressVerifyDocumentFront ? (
                    <>
                      <Loader2 className="h-6 w-6 text-gray-400 mb-2 animate-spin" />
                      <span className="text-sm text-gray-500">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-500">Upload Hotel Address Verify Document</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) =>
                      e.target.files[0] &&
                      handleDocumentUpload("hotelAddressVerifyDocumentFront", e.target.files[0])
                    }
                    disabled={uploadingDocs.hotelAddressVerifyDocumentFront}
                  />
                </label>
              )}
            </div>

            {/* Bank Passbook Front */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Check/Bank Passbook Front *
              </Label>
              {documents.bankPassbookFront?.url ? (
                <div className="relative">
                  <img
                    src={documents.bankPassbookFront.url}
                    alt="Bank Passbook"
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <button
                    onClick={() => handleRemoveDocument("bankPassbookFront")}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 ${uploadingDocs.bankPassbookFront ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {uploadingDocs.bankPassbookFront ? (
                    <>
                      <Loader2 className="h-6 w-6 text-gray-400 mb-2 animate-spin" />
                      <span className="text-sm text-gray-500">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-500">Upload Check/Bank Passbook</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) =>
                      e.target.files[0] &&
                      handleDocumentUpload("bankPassbookFront", e.target.files[0])
                    }
                    disabled={uploadingDocs.bankPassbookFront}
                  />
                </label>
              )}
            </div>
              </div>
            </>
          )}
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
