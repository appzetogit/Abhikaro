import { useState, useRef, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { setAuthData } from "@/lib/utils/auth"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { restaurantAPI } from "@/lib/api"
import { firebaseAuth, googleProvider } from "@/lib/firebase"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

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

export default function RestaurantLogin() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [loginMethod, setLoginMethod] = useState("phone") // "phone" or "email"
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
    email: "",
  })
  const [errors, setErrors] = useState({
    phone: "",
    email: "",
  })
  const [touched, setTouched] = useState({
    phone: false,
    email: false,
  })
  const [isSending, setIsSending] = useState(false)
  const [apiError, setApiError] = useState("")
  const lastOTPRequestTime = useRef(0) // Track last OTP request time for debouncing

  // Prefill phone from sessionStorage when returning from OTP screen
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("restaurantAuthData")
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
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  // Get selected country details dynamically
  const selectedCountry = countryCodes.find(c => c.code === formData.countryCode) || countryCodes[2] // Default to India (+91)

  // Phone number validation
  const validatePhone = (phone, countryCode) => {
    if (!phone || phone.trim() === "") {
      return "Phone number is required"
    }

    // Remove any non-digit characters for validation
    const digitsOnly = phone.replace(/\D/g, "")

    // Minimum length check (at least 7 digits)
    if (digitsOnly.length < 7) {
      return "Phone number must be at least 7 digits"
    }

    // Maximum length check (typically 15 digits for international numbers)
    if (digitsOnly.length > 15) {
      return "Phone number is too long"
    }

    // Country-specific validation (India +91)
    if (countryCode === "+91") {
      if (digitsOnly.length !== 10) {
        return "Indian phone number must be 10 digits"
      }
      // Check if it starts with valid Indian mobile prefixes
      const firstDigit = digitsOnly[0]
      if (!["6", "7", "8", "9"].includes(firstDigit)) {
        return "Invalid Indian mobile number"
      }
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
    
    // Mark all fields as touched
    setTouched({ phone: true })
    setApiError("")

    // Validate
    const phoneError = validatePhone(formData.phone, formData.countryCode)

    if (phoneError) {
      setErrors({ phone: phoneError })
      return
    }

    // Clear errors if validation passes
    setErrors({ phone: "" })

    // Build full phone in E.164-ish format (e.g. +91xxxxxxxxxx)
    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)

      // Call backend to send OTP for login
      await restaurantAPI.sendOTP(fullPhone, "login")

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "restaurant",
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/restaurant/otp")
    } catch (error) {
      // Extract backend error message if available
      let message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      
      // Check if it's a rate limit error and add retry information
      if (error?.response?.status === 429 || message.includes("Too many")) {
        const retryAfter = error?.response?.data?.retryAfter;
        if (retryAfter) {
          const minutes = Math.ceil(retryAfter / 60);
          message = `Too many OTP requests. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`;
        } else {
          message = "Too many OTP requests. Please wait a moment before trying again.";
        }
      }
      
      setApiError(message)
    } finally {
      setIsSending(false)
    }
  }

  // Email validation
  const validateEmail = (email) => {
    if (!email || email.trim() === "") {
      return "Email is required"
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return "Please enter a valid email address"
    }

    return ""
  }

  const handleEmailChange = (e) => {
    const value = e.target.value
    const newFormData = {
      ...formData,
      email: value,
    }
    setFormData(newFormData)

    // Validate if field has been touched
    if (touched.email) {
      const error = validateEmail(value)
      setErrors({ ...errors, email: error })
    }
  }

  const handleEmailBlur = () => {
    setTouched({ ...touched, email: true })
    const error = validateEmail(formData.email)
    setErrors({ ...errors, email: error })
  }

  const handleEmailLogin = () => {
    setLoginMethod("email")
  }

  const handleSendEmailOTP = async () => {
    // Mark email field as touched
    setTouched({ ...touched, email: true })
    setApiError("")

    // Validate
    const emailError = validateEmail(formData.email)

    if (emailError) {
      setErrors({ ...errors, email: emailError })
      return
    }

    // Clear errors if validation passes
    setErrors({ ...errors, email: "" })

    try {
      setIsSending(true)

      // Call backend API to send OTP via email
      await restaurantAPI.sendOTP(null, "login", formData.email)

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: "email",
        email: formData.email,
        isSignUp: false,
        module: "restaurant",
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/restaurant/otp")
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setApiError(message)
    } finally {
      setIsSending(false)
    }
  }

  const redirectHandledRef = useRef(false)

  // Helper function to process signed-in user
  const processSignedInUser = async (user, source = "unknown") => {
    if (redirectHandledRef.current) return
    redirectHandledRef.current = true
    setIsSending(true)
    setApiError("")

    try {
      const idToken = await user.getIdToken()
      const response = await restaurantAPI.firebaseGoogleLogin(idToken)
      const data = response?.data?.data || {}

      const accessToken = data.accessToken
      const restaurant = data.restaurant

      if (accessToken && restaurant) {
        setAuthData("restaurant", accessToken, restaurant)
        window.dispatchEvent(new Event("restaurantAuthChanged"))

        // Register FCM token for push notifications (non-blocking)
        import("@/lib/fcmService.js").then(({ registerFcmToken }) => {
          registerFcmToken(accessToken, { sendLoginAlert: true }).catch(() => {})
        })
        navigate("/restaurant", { replace: true })
      } else {
        throw new Error("Invalid response from server")
      }
    } catch (error) {
      console.error(`❌ Error processing user from ${source}:`, error)
      redirectHandledRef.current = false
      setIsSending(false)
      setApiError(error?.response?.data?.message || error?.message || "Authentication failed")
    }
  }

  // Handle Firebase auth state and redirect results
  useEffect(() => {
    let unsubscribe = null

    const handleRedirectResult = async () => {
      try {
        const { getRedirectResult } = await import("firebase/auth")
        if (!firebaseAuth) return

        let result = null
        try {
          result = await Promise.race([
            getRedirectResult(firebaseAuth),
            new Promise((resolve) => setTimeout(() => resolve(null), 3000))
          ])
        } catch (e) { result = null }

        if (result?.user) {
          await processSignedInUser(result.user, "redirect-result")
        } else if (firebaseAuth.currentUser && !redirectHandledRef.current) {
          await processSignedInUser(firebaseAuth.currentUser, "current-user-check")
        }
      } catch (error) {
        console.error("❌ Google sign-in check error:", error)
        setIsSending(false)
      }
    }

    const setupAuthListener = async () => {
      try {
        const { onAuthStateChanged } = await import("firebase/auth")
        if (!firebaseAuth) return

        unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
          if (user && !redirectHandledRef.current) {
            await processSignedInUser(user, "auth-state-listener")
          }
        })
      } catch (e) {
        console.error("❌ Auth listener error:", e)
      }
    }

    setupAuthListener()
    setTimeout(handleRedirectResult, 500)

    return () => { if (unsubscribe) unsubscribe() }
  }, [navigate])

  const handleGoogleLogin = async () => {
    setApiError("")
    setIsSending(true)
    redirectHandledRef.current = false

    try {
      // 1. Ensure Firebase is ready
      if (!firebaseAuth) {
        throw new Error("Firebase Auth is not initialized. Please check your Firebase configuration.")
      }

      // 2. Check if running inside Flutter InAppWebView (mobile app)
      if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
        try {
          console.log("📱 Restaurant: starting Google sign-in via Flutter native bridge...")

          // 3. Call the native Android/iOS Google Sign-In (shows account list)
          const result = await window.flutter_inappwebview.callHandler("nativeGoogleSignIn")

          if (result && result.success && result.idToken) {
            const idToken = result.idToken

            const { GoogleAuthProvider, signInWithCredential } = await import("firebase/auth")

            // 4. Authenticate with Firebase on web using Flutter's ID token
            const credential = GoogleAuthProvider.credential(idToken)
            const userCredential = await signInWithCredential(firebaseAuth, credential)

            console.log("✅ Restaurant website login successful via Flutter App!")
            await processSignedInUser(userCredential.user, "flutter-bridge")
            return
          } else {
            console.log("ℹ️ Restaurant: user cancelled native sign-in or no idToken returned.")
            redirectHandledRef.current = true
            setIsSending(false)
            return
          }
        } catch (e) {
          console.error("❌ Restaurant Flutter Bridge Error during Google sign-in:", e)
          redirectHandledRef.current = true
          setIsSending(false)
          return
        }
      }

      // 3. Fallback: normal browser (Chrome/Safari etc.) – use redirect flow
      console.log("🚀 Restaurant: starting Google sign-in (web browser redirect)...")

      const { signInWithRedirect } = await import("firebase/auth")
      await signInWithRedirect(firebaseAuth, googleProvider)
      // Redirect result handled by getRedirectResult / onAuthStateChanged above
    } catch (error) {
      console.error("Firebase Google login error:", error)
      setIsSending(false)
      redirectHandledRef.current = true

      const code = error?.code || ""
      let message = error?.message || "Google sign-in failed"

      if (code === "auth/popup-closed-by-user") {
        return
      }

      setApiError(message)
    }
  }

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "")
    const maxLen = formData.countryCode === "+91" ? 10 : 15
    const value = raw.slice(0, maxLen)
    const newFormData = {
      ...formData,
      phone: value,
    }
    setFormData(newFormData)

    // Real-time validation
    const error = validatePhone(value, formData.countryCode)
    setErrors({ ...errors, phone: error })

    // Mark as touched when user starts typing
    if (!touched.phone && value.length > 0) {
      setTouched({ ...touched, phone: true })
    }
  }

  const handlePhoneBlur = () => {
    // Mark as touched on blur if not already touched
    if (!touched.phone) {
      setTouched({ ...touched, phone: true })
    }
    // Re-validate on blur
    const error = validatePhone(formData.phone, formData.countryCode)
    setErrors({ ...errors, phone: error })
  }

  const handleCountryCodeChange = (value) => {
    const newFormData = {
      ...formData,
      countryCode: value,
    }
    setFormData(newFormData)

    // Re-validate phone if it's been touched
    if (touched.phone) {
      const error = validatePhone(formData.phone, value)
      setErrors({ ...errors, phone: error })
    }
  }

  const isValidPhone = !errors.phone && formData.phone.trim().length > 0
  const isValidEmail = !errors.email && formData.email.trim().length > 0

  return (
    <div className="max-h-screen h-screen bg-white flex flex-col">
      {/* Top Section - Logo and Badge */}
      <div className="flex flex-col items-center pt-8 pb-8 px-6">
        {/* Logo */}
        <div>
          <h1
            className="text-3xl italic md:text-4xl tracking-wide font-extrabold text-black"
            style={{
              WebkitTextStroke: "0.5px black",
              textStroke: "0.5px black"
            }}
          >

            {companyName.toLowerCase()}
          </h1>
        </div>

        {/* Restaurant Partner Badge */}
        <div className="">
          <span className="text-gray-600 font-light text-sm tracking-wide block text-center">
            — restaurant partner —
          </span>
        </div>
        {/* Screen heading - Login mode */}
        <h2 className="text-xl font-semibold text-gray-900 mt-4">Login</h2>
      </div>

      {/* Main Content - Form Section */}
      <div className="flex-1 flex flex-col px-6 overflow-y-auto">
        <div className="w-full max-w-md mx-auto space-y-6 py-4">
          {/* Instruction Text */}
          <div className="text-center">
            <p className="text-base text-gray-700 leading-relaxed">
              {loginMethod === "email"
                ? "Enter your registered email and we will send an OTP to continue"
                : "Enter your phone number and we will send an OTP to continue"
              }
            </p>
          </div>

          {/* Phone Number Input */}
          {loginMethod === "phone" && (
            <div className="space-y-4">
              <div className="flex gap-2 items-stretch w-full">
                {/* Country Code Selector */}
                <Select
                  value={formData.countryCode}
                  onValueChange={handleCountryCodeChange}
                >
                  <SelectTrigger className="w-[100px] h-12 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center shrink-0" style={{ height: '48px' }}>
                    <SelectValue>
                      <span className="flex items-center gap-1.5">
                        <span className="text-base">{selectedCountry.flag}</span>
                        <span className="text-sm font-medium text-gray-900">{selectedCountry.code}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
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

                {/* Phone Number Input */}
                <div className="flex-1 flex flex-col">
                  <input
                    type="tel"
                    placeholder="Enter phone number"
                    value={formData.phone}
                    onChange={handlePhoneChange}
                    onBlur={handlePhoneBlur}
                    maxLength={formData.countryCode === "+91" ? 10 : 15}
                    pattern="[0-9]*"
                    className={`w-full px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 text-base border rounded-lg min-w-0 bg-white ${errors.phone && (formData.phone.length > 0 || touched.phone)
                      ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                      }`}
                    style={{ height: '48px' }}
                  />
                  {errors.phone && (formData.phone.length > 0 || touched.phone) && (
                    <p className="text-red-500 text-xs mt-1 ml-1">{errors.phone}</p>
                  )}
                </div>
              </div>

              {/* API error */}
              {apiError && (
                <p className="text-red-500 text-xs mt-1 ml-1">{apiError}</p>
              )}

              {/* Send OTP Button */}
              <Button
                onClick={handleSendOTP}
                disabled={!isValidPhone || isSending}
                className={`w-full h-12 rounded-lg font-bold text-base transition-colors ${isValidPhone && !isSending
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
              >
                {isSending ? "Sending OTP..." : "Send OTP"}
              </Button>
            </div>
          )}

          {/* Email Input */}
          {loginMethod === "email" && (
            <div className="space-y-4">
              <div className="flex flex-col">
                <input
                  type="email"
                  inputMode="email"
                  placeholder="Enter email address"
                  value={formData.email}
                  onChange={handleEmailChange}
                  onBlur={handleEmailBlur}
                  className={`w-full px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 text-base border rounded-lg bg-white ${errors.email && formData.email.length > 0
                    ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                    }`}
                  style={{ height: '48px' }}
                />
                {errors.email && formData.email.length > 0 && (
                  <p className="text-red-500 text-xs mt-1 ml-1">{errors.email}</p>
                )}
              </div>

              {/* API error */}
              {apiError && (
                <p className="text-red-500 text-xs mt-1 ml-1">{apiError}</p>
              )}

              {/* Send OTP Button */}
              <Button
                onClick={handleSendEmailOTP}
                disabled={!isValidEmail || isSending}
                className={`w-full h-12 rounded-lg font-bold text-base transition-colors ${isValidEmail && !isSending
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
              >
                {isSending ? "Sending OTP..." : "Send OTP"}
              </Button>
            </div>
          )}

          {/* OR Separator */}
          <div className="relative flex items-center py-4">
            <div className="flex-1 border-t border-gray-500"></div>
            <span className="px-4 text-sm font-medium text-gray-600">OR</span>
            <div className="flex-1 border-t border-gray-500"></div>
          </div>

          {/* Alternative Login Options */}
          <div className="space-y-3">
            {/* Login with Google Button */}
            <Button
              onClick={handleGoogleLogin}
              variant="outline"
              className="w-full h-12 rounded-lg border border-gray- hover:border-gray-400 hover:bg-gray-50 text-gray-900 font-semibold text-base flex items-center justify-center gap-3"
            >
              {/* Google Logo SVG */}
              <svg className="w-5 h-5 mr-auto" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="mr-auto text-gray-900">Login with Google</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

