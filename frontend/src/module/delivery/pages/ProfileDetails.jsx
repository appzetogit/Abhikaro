import { useRef, useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Plus, Edit2, Eye, X, Trash2, Camera } from "lucide-react"
import BottomPopup from "../components/BottomPopup"
import { toast } from "sonner"
import { deliveryAPI } from "@/lib/api"
import { getDeliveryProfilePhotoUrl, getDeliveryUiAvatarUrl } from "../utils/profilePhoto"
import apiClient from "@/lib/api/axios"

export default function ProfileDetails() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [vehicleNumber, setVehicleNumber] = useState("")
  const [showVehiclePopup, setShowVehiclePopup] = useState(false)
  const [vehicleInput, setVehicleInput] = useState("")
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [showBankDetailsPopup, setShowBankDetailsPopup] = useState(false)
  const [bankDetails, setBankDetails] = useState({
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: ""
  })
  const [bankDetailsErrors, setBankDetailsErrors] = useState({})
  const [isUpdatingBankDetails, setIsUpdatingBankDetails] = useState(false)
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false)
  const photoInputRef = useRef(null)
  const [showPersonalDetailsPopup, setShowPersonalDetailsPopup] = useState(false)
  const [isUpdatingPersonalDetails, setIsUpdatingPersonalDetails] = useState(false)
  const [personalDetails, setPersonalDetails] = useState({
    email: "",
    dateOfBirth: "",
    gender: "",
  })
  const [personalDetailsErrors, setPersonalDetailsErrors] = useState({})
  const [showRiderDetailsPopup, setShowRiderDetailsPopup] = useState(false)
  const [isUpdatingRiderDetails, setIsUpdatingRiderDetails] = useState(false)
  const [riderDetails, setRiderDetails] = useState({
    name: "",
    city: "",
    vehicleType: "bike",
  })
  const [riderDetailsErrors, setRiderDetailsErrors] = useState({})

  // Note: All alternate phone related code has been removed

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          const profileData = response.data.data.profile
          setProfile(profileData)
          setVehicleNumber(profileData?.vehicle?.number || "")
          setVehicleInput(profileData?.vehicle?.number || "")
          // Set bank details
          setBankDetails({
            accountHolderName: profileData?.documents?.bankDetails?.accountHolderName || "",
            accountNumber: profileData?.documents?.bankDetails?.accountNumber || "",
            ifscCode: profileData?.documents?.bankDetails?.ifscCode || "",
            bankName: profileData?.documents?.bankDetails?.bankName || ""
          })
        }
      } catch (error) {
        // Error fetching profile
        
        // More detailed error handling
        if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
          toast.error("Cannot connect to server. Please check if backend is running.")
        } else if (error.response?.status === 401) {
          toast.error("Session expired. Please login again.")
          // Optionally redirect to login
          setTimeout(() => {
            navigate("/delivery/sign-in", { replace: true })
          }, 2000)
        } else {
          toast.error(error?.response?.data?.message || "Failed to load profile data")
        }
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [navigate])

  const formatVehicleNumber = (value) => value.toUpperCase().replace(/\s/g, "")

  const isValidVehicleNumber = (value) => {
    const formatted = formatVehicleNumber(value)
    // 2 letters + 2 digits + 1-2 letters + 4 digits
    const vehiclePattern = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/
    return vehiclePattern.test(formatted)
  }

  // When account is approved/active, show documents as Verified if they exist (backend now sets verified on approve; this covers legacy data)
  const getDocumentStatus = (doc) => {
    if (!doc?.document) return "Not uploaded"
    const accountApproved = profile?.status === "approved" || profile?.status === "active"
    if (doc.verified || accountApproved) return "Verified"
    return "Not verified"
  }

  const photoUrl = getDeliveryProfilePhotoUrl(profile)

  const refetchProfile = async () => {
    const response = await deliveryAPI.getProfile()
    if (response?.data?.success && response?.data?.data?.profile) {
      setProfile(response.data.data.profile)
    }
  }

  const handleSelectNewPhoto = async (file) => {
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    // 5MB limit (Cloudinary allows more, but keep mobile-friendly)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB")
      return
    }

    setIsUpdatingPhoto(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folder", "delivery/profile")

      const uploadRes = await apiClient.post("/upload/media", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      if (!uploadRes?.data?.success || !uploadRes?.data?.data?.url) {
        toast.error("Failed to upload profile photo")
        return
      }

      const { url, publicId } = uploadRes.data.data
      const updateRes = await deliveryAPI.updateProfile({
        profileImage: { url, publicId },
      })

      if (updateRes?.data?.success) {
        toast.success("Profile photo updated")
        await refetchProfile()
      } else {
        toast.error(updateRes?.data?.message || "Failed to update profile photo")
      }
    } catch (error) {
      console.error("Profile photo update failed:", error)
      toast.error(error?.response?.data?.message || "Failed to update profile photo")
    } finally {
      setIsUpdatingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ""
    }
  }

  const handleDeletePhoto = async () => {
    if (!window.confirm("Delete profile photo?")) return
    setIsUpdatingPhoto(true)
    try {
      const updateRes = await deliveryAPI.updateProfile({
        profileImage: { url: null, publicId: null },
        documents: { photo: null, profilePhoto: null },
      })

      if (updateRes?.data?.success) {
        toast.success("Profile photo removed")
        await refetchProfile()
      } else {
        toast.error(updateRes?.data?.message || "Failed to remove profile photo")
      }
    } catch (error) {
      console.error("Profile photo delete failed:", error)
      toast.error(error?.response?.data?.message || "Failed to remove profile photo")
    } finally {
      setIsUpdatingPhoto(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Profile</h1>
      </div>

      {/* Profile Picture Area */}
      <div className="relative w-full bg-gray-200 overflow-hidden flex items-center justify-center">
        <input
          ref={photoInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => handleSelectNewPhoto(e.target.files?.[0] || null)}
        />
        {photoUrl ? (
          <img
            src={photoUrl}
            alt="Profile"
            className="w-full h-auto max-h-96 object-contain"
            onError={(e) => {
              // If image fails, treat as no profile photo (show "No profile")
              e.currentTarget.style.display = "none"
            }}
          />
        ) : (
          <div className="w-full h-72 md:h-96 flex items-center justify-center">
            <div className="text-gray-700 text-base font-semibold">No profile</div>
          </div>
        )}

        {/* Photo actions */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={isUpdatingPhoto}
            className="bg-white/95 hover:bg-white text-gray-900 shadow px-3 py-2 rounded-full flex items-center gap-2 text-sm font-medium disabled:opacity-60"
          >
            <Camera className="w-4 h-4" />
            {isUpdatingPhoto ? "Updating..." : "Edit"}
          </button>
          {photoUrl && (
            <button
              type="button"
              onClick={handleDeletePhoto}
              disabled={isUpdatingPhoto}
              className="bg-white/95 hover:bg-white text-red-600 shadow px-3 py-2 rounded-full flex items-center gap-2 text-sm font-medium disabled:opacity-60"
              title="Delete photo"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6">
        {/* Rider Details Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900">Rider details</h2>
            <button
              onClick={() => {
                setRiderDetails({
                  name: profile?.name || "",
                  city: profile?.location?.city || "",
                  vehicleType: profile?.vehicle?.type || "bike",
                })
                setRiderDetailsErrors({})
                setShowRiderDetailsPopup(true)
              }}
              className="text-green-600 font-medium text-sm flex items-center gap-1 hover:text-green-700"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit</span>
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-200">
            <div className="p-2 px-3 flex items-center justify-between">
              <p className="text-base text-gray-900">
                {loading ? "Loading..." : `${profile?.name || "N/A"} (${profile?.deliveryId || "N/A"})`}
              </p>
            </div>
            <div className="divide-y divide-gray-200">
            <div className="p-2 px-3 flex items-center justify-between">
                <p className="text-sm text-gray-900">Zone</p>
                <p className="text-base text-gray-900">
                  {profile?.availability?.zones?.length > 0 ? "Assigned" : "Not assigned"}
                </p>
              </div>
            <div className="p-2 px-3 flex items-center justify-between">
                <p className="text-sm text-gray-900">City</p>
                <p className="text-base text-gray-900">
                  {profile?.location?.city || "N/A"}
                </p>
              </div>
            <div className="p-2 px-3 flex items-center justify-between">
                <p className="text-sm text-gray-900">Vehicle type</p>
                <p className="text-base text-gray-900 capitalize">
                  {profile?.vehicle?.type || "N/A"}
                </p>
              </div>
            <div className="p-2 px-3 flex items-center justify-between">
                <p className="text-sm text-gray-900">Vehicle number</p>
                {vehicleNumber ? (
                  <div className="flex items-center gap-2">
                    <p className="text-base text-gray-900">{vehicleNumber}</p>
                    <button
                      onClick={() => {
                        setVehicleInput(vehicleNumber)
                        setShowVehiclePopup(true)
                      }}
                      className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-green-600" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setVehicleInput("")
                      setShowVehiclePopup(true)
                    }}
                    className="flex items-center gap-2 text-green-600 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Documents Section */}
        <div>
          <h2 className="text-base font-medium text-gray-900 mb-3">Documents</h2>
          <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-200">
            {/* Aadhar Card Front */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-medium text-gray-900">Aadhar Card (Front)</p>
                <p className="text-xs text-gray-500 mt-1">
                  {getDocumentStatus(profile?.documents?.aadhar)}
                </p>
              </div>
              {profile?.documents?.aadhar?.document && (
                <button
                  onClick={() => {
                    setSelectedDocument({
                      name: "Aadhar Card (Front)",
                      url: profile.documents.aadhar.document
                    })
                    setShowDocumentModal(true)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Eye className="w-5 h-5 text-gray-600" />
                </button>
              )}
            </div>

            {/* Aadhar Card Back */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-medium text-gray-900">Aadhar Card (Back)</p>
                <p className="text-xs text-gray-500 mt-1">
                  {getDocumentStatus(profile?.documents?.aadhar)}
                </p>
              </div>
              {profile?.documents?.aadhar?.documentBack && (
                <button
                  onClick={() => {
                    setSelectedDocument({
                      name: "Aadhar Card (Back)",
                      url: profile.documents.aadhar.documentBack
                    })
                    setShowDocumentModal(true)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Eye className="w-5 h-5 text-gray-600" />
                </button>
              )}
            </div>

            {/* PAN Card */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-medium text-gray-900">PAN Card</p>
                <p className="text-xs text-gray-500 mt-1">
                  {getDocumentStatus(profile?.documents?.pan)}
                </p>
              </div>
              {profile?.documents?.pan?.document && (
                <button
                  onClick={() => {
                    setSelectedDocument({
                      name: "PAN Card",
                      url: profile.documents.pan.document
                    })
                    setShowDocumentModal(true)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Eye className="w-5 h-5 text-gray-600" />
                </button>
              )}
            </div>

            {/* Driving License */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-medium text-gray-900">Driving License</p>
                <p className="text-xs text-gray-500 mt-1">
                  {getDocumentStatus(profile?.documents?.drivingLicense)}
                </p>
              </div>
              {profile?.documents?.drivingLicense?.document && (
                <button
                  onClick={() => {
                    setSelectedDocument({
                      name: "Driving License",
                      url: profile.documents.drivingLicense.document
                    })
                    setShowDocumentModal(true)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Eye className="w-5 h-5 text-gray-600" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Personal Details Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium text-gray-900">Personal details</h2>
            <button
              onClick={() => {
                const dob = profile?.dateOfBirth ? new Date(profile.dateOfBirth) : null
                const toInputDate = (d) => {
                  if (!d || Number.isNaN(d.getTime?.())) return ""
                  const yyyy = d.getFullYear()
                  const mm = String(d.getMonth() + 1).padStart(2, "0")
                  const dd = String(d.getDate()).padStart(2, "0")
                  return `${yyyy}-${mm}-${dd}`
                }
                setPersonalDetails({
                  email: profile?.email || "",
                  dateOfBirth: toInputDate(dob),
                  gender: profile?.gender || "",
                })
                setPersonalDetailsErrors({})
                setShowPersonalDetailsPopup(true)
              }}
              className="text-green-600 font-medium text-sm flex items-center gap-1 hover:text-green-700"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit</span>
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-200">
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Phone</p>
                <p className="text-base text-gray-900">
                  {profile?.phone || "N/A"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Email</p>
                <p className="text-base text-gray-900">{profile?.email || "-"}</p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Date of birth</p>
                <p className="text-base text-gray-900">
                  {profile?.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Gender</p>
                <p className="text-base text-gray-900 capitalize">{profile?.gender || "-"}</p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Aadhar Card Number</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.aadhar?.number || "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Rating</p>
                <p className="text-base text-gray-900">
                  {profile?.metrics?.rating !== null && profile?.metrics?.rating !== undefined
                    ? `${Number(profile.metrics.rating || 0).toFixed(1)} (${profile.metrics.ratingCount || 0})`
                    : "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Status</p>
                <p className="text-base text-gray-900 capitalize">
                  {profile?.status || "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900">Bank details</h2>
            <button
              onClick={() => {
                setShowBankDetailsPopup(true)
                // Pre-fill form with existing data
                setBankDetails({
                  accountHolderName: profile?.documents?.bankDetails?.accountHolderName || "",
                  accountNumber: profile?.documents?.bankDetails?.accountNumber || "",
                  ifscCode: profile?.documents?.bankDetails?.ifscCode || "",
                  bankName: profile?.documents?.bankDetails?.bankName || ""
                })
                setBankDetailsErrors({})
              }}
              className="text-green-600 font-medium text-sm flex items-center gap-1 hover:text-green-700"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit</span>
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-200">
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Account Holder Name</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.bankDetails?.accountHolderName || "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Account Number</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.bankDetails?.accountNumber 
                    ? `****${profile.documents.bankDetails.accountNumber.slice(-4)}`
                    : "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">IFSC Code</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.bankDetails?.ifscCode || "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Bank Name</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.bankDetails?.bankName || "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Pan Card Number</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.pan?.number || "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle Number Popup */}
      <BottomPopup
        isOpen={showVehiclePopup}
        onClose={() => setShowVehiclePopup(false)}
        title={vehicleNumber ? "Edit Vehicle Number" : "Add Vehicle Number"}
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="50vh"
      >
        <div className="space-y-4">
          <div>
            <input
              type="text"
              value={vehicleInput}
              onChange={(e) => setVehicleInput(formatVehicleNumber(e.target.value))}
              placeholder="e.g., MH12AB1234"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <button
            onClick={async () => {
              if (vehicleInput.trim() && isValidVehicleNumber(vehicleInput)) {
                try {
                  const formattedNumber = formatVehicleNumber(vehicleInput)
                  await deliveryAPI.updateProfile({
                    vehicle: {
                      ...profile?.vehicle,
                      number: formattedNumber
                    }
                  })
                  setVehicleNumber(formattedNumber)
                  setShowVehiclePopup(false)
                  toast.success("Vehicle number updated successfully")
                  // Refetch profile
                  const response = await deliveryAPI.getProfile()
                  if (response?.data?.success && response?.data?.data?.profile) {
                    setProfile(response.data.data.profile)
                  }
                } catch (error) {
                  // Error updating vehicle number
                  toast.error("Failed to update vehicle number")
                }
              } else {
                toast.error("Please enter a valid vehicle number (e.g., MH12AB1234)")
              }
            }}
            className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            {vehicleNumber ? "Update" : "Add"}
          </button>
        </div>
      </BottomPopup>

      {/* Document Image Modal */}
      {showDocumentModal && selectedDocument && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto relative">
            {/* Close Button */}
            <button
              onClick={() => {
                setShowDocumentModal(false)
                setSelectedDocument(null)
              }}
              className="absolute top-4 right-4 z-10 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
            
            {/* Document Title */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{selectedDocument.name}</h3>
            </div>
            
            {/* Document Image */}
            <div className="p-4">
              <img
                src={selectedDocument.url}
                alt={selectedDocument.name}
                className="w-full h-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Bank Details Edit Popup */}
      <BottomPopup
        isOpen={showBankDetailsPopup}
        onClose={() => {
          setShowBankDetailsPopup(false)
          setBankDetailsErrors({})
        }}
        title="Edit Bank Details"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="80vh"
      >
        <div className="space-y-4">
          {/* Account Holder Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Holder Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankDetails.accountHolderName}
              onChange={(e) => {
                setBankDetails(prev => ({ ...prev, accountHolderName: e.target.value }))
                setBankDetailsErrors(prev => ({ ...prev, accountHolderName: "" }))
              }}
              placeholder="Enter account holder name"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                bankDetailsErrors.accountHolderName ? "border-red-500" : "border-gray-300"
              }`}
            />
            {bankDetailsErrors.accountHolderName && (
              <p className="text-red-500 text-xs mt-1">{bankDetailsErrors.accountHolderName}</p>
            )}
          </div>

          {/* Account Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankDetails.accountNumber}
              onChange={(e) => {
                const value = e.target.value.replace(/\s/g, '').replace(/\D/g, '') // No spaces, only digits
                setBankDetails(prev => ({ ...prev, accountNumber: value }))
                setBankDetailsErrors(prev => ({ ...prev, accountNumber: "" }))
              }}
              placeholder="Enter account number"
              maxLength={18}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                bankDetailsErrors.accountNumber ? "border-red-500" : "border-gray-300"
              }`}
            />
            {bankDetailsErrors.accountNumber && (
              <p className="text-red-500 text-xs mt-1">{bankDetailsErrors.accountNumber}</p>
            )}
          </div>

          {/* IFSC Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              IFSC Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankDetails.ifscCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\s/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '') // No spaces, only uppercase letters and numbers
                setBankDetails(prev => ({ ...prev, ifscCode: value }))
                setBankDetailsErrors(prev => ({ ...prev, ifscCode: "" }))
              }}
              placeholder="Enter IFSC code"
              maxLength={11}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                bankDetailsErrors.ifscCode ? "border-red-500" : "border-gray-300"
              }`}
            />
            {bankDetailsErrors.ifscCode && (
              <p className="text-red-500 text-xs mt-1">{bankDetailsErrors.ifscCode}</p>
            )}
          </div>

          {/* Bank Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bank Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankDetails.bankName}
              onChange={(e) => {
                setBankDetails(prev => ({ ...prev, bankName: e.target.value }))
                setBankDetailsErrors(prev => ({ ...prev, bankName: "" }))
              }}
              placeholder="Enter bank name"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                bankDetailsErrors.bankName ? "border-red-500" : "border-gray-300"
              }`}
            />
            {bankDetailsErrors.bankName && (
              <p className="text-red-500 text-xs mt-1">{bankDetailsErrors.bankName}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={async () => {
              // Validate
              const errors = {}
              if (!bankDetails.accountHolderName.trim()) {
                errors.accountHolderName = "Account holder name is required"
              }
              if (!bankDetails.accountNumber.trim()) {
                errors.accountNumber = "Account number is required"
              } else if (bankDetails.accountNumber.length < 9 || bankDetails.accountNumber.length > 18) {
                errors.accountNumber = "Account number must be between 9 and 18 digits"
              }
              if (!bankDetails.ifscCode.trim()) {
                errors.ifscCode = "IFSC code is required"
              } else if (bankDetails.ifscCode.length !== 11) {
                errors.ifscCode = "IFSC code must be 11 characters"
              }
              if (!bankDetails.bankName.trim()) {
                errors.bankName = "Bank name is required"
              }

              if (Object.keys(errors).length > 0) {
                setBankDetailsErrors(errors)
                toast.error("Please fill all required fields correctly")
                return
              }

              setIsUpdatingBankDetails(true)
              try {
                await deliveryAPI.updateProfile({
                  documents: {
                    ...profile?.documents,
                    bankDetails: {
                      accountHolderName: bankDetails.accountHolderName.trim(),
                      accountNumber: bankDetails.accountNumber.trim(),
                      ifscCode: bankDetails.ifscCode.trim(),
                      bankName: bankDetails.bankName.trim()
                    }
                  }
                })
                toast.success("Bank details updated successfully")
                setShowBankDetailsPopup(false)
                // Refetch profile
                const response = await deliveryAPI.getProfile()
                if (response?.data?.success && response?.data?.data?.profile) {
                  setProfile(response.data.data.profile)
                }
              } catch (error) {
                // Error updating bank details
                toast.error(error?.response?.data?.message || "Failed to update bank details")
              } finally {
                setIsUpdatingBankDetails(false)
              }
            }}
            disabled={isUpdatingBankDetails}
            className={`w-full py-3 rounded-lg font-medium text-white transition-colors ${
              isUpdatingBankDetails
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#00B761] hover:bg-[#00A055]"
            }`}
          >
            {isUpdatingBankDetails ? "Updating..." : "Save Bank Details"}
          </button>
        </div>
      </BottomPopup>

      {/* Rider Details Edit Popup */}
      <BottomPopup
        isOpen={showRiderDetailsPopup}
        onClose={() => {
          setShowRiderDetailsPopup(false)
          setRiderDetailsErrors({})
        }}
        title="Edit Rider Details"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="75vh"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={riderDetails.name}
              onChange={(e) => {
                setRiderDetails((p) => ({ ...p, name: e.target.value }))
                setRiderDetailsErrors((prev) => ({ ...prev, name: "" }))
              }}
              placeholder="Enter name"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                riderDetailsErrors.name ? "border-red-500" : "border-gray-300"
              }`}
            />
            {riderDetailsErrors.name && (
              <p className="text-red-500 text-xs mt-1">{riderDetailsErrors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={riderDetails.city}
              onChange={(e) => setRiderDetails((p) => ({ ...p, city: e.target.value }))}
              placeholder="Enter city"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle type</label>
            <select
              value={riderDetails.vehicleType}
              onChange={(e) => setRiderDetails((p) => ({ ...p, vehicleType: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="bike">Bike</option>
              <option value="scooter">Scooter</option>
              <option value="bicycle">Bicycle</option>
              <option value="car">Car</option>
            </select>
          </div>

          <button
            onClick={async () => {
              const errors = {}
              const nameTrimmed = String(riderDetails.name || "").trim()
              if (!nameTrimmed || nameTrimmed.length < 2) {
                errors.name = "Name must be at least 2 characters"
              }

              if (Object.keys(errors).length > 0) {
                setRiderDetailsErrors(errors)
                toast.error("Please fix the errors")
                return
              }

              setIsUpdatingRiderDetails(true)
              try {
                const payload = {
                  name: nameTrimmed,
                  location: {
                    ...(profile?.location || {}),
                    city: String(riderDetails.city || "").trim(),
                  },
                  vehicle: {
                    ...(profile?.vehicle || {}),
                    type: riderDetails.vehicleType || "bike",
                  },
                }
                const res = await deliveryAPI.updateProfile(payload)
                if (res?.data?.success) {
                  toast.success("Rider details updated")
                  setShowRiderDetailsPopup(false)
                  await refetchProfile()
                } else {
                  toast.error(res?.data?.message || "Failed to update rider details")
                }
              } catch (error) {
                console.error("Failed to update rider details:", error)
                toast.error(error?.response?.data?.message || "Failed to update rider details")
              } finally {
                setIsUpdatingRiderDetails(false)
              }
            }}
            disabled={isUpdatingRiderDetails}
            className={`w-full py-3 rounded-lg font-medium text-white transition-colors ${
              isUpdatingRiderDetails
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#00B761] hover:bg-[#00A055]"
            }`}
          >
            {isUpdatingRiderDetails ? "Updating..." : "Save Rider Details"}
          </button>
        </div>
      </BottomPopup>

      {/* Personal Details Edit Popup */}
      <BottomPopup
        isOpen={showPersonalDetailsPopup}
        onClose={() => {
          setShowPersonalDetailsPopup(false)
          setPersonalDetailsErrors({})
        }}
        title="Edit Personal Details"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="75vh"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={personalDetails.email}
              onChange={(e) => {
                setPersonalDetails((p) => ({ ...p, email: e.target.value }))
                setPersonalDetailsErrors((prev) => ({ ...prev, email: "" }))
              }}
              placeholder="Enter email"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                personalDetailsErrors.email ? "border-red-500" : "border-gray-300"
              }`}
            />
            {personalDetailsErrors.email && (
              <p className="text-red-500 text-xs mt-1">{personalDetailsErrors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of birth</label>
            <input
              type="date"
              value={personalDetails.dateOfBirth}
              onChange={(e) => {
                setPersonalDetails((p) => ({ ...p, dateOfBirth: e.target.value }))
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
            <select
              value={personalDetails.gender}
              onChange={(e) => setPersonalDetails((p) => ({ ...p, gender: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer-not-to-say">Prefer not to say</option>
            </select>
          </div>

          <button
            onClick={async () => {
              const errors = {}
              const emailTrimmed = String(personalDetails.email || "").trim()
              if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
                errors.email = "Please enter a valid email"
              }

              if (Object.keys(errors).length > 0) {
                setPersonalDetailsErrors(errors)
                toast.error("Please fix the errors")
                return
              }

              setIsUpdatingPersonalDetails(true)
              try {
                const payload = {
                  email: emailTrimmed || "",
                  gender: personalDetails.gender || "",
                  dateOfBirth: personalDetails.dateOfBirth
                    ? new Date(personalDetails.dateOfBirth).toISOString()
                    : null,
                }

                const res = await deliveryAPI.updateProfile(payload)
                if (res?.data?.success) {
                  toast.success("Personal details updated")
                  setShowPersonalDetailsPopup(false)
                  await refetchProfile()
                } else {
                  toast.error(res?.data?.message || "Failed to update personal details")
                }
              } catch (error) {
                console.error("Failed to update personal details:", error)
                toast.error(error?.response?.data?.message || "Failed to update personal details")
              } finally {
                setIsUpdatingPersonalDetails(false)
              }
            }}
            disabled={isUpdatingPersonalDetails}
            className={`w-full py-3 rounded-lg font-medium text-white transition-colors ${
              isUpdatingPersonalDetails
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#00B761] hover:bg-[#00A055]"
            }`}
          >
            {isUpdatingPersonalDetails ? "Updating..." : "Save Personal Details"}
          </button>
        </div>
      </BottomPopup>

    </div>
  )
}

