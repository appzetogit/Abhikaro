import { useState, useMemo, useEffect } from "react"
import { Search, Eye, Pencil, Trash2, ArrowUpDown, Loader2, Building2, MapPin, Phone, Mail, QrCode, FileText, Image as ImageIcon, ExternalLink, X, Plus, Upload, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { uploadToCloudinary } from "@/lib/utils/cloudinary"
import qrPosterTemplate from "@/assets/qrcode.png"
import { exportHotelsToPDF } from "./hotelsExportUtils"

const ITEMS_PER_PAGE = 15

function normalizeHotelQrValue(rawValue, hotelId) {
  const origin = window.location.origin
  const fallback = hotelId ? `${origin}/hotel-menu?ref=${encodeURIComponent(hotelId)}` : `${origin}/hotel-menu`

  if (!rawValue || typeof rawValue !== "string") return fallback

  // If DB accidentally stored a QR image data URL, never encode that into another QR.
  if (rawValue.startsWith("data:image/")) return fallback

  // Already correct
  if (rawValue.includes("/hotel-menu") && rawValue.includes("ref=")) return rawValue

  // Legacy /hotel/view/:id?hotelRef=...
  try {
    const url = new URL(rawValue, origin)
    const ref =
      url.searchParams.get("ref") ||
      url.searchParams.get("hotelRef") ||
      url.pathname.match(/\/hotel\/view\/([^/?]+)/)?.[1] ||
      hotelId ||
      null

    if (ref) return `${origin}/hotel-menu?ref=${encodeURIComponent(ref)}`
  } catch {
    // ignore
  }

  return fallback
}

export default function HotelsList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortOrder, setSortOrder] = useState("asc") // "asc" or "desc"
  const [sortBy, setSortBy] = useState("hotelName") // "hotelName" or "address"
  const [currentPage, setCurrentPage] = useState(1)
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [editDialog, setEditDialog] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [qrCodeDialog, setQrCodeDialog] = useState(null)
  const [downloadingQr, setDownloadingQr] = useState(false)
  const [addDialog, setAddDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [uploadingImages, setUploadingImages] = useState({
    aadharCard: false,
    rentProof: false,
    cancelledChecks: false,
  })
  const [uploadingKyc, setUploadingKyc] = useState({
    aadharCardFront: false,
    aadharCardBack: false,
    panCardFront: false,
    panCardBack: false,
    hotelAddressVerifyDocumentFront: false,
    bankPassbookFront: false,
  })
  const [newHotelData, setNewHotelData] = useState({
    hotelName: "",
    email: "",
    address: "",
    phone: "",
    isActive: true,
  })
  const [newHotelImages, setNewHotelImages] = useState({
    aadharCardImage: null,
    hotelRentProofImage: null,
    cancelledCheckImages: [],
  })
  const [formErrors, setFormErrors] = useState({})

  // Fetch hotels from backend API
  useEffect(() => {
    const fetchHotels = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const response = await adminAPI.getHotels({ limit: 1000 })
        
        if (response.data && response.data.success && response.data.data) {
          const hotelsData = response.data.data.hotels || []
          setHotels(hotelsData)
        } else {
          setHotels([])
        }
      } catch (err) {
        console.error("Error fetching hotels:", err)
        setError(err.response?.data?.message || "Failed to fetch hotels")
        setHotels([])
        toast.error("Failed to fetch hotels")
      } finally {
        setLoading(false)
      }
    }
    
    fetchHotels()
  }, [])

  // Filter and sort hotels
  const filteredAndSortedHotels = useMemo(() => {
    let result = [...hotels]
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(hotel =>
        (hotel.hotelName || "").toLowerCase().includes(query) ||
        (hotel.email || "").toLowerCase().includes(query) ||
        (hotel.phone || "").includes(query) ||
        (hotel.address || "").toLowerCase().includes(query) ||
        (hotel.hotelId || "").toLowerCase().includes(query)
      )
    }

    // Sort hotels
    result.sort((a, b) => {
      let aValue = ""
      let bValue = ""
      
      if (sortBy === "hotelName") {
        aValue = (a.hotelName || "").toLowerCase()
        bValue = (b.hotelName || "").toLowerCase()
      } else if (sortBy === "address") {
        aValue = (a.address || "").toLowerCase()
        bValue = (b.address || "").toLowerCase()
      }
      
      if (sortOrder === "asc") {
        return aValue.localeCompare(bValue)
      } else {
        return bValue.localeCompare(aValue)
      }
    })

    return result
  }, [hotels, searchQuery, sortBy, sortOrder])

  // Calculate pagination
  const totalPages = Math.ceil(filteredAndSortedHotels.length / ITEMS_PER_PAGE)
  const paginatedHotels = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return filteredAndSortedHotels.slice(startIndex, endIndex)
  }, [filteredAndSortedHotels, currentPage])

  // Reset to page 1 when search or sort changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sortBy, sortOrder])

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(field)
      setSortOrder("asc")
    }
  }

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      // Scroll to top of table
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = []
    const maxVisiblePages = 5
    
    if (totalPages <= maxVisiblePages) {
      // Show all pages if total pages is less than max visible
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Show pages with ellipsis
      if (currentPage <= 3) {
        // Show first pages
        for (let i = 1; i <= 5; i++) {
          pages.push(i)
        }
      } else if (currentPage >= totalPages - 2) {
        // Show last pages
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        // Show pages around current page
        for (let i = currentPage - 2; i <= currentPage + 2; i++) {
          pages.push(i)
        }
      }
    }
    
    return pages
  }

  const handleKycUpload = async (field, file) => {
    if (!editDialog || !file) return

    setUploadingKyc((prev) => ({ ...prev, [field]: true }))
    try {
      // Upload to Cloudinary via backend
      const result = await uploadToCloudinary(file, {
        folder: `hotel-kyc-documents/${editDialog.hotelId || editDialog._id}`,
      })

      const documentData = {
        url: result.url || result.secure_url,
        publicId: result.publicId || result.public_id || null,
      }

      if (!documentData.url) {
        throw new Error("No URL returned from upload service")
      }

      // Update on backend
      await adminAPI.updateHotel(editDialog._id, {
        [field]: documentData,
      })

      // Update local edit dialog state
      const updatedEdit = {
        ...editDialog,
        [field]: documentData,
      }
      setEditDialog(updatedEdit)

      // Update hotels list
      setHotels((prev) =>
        prev.map((h) =>
          h._id === editDialog._id ? { ...h, [field]: documentData } : h,
        ),
      )

      toast.success("Document updated successfully")
    } catch (err) {
      console.error("Error updating KYC document:", err)
      toast.error(
        err?.response?.data?.message || "Failed to update document",
      )
    } finally {
      setUploadingKyc((prev) => ({ ...prev, [field]: false }))
    }
  }

  const handleDelete = async (hotel) => {
    setDeleteConfirmDialog(hotel)
  }

  const confirmDelete = async () => {
    if (!deleteConfirmDialog) return
    
    try {
      setDeleting(true)
      await adminAPI.deleteHotel(deleteConfirmDialog._id)
      setHotels(hotels.filter(h => h._id !== deleteConfirmDialog._id))
      toast.success("Hotel deleted successfully")
      setDeleteConfirmDialog(null)
    } catch (err) {
      console.error("Error deleting hotel:", err)
      toast.error(err.response?.data?.message || "Failed to delete hotel")
    } finally {
      setDeleting(false)
    }
  }

  const handleEdit = (hotel) => {
    setEditDialog({
      ...hotel,
      hotelName: hotel.hotelName || "",
      email: hotel.email || "",
      address: hotel.address || "",
      phone: hotel.phone || "",
      isActive: hotel.isActive !== false,
      commission: hotel.commission !== undefined ? hotel.commission : 0,
      profileImage: hotel.profileImage || null,
      aadharCardImage: hotel.aadharCardImage || null,
      hotelRentProofImage: hotel.hotelRentProofImage || null,
      cancelledCheckImages: hotel.cancelledCheckImages || [],
      // KYC documents uploaded from hotel app
      aadharCardFront: hotel.aadharCardFront || null,
      aadharCardBack: hotel.aadharCardBack || null,
      panCardFront: hotel.panCardFront || null,
      panCardBack: hotel.panCardBack || null,
      hotelAddressVerifyDocumentFront:
        hotel.hotelAddressVerifyDocumentFront || null,
      bankPassbookFront: hotel.bankPassbookFront || null,
    })
  }

  const handleUpdate = async () => {
    if (!editDialog) return
    
    try {
      setUpdating(true)
      const updateData = {
        hotelName: editDialog.hotelName,
        email: editDialog.email,
        address: editDialog.address,
        phone: editDialog.phone,
        isActive: editDialog.isActive,
        commission: parseFloat(editDialog.commission) || 0,
      }
      
      await adminAPI.updateHotel(editDialog._id, updateData)
      
      // Update local state
      setHotels(hotels.map(h => 
        h._id === editDialog._id 
          ? { ...h, ...updateData }
          : h
      ))
      
      toast.success("Hotel updated successfully")
      setEditDialog(null)
    } catch (err) {
      console.error("Error updating hotel:", err)
      toast.error(err.response?.data?.message || "Failed to update hotel")
    } finally {
      setUpdating(false)
    }
  }

  const handleViewQR = (hotel) => {
    if (hotel.qrCode) {
      setQrCodeDialog(hotel)
    } else {
      toast.info("QR code not generated for this hotel yet")
    }
  }

  const handleDownloadHotelQR = async () => {
    if (!qrCodeDialog?.qrCode) return

    try {
      setDownloadingQr(true)

      const wrapper = document.getElementById("admin-hotel-qr-code")
      if (!wrapper) {
        throw new Error("QR code element not found")
      }

      const svg = wrapper.querySelector("svg")
      if (!svg) {
        throw new Error("QR code SVG not found")
      }

      // Convert SVG to data URL
      const svgData = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([svgData], {
        type: "image/svg+xml;charset=utf-8",
      })
      const svgUrl = URL.createObjectURL(svgBlob)

      // Load SVG into an Image to draw on canvas
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = svgUrl
      })

      const canvas = document.createElement("canvas")
      const size = 600
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")

      // White background
      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, size, size)

      // Draw QR with padding
      const padding = 40
      ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2)

      // Download as PNG
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.error("Failed to create QR PNG blob")
            toast.error("Failed to generate QR image. Please try again.")
            return
          }
          const url = URL.createObjectURL(blob)
          const link = document.createElement("a")
          link.href = url
          const safeName = (qrCodeDialog.hotelName || "hotel")
            .toString()
            .replace(/[^a-z0-9\-]+/gi, "_")
          link.download = `${safeName}-qr-code.png`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
          URL.revokeObjectURL(svgUrl)
          toast.success("QR code downloaded successfully")
        },
        "image/png",
        1.0,
      )
    } catch (error) {
      console.error("Error downloading hotel QR:", error)
      toast.error("Failed to download QR code. Please try again.")
    } finally {
      setDownloadingQr(false)
    }
  }

  const handleDownloadHotelQRTemplate = async () => {
    if (!qrCodeDialog?.qrCode || !qrCodeDialog?.hotelName) return

    try {
      setDownloadingQr(true)

      // Get the SVG element (current QR)
      const wrapper = document.getElementById("admin-hotel-qr-code")
      if (!wrapper) {
        throw new Error("QR code element not found")
      }

      const svg = wrapper.querySelector("svg")
      if (!svg) {
        throw new Error("QR code SVG not found")
      }

      // Convert SVG to data URL
      const svgData = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([svgData], {
        type: "image/svg+xml;charset=utf-8",
      })
      const svgUrl = URL.createObjectURL(svgBlob)

      // Load SVG into image
      const qrImage = new Image()
      await new Promise((resolve, reject) => {
        qrImage.onload = resolve
        qrImage.onerror = reject
        qrImage.src = svgUrl
      })

      // Load poster template
      const templateImage = new Image()
      templateImage.src = qrPosterTemplate

      await new Promise((resolve, reject) => {
        templateImage.onload = resolve
        templateImage.onerror = reject
      })

      const canvas = document.createElement("canvas")
      const posterWidth = templateImage.width
      const posterHeight = templateImage.height
      canvas.width = posterWidth
      canvas.height = posterHeight
      const ctx = canvas.getContext("2d")

      // Background template
      ctx.drawImage(templateImage, 0, 0, posterWidth, posterHeight)

      // Helper function to split hotel name intelligently (match hotel app formatting)
      const splitHotelName = (hotelName) => {
        if (!hotelName || typeof hotelName !== "string") {
          return [hotelName || "Hotel"]
        }

        const trimmedName = hotelName.trim()

        // Keywords to split on (case-insensitive)
        const splitKeywords = [
          "Hotel",
          "Place",
          "Restaurant",
          "Resort",
          "Lodge",
          "Inn",
          "Palace",
        ]

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

      // Text styling
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

      // "Welcome To"
      ctx.font =
        "bold " + Math.round(posterHeight * 0.032) + "px Arial, sans-serif"
      const welcomeY = posterHeight * 0.09
      ctx.fillText("Welcome To", posterWidth / 2, welcomeY)

      // Hotel name - ALWAYS single line (auto-fit by width)
      const hotelNameSingleLine = String(qrCodeDialog?.hotelName || "Hotel").trim()
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

      // QR placement
      const qrSize = posterWidth * 0.45
      const qrX = posterWidth * 0.1
      const qrY = posterHeight * 0.45

      // White box behind QR
      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40)

      // Draw QR
      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize)

      // Download
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            throw new Error("Failed to create image blob")
          }
          const url = URL.createObjectURL(blob)
          const link = document.createElement("a")
          link.href = url
          // Match hotel app download name formatting
          link.download = `${qrCodeDialog.hotelName || "hotel"}-qr-code-poster-${qrCodeDialog.hotelId || qrCodeDialog._id}.png`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
          URL.revokeObjectURL(svgUrl)
          toast.success("QR code poster downloaded successfully!")
        },
        "image/png",
      )
    } catch (error) {
      console.error("Error downloading hotel QR poster:", error)
      toast.error("Failed to download QR poster. Please try again.")
    } finally {
      setDownloadingQr(false)
    }
  }

  const handleImageUpload = async (type, file) => {
    if (!file) {
      toast.error("Please select a file")
      return
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      toast.error("Image size should be less than 10MB")
      return
    }

    setUploadingImages((prev) => ({ ...prev, [type]: true }))
    try {
      console.log(`📤 Uploading ${type} image:`, file.name, file.size)
      
      // Upload to Cloudinary with hotel documents folder
      const result = await uploadToCloudinary(file, { 
        folder: "hotel-documents" 
      })
      
      console.log(`✅ Upload result for ${type}:`, result)
      
      // Ensure we have url and publicId
      if (!result || !result.url) {
        throw new Error("Invalid response from upload service - no URL returned")
      }

      const imageData = {
        url: result.url,
        publicId: result.publicId || result.public_id || null,
      }

      if (type === "cancelledChecks") {
        setNewHotelImages((prev) => ({
          ...prev,
          cancelledCheckImages: [...prev.cancelledCheckImages, imageData],
        }))
        toast.success("Cancelled check image uploaded successfully")
      } else if (type === "rentProof") {
        setNewHotelImages((prev) => ({
          ...prev,
          hotelRentProofImage: imageData,
        }))
        toast.success("Rent proof image uploaded successfully")
      } else if (type === "aadharCard") {
        setNewHotelImages((prev) => ({
          ...prev,
          aadharCardImage: imageData,
        }))
        toast.success("Aadhar card image uploaded successfully")
      } else {
        // Fallback for any other type
        setNewHotelImages((prev) => ({
          ...prev,
          [`${type}Image`]: imageData,
        }))
        toast.success("Image uploaded successfully")
      }
    } catch (err) {
      console.error(`❌ Error uploading ${type} image:`, err)
      const errorMessage = err.response?.data?.message || err.message || `Failed to upload ${type} image`
      toast.error(errorMessage)
    } finally {
      setUploadingImages((prev) => ({ ...prev, [type]: false }))
    }
  }

  const handleRemoveImage = (type, index = null) => {
    if (type === "cancelledChecks" && index !== null) {
      setNewHotelImages((prev) => ({
        ...prev,
        cancelledCheckImages: prev.cancelledCheckImages.filter((_, i) => i !== index),
      }))
    } else if (type === "rentProof") {
      setNewHotelImages((prev) => ({
        ...prev,
        hotelRentProofImage: null,
      }))
    } else if (type === "aadharCard") {
      setNewHotelImages((prev) => ({
        ...prev,
        aadharCardImage: null,
      }))
    } else {
      setNewHotelImages((prev) => ({
        ...prev,
        [`${type}Image`]: null,
      }))
    }
  }

  const validateAddForm = () => {
    const errors = {}
    if (!newHotelData.hotelName.trim()) errors.hotelName = "Hotel name is required"
    if (!newHotelData.email.trim()) errors.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newHotelData.email)) {
      errors.email = "Invalid email format"
    }
    if (!newHotelData.address.trim()) errors.address = "Address is required"
    if (!newHotelData.phone.trim()) errors.phone = "Phone is required"

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleAddHotel = async () => {
    if (!validateAddForm()) {
      toast.error("Please fill all required fields")
      return
    }

    try {
      setCreating(true)
      
      // Prepare hotel data with proper image format
      const hotelData = {
        hotelName: newHotelData.hotelName.trim(),
        email: newHotelData.email.trim(),
        address: newHotelData.address.trim(),
        phone: newHotelData.phone.trim(),
        isActive: newHotelData.isActive,
      }

      console.log("📤 Creating hotel with data:", {
        ...hotelData,
      })

      const response = await adminAPI.createHotel(hotelData)
      
      console.log("✅ Hotel created response:", response.data)
      
      if (response.data?.success) {
        // Refresh hotels list
        const hotelsResponse = await adminAPI.getHotels({ limit: 1000 })
        if (hotelsResponse.data?.success) {
          setHotels(hotelsResponse.data.data.hotels || [])
        }
        
        toast.success("Hotel created successfully")
        setAddDialog(false)
        // Reset form
        setNewHotelData({
          hotelName: "",
          email: "",
          address: "",
          phone: "",
          isActive: true,
        })
        setNewHotelImages({
          aadharCardImage: null,
          hotelRentProofImage: null,
          cancelledCheckImages: [],
        })
        setFormErrors({})
      } else {
        throw new Error(response.data?.message || "Failed to create hotel")
      }
    } catch (err) {
      console.error("❌ Error creating hotel:", err)
      console.error("Error details:", {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
      })
      
      const errorMessage = 
        err.response?.data?.message || 
        err.response?.data?.error || 
        err.message || 
        "Failed to create hotel. Please check all fields and try again."
      
      toast.error(errorMessage)
    } finally {
      setCreating(false)
    }
  }

  const handleExportPDF = () => {
    if (filteredAndSortedHotels.length === 0) {
      toast.error("No data to export")
      return
    }
    
    exportHotelsToPDF(filteredAndSortedHotels, "hotels_list")
    toast.success("PDF report generated successfully")
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-600" />
          <p className="mt-4 text-slate-600">Loading hotels...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Hotels Management</h1>
          <p className="text-slate-600 text-sm">
            Total Hotels: <span className="font-semibold">{hotels.length}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleExportPDF}
            variant="outline"
            className="flex items-center gap-2 border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span className="font-bold">Export PDF</span>
          </Button>

          <Button
            onClick={() => setAddDialog(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Hotel
          </Button>
        </div>
      </div>

      {/* Search and Sort */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search by hotel name, email, phone, address, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleSort("hotelName")}
              className="flex items-center gap-2"
            >
              <ArrowUpDown className="w-4 h-4" />
              {sortBy === "hotelName" && (sortOrder === "asc" ? "A-Z" : "Z-A")}
              {sortBy !== "hotelName" && "Sort Name"}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSort("address")}
              className="flex items-center gap-2"
            >
              <ArrowUpDown className="w-4 h-4" />
              {sortBy === "address" && (sortOrder === "asc" ? "A-Z" : "Z-A")}
              {sortBy !== "address" && "Sort Address"}
            </Button>
          </div>
        </div>
      </div>

      {/* Hotels Table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Hotel ID
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Hotel Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Address
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-4 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredAndSortedHotels.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-slate-500">
                    {error ? (
                      <div>
                        <p className="text-red-600 mb-2">{error}</p>
                        <p>No hotels found</p>
                      </div>
                    ) : (
                      "No hotels found"
                    )}
                  </td>
                </tr>
              ) : (
                paginatedHotels.map((hotel) => (
                  <tr key={hotel._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-900">
                        {hotel.hotelId || hotel._id?.slice(-8) || "N/A"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-slate-400" />
                        <div className="text-sm font-medium text-slate-900">
                          {hotel.hotelName || "N/A"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        <div className="text-sm text-slate-600 max-w-xs truncate">
                          {hotel.address || "N/A"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <div className="text-sm text-slate-600">
                          {hotel.email || "N/A"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <div className="text-sm text-slate-600">
                          {hotel.phone || "N/A"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          hotel.isActive !== false
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {hotel.isActive !== false ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewQR(hotel)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View QR Code"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(hotel)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit Hotel"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(hotel)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Hotel"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {filteredAndSortedHotels.length > 0 && totalPages > 1 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Page Info */}
            <div className="text-sm text-slate-600">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedHotels.length)} of{" "}
              {filteredAndSortedHotels.length} hotels
            </div>

            {/* Pagination Buttons */}
            <div className="flex items-center gap-2">
              {/* Previous Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {getPageNumbers().map((pageNum) => (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    className={`min-w-[40px] ${
                      currentPage === pageNum
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : ""
                    }`}
                  >
                    {pageNum}
                  </Button>
                ))}
              </div>

              {/* Next Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmDialog} onOpenChange={(open) => !open && setDeleteConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Hotel</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirmDialog?.hotelName}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmDialog(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
            <DialogTitle className="text-lg font-semibold text-slate-900">Edit Hotel</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Update hotel information and view documents
            </DialogDescription>
          </DialogHeader>
          {editDialog && (
            <div className="px-6 py-4 space-y-4">
              {/* Hotel Information Card */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5" />
                  Hotel Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="hotelName" className="text-xs font-medium text-slate-600 mb-1.5 block">
                      Hotel Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="hotelName"
                      value={editDialog.hotelName}
                      onChange={(e) => setEditDialog({ ...editDialog, hotelName: e.target.value })}
                      className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter hotel name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-xs font-medium text-slate-600 mb-1.5 block">
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={editDialog.email}
                      onChange={(e) => setEditDialog({ ...editDialog, email: e.target.value })}
                      className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-xs font-medium text-slate-600 mb-1.5 block">
                      Phone <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="phone"
                      value={editDialog.phone}
                      onChange={(e) => setEditDialog({ ...editDialog, phone: e.target.value })}
                      className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter phone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="address" className="text-xs font-medium text-slate-600 mb-1.5 block">
                      Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="address"
                      value={editDialog.address}
                      onChange={(e) => setEditDialog({ ...editDialog, address: e.target.value })}
                      className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter address"
                    />
                  </div>
                  <div>
                    <Label htmlFor="commission" className="text-xs font-medium text-slate-600 mb-1.5 block">
                      Commission (%) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="commission"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={editDialog.commission !== undefined ? editDialog.commission : 0}
                      onChange={(e) => setEditDialog({ ...editDialog, commission: e.target.value })}
                      className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter commission percentage (0-100)"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Commission for orders from QR code scans
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="isActive"
                        checked={editDialog.isActive}
                        onChange={(e) => setEditDialog({ ...editDialog, isActive: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <Label htmlFor="isActive" className="cursor-pointer text-xs font-medium text-slate-700">
                        Hotel is Active
                      </Label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Documents Card */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" />
                  Documents
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {/* Profile Image */}
                  {editDialog.profileImage?.url && (
                    <div className="bg-white rounded-lg p-2 border border-slate-200 hover:border-blue-300 transition-colors">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Profile</Label>
                      <div className="relative">
                        <img
                          src={editDialog.profileImage.url}
                          alt="Profile"
                          className="w-full h-20 object-cover rounded border border-slate-200 cursor-pointer"
                          onClick={() => window.open(editDialog.profileImage.url, '_blank')}
                          onError={(e) => {
                            e.target.style.display = 'none'
                          }}
                        />
                        <a
                          href={editDialog.profileImage.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Aadhar Card Image (old single image field) */}
                  {editDialog.aadharCardImage?.url && (
                    <div className="bg-white rounded-lg p-2 border border-slate-200 hover:border-blue-300 transition-colors">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Aadhar Card</Label>
                      <div className="relative">
                        <img
                          src={editDialog.aadharCardImage.url}
                          alt="Aadhar"
                          className="w-full h-20 object-cover rounded border border-slate-200 cursor-pointer"
                          onClick={() => window.open(editDialog.aadharCardImage.url, '_blank')}
                          onError={(e) => {
                            e.target.style.display = 'none'
                          }}
                        />
                        <a
                          href={editDialog.aadharCardImage.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* KYC Documents from hotel app */}
                  {/* Aadhar Front (Hotel App KYC) */}
                  {editDialog.aadharCardFront?.url ? (
                    <div className="bg-white rounded-lg p-2 border border-slate-200 hover:border-blue-300 transition-colors">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        Aadhar Card Front (Hotel)
                      </Label>
                      <div className="relative">
                        <img
                          src={editDialog.aadharCardFront.url}
                          alt="Aadhar Front"
                          className="w-full h-20 object-cover rounded border border-slate-200 cursor-pointer"
                          onClick={() =>
                            window.open(editDialog.aadharCardFront.url, "_blank")
                          }
                          onError={(e) => {
                            e.target.style.display = "none"
                          }}
                        />
                        <a
                          href={editDialog.aadharCardFront.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <label className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 border border-slate-300 rounded text-[11px] text-slate-600 cursor-pointer hover:bg-slate-50">
                        <Upload className="w-3 h-3" />
                        <span>
                          {uploadingKyc.aadharCardFront ? "Uploading..." : "Change"}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          disabled={uploadingKyc.aadharCardFront}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              handleKycUpload("aadharCardFront", file)
                              e.target.value = ""
                            }
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="bg-white rounded-lg p-2 border border-dashed border-slate-300 hover:border-blue-300 transition-colors flex flex-col items-center justify-center cursor-pointer">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        Aadhar Card Front (Hotel)
                      </Label>
                      <Upload className="w-4 h-4 text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-500">
                        {uploadingKyc.aadharCardFront ? "Uploading..." : "Upload"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        disabled={uploadingKyc.aadharCardFront}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handleKycUpload("aadharCardFront", file)
                            e.target.value = ""
                          }
                        }}
                      />
                    </label>
                  )}

                  {/* Aadhar Back (Hotel App KYC) */}
                  {editDialog.aadharCardBack?.url ? (
                    <div className="bg-white rounded-lg p-2 border border-slate-200 hover:border-blue-300 transition-colors">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        Aadhar Card Back (Hotel)
                      </Label>
                      <div className="relative">
                        <img
                          src={editDialog.aadharCardBack.url}
                          alt="Aadhar Back"
                          className="w-full h-20 object-cover rounded border border-slate-200 cursor-pointer"
                          onClick={() =>
                            window.open(editDialog.aadharCardBack.url, "_blank")
                          }
                          onError={(e) => {
                            e.target.style.display = "none"
                          }}
                        />
                        <a
                          href={editDialog.aadharCardBack.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <label className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 border border-slate-300 rounded text-[11px] text-slate-600 cursor-pointer hover:bg-slate-50">
                        <Upload className="w-3 h-3" />
                        <span>
                          {uploadingKyc.aadharCardBack ? "Uploading..." : "Change"}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          disabled={uploadingKyc.aadharCardBack}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              handleKycUpload("aadharCardBack", file)
                              e.target.value = ""
                            }
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="bg-white rounded-lg p-2 border border-dashed border-slate-300 hover:border-blue-300 transition-colors flex flex-col items-center justify-center cursor-pointer">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        Aadhar Card Back (Hotel)
                      </Label>
                      <Upload className="w-4 h-4 text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-500">
                        {uploadingKyc.aadharCardBack ? "Uploading..." : "Upload"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        disabled={uploadingKyc.aadharCardBack}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handleKycUpload("aadharCardBack", file)
                            e.target.value = ""
                          }
                        }}
                      />
                    </label>
                  )}

                  {/* PAN Front (Hotel App KYC) */}
                  {editDialog.panCardFront?.url ? (
                    <div className="bg-white rounded-lg p-2 border border-slate-200 hover:border-blue-300 transition-colors">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        PAN Card Front (Hotel)
                      </Label>
                      <div className="relative">
                        <img
                          src={editDialog.panCardFront.url}
                          alt="PAN Front"
                          className="w-full h-20 object-cover rounded border border-slate-200 cursor-pointer"
                          onClick={() =>
                            window.open(editDialog.panCardFront.url, "_blank")
                          }
                          onError={(e) => {
                            e.target.style.display = "none"
                          }}
                        />
                        <a
                          href={editDialog.panCardFront.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <label className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 border border-slate-300 rounded text-[11px] text-slate-600 cursor-pointer hover:bg-slate-50">
                        <Upload className="w-3 h-3" />
                        <span>
                          {uploadingKyc.panCardFront ? "Uploading..." : "Change"}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          disabled={uploadingKyc.panCardFront}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              handleKycUpload("panCardFront", file)
                              e.target.value = ""
                            }
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="bg-white rounded-lg p-2 border border-dashed border-slate-300 hover:border-blue-300 transition-colors flex flex-col items-center justify-center cursor-pointer">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        PAN Card Front (Hotel)
                      </Label>
                      <Upload className="w-4 h-4 text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-500">
                        {uploadingKyc.panCardFront ? "Uploading..." : "Upload"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        disabled={uploadingKyc.panCardFront}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handleKycUpload("panCardFront", file)
                            e.target.value = ""
                          }
                        }}
                      />
                    </label>
                  )}

                  {/* PAN Back (Hotel App KYC) */}
                  {editDialog.panCardBack?.url ? (
                    <div className="bg-white rounded-lg p-2 border border-slate-200 hover:border-blue-300 transition-colors">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        PAN Card Back (Hotel)
                      </Label>
                      <div className="relative">
                        <img
                          src={editDialog.panCardBack.url}
                          alt="PAN Back"
                          className="w-full h-20 object-cover rounded border border-slate-200 cursor-pointer"
                          onClick={() =>
                            window.open(editDialog.panCardBack.url, "_blank")
                          }
                          onError={(e) => {
                            e.target.style.display = "none"
                          }}
                        />
                        <a
                          href={editDialog.panCardBack.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <label className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 border border-slate-300 rounded text-[11px] text-slate-600 cursor-pointer hover:bg-slate-50">
                        <Upload className="w-3 h-3" />
                        <span>
                          {uploadingKyc.panCardBack ? "Uploading..." : "Change"}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          disabled={uploadingKyc.panCardBack}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              handleKycUpload("panCardBack", file)
                              e.target.value = ""
                            }
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="bg-white rounded-lg p-2 border border-dashed border-slate-300 hover:border-blue-300 transition-colors flex flex-col items-center justify-center cursor-pointer">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        PAN Card Back (Hotel)
                      </Label>
                      <Upload className="w-4 h-4 text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-500">
                        {uploadingKyc.panCardBack ? "Uploading..." : "Upload"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        disabled={uploadingKyc.panCardBack}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handleKycUpload("panCardBack", file)
                            e.target.value = ""
                          }
                        }}
                      />
                    </label>
                  )}

                  {/* Address Proof (Hotel App KYC) */}
                  {editDialog.hotelAddressVerifyDocumentFront?.url ? (
                    <div className="bg-white rounded-lg p-2 border border-slate-200 hover:border-blue-300 transition-colors">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        Hotel Address Proof (Front)
                      </Label>
                      <div className="relative">
                        <img
                          src={editDialog.hotelAddressVerifyDocumentFront.url}
                          alt="Address Proof"
                          className="w-full h-20 object-cover rounded border border-slate-200 cursor-pointer"
                          onClick={() =>
                            window.open(
                              editDialog.hotelAddressVerifyDocumentFront.url,
                              "_blank",
                            )
                          }
                          onError={(e) => {
                            e.target.style.display = "none"
                          }}
                        />
                        <a
                          href={editDialog.hotelAddressVerifyDocumentFront.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <label className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 border border-slate-300 rounded text-[11px] text-slate-600 cursor-pointer hover:bg-slate-50">
                        <Upload className="w-3 h-3" />
                        <span>
                          {uploadingKyc.hotelAddressVerifyDocumentFront
                            ? "Uploading..."
                            : "Change"}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          disabled={uploadingKyc.hotelAddressVerifyDocumentFront}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              handleKycUpload(
                                "hotelAddressVerifyDocumentFront",
                                file,
                              )
                              e.target.value = ""
                            }
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="bg-white rounded-lg p-2 border border-dashed border-slate-300 hover:border-blue-300 transition-colors flex flex-col items-center justify-center cursor-pointer">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        Hotel Address Proof (Front)
                      </Label>
                      <Upload className="w-4 h-4 text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-500">
                        {uploadingKyc.hotelAddressVerifyDocumentFront
                          ? "Uploading..."
                          : "Upload"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        disabled={uploadingKyc.hotelAddressVerifyDocumentFront}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handleKycUpload(
                              "hotelAddressVerifyDocumentFront",
                              file,
                            )
                            e.target.value = ""
                          }
                        }}
                      />
                    </label>
                  )}

                  {/* Bank Passbook / Cheque (Hotel App KYC) */}
                  {editDialog.bankPassbookFront?.url ? (
                    <div className="bg-white rounded-lg p-2 border border-slate-200 hover:border-blue-300 transition-colors">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        Bank Passbook / Cancelled Cheque (Front)
                      </Label>
                      <div className="relative">
                        <img
                          src={editDialog.bankPassbookFront.url}
                          alt="Bank Passbook"
                          className="w-full h-20 object-cover rounded border border-slate-200 cursor-pointer"
                          onClick={() =>
                            window.open(editDialog.bankPassbookFront.url, "_blank")
                          }
                          onError={(e) => {
                            e.target.style.display = "none"
                          }}
                        />
                        <a
                          href={editDialog.bankPassbookFront.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <label className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 border border-slate-300 rounded text-[11px] text-slate-600 cursor-pointer hover:bg-slate-50">
                        <Upload className="w-3 h-3" />
                        <span>
                          {uploadingKyc.bankPassbookFront
                            ? "Uploading..."
                            : "Change"}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          disabled={uploadingKyc.bankPassbookFront}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              handleKycUpload("bankPassbookFront", file)
                              e.target.value = ""
                            }
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="bg-white rounded-lg p-2 border border-dashed border-slate-300 hover:border-blue-300 transition-colors flex flex-col items-center justify-center cursor-pointer">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                        Bank Passbook / Cancelled Cheque (Front)
                      </Label>
                      <Upload className="w-4 h-4 text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-500">
                        {uploadingKyc.bankPassbookFront
                          ? "Uploading..."
                          : "Upload"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        disabled={uploadingKyc.bankPassbookFront}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handleKycUpload("bankPassbookFront", file)
                            e.target.value = ""
                          }
                        }}
                      />
                    </label>
                  )}

                  {/* Hotel Rent Proof Image */}
                  {editDialog.hotelRentProofImage?.url && (
                    <div className="bg-white rounded-lg p-2 border border-slate-200 hover:border-blue-300 transition-colors">
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Rent Proof</Label>
                      <div className="relative">
                        <img
                          src={editDialog.hotelRentProofImage.url}
                          alt="Rent Proof"
                          className="w-full h-20 object-cover rounded border border-slate-200 cursor-pointer"
                          onClick={() => window.open(editDialog.hotelRentProofImage.url, '_blank')}
                          onError={(e) => {
                            e.target.style.display = 'none'
                          }}
                        />
                        <a
                          href={editDialog.hotelRentProofImage.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Cancelled Check Images */}
                  {editDialog.cancelledCheckImages && Array.isArray(editDialog.cancelledCheckImages) && editDialog.cancelledCheckImages.length > 0 && (
                    editDialog.cancelledCheckImages.map((checkImage, index) => (
                      checkImage?.url && (
                        <div key={index} className="bg-white rounded-lg p-2 border border-slate-200 hover:border-blue-300 transition-colors">
                          <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                            Check {index + 1}
                          </Label>
                          <div className="relative">
                            <img
                              src={checkImage.url}
                              alt={`Check ${index + 1}`}
                              className="w-full h-20 object-cover rounded border border-slate-200 cursor-pointer"
                              onClick={() => window.open(checkImage.url, '_blank')}
                              onError={(e) => {
                                e.target.style.display = 'none'
                              }}
                            />
                            <a
                              href={checkImage.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </div>
                      )
                    ))
                  )}

                  {/* No Documents Message */}
                  {!editDialog.profileImage?.url &&
                   !editDialog.aadharCardImage?.url &&
                   !editDialog.hotelRentProofImage?.url &&
                   (!editDialog.cancelledCheckImages ||
                     editDialog.cancelledCheckImages.length === 0) &&
                   !editDialog.aadharCardFront?.url &&
                   !editDialog.aadharCardBack?.url &&
                   !editDialog.panCardFront?.url &&
                   !editDialog.panCardBack?.url &&
                   !editDialog.hotelAddressVerifyDocumentFront?.url &&
                   !editDialog.bankPassbookFront?.url && (
                    <div className="col-span-full text-center py-6 text-slate-500 text-xs">
                      <FileText className="w-6 h-6 mx-auto mb-1.5 text-slate-400" />
                      <p>No documents uploaded</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  variant="outline"
                  onClick={() => setEditDialog(null)}
                  disabled={updating}
                  className="h-9 px-4 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={updating}
                  className="h-9 px-4 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {updating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!qrCodeDialog} onOpenChange={(open) => !open && setQrCodeDialog(null)}>
        <DialogContent className="max-w-sm p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
            <DialogTitle className="text-lg font-semibold text-slate-900">Hotel QR Code</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              QR Code for {qrCodeDialog?.hotelName}
            </DialogDescription>
          </DialogHeader>
          {qrCodeDialog && qrCodeDialog.qrCode && (
            <div className="px-6 py-6">
              <div
                id="admin-hotel-qr-code"
                className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm mx-auto w-fit"
              >
                <QRCodeSVG
                  value={normalizeHotelQrValue(qrCodeDialog.qrCode, qrCodeDialog.hotelId || qrCodeDialog._id)}
                  size={180}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div className="text-center mt-4 space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {qrCodeDialog.hotelName}
                </p>
                <p className="text-xs text-slate-500 font-mono">
                  ID: {qrCodeDialog.hotelId || qrCodeDialog._id?.slice(-8) || "N/A"}
                </p>
              </div>
              <div className="mt-5 flex justify-center gap-3">
                <Button
                  onClick={handleDownloadHotelQR}
                  className="flex items-center gap-2"
                  variant="outline"
                  disabled={downloadingQr}
                >
                  {downloadingQr ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download QR
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleDownloadHotelQRTemplate}
                  className="flex items-center gap-2 bg-[#ff8100] hover:bg-[#ff8100]/90 text-white"
                  disabled={downloadingQr}
                >
                  {downloadingQr ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download Template
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Hotel Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
            <DialogTitle className="text-lg font-semibold text-slate-900">Add New Hotel</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Fill in all the required information to add a new hotel
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4 space-y-4">
            {/* Hotel Information Card */}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5" />
                Hotel Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="newHotelName" className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Hotel Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="newHotelName"
                    value={newHotelData.hotelName}
                    onChange={(e) => setNewHotelData({ ...newHotelData, hotelName: e.target.value })}
                    className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter hotel name"
                  />
                  {formErrors.hotelName && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.hotelName}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="newEmail" className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={newHotelData.email}
                    onChange={(e) => setNewHotelData({ ...newHotelData, email: e.target.value })}
                    className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter email"
                  />
                  {formErrors.email && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="newPhone" className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Phone <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="newPhone"
                    value={newHotelData.phone}
                    onChange={(e) => setNewHotelData({ ...newHotelData, phone: e.target.value })}
                    className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter phone number"
                  />
                  {formErrors.phone && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="newAddress" className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Address <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="newAddress"
                    value={newHotelData.address}
                    onChange={(e) => setNewHotelData({ ...newHotelData, address: e.target.value })}
                    className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter address"
                  />
                  {formErrors.address && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.address}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="newIsActive"
                      checked={newHotelData.isActive}
                      onChange={(e) => setNewHotelData({ ...newHotelData, isActive: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <Label htmlFor="newIsActive" className="cursor-pointer text-xs font-medium text-slate-700">
                      Hotel is Active
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="outline"
                onClick={() => {
                  setAddDialog(false)
                  setNewHotelData({
                    hotelName: "",
                    email: "",
                    address: "",
                    phone: "",
                    isActive: true,
                  })
                  setNewHotelImages({
                    aadharCardImage: null,
                    hotelRentProofImage: null,
                    cancelledCheckImages: [],
                  })
                  setFormErrors({})
                }}
                disabled={creating}
                className="h-9 px-4 text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddHotel}
                disabled={creating}
                className="h-9 px-4 text-sm bg-blue-600 hover:bg-blue-700 text-white"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Hotel"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
