import { useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Mail, Phone, AlertCircle, Loader2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { authAPI } from "@/lib/api"
import { firebaseAuth, googleProvider, ensureFirebaseInitialized } from "@/lib/firebase"
import { setAuthData } from "@/lib/utils/auth"
import loginBanner from "@/assets/loginbanner.png"

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

export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isSignUp = searchParams.get("mode") === "signup"

  const [authMethod, setAuthMethod] = useState("phone") // "phone" or "email"
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
    email: "",
    name: "",
    rememberMe: false,
  })
  const [errors, setErrors] = useState({
    phone: "",
    email: "",
    name: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState("")
  const redirectHandledRef = useRef(false)

  // Restore form data from sessionStorage when component mounts (e.g., when coming back from OTP page)
  useEffect(() => {
    const stored = sessionStorage.getItem("userAuthData")
    if (stored) {
      try {
        const authData = JSON.parse(stored)
        if (authData.phone) {
          // Extract country code and phone number from stored phone
          const phoneMatch = authData.phone.match(/^(\+\d+)\s*(.+)$/)
          if (phoneMatch) {
            const [, countryCode, phoneNumber] = phoneMatch
            setFormData(prev => ({
              ...prev,
              countryCode: countryCode,
              phone: phoneNumber.replace(/\D/g, "").slice(0, 10), // Extract only digits and limit to 10
            }))
            setAuthMethod("phone")
          } else {
            // If format is different, try to extract
            const digitsOnly = authData.phone.replace(/\D/g, "")
            if (digitsOnly.length >= 10) {
              // Assume +91 if no country code found
              setFormData(prev => ({
                ...prev,
                countryCode: "+91",
                phone: digitsOnly.slice(-10), // Take last 10 digits
              }))
              setAuthMethod("phone")
            }
          }
        } else if (authData.email) {
          setFormData(prev => ({
            ...prev,
            email: authData.email,
          }))
          setAuthMethod("email")
        }
        if (authData.name) {
          setFormData(prev => ({
            ...prev,
            name: authData.name,
          }))
        }
      } catch (error) {
        console.error("Error parsing stored auth data:", error)
      }
    }
  }, [])

  // Helper function to process signed-in user
  const processSignedInUser = async (user, source = "unknown") => {
    if (redirectHandledRef.current) {
      console.log(`ℹ️ User already being processed, skipping (source: ${source})`)
      return
    }

    console.log(`✅ Processing signed-in user from ${source}:`, {
      email: user.email,
      uid: user.uid,
      displayName: user.displayName
    })

    redirectHandledRef.current = true
    setIsLoading(true)
    setApiError("")

    try {
      const idToken = await user.getIdToken()
      console.log(`✅ Got ID token from ${source}, calling backend...`)

      const response = await authAPI.firebaseGoogleLogin(idToken, "user")
      const data = response?.data?.data || {}

      console.log(`✅ Backend response from ${source}:`, {
        hasAccessToken: !!data.accessToken,
        hasUser: !!data.user,
        userEmail: data.user?.email
      })

      const accessToken = data.accessToken
      const appUser = data.user

      if (accessToken && appUser) {
        setAuthData("user", accessToken, appUser)
        window.dispatchEvent(new Event("userAuthChanged"))

        // Register FCM token for push notifications (non-blocking)
        import("@/lib/fcmService.js").then(({ registerFcmToken }) => {
          registerFcmToken(accessToken, { sendLoginAlert: true }).catch(() => {})
        })

        // Clear any URL hash or params
        const hasHash = window.location.hash.length > 0
        const hasQueryParams = window.location.search.length > 0
        if (hasHash || hasQueryParams) {
          window.history.replaceState({}, document.title, window.location.pathname)
        }

        console.log(`✅ Navigating to user dashboard from ${source}...`)
        navigate("/user", { replace: true })
      } else {
        console.error(`❌ Invalid backend response from ${source}`)
        redirectHandledRef.current = false
        setIsLoading(false)
        setApiError("Invalid response from server. Please try again.")
      }
    } catch (error) {
      console.error(`❌ Error processing user from ${source}:`, error)
      redirectHandledRef.current = false
      setIsLoading(false)

      let errorMessage = "Failed to complete sign-in. Please try again."
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error?.message) {
        errorMessage = error.message
      }
      setApiError(errorMessage)
    }
  }

  // Handle Firebase redirect result on component mount and URL changes
  useEffect(() => {
    let unsubscribe = null

    const handleRedirectResult = async () => {
      try {
        const { getRedirectResult } = await import("firebase/auth")
        await ensureFirebaseInitialized()

        if (!firebaseAuth) {
          console.log("ℹ️ Firebase Auth not ready, skipping redirect check")
          return
        }

        // Check if we're coming back from a redirect
        let result = null
        try {
          result = await Promise.race([
            getRedirectResult(firebaseAuth),
            new Promise((resolve) =>
              setTimeout(() => resolve(null), 3000)
            )
          ])
        } catch (redirectError) {
          console.log("ℹ️ getRedirectResult error:", redirectError?.code)
          result = null
        }

        if (result?.user) {
          await processSignedInUser(result.user, "redirect-result")
        } else {
          const currentUser = firebaseAuth?.currentUser
          if (currentUser && !redirectHandledRef.current) {
            await processSignedInUser(currentUser, "current-user-check")
          }
        }
      } catch (error) {
        console.error("❌ Google sign-in check error:", error)
        setApiError("Failed to check authentication status. Please try refreshing.")
        setIsLoading(false)
      }
    }

    const setupAuthListener = async () => {
      try {
        const { onAuthStateChanged } = await import("firebase/auth")
        await ensureFirebaseInitialized()

        if (!firebaseAuth) return

        unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
          if (user && !redirectHandledRef.current) {
            await processSignedInUser(user, "auth-state-listener")
          }
        })
      } catch (error) {
        console.error("❌ Error setting up auth state listener:", error)
      }
    }

    // Initialize everything
    const init = async () => {
      await setupAuthListener()
      // Small delay to let Firebase state settle
      setTimeout(() => {
        handleRedirectResult()
      }, 500)
    }

    init()

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [navigate])

  // Get selected country details dynamically
  const selectedCountry = countryCodes.find(c => c.code === formData.countryCode) || countryCodes[2] // Default to  (+91)

  const validateEmail = (email) => {
    if (!email.trim()) {
      return "Email is required"
    }
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!emailRegex.test(email.trim())) {
      return "Please enter a valid email address"
    }
    return ""
  }

  const validatePhone = (phone) => {
    if (!phone.trim()) {
      return "Phone number is required"
    }
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "")
    const phoneRegex = /^\d{10}$/
    if (!phoneRegex.test(cleanPhone)) {
      return "Phone number must be exactly 10 digits"
    }
    return ""
  }

  const validateName = (name) => {
    if (!name.trim()) {
      return "Name is required"
    }
    if (name.trim().length < 2) {
      return "Name must be at least 2 characters"
    }
    if (name.trim().length > 50) {
      return "Name must be less than 50 characters"
    }
    const nameRegex = /^[a-zA-Z\s'-]+$/
    if (!nameRegex.test(name.trim())) {
      return "Name can only contain letters, spaces, hyphens, and apostrophes"
    }
    return ""
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    
    // For phone input, only allow digits and limit to 10 digits
    if (name === "phone") {
      const digitsOnly = value.replace(/\D/g, "") // Remove all non-digits
      const limitedValue = digitsOnly.slice(0, 10) // Limit to 10 digits
      setFormData({
        ...formData,
        [name]: limitedValue,
      })
      // Real-time validation
      setErrors({ ...errors, phone: validatePhone(limitedValue) })
    } else {
      setFormData({
        ...formData,
        [name]: value,
      })
      // Real-time validation
      if (name === "email") {
        setErrors({ ...errors, email: validateEmail(value) })
      } else if (name === "name") {
        setErrors({ ...errors, name: validateName(value) })
      }
    }
  }

  const handleCountryCodeChange = (value) => {
    setFormData({
      ...formData,
      countryCode: value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setApiError("")

    // Validate based on auth method
    let hasErrors = false
    const newErrors = { phone: "", email: "", name: "" }

    if (authMethod === "phone") {
      const phoneError = validatePhone(formData.phone)
      newErrors.phone = phoneError
      if (phoneError) hasErrors = true
    } else {
      const emailError = validateEmail(formData.email)
      newErrors.email = emailError
      if (emailError) hasErrors = true
    }

    // Validate name for sign up
    if (isSignUp) {
      const nameError = validateName(formData.name)
      newErrors.name = nameError
      if (nameError) hasErrors = true
    }

    setErrors(newErrors)

    if (hasErrors) {
      setIsLoading(false)
      return
    }

    try {
      const purpose = isSignUp ? "register" : "login"
      const fullPhone = authMethod === "phone" ? `${formData.countryCode} ${formData.phone}`.trim() : null
      const email = authMethod === "email" ? formData.email.trim() : null

      // Call backend to send OTP
      await authAPI.sendOTP(fullPhone, purpose, email)

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: authMethod,
        phone: fullPhone,
        email: email,
        name: isSignUp ? formData.name.trim() : null,
        isSignUp,
        module: "user",
      }
      sessionStorage.setItem("userAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/user/auth/otp")
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setApiError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setApiError("")
    setIsLoading(true)
    redirectHandledRef.current = false // Reset flag when starting new sign-in

    try {
      // Ensure Firebase is initialized before use
      await ensureFirebaseInitialized()

      // Validate Firebase Auth instance
      if (!firebaseAuth) {
        throw new Error("Firebase Auth is not initialized. Please check your Firebase configuration.")
      }

      const { signInWithPopup } = await import("firebase/auth")

      // Log current origin for debugging
      console.log("🚀 Starting Google sign-in popup...")

      // Use popup for better UX and error handling
      const result = await signInWithPopup(firebaseAuth, googleProvider)

      console.log("✅ Popup sign-in successful:", {
        user: result?.user?.email,
        operationType: result.operationType
      })

      if (result && result.user) {
        // Process signed-in user
        await processSignedInUser(result.user, "popup-result")
      }
    } catch (error) {
      console.error("❌ Google sign-in redirect error:", error)
      console.error("Error code:", error?.code)
      console.error("Error message:", error?.message)
      setIsLoading(false)
      redirectHandledRef.current = false

      const errorCode = error?.code || ""
      const errorMessage = error?.message || ""

      let message = "Google sign-in failed. Please try again."

      if (errorCode === "auth/configuration-not-found") {
        message = "Firebase configuration error. Please ensure your domain is authorized in Firebase Console. Current domain: " + window.location.hostname
      } else if (errorCode === "auth/operation-not-allowed") {
        message = "This sign-in method is disabled. Please enable it in the Firebase Console."
      } else if (errorCode === "auth/popup-blocked") {
        message = "Popup was blocked. Please allow popups and try again."
      } else if (errorCode === "auth/popup-closed-by-user") {
        message = "Sign-in was cancelled. Please try again."
      } else if (errorCode === "auth/network-request-failed") {
        message = "Network error. Please check your connection and try again."
      } else if (errorMessage) {
        message = errorMessage
      } else if (error?.response?.data?.message) {
        message = error.response.data.message
      } else if (error?.response?.data?.error) {
        message = error.response.data.error
      }

      setApiError(message)
    }
  }

  const toggleMode = () => {
    const newMode = isSignUp ? "signin" : "signup"
    navigate(`/user/auth/sign-in?mode=${newMode}`, { replace: true })
    // Reset form
    setFormData({ phone: "", countryCode: "+91", email: "", name: "", rememberMe: false })
    setErrors({ phone: "", email: "", name: "" })
  }

  const handleLoginMethodChange = () => {
    setAuthMethod(authMethod === "email" ? "phone" : "email")
  }

  return (
    <AnimatedPage className="max-h-screen flex flex-col bg-white dark:bg-[#0a0a0a] overflow-hidden !pb-0 md:flex-row md:overflow-hidden">

      {/* Mobile: Top Section - Banner Image */}
      {/* Desktop: Left Section - Banner Image */}
      <div className="relative md:hidden w-full shrink-0" style={{ height: "45vh", minHeight: "300px" }}>
        <img
          src={loginBanner}
          alt="Food Banner"
          className="w-full h-full object-cover object-center"
        />
      </div>

      <div className="relative hidden md:block w-full shrink-0 md:w-1/2 md:h-screen md:sticky md:top-0">
        <img
          src={loginBanner}
          alt="Food Banner"
          className="w-full h-full object-cover object-center"
        />
        {/* Overlay gradient for better text readability on desktop */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent" />
      </div>

      {/* Mobile: Bottom Section - White Login Form */}
      {/* Desktop: Right Section - Login Form */}
      <div className="bg-white dark:bg-[#1a1a1a] p-3 sm:p-4 md:p-6 lg:p-8 xl:p-10 overflow-y-auto md:w-1/2 md:flex md:items-center md:justify-center md:h-screen">
        <div className="max-w-md lg:max-w-lg xl:max-w-xl mx-auto space-y-6 md:space-y-8 lg:space-y-10 w-full">
          {/* Heading */}
          <div className="text-center space-y-2 md:space-y-3">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-black dark:text-white leading-tight">
             Food Delivery and Dining App
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 dark:text-gray-400">
              Log in or sign up
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
            {/* Name field for sign up - hidden by default, shown only when needed */}
            {isSignUp && (
              <div className="space-y-2">
                <Input
                  id="name"
                  name="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  className={`text-base md:text-lg h-12 md:h-14 bg-white dark:bg-[#1a1a1a] text-black dark:text-white ${errors.name ? "border-red-500" : "border-gray-300 dark:border-gray-700"} transition-colors`}
                  aria-invalid={errors.name ? "true" : "false"}
                />
                {errors.name && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.name}</span>
                  </div>
                )}
              </div>
            )}

            {/* Phone Number Input */}
            {authMethod === "phone" && (
              <div className="space-y-2">
                <div className="flex gap-2 items-stretch">
                  <Select
                    value={formData.countryCode}
                    onValueChange={handleCountryCodeChange}
                  >
                    <SelectTrigger
                      className="w-[100px] md:w-[120px] !h-12 md:!h-14 border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] text-black dark:text-white rounded-lg flex items-center transition-colors"
                      size="default"
                      aria-label="Select country code"
                    >
                      <SelectValue>
                        <span className="flex items-center gap-2 text-sm md:text-base">
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
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="Enter 10-digit Phone Number"
                    value={formData.phone}
                    onChange={handleChange}
                    maxLength={10}
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    className={`flex-1 h-12 md:h-14 text-base md:text-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-gray-300 dark:border-gray-700 rounded-lg ${errors.phone ? "border-red-500" : ""} transition-colors`}
                    aria-invalid={errors.phone ? "true" : "false"}
                  />
                </div>
                {errors.phone && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.phone}</span>
                  </div>
                )}
                {apiError && authMethod === "phone" && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{apiError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Email Input */}
            {authMethod === "email" && (
              <div className="space-y-2">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email address"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full h-12 md:h-14 text-base md:text-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-gray-300 dark:border-gray-700 rounded-lg ${errors.email ? "border-red-500" : ""} transition-colors`}
                  aria-invalid={errors.email ? "true" : "false"}
                />
                {errors.email && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.email}</span>
                  </div>
                )}
                {apiError && authMethod === "email" && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{apiError}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod("phone")
                    setApiError("")
                  }}
                  className="text-xs text-[#E23744] hover:underline text-left"
                >
                  Use phone instead
                </button>
              </div>
            )}

            {/* Remember Me Checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="rememberMe"
                checked={formData.rememberMe}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, rememberMe: checked })
                }
                className="w-4 h-4 border-2 border-gray-300 rounded data-[state=checked]:bg-[#E23744] data-[state=checked]:border-[#E23744] flex items-center justify-center"
              />
              <label
                htmlFor="rememberMe"
                className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none"
              >
                Remember my login for faster sign-in
              </label>
            </div>

            {/* Continue Button */}
            <Button
              type="submit"
              className="w-full h-12 md:h-14 bg-[#D32F2F] hover:bg-[#b71c1c] text-white font-bold text-base md:text-lg rounded-lg transition-all hover:shadow-lg active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isSignUp ? "Creating Account..." : "Signing In..."}
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </form>

          {/* Or Separator */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-[#1a1a1a] px-2 text-sm text-gray-500 dark:text-gray-400">
                or
              </span>
            </div>
          </div>

          {/* Social Login Icons */}
          <div className="flex justify-center gap-4 md:gap-6">
            {/* Google Login */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-all hover:shadow-md active:scale-95"
              aria-label="Sign in with Google"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24">
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
            </button>

            {/* Email Login */}
            <button
              type="button"
              onClick={handleLoginMethodChange}
              className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-[#E23744] flex items-center justify-center hover:bg-[#d32f3d] transition-all hover:shadow-md active:scale-95 bg-[#E23744]"
              aria-label="Sign in with Email"
            >
              {authMethod == "phone" ? <Mail className="h-5 w-5 md:h-6 md:w-6 text-white" /> : <Phone className="h-5 w-5 md:h-6 md:w-6 text-white" />}
            </button>
          </div>

          {/* Legal Disclaimer */}
          <div className="text-center text-xs md:text-sm text-gray-500 dark:text-gray-400 pt-4 md:pt-6">
            <p className="mb-1 md:mb-2">
              By continuing, you agree to our
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => navigate("/user/terms")}
                className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Terms of Service
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => navigate("/user/privacy")}
                className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Privacy Policy
              </button>
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}
