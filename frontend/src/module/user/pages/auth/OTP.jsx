import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { authAPI } from "@/lib/api"
import { setAuthData as setUserAuthData } from "@/lib/utils/auth"

export default function OTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [verifiedOtp, setVerifiedOtp] = useState("")
  const [contactInfo, setContactInfo] = useState("")
  const [contactType, setContactType] = useState("phone")
  const inputRefs = useRef([])

  useEffect(() => {
    // Redirect to home if already authenticated
    const { isModuleAuthenticated } = import("@/lib/utils/auth")
    if (isModuleAuthenticated && isModuleAuthenticated("user")) {
      navigate("/user", { replace: true })
      return
    }

    // Get auth data from sessionStorage
    const stored = sessionStorage.getItem("userAuthData")
    if (!stored) {
      navigate("/user/auth/sign-in", { replace: true })
      return
    }
    const data = JSON.parse(stored)
    setAuthData(data)

    if (data.method === "email" && data.email) {
      setContactType("email")
      setContactInfo(data.email)
    } else if (data.phone) {
      setContactType("phone")
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
    if (inputRefs.current[0] && !showNameInput) {
      inputRefs.current[0].focus()
    }
  }, [showNameInput])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    if (!showNameInput && newOtp.every((digit) => digit !== "") && newOtp.length === 6) {
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

    if (!showNameInput && digits.length === 6) {
      handleVerify(newOtp.join(""))
    } else {
      const nextIndex = Math.min(digits.length, 5)
      inputRefs.current[nextIndex]?.focus()
    }
  }

  const handleVerify = async (otpValue = null) => {
    if (showNameInput) return

    const code = otpValue || otp.join("")
    if (code.length !== 6) return

    setIsLoading(true)
    setError("")

    try {
      const { phone, email, isSignUp } = authData
      const purpose = isSignUp ? "register" : "login"

      const response = await authAPI.verifyOTP(phone, code, purpose, null, email, "user")
      const data = response?.data?.data || {}

      if (data.needsName) {
        setShowNameInput(true)
        setVerifiedOtp(code)
        setOtp(["", "", "", "", "", ""])
        setIsLoading(false)
        return
      }

      const { accessToken, user } = data
      if (!accessToken || !user) throw new Error("Invalid response from server")

      sessionStorage.removeItem("userAuthData")
      setUserAuthData("user", accessToken, user)
      window.dispatchEvent(new Event("userAuthChanged"))

      setSuccess(true)
      setTimeout(() => navigate("/user"), 1000)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Verification failed")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitName = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Name is required")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const { phone, email, isSignUp } = authData
      const purpose = isSignUp ? "register" : "login"

      const response = await authAPI.verifyOTP(phone, verifiedOtp, purpose, trimmedName, email, "user")
      const data = response?.data?.data || {}

      const { accessToken, user } = data
      if (!accessToken || !user) throw new Error("Invalid response from server")

      sessionStorage.removeItem("userAuthData")
      setUserAuthData("user", accessToken, user)
      window.dispatchEvent(new Event("userAuthChanged"))

      setSuccess(true)
      setTimeout(() => navigate("/user"), 1000)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Registration failed")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0 || isLoading) return

    setIsLoading(true)
    setError("")

    try {
      const { phone, email, isSignUp } = authData
      await authAPI.sendOTP(phone, isSignUp ? "register" : "login", email)
      startResendTimer()
      setOtp(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } catch (err) {
      setError("Failed to resend OTP. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (!authData) {
    return null
  }

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <div className="relative flex items-center justify-center py-4 px-4 md:py-6 md:px-6 lg:px-8 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => navigate("/user/auth/sign-in")}
          className="absolute left-4 md:left-6 lg:left-8 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 md:h-6 md:w-6 text-black dark:text-white" />
        </button>
        <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-black dark:text-white">OTP Verification</h1>
      </div>

      {/* Main Content */}
      <div className="flex flex-col justify-center px-6 sm:px-8 md:px-12 lg:px-16 xl:px-20 pt-8 sm:pt-12 md:pt-16 lg:pt-20 pb-12 sm:pb-16 md:pb-20">
        <div className="max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl mx-auto w-full space-y-8 md:space-y-10 lg:space-y-12">
          {/* Message */}
          <div className="text-center space-y-2 md:space-y-3">
            <p className="text-base md:text-lg lg:text-xl text-black dark:text-white">
              {showNameInput
                ? "You're almost done! Please tell us your name to complete registration."
                : contactType === "email"
                  ? "We have sent a verification code to"
                  : "We have sent a verification code to"}
            </p>
            {!showNameInput && (
              <p className="text-base md:text-lg lg:text-xl text-black dark:text-white font-medium">
                {contactInfo}
              </p>
            )}
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-500 text-center">
              {error}
            </p>
          )}

          {/* OTP Input Fields */}
          {!showNameInput && (
            <>
              <div className="flex justify-center gap-2 sm:gap-3 md:gap-4 lg:gap-5">
                {otp.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    disabled={isLoading}
                    className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-18 lg:h-18 text-center text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold p-0 border-2 border-black dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:border-[#E23744] dark:focus-visible:border-[#E23744] bg-white dark:bg-[#1a1a1a] text-black dark:text-white transition-all"
                  />
                ))}
              </div>

              {/* Resend Section */}
              <div className="text-center space-y-1 md:space-y-2">
                <p className="text-sm md:text-base text-black dark:text-white">
                  Didn't get the {contactType === "email" ? "email" : "SMS"}?
                </p>
                {resendTimer > 0 ? (
                  <p className="text-sm md:text-base text-gray-500 dark:text-gray-400">
                    Resend {contactType === "email" ? "email" : "SMS"} in {resendTimer}s
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isLoading}
                    className="text-sm md:text-base text-[#E23744] hover:text-[#d32f3d] dark:text-[#E23744] dark:hover:text-[#d32f3d] disabled:opacity-50 transition-colors font-medium"
                  >
                    Resend {contactType === "email" ? "email" : "SMS"}
                  </button>
                )}
              </div>
            </>
          )}

          {/* Name Input (shown only after OTP verified and user is new) */}
          {showNameInput && (
            <div className="space-y-4 md:space-y-5">
              <div className="space-y-2">
                <label className="block text-sm md:text-base font-medium text-black dark:text-white text-left">
                  Full name
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (nameError) setNameError("")
                  }}
                  disabled={isLoading}
                  placeholder="Enter your name"
                  className={`h-11 md:h-14 text-base md:text-lg border-2 ${nameError ? "border-red-500" : "border-gray-300 dark:border-gray-700"
                    } bg-white dark:bg-[#1a1a1a] text-black dark:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[#E23744]`}
                />
                {nameError && (
                  <p className="text-xs md:text-sm text-red-500 text-left">
                    {nameError}
                  </p>
                )}
              </div>

              <Button
                onClick={handleSubmitName}
                disabled={isLoading}
                className="w-full h-11 md:h-14 bg-[#E23744] hover:bg-[#d32f3d] text-white font-semibold text-base md:text-lg rounded-lg transition-all hover:shadow-lg active:scale-[0.98]"
              >
                {isLoading ? "Continuing..." : "Continue"}
              </Button>
            </div>
          )}

          {/* Loading Spinner */}
          {isLoading && !showNameInput && (
            <div className="flex justify-center pt-4">
              <Loader2 className="h-6 w-6 text-[#E23744] animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Go back to login methods */}
      <div className="pt-4 md:pt-6 mt-auto px-6 md:px-8 lg:px-12 text-center pb-8 md:pb-12">
        <button
          type="button"
          onClick={() => navigate("/user/auth/sign-in")}
          className="text-sm md:text-base text-[#E23744] hover:text-[#d32f3d] hover:underline transition-colors font-medium"
        >
          Go back to login methods
        </button>
      </div>
    </AnimatedPage>
  )
}
