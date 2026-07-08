import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, X, Check, Camera, Image } from "lucide-react"
import { deliveryAPI } from "@/lib/api"
import apiClient from "@/lib/api/axios"
import { toast } from "sonner"

export default function SignupStep2() {
  const navigate = useNavigate()
  const MAX_DOCUMENT_SIZE_BYTES = 8 * 1024 * 1024 // 8MB
  const [documents, setDocuments] = useState({
    profilePhoto: null,
    aadharPhoto: null,
    aadharBackPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  })
  const [uploadedDocs, setUploadedDocs] = useState({
    profilePhoto: null,
    aadharPhoto: null,
    aadharBackPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  })
  const [uploading, setUploading] = useState({
    profilePhoto: false,
    aadharPhoto: false,
    aadharBackPhoto: false,
    panPhoto: false,
    drivingLicensePhoto: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Ensure screen always starts at top when this step is opened
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    }
  }, [])

  // Camera capture handler with Flutter support (reused pattern from other modules)
  const handleCameraCapture = async (docType, cameraInputRef) => {
    try {
      if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
        // Use Flutter InAppWebView handler when available
        const result = await window.flutter_inappwebview.callHandler("openCamera", {
          source: "camera",
          accept: "image/*",
          multiple: false,
          quality: 0.8,
        })

        if (result && result.success) {
          let file = null

          if (result.file) {
            // Preferred: Flutter returns a File object
            file = result.file
          } else if (result.base64) {
            // Convert base64 to File object
            const base64Data = result.base64
            const mimeType = result.mimeType || "image/jpeg"
            const fileName = result.fileName || "camera-image.jpg"

            const byteCharacters = atob(base64Data.split(",")[1] || base64Data)
            const byteNumbers = new Array(byteCharacters.length)
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i)
            }
            const byteArray = new Uint8Array(byteNumbers)
            const blob = new Blob([byteArray], { type: mimeType })
            file = new File([blob], fileName, { type: mimeType })
          }

          if (file) {
            await handleFileSelect(docType, file)
          } else {
            toast.error("Failed to get image from camera")
          }
        } else {
          // User cancelled or camera failed silently
          return
        }
      } else {
        cameraInputRef?.current?.click()
      }
    } catch (error) {
      // Error opening camera
      toast.error("Failed to open camera. Please try again.")

      cameraInputRef?.current?.click()
    }
  }

  const handleFlutterGallery = async (docType) => {
    try {
      if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
        const result = await window.flutter_inappwebview.callHandler("openCamera", {
          source: "gallery",
          accept: "image/*",
          multiple: false,
          quality: 0.8,
        })
        if (result?.success) {
          let file = null
          if (result.file) {
            file = result.file
          } else if (result.base64) {
            const base64Data = result.base64
            const mimeType = result.mimeType || "image/jpeg"
            const fileName = result.fileName || "gallery-image.jpg"
            const byteCharacters = atob(base64Data.split(",")[1] || base64Data)
            const byteNumbers = new Array(byteCharacters.length)
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i)
            }
            const byteArray = new Uint8Array(byteNumbers)
            const blob = new Blob([byteArray], { type: mimeType })
            file = new File([blob], fileName, { type: mimeType })
          }
          if (file) await handleFileSelect(docType, file)
        }
      }
    } catch {
      // fall through to native file picker via caller
    }
  }

  const handleFileSelect = async (docType, file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file")
      return
    }

    // Validate file size (max 8MB)
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      toast.error("Image size should be less than 8MB")
      return
    }

    setUploading(prev => ({ ...prev, [docType]: true }))

    try {
      // Create FormData for file upload
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'delivery/documents')

      // Upload to Cloudinary via backend
      const response = await apiClient.post('/upload/media', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      if (response?.data?.success && response?.data?.data) {
        const { url, publicId } = response.data.data
        
        setDocuments(prev => ({
          ...prev,
          [docType]: file
        }))
        
        setUploadedDocs(prev => ({
          ...prev,
          [docType]: { url, publicId }
        }))

        toast.success(`${docType.replace(/([A-Z])/g, ' $1').trim()} uploaded successfully`)
      }
    } catch (error) {
      // Error uploading document
      toast.error(`Failed to upload ${docType.replace(/([A-Z])/g, ' $1').trim()}`)
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }))
    }
  }

  const handleRemove = (docType) => {
    setDocuments(prev => ({
      ...prev,
      [docType]: null
    }))
    setUploadedDocs(prev => ({
      ...prev,
      [docType]: null
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Check if all required documents are uploaded
    if (!uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.aadharBackPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto) {
      toast.error("Please upload all required documents")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await deliveryAPI.submitSignupDocuments({
        profilePhoto: uploadedDocs.profilePhoto,
        aadharPhoto: uploadedDocs.aadharPhoto,
        aadharBackPhoto: uploadedDocs.aadharBackPhoto,
        panPhoto: uploadedDocs.panPhoto,
        drivingLicensePhoto: uploadedDocs.drivingLicensePhoto
      })

      if (response?.data?.success) {
        toast.success("Signup completed successfully!")
        // Clear persisted basic details now that signup is complete
        if (typeof window !== "undefined") {
          try {
            sessionStorage.removeItem("deliverySignupDetails")
            sessionStorage.setItem("delivery_signup_step", "complete")
          } catch {
            // Ignore storage errors
          }
        }
        // Redirect to delivery home page
        setTimeout(() => {
          navigate("/delivery", { replace: true })
        }, 1000)
      }
    } catch (error) {
      // Error submitting documents
      const message = error?.response?.data?.message || "Failed to submit documents. Please try again."
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const DocumentUpload = ({ docType, label, required = true }) => {
    const galleryInputRef = useRef(null)
    const cameraInputRef = useRef(null)
    const galleryDomId = `delivery-signup-gallery-${docType}`
    const file = documents[docType]
    const uploaded = uploadedDocs[docType]
    const isUploading = uploading[docType]
    const [showSourceModal, setShowSourceModal] = useState(false)

    const openGallery = async () => {
      if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
        await handleFlutterGallery(docType)
        return
      }
      galleryInputRef.current?.click()
    }

    return (
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <span className="block text-xs font-semibold text-gray-700 mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </span>

        <input
          ref={galleryInputRef}
          id={galleryDomId}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            const selectedFile = e.target.files?.[0]
            if (selectedFile) {
              handleFileSelect(docType, selectedFile)
            }
            e.target.value = ""
          }}
          disabled={isUploading}
        />
        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const selectedFile = e.target.files?.[0]
            if (selectedFile) {
              handleFileSelect(docType, selectedFile)
            }
            e.target.value = ""
          }}
          disabled={isUploading}
        />

        {uploaded ? (
          <div className="relative">
            <img
              src={uploaded.url}
              alt={label}
              className="w-full h-32 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={() => handleRemove(docType)}
              className="absolute top-2 right-2 bg-red-500 text-white p-2.5 rounded-full hover:bg-red-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="absolute bottom-2 left-2 bg-green-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1 text-xs font-medium">
              <Check className="w-3.5 h-3.5" />
              <span>Uploaded</span>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowSourceModal(true)}
              disabled={isUploading}
              className="flex w-full flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-green-500 transition-colors disabled:opacity-60"
            >
              <div className="flex flex-col items-center justify-center py-2">
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mb-1.5"></div>
                    <p className="text-xs text-gray-500">Uploading...</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-gray-400 mb-1.5" />
                    <p className="text-xs font-medium text-gray-500 mb-0.5">Tap to upload from gallery</p>
                    <p className="text-[10px] text-gray-400">PNG, JPG up to 8MB</p>
                  </>
                )}
              </div>
            </button>
          </>
        )}

        {showSourceModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-transparent" 
              onClick={() => setShowSourceModal(false)} 
            />
            
            <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl animate-in slide-in-from-bottom duration-200">
              <h3 className="text-sm font-bold text-gray-900 mb-4 text-center">
                Select Upload Method
              </h3>
              
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowSourceModal(false)
                    handleCameraCapture(docType, cameraInputRef)
                  }}
                  className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <Camera className="w-6 h-6 text-[#00B761] mb-2" />
                  <span className="text-xs font-semibold text-gray-700">Take Photo</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setShowSourceModal(false)
                    openGallery()
                  }}
                  className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <Image className="w-6 h-6 text-[#00B761] mb-2" />
                  <span className="text-xs font-semibold text-gray-700">From Gallery</span>
                </button>
              </div>
              
              <button
                type="button"
                onClick={() => setShowSourceModal(false)}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => navigate("/delivery/signup/details")}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Upload Documents</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Document Verification</h2>
          <p className="text-sm text-gray-600">Please upload clear photos of your documents</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <DocumentUpload docType="profilePhoto" label="Profile Photo" required={true} />
          <DocumentUpload docType="aadharPhoto" label="Aadhar Card Photo (Front)" required={true} />
          <DocumentUpload docType="aadharBackPhoto" label="Aadhar Card Photo (Back)" required={true} />
          <DocumentUpload docType="panPhoto" label="PAN Card Photo" required={true} />
          <DocumentUpload docType="drivingLicensePhoto" label="Driving License Photo" required={true} />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.aadharBackPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto}
            className={`w-full py-3 rounded-lg font-bold text-white text-sm transition-colors mt-4 ${
              isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.aadharBackPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#00B761] hover:bg-[#00A055]"
            }`}
          >
            {isSubmitting ? "Submitting..." : "Complete Signup"}
          </button>
        </form>
      </div>
    </div>
  )
}

