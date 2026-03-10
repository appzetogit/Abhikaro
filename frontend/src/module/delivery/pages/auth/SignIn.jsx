import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { deliveryAPI } from "@/lib/api"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { isModuleAuthenticated } from "@/lib/utils/auth"

// Common country codes
const countryCodes = [
  { code: "+1", country: "US/CA", flag: "🇺🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+91", country: "IN", flag: "🇮🇳" },
  { code: "+86", country: "CN", flag: "🇨🇳" },
  { code: "+81", country: "JP", flag: "🇯🇵" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+61", country: "AU", flag: "🇦🇺" },
  { code: "+7", country: "RU", flag: "🇷🇺" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+82", country: "KR", flag: "🇰🇷" },
  { code: "+65", country: "SG", flag: "🇸🇬" },
  { code: "+971", country: "AE", flag: "🇦🇪" },
  { code: "+966", country: "SA", flag: "🇸🇦" },
  { code: "+27", country: "ZA", flag: "🇿🇦" },
  { code: "+31", country: "NL", flag: "🇳🇱" },
  { code: "+46", country: "SE", flag: "🇸🇪" },
]

export default function DeliverySignIn() {
  const companyName = useCompanyName()
  const navigate = useNavigate()

  useEffect(() => {
    if (isModuleAuthenticated("delivery")) {
      navigate("/delivery", { replace: true })
    }
  }, [navigate])

  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
    rememberMe: false,
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const lastOTPRequestTime = useRef(0) // Track last OTP request time for debouncing

  // Prefill phone from sessionStorage when returning from OTP screen
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("deliveryAuthData")
      if (stored) {
        const data = JSON.parse(stored)
        if (data.phone) {
          const match = data.phone.match(/(\+\d+)\s*(.+)/)
          if (match) {
            const countryCode = match[1]
            const digits = (match[2] || "").replace(/\D/g, "").slice(0, 10)
            setFormData((prev) => ({
              ...prev,
              countryCode,
              phone: digits,
            }))
            const validationError = validatePhone(digits, countryCode)
            setError(validationError)
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  // Get selected country details dynamically
  const selectedCountry = countryCodes.find(c => c.code === formData.countryCode) || countryCodes[2] // Default to India (+91)

  const validatePhone = (phone, countryCode) => {
    if (!phone || phone.trim() === "") {
      return "Phone number is required"
    }

    const digitsOnly = phone.replace(/\D/g, "")

    // For Indian numbers, strictly enforce 10 digits with valid prefixes
    if (countryCode === "+91") {
      if (digitsOnly.length !== 10) {
        return "Mobile number must be exactly 10 digits"
      }
      const firstDigit = digitsOnly[0]
      if (!["6", "7", "8", "9"].includes(firstDigit)) {
        return "Invalid Indian mobile number"
      }
      return ""
    }

    // Generic validation for other country codes (7–15 digits)
    if (digitsOnly.length < 7) {
      return "Phone number must be at least 7 digits"
    }

    if (digitsOnly.length > 15) {
      return "Phone number is too long"
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

    const phoneError = validatePhone(formData.phone, formData.countryCode)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)

      // Call backend to send OTP for delivery login
      await deliveryAPI.sendOTP(fullPhone, "login")

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "delivery",
        rememberMe: !!formData.rememberMe,
      }
      sessionStorage.setItem("deliveryAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/delivery/otp")
    } catch (err) {
      // Send OTP Error
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
    // Only allow numeric input and enforce max length
    const raw = e.target.value.replace(/\D/g, "")
    const maxLen = formData.countryCode === "+91" ? 10 : 15
    const value = raw.slice(0, maxLen)

    setFormData((prev) => ({
      ...prev,
      phone: value,
    }))

    // Real-time validation feedback
    const validationError = validatePhone(value, formData.countryCode)
    setError(validationError)
  }

  const handleCountryCodeChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      countryCode: value,
    }))

    // Re-validate when country code changes
    if (formData.phone) {
      const validationError = validatePhone(formData.phone, value)
      setError(validationError)
    } else {
      setError("")
    }
  }

  const isValid = !validatePhone(formData.phone, formData.countryCode)

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

        {/* DELIVERY Badge */}
        <div className="bg-black px-6 py-2 rounded mt-2">
          <span className="text-white font-semibold text-sm uppercase tracking-wide">
            DELIVERY
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
              <Select
                value={formData.countryCode}
                onValueChange={handleCountryCodeChange}
              >
                <SelectTrigger className="w-[100px] !h-12 border-gray-300 rounded-lg flex items-center shrink-0" size="default">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span>{selectedCountry.flag}</span>
                      <span>{selectedCountry.code}</span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {countryCodes.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      <span className="flex items-center gap-2">
                        <span>{country.flag}</span>
                        <span>{country.code}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="Enter mobile number"
                value={formData.phone}
                onChange={handlePhoneChange}
                maxLength={formData.countryCode === "+91" ? 10 : 15}
                pattern="[0-9]*"
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

            {/* Remember Me Checkbox */}
            <div className="flex items-center gap-2 mt-3">
              <input
                type="checkbox"
                id="rememberMe"
                checked={formData.rememberMe}
                onChange={(e) => setFormData(prev => ({ ...prev, rememberMe: e.target.checked }))}
                className="w-4 h-4 border-2 border-gray-300 rounded accent-black"
              />
              <label htmlFor="rememberMe" className="text-sm text-gray-700 cursor-pointer">
                Remember my login for faster sign-in
              </label>
            </div>

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
              onClick={() => navigate("/delivery/profile/terms")}
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

