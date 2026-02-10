import { useState, useMemo, useEffect } from "react"
import { 
  Search, Filter, Eye, Check, X, Building2, Loader2,
  FileText, Image as ImageIcon, Phone, Mail, MapPin, Clock, Calendar
} from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function HotelRequests() {
  const [activeTab, setActiveTab] = useState("pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [pendingRequests, setPendingRequests] = useState([])
  const [rejectedRequests, setRejectedRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [hotelDetails, setHotelDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Fetch hotel requests
  useEffect(() => {
    fetchRequests()
  }, [activeTab])

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRequests()
    }, 500)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      setError(null)

      const status = activeTab === "pending" ? "pending" : "rejected"
      const response = await adminAPI.getHotelRequests({
        status,
        search: searchQuery || undefined,
        page: 1,
        limit: 100
      })

      if (response.data && response.data.success && response.data.data) {
        const requests = response.data.data.requests || []
        if (activeTab === "pending") {
          setPendingRequests(requests)
        } else {
          setRejectedRequests(requests)
        }
      } else {
        if (activeTab === "pending") {
          setPendingRequests([])
        } else {
          setRejectedRequests([])
        }
      }
    } catch (err) {
      console.error("Error fetching hotel requests:", err)
      setError(err.message || "Failed to fetch hotel requests")
      toast.error(err.response?.data?.message || "Failed to fetch hotel requests")
      if (activeTab === "pending") {
        setPendingRequests([])
      } else {
        setRejectedRequests([])
      }
    } finally {
      setLoading(false)
    }
  }

  const currentRequests = activeTab === "pending" ? pendingRequests : rejectedRequests

  const filteredRequests = useMemo(() => {
    let filtered = currentRequests

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(request =>
        request.hotelName?.toLowerCase().includes(query) ||
        request.email?.toLowerCase().includes(query) ||
        request.phone?.includes(query) ||
        request.address?.toLowerCase().includes(query) ||
        request.hotelId?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [currentRequests, searchQuery])

  const handleApprove = async (request) => {
    if (window.confirm(`Are you sure you want to approve "${request.hotelName}" hotel request?`)) {
      try {
        setProcessing(true)
        await adminAPI.updateHotel(request._id, { isActive: true })
        
        // Refresh the list
        await fetchRequests()
        
        toast.success(`Successfully approved ${request.hotelName}'s hotel request!`)
      } catch (err) {
        console.error("Error approving request:", err)
        toast.error(err.response?.data?.message || "Failed to approve request. Please try again.")
      } finally {
        setProcessing(false)
      }
    }
  }

  const handleReject = (request) => {
    setSelectedRequest(request)
    setRejectionReason("")
    setShowRejectDialog(true)
  }

  const confirmReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast.error("Please provide a rejection reason")
      return
    }

    try {
      setProcessing(true)
      await adminAPI.updateHotel(selectedRequest._id, { 
        isActive: false,
        rejectionReason: rejectionReason.trim()
      })
      
      // Refresh the list
      await fetchRequests()
      
      setShowRejectDialog(false)
      setSelectedRequest(null)
      setRejectionReason("")
      
      toast.success(`Successfully rejected ${selectedRequest.hotelName}'s hotel request!`)
    } catch (err) {
      console.error("Error rejecting request:", err)
      toast.error(err.response?.data?.message || "Failed to reject request. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  const handleViewDetails = async (request) => {
    setShowDetailsModal(true)
    setLoadingDetails(true)
    try {
      const response = await adminAPI.getHotelById(request._id)
      if (response.data?.success && response.data.data?.hotel) {
        setHotelDetails(response.data.data.hotel)
      }
    } catch (err) {
      console.error("Error fetching hotel details:", err)
      toast.error("Failed to fetch hotel details")
    } finally {
      setLoadingDetails(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hotel Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Manage hotel registration requests</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "pending"
              ? "text-[#ff8100] border-b-2 border-[#ff8100]"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Pending ({pendingRequests.length})
        </button>
        <button
          onClick={() => setActiveTab("rejected")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "rejected"
              ? "text-[#ff8100] border-b-2 border-[#ff8100]"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Rejected ({rejectedRequests.length})
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by hotel name, email, phone, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#ff8100]" />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Requests List */}
      {!loading && !error && (
        <div className="bg-white rounded-lg shadow-sm border">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                No {activeTab} hotel requests found
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hotel
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRequests.map((request) => (
                    <tr key={request._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Building2 className="h-5 w-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {request.hotelName || "N/A"}
                            </div>
                            {request.hotelId && (
                              <div className="text-sm text-gray-500">
                                ID: {request.hotelId}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <div className="flex items-center gap-2 mb-1">
                            <Phone className="h-4 w-4 text-gray-400" />
                            {request.phone || "N/A"}
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400" />
                            {request.email || "N/A"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {request.address || "N/A"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {formatDate(request.createdAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewDetails(request)}
                            className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {activeTab === "pending" && (
                            <>
                              <button
                                onClick={() => handleApprove(request)}
                                disabled={processing}
                                className="text-green-600 hover:text-green-900 p-2 hover:bg-green-50 rounded disabled:opacity-50"
                                title="Approve"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleReject(request)}
                                disabled={processing}
                                className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded disabled:opacity-50"
                                title="Reject"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Hotel Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Please provide a reason for rejecting this hotel request.
            </p>
            <div>
              <Label htmlFor="rejectionReason">Rejection Reason *</Label>
              <textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#ff8100]"
                rows={4}
                placeholder="Enter rejection reason..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false)
                setSelectedRequest(null)
                setRejectionReason("")
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmReject}
              disabled={!rejectionReason.trim() || processing}
              className="bg-red-600 hover:bg-red-700"
            >
              {processing ? "Rejecting..." : "Reject Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Hotel Details</DialogTitle>
          </DialogHeader>
          {loadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#ff8100]" />
            </div>
          ) : hotelDetails ? (
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Hotel Name</Label>
                    <p className="text-sm text-gray-900">{hotelDetails.hotelName || "N/A"}</p>
                  </div>
                  <div>
                    <Label>Hotel ID</Label>
                    <p className="text-sm text-gray-900">{hotelDetails.hotelId || "N/A"}</p>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <p className="text-sm text-gray-900">{hotelDetails.email || "N/A"}</p>
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <p className="text-sm text-gray-900">{hotelDetails.phone || "N/A"}</p>
                  </div>
                  <div className="col-span-2">
                    <Label>Address</Label>
                    <p className="text-sm text-gray-900">{hotelDetails.address || "N/A"}</p>
                  </div>
                </div>
              </div>

               {/* Documents */}
               <div>
                 <h3 className="text-lg font-semibold mb-4">Documents</h3>
                 <div className="space-y-4">
                   {hotelDetails.aadharCardImage?.url && (
                     <div>
                       <Label>Aadhar Card</Label>
                       <div className="mt-2 flex justify-center">
                         <img
                           src={hotelDetails.aadharCardImage.url}
                           alt="Aadhar Card"
                           className="max-w-xs w-full h-auto rounded-lg border-2 border-gray-300 shadow-sm cursor-pointer hover:border-[#ff8100] transition-colors object-contain"
                           onClick={() => window.open(hotelDetails.aadharCardImage.url, '_blank')}
                         />
                       </div>
                     </div>
                   )}
                   {hotelDetails.hotelRentProofImage?.url && (
                     <div>
                       <Label>Hotel Rent Proof</Label>
                       <div className="mt-2 flex justify-center">
                         <img
                           src={hotelDetails.hotelRentProofImage.url}
                           alt="Hotel Rent Proof"
                           className="max-w-xs w-full h-auto rounded-lg border-2 border-gray-300 shadow-sm cursor-pointer hover:border-[#ff8100] transition-colors object-contain"
                           onClick={() => window.open(hotelDetails.hotelRentProofImage.url, '_blank')}
                         />
                       </div>
                     </div>
                   )}
                   {hotelDetails.cancelledCheckImages && hotelDetails.cancelledCheckImages.length > 0 && (
                     <div>
                       <Label>Cancelled Checks ({hotelDetails.cancelledCheckImages.length})</Label>
                       <div className="grid grid-cols-2 gap-3 mt-2">
                         {hotelDetails.cancelledCheckImages.map((img, idx) => (
                           <div key={idx} className="flex justify-center">
                             <img
                               src={img.url}
                               alt={`Cancelled Check ${idx + 1}`}
                               className="max-w-[200px] w-full h-auto rounded-lg border-2 border-gray-300 shadow-sm cursor-pointer hover:border-[#ff8100] transition-colors object-contain"
                               onClick={() => window.open(img.url, '_blank')}
                             />
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>
               </div>

              {/* Status */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Status & Commission</h3>
                <div className="space-y-2">
                  <div>
                    <Label>Status</Label>
                    <p className="text-sm">
                      <span className={`px-2 py-1 rounded ${
                        hotelDetails.isActive 
                          ? "bg-green-100 text-green-800" 
                          : "bg-red-100 text-red-800"
                      }`}>
                        {hotelDetails.isActive ? "Active" : "Inactive"}
                      </span>
                    </p>
                  </div>
                  <div>
                    <Label>Commission Percentage</Label>
                    <p className="text-sm text-gray-900">
                      {hotelDetails.commission !== undefined && hotelDetails.commission !== null
                        ? `${hotelDetails.commission}%`
                        : "0%"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Commission for orders from QR code scans
                    </p>
                  </div>
                  {hotelDetails.rejectionReason && (
                    <div>
                      <Label>Rejection Reason</Label>
                      <p className="text-sm text-gray-900">{hotelDetails.rejectionReason}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-600">No details available</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
