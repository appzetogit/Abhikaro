import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { hotelAPI } from "@/lib/api"
import { setAuthData as setModuleAuthData, isModuleAuthenticated } from "@/lib/utils/auth"
import { uploadToCloudinary } from "@/lib/utils/cloudinary"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"

export default function HotelOTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const [focusedIndex, setFocusedIndex] = useState(null)
  const inputRefs = useRef([])

  // Signup form state (shown after OTP verification for new users)
  const [showSignupForm, setShowSignupForm] = useState(false)
  const [signupData, setSignupData] = useState({
    hotelName: "",
    email: "",
    address: "",
  })
  const [signupErrors, setSignupErrors] = useState({})
  const [uploadingImages, setUploadingImages] = useState({
    aadharCard: false,
    rentProof: false,
    cancelledChecks: false,
  })
  const [images, setImages] = useState({
    aadharCardImage: null,
    hotelRentProofImage: null,
    cancelledCheckImages: [],
  })

  // Load business settings (title and favicon)
  useEffect(() => {
    loadBusinessSettings().catch(() => {
      // Silently fail - not critical
    })
  }, [])

  useEffect(() => {
    // Redirect to home if already authenticated
    if (isModuleAuthenticated && isModuleAuthenticated("hotel")) {
      navigate("/hotel", { replace: true })
      return
    }

    // Get auth data from sessionStorage
    const stored = sessionStorage.getItem("hotelAuthData")
    if (!stored) {
      navigate("/hotel", { replace: true })
      return
    }
    const data = JSON.parse(stored)
    setAuthData(data)

    if (data.phone) {
      const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
      if (phoneMatch) {
        setContactInfo(`${phoneMatch[1]}-${phoneMatch[2].replace(/\D/g, "")}`)
      } else {
        setContactInfo(data.phone || "")
      }
    }

    startResendTimer()
  }, [navigate])

  const startResendTimer = () => {
    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    if (newOtp.every((digit) => digit !== "") && newOtp.length === 6) {
      handleVerify(newOtp.join(""))
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text") || ""
    const digits = pastedData.replace(/\D/g, "").slice(0, 6).split("")

    if (digits.length === 0) return

    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 6) newOtp[i] = digit
    })
    setOtp(newOtp)

    if (digits.length === 6) {
      handleVerify(newOtp.join(""))
    } else {
      const nextIndex = Math.min(digits.length, 5)
      inputRefs.current[nextIndex]?.focus()
    }
  }

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")

    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please try logging in again.")
      }

      const phone = authData.phone
      const purpose = "login" // Try login first

      const response = await hotelAPI.verifyOTP(phone, code, purpose)

      const data = response?.data?.data || response?.data

      // If backend says we need details (hotel not found), show signup form
      if (data?.needsDetails) {
        setShowSignupForm(true)
        setError("")
        setIsLoading(false)
        return
      }

      const accessToken = data?.accessToken
      const hotel = data?.hotel

      if (accessToken && hotel) {
        // Store auth data
        setModuleAuthData("hotel", accessToken, hotel)

        // Dispatch custom event
        window.dispatchEvent(new Event("hotelAuthChanged"))

        // Register FCM token for push notifications (non-blocking)
        import("@/lib/fcmService.js").then(({ registerFcmToken }) => {
          registerFcmToken(accessToken, {
            sendWelcome: false,
            sendLoginAlert: true,
          }).catch(() => {})
        })

        sessionStorage.removeItem("hotelAuthData")

        setTimeout(() => {
          navigate("/hotel/dashboard", { replace: true })
        }, 500)
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP. Please try again."
      setError(message)
      setOtp(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please go back and try again.")
      }

      await hotelAPI.sendOTP(authData.phone, "login")
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again."
      setError(message)
    }

    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    setIsLoading(false)
    setOtp(["", "", "", "", "", ""])
    inputRefs.current[0]?.focus()
  }

  const handleImageUpload = async (type, file) => {
    if (!file) return

    setUploadingImages((prev) => ({ ...prev, [type]: true }))
    try {
      const result = await uploadToCloudinary(file)
      if (type === "cancelledChecks") {
        setImages((prev) => ({
          ...prev,
          cancelledCheckImages: [...prev.cancelledCheckImages, result],
        }))
      } else {
        setImages((prev) => ({
          ...prev,
          [`${type}Image`]: result,
        }))
      }
    } catch (err) {
      setError(`Failed to upload ${type} image`)
    } finally {
      setUploadingImages((prev) => ({ ...prev, [type]: false }))
    }
  }

  const handleRemoveImage = (type, index = null) => {
    if (type === "cancelledChecks" && index !== null) {
      setImages((prev) => ({
        ...prev,
        cancelledCheckImages: prev.cancelledCheckImages.filter((_, i) => i !== index),
      }))
    } else {
      setImages((prev) => ({
        ...prev,
        [`${type}Image`]: null,
      }))
    }
  }

  const validateSignupForm = () => {
    const errors = {}
    if (!signupData.hotelName.trim()) errors.hotelName = "Hotel name is required"
    if (!signupData.email.trim()) errors.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupData.email)) {
      errors.email = "Invalid email format"
    }
    if (!signupData.address.trim()) errors.address = "Address is required"
    if (!images.aadharCardImage) errors.aadharCard = "Aadhar card image is required"
    if (!images.hotelRentProofImage) errors.rentProof = "Hotel rent proof image is required"
    if (images.cancelledCheckImages.length === 0) {
      errors.cancelledChecks = "At least one cancelled check image is required"
    }

    setSignupErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSignupSubmit = async () => {
    if (!validateSignupForm()) return

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please try logging in again.")
      }

      const phone = authData.phone
      const code = otp.join("")

      const response = await hotelAPI.verifyOTP(
        phone,
        code,
        "register",
        signupData.hotelName,
        signupData.email,
        signupData.address,
        images.aadharCardImage,
        images.hotelRentProofImage,
        images.cancelledCheckImages,
      )

      const data = response?.data?.data || response?.data
      const accessToken = data?.accessToken
      const hotel = data?.hotel

      if (accessToken && hotel) {
        // Store auth data
        setModuleAuthData("hotel", accessToken, hotel)

        // Dispatch custom event
        window.dispatchEvent(new Event("hotelAuthChanged"))

        // Register FCM token for push notifications (non-blocking)
        import("@/lib/fcmService.js").then(({ registerFcmToken }) => {
          registerFcmToken(accessToken, {
            sendWelcome: true,
            sendLoginAlert: false,
          }).catch(() => {})
        })

        sessionStorage.removeItem("hotelAuthData")

        setTimeout(() => {
          navigate("/hotel/dashboard", { replace: true })
        }, 500)
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to complete registration. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const isOtpComplete = otp.every((digit) => digit !== "")

  if (!authData) {
    return null
  }

  if (showSignupForm) {
    return (
      <div className="max-h-screen h-screen bg-white flex flex-col overflow-y-auto">
        <div className="relative flex items-center justify-center py-4 px-4 border-b">
          <button
            onClick={() => setShowSignupForm(false)}
            className="absolute left-4 top-1/2 -translate-y-1/2"
          >
            <ArrowLeft className="h-5 w-5 text-black" />
          </button>
          <h2 className="text-lg font-bold text-black">Complete Registration</h2>
        </div>

        <div className="flex-1 px-6 py-6 space-y-6">
          <div>
            <Label htmlFor="hotelName">Hotel Name *</Label>
            <Input
              id="hotelName"
              value={signupData.hotelName}
              onChange={(e) =>
                setSignupData({ ...signupData, hotelName: e.target.value })
              }
              className={`border ${signupErrors.hotelName ? "border-red-500" : "border-gray-300"} focus:border-gray-400 focus:ring-1 focus:ring-gray-400`}
            />
            {signupErrors.hotelName && (
              <p className="text-sm text-red-600 mt-1">{signupErrors.hotelName}</p>
            )}
          </div>

          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={signupData.email}
              onChange={(e) =>
                setSignupData({ ...signupData, email: e.target.value })
              }
              className={`border ${signupErrors.email ? "border-red-500" : "border-gray-300"} focus:border-gray-400 focus:ring-1 focus:ring-gray-400`}
            />
            {signupErrors.email && (
              <p className="text-sm text-red-600 mt-1">{signupErrors.email}</p>
            )}
          </div>

          <div>
            <Label htmlFor="address">Address *</Label>
            <Input
              id="address"
              value={signupData.address}
              onChange={(e) =>
                setSignupData({ ...signupData, address: e.target.value })
              }
              className={`border ${signupErrors.address ? "border-red-500" : "border-gray-300"} focus:border-gray-400 focus:ring-1 focus:ring-gray-400`}
            />
            {signupErrors.address && (
              <p className="text-sm text-red-600 mt-1">{signupErrors.address}</p>
            )}
          </div>

          <div>
            <Label>Aadhar Card Image *</Label>
            {images.aadharCardImage ? (
              <div className="mt-2 relative">
                <img
                  src={images.aadharCardImage.url}
                  alt="Aadhar card"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <button
                  onClick={() => handleRemoveImage("aadharCard")}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="mt-2 flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-sm text-gray-500 mt-2">Upload Aadhar Card</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files[0] &&
                    handleImageUpload("aadharCard", e.target.files[0])
                  }
                  disabled={uploadingImages.aadharCard}
                />
              </label>
            )}
            {signupErrors.aadharCard && (
              <p className="text-sm text-red-600 mt-1">{signupErrors.aadharCard}</p>
            )}
          </div>

          <div>
            <Label>Hotel Rent & Proof Image *</Label>
            {images.hotelRentProofImage ? (
              <div className="mt-2 relative">
                <img
                  src={images.hotelRentProofImage.url}
                  alt="Rent proof"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <button
                  onClick={() => handleRemoveImage("hotelRentProof")}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="mt-2 flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-sm text-gray-500 mt-2">Upload Rent Proof</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files[0] &&
                    handleImageUpload("hotelRentProof", e.target.files[0])
                  }
                  disabled={uploadingImages.rentProof}
                />
              </label>
            )}
            {signupErrors.rentProof && (
              <p className="text-sm text-red-600 mt-1">{signupErrors.rentProof}</p>
            )}
          </div>

          <div>
            <Label>Cancelled Check Images *</Label>
            <div className="mt-2 space-y-2">
              {images.cancelledCheckImages.map((img, index) => (
                <div key={index} className="relative">
                  <img
                    src={img.url}
                    alt={`Cancelled check ${index + 1}`}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <button
                    onClick={() => handleRemoveImage("cancelledChecks", index)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {images.cancelledCheckImages.length === 0 && (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <Upload className="h-8 w-8 text-gray-400" />
                  <span className="text-sm text-gray-500 mt-2">
                    Upload Cancelled Check
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) =>
                      e.target.files[0] &&
                      handleImageUpload("cancelledChecks", e.target.files[0])
                    }
                    disabled={uploadingImages.cancelledChecks}
                  />
                </label>
              )}
            </div>
            {signupErrors.cancelledChecks && (
              <p className="text-sm text-red-600 mt-1">{signupErrors.cancelledChecks}</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            onClick={handleSignupSubmit}
            disabled={isLoading}
            className="w-full h-12 bg-primary-orange hover:bg-primary-orange/90"
          >
            {isLoading ? "Registering..." : "Complete Registration"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-h-screen h-screen bg-white flex flex-col">
      <div className="relative flex items-center justify-center py-4 px-4">
        <button
          onClick={() => navigate("/hotel/signup")}
          className="absolute left-4 top-1/2 -translate-y-1/2"
        >
          <ArrowLeft className="h-5 w-5 text-black" />
        </button>
        <h2 className="text-lg font-bold text-black">Verify details</h2>
      </div>

      <div className="flex-1 flex flex-col px-6 overflow-y-auto">
        <div className="w-full max-w-md mx-auto space-y-8 py-8">
          <div className="text-center">
            <p className="text-base text-gray-900 leading-relaxed">
              Enter OTP sent on <span className="font-semibold">{contactInfo}</span>. Do not share OTP with anyone.
            </p>
          </div>

          <div className="flex justify-center gap-4">
            {otp.map((digit, index) => {
              const hasValue = digit !== ""
              const isFocused = focusedIndex === index

              return (
                <div key={index} className="relative flex flex-col items-center min-w-[48px] py-2" style={{ minHeight: '60px' }}>
                  <input
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit || ""}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex(null)}
                    disabled={isLoading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-text z-20"
                    style={{ minHeight: '60px' }}
                  />
                  {hasValue && (
                    <div className="absolute top-0 text-2xl font-semibold text-gray-900 pointer-events-none z-10">
                      {digit}
                    </div>
                  )}
                  <div className="w-12 relative mt-8">
                    {hasValue ? (
                      <div className="absolute inset-0 bg-blue-600 h-0.5" />
                    ) : isFocused ? (
                      <div className="absolute inset-0 bg-blue-600 h-0.5" />
                    ) : (
                      <div className="absolute inset-0 h-0.5 border-b border-dashed border-gray-400" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {error && (
            <div className="text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="text-center">
            {resendTimer > 0 ? (
              <p className="text-sm text-gray-900">
                Resend OTP in <span className="font-semibold">{resendTimer} secs</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading}
                className="text-sm text-blue-600 hover:underline font-medium disabled:opacity-50"
              >
                Resend OTP
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 pb-8 pt-4">
        <div className="w-full max-w-md mx-auto">
          <Button
            onClick={() => handleVerify()}
            disabled={isLoading || !isOtpComplete}
            className={`w-full h-12 rounded-lg font-bold text-base transition-colors ${!isLoading && isOtpComplete
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
          >
            {isLoading ? "Verifying..." : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  )
}
