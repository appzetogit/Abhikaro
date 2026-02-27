import { useState, useMemo, useEffect } from "react"
import { Search, Eye, Pencil, Trash2, ArrowUpDown, Loader2, Building2, MapPin, Phone, Mail, QrCode, FileText, Image as ImageIcon, ExternalLink, X, Plus, Upload, Download } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { uploadToCloudinary } from "@/lib/utils/cloudinary"

export default function HotelsList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortOrder, setSortOrder] = useState("asc") // "asc" or "desc"
  const [sortBy, setSortBy] = useState("hotelName") // "hotelName" or "address"
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
  const [newHotelData, setNewHotelData] = useState({
    hotelName: "",
    email: "",
    address: "",
    phone: "",
    isActive: false,
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

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(field)
      setSortOrder("asc")
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
        folder: "appzeto/hotel-documents" 
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
    if (!newHotelImages.aadharCardImage) errors.aadharCard = "Aadhar card image is required"
    if (!newHotelImages.hotelRentProofImage) errors.rentProof = "Hotel rent proof image is required"
    if (newHotelImages.cancelledCheckImages.length === 0) {
      errors.cancelledChecks = "At least one cancelled check image is required"
    }

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
        aadharCardImage: newHotelImages.aadharCardImage,
        hotelRentProofImage: newHotelImages.hotelRentProofImage,
        cancelledCheckImages: newHotelImages.cancelledCheckImages,
      }

      console.log("📤 Creating hotel with data:", {
        ...hotelData,
        aadharCardImage: hotelData.aadharCardImage ? "✓" : "✗",
        hotelRentProofImage: hotelData.hotelRentProofImage ? "✓" : "✗",
        cancelledCheckImages: hotelData.cancelledCheckImages?.length || 0,
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
          isActive: false,
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
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Hotels Management</h1>
          <p className="text-slate-600">Manage all hotels in the system</p>
        </div>
        <Button
          onClick={() => setAddDialog(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Hotel
        </Button>
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
                filteredAndSortedHotels.map((hotel) => (
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

                  {/* Aadhar Card Image */}
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
                   (!editDialog.cancelledCheckImages || editDialog.cancelledCheckImages.length === 0) && (
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
                  value={qrCodeDialog.qrCode}
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
              <div className="mt-5 flex justify-center">
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

            {/* Documents Card */}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" />
                Documents <span className="text-red-500">*</span>
              </h3>
              
              <div className="space-y-3">
                {/* Aadhar Card Image */}
                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Aadhar Card Image <span className="text-red-500">*</span>
                  </Label>
                  {uploadingImages.aadharCard ? (
                    <div className="flex flex-col items-center justify-center w-32 h-20 border-2 border-dashed border-blue-400 rounded-lg bg-blue-50">
                      <Loader2 className="w-5 h-5 text-blue-600 mb-1 animate-spin" />
                      <span className="text-xs text-blue-600">Uploading...</span>
                    </div>
                  ) : newHotelImages.aadharCardImage?.url ? (
                    <div className="relative inline-block">
                      <img
                        src={newHotelImages.aadharCardImage.url}
                        alt="Aadhar Card"
                        className="w-32 h-20 object-cover rounded border border-slate-200"
                      />
                      <button
                        onClick={() => handleRemoveImage("aadharCard")}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-32 h-20 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors bg-white">
                      <Upload className="w-5 h-5 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-500">Upload</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handleImageUpload("aadharCard", file)
                            e.target.value = "" // Reset input
                          }
                        }}
                        disabled={uploadingImages.aadharCard}
                      />
                    </label>
                  )}
                  {formErrors.aadharCard && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.aadharCard}</p>
                  )}
                </div>

                {/* Hotel Rent Proof Image */}
                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Hotel Rent Proof Image <span className="text-red-500">*</span>
                  </Label>
                  {uploadingImages.rentProof ? (
                    <div className="flex flex-col items-center justify-center w-32 h-20 border-2 border-dashed border-blue-400 rounded-lg bg-blue-50">
                      <Loader2 className="w-5 h-5 text-blue-600 mb-1 animate-spin" />
                      <span className="text-xs text-blue-600">Uploading...</span>
                    </div>
                  ) : newHotelImages.hotelRentProofImage?.url ? (
                    <div className="relative inline-block">
                      <img
                        src={newHotelImages.hotelRentProofImage.url}
                        alt="Rent Proof"
                        className="w-32 h-20 object-cover rounded border border-slate-200"
                      />
                      <button
                        onClick={() => handleRemoveImage("rentProof")}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-32 h-20 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors bg-white">
                      <Upload className="w-5 h-5 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-500">Upload</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handleImageUpload("rentProof", file)
                            e.target.value = "" // Reset input
                          }
                        }}
                        disabled={uploadingImages.rentProof}
                      />
                    </label>
                  )}
                  {formErrors.rentProof && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.rentProof}</p>
                  )}
                </div>

                {/* Cancelled Check Images */}
                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Cancelled Check Images <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {newHotelImages.cancelledCheckImages.map((img, index) => (
                      <div key={index} className="relative">
                        <img
                          src={img.url}
                          alt={`Check ${index + 1}`}
                          className="w-32 h-20 object-cover rounded border border-slate-200"
                        />
                        <button
                          onClick={() => handleRemoveImage("cancelledChecks", index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {uploadingImages.cancelledChecks ? (
                      <div className="flex flex-col items-center justify-center w-32 h-20 border-2 border-dashed border-blue-400 rounded-lg bg-blue-50">
                        <Loader2 className="w-5 h-5 text-blue-600 mb-1 animate-spin" />
                        <span className="text-xs text-blue-600">Uploading...</span>
                      </div>
                    ) : newHotelImages.cancelledCheckImages.length < 3 && (
                      <label className="flex flex-col items-center justify-center w-32 h-20 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors bg-white">
                        <Upload className="w-5 h-5 text-slate-400 mb-1" />
                        <span className="text-xs text-slate-500">Upload</span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              handleImageUpload("cancelledChecks", file)
                              e.target.value = "" // Reset input
                            }
                          }}
                          disabled={uploadingImages.cancelledChecks}
                        />
                      </label>
                    )}
                  </div>
                  {formErrors.cancelledChecks && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.cancelledChecks}</p>
                  )}
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
                    isActive: false,
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
