import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { hotelAPI } from "@/lib/api"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"

export default function HotelSignup() {
  const companyName = useCompanyName()
  const navigate = useNavigate()

  // Load business settings (title and favicon)
  useEffect(() => {
    loadBusinessSettings().catch(() => {
      // Silently fail - not critical
    })
  }, [])

  useEffect(() => {
    if (isModuleAuthenticated("hotel")) {
      navigate("/hotel/dashboard", { replace: true })
    }
  }, [navigate])

  const [formData, setFormData] = useState({
    phone: "",
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const lastOTPRequestTime = useRef(0) // Track last OTP request time for debouncing

  const validatePhone = (phone) => {
    if (!phone || phone.trim() === "") {
      return "Phone number is required"
    }

    const digitsOnly = phone.replace(/\D/g, "")

    if (digitsOnly.length !== 10) {
      return "Mobile number must be 10 digits"
    }

    const firstDigit = digitsOnly[0]
    if (!["6", "7", "8", "9"].includes(firstDigit)) {
      return "Invalid mobile number"
    }

    return ""
  }

  const handleSendOTP = async () => {
    // Prevent duplicate requests - debounce for 2 seconds
    const now = Date.now()
    if (now - lastOTPRequestTime.current < 2000 || isSending) {
      return
    }
    lastOTPRequestTime.current = now
    
    setError("")

    const phoneError = validatePhone(formData.phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = formData.phone.trim()

    try {
      setIsSending(true)

      // Call backend to send OTP for hotel login
      await hotelAPI.sendOTP(fullPhone, "login")

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "hotel",
      }
      sessionStorage.setItem("hotelAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/hotel/otp")
    } catch (err) {
      console.error("Send OTP Error:", err)
      let message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to send OTP. Please try again."
      
      // Check if it's a rate limit error and add retry information
      if (err?.response?.status === 429 || message.includes("Too many")) {
        const retryAfter = err?.response?.data?.retryAfter;
        if (retryAfter) {
          const minutes = Math.ceil(retryAfter / 60);
          message = `Too many OTP requests. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`;
        } else {
          message = "Too many OTP requests. Please wait a moment before trying again.";
        }
      }
      
      setError(message)
      setIsSending(false)
    }
  }

  const handlePhoneChange = (e) => {
    // Only allow digits
    const value = e.target.value.replace(/\D/g, "")
    setFormData({
      ...formData,
      phone: value.slice(0, 10),
    })
  }

  const isValid = !validatePhone(formData.phone)

  return (
    <div className="max-h-screen h-screen bg-white flex flex-col">
      {/* Top Section - Logo and Badge */}
      <div className="flex flex-col items-center pt-8 pb-6 px-6">
        {/* Logo */}
        <div>
          <h1 className="text-3xl text-black font-extrabold italic lowercase tracking-tight">
            {companyName.toLowerCase()}
          </h1>
        </div>

        {/* Hotel Partner Badge */}
        <div className="bg-black px-6 py-2 rounded mt-2">
          <span className="text-white font-semibold text-sm uppercase tracking-wide">
            Hotel Partner
          </span>
        </div>
      </div>

      {/* Main Content - Form Section */}
      <div className="flex-1 flex flex-col px-6">
        <div className="w-full max-w-md mx-auto space-y-6">
          {/* Sign In Heading */}
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold text-black">
              Sign in to your account
            </h2>
            <p className="text-base text-gray-600">
              Login or create an account
            </p>
          </div>

          {/* Mobile Number Input */}
          <div className="space-y-2 w-full">
            <div className="flex gap-2 items-stretch w-full">
              <input
                type="tel"
                inputMode="numeric"
                placeholder="Enter mobile number"
                value={formData.phone}
                onChange={handlePhoneChange}
                maxLength={10}
                autoComplete="off"
                autoFocus={false}
                className={`flex-1 h-12 px-4 text-gray-900 placeholder-gray-400 focus:outline-none text-base border rounded-lg min-w-0 ${error ? "border-red-500" : "border-gray-300"
                  }`}
              />
            </div>

            {/* Hint Text */}
            <p className="text-sm text-gray-500">
              Enter a valid 10 digit mobile number
            </p>

            {error && (
              <p className="text-sm text-red-500">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section - Continue Button and Terms */}
      <div className="px-6 pb-8 pt-4">
        <div className="w-full max-w-md mx-auto space-y-4">
          {/* Continue Button */}
          <button
            onClick={handleSendOTP}
            disabled={!isValid || isSending}
            className={`w-full py-4 rounded-lg font-bold text-base transition-colors ${isValid && !isSending
                ? "bg-[#00B761] hover:bg-[#00A055] active:bg-[#009049] text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
          >
            {isSending ? "Sending OTP..." : "Continue"}
          </button>

          {/* Terms and Conditions */}
          <p className="text-xs text-center text-gray-600 px-4">
            By continuing, you agree to our{" "}
            <button
              type="button"
              onClick={() => navigate("/hotel/legal/terms")}
              className="text-blue-600 hover:underline"
            >
              Terms and Conditions
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
