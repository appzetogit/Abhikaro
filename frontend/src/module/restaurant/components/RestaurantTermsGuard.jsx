import React, { useEffect, useState, useCallback, useContext } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { FileText, ShieldCheck, Loader2, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@/lib/api"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { RestaurantSocketContext } from "../context/RestaurantSocketContext"

export default function RestaurantTermsGuard({ children }) {
  const companyName = useCompanyName()
  const socketContext = useContext(RestaurantSocketContext)
  const [checking, setChecking] = useState(true)
  const [requiresAcceptance, setRequiresAcceptance] = useState(false)
  const [terms, setTerms] = useState({
    title: "Restaurant Terms and Conditions",
    content: "",
    version: 1,
    updatedAt: null,
  })
  const [agreed, setAgreed] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState("")

  const checkStatus = useCallback(async () => {
    if (!isModuleAuthenticated("restaurant")) {
      setChecking(false)
      return
    }

    try {
      const res = await restaurantAPI.getTermsAcceptanceStatus()
      const data = res?.data?.data
      if (data) {
        setRequiresAcceptance(Boolean(data.requiresAcceptance))
        if (data.terms) {
          setTerms({
            title: data.terms.title || "Restaurant Terms and Conditions",
            content: data.terms.content || "",
            version: data.terms.version || 1,
            updatedAt: data.terms.updatedAt,
          })
        }
      }
    } catch (err) {
      console.error("Failed to check restaurant terms status:", err)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Listen for socket update if terms are updated in real-time
  useEffect(() => {
    const handleTermsUpdated = () => {
      checkStatus()
    }

    window.addEventListener("restaurant_terms_updated", handleTermsUpdated)
    return () => {
      window.removeEventListener("restaurant_terms_updated", handleTermsUpdated)
    }
  }, [checkStatus])

  const handleAccept = async () => {
    if (!agreed || accepting) return

    try {
      setAccepting(true)
      setError("")
      await restaurantAPI.acceptTerms()
      setRequiresAcceptance(false)
      toast.success("Terms & Conditions accepted successfully!")
      window.dispatchEvent(new Event("restaurant_terms_accepted"))
    } catch (err) {
      console.error("Failed to accept terms:", err)
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to accept terms. Please try again."
      setError(msg)
      toast.error(msg)
    } finally {
      setAccepting(false)
    }
  }

  return (
    <>
      {children}

      {/* Mandatory Full Page Terms Acceptance Guard */}
      <AnimatePresence>
        {requiresAcceptance && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-lenis-prevent="true"
            className="fixed inset-0 z-[999999] bg-white overflow-y-auto overflow-x-hidden w-full h-full min-h-screen flex flex-col"
            style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
          >
            {/* Top Full-Width Header */}
            <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white px-4 sm:px-6 md:px-8 py-4 sm:py-5 shadow-md flex items-center gap-3.5 sm:gap-4 shrink-0 sticky top-0 z-30">
              <div className="p-2.5 sm:p-3 bg-white/20 rounded-xl backdrop-blur-md shrink-0 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="space-y-0.5 sm:space-y-1">
                <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-white">
                  Terms & Conditions Updated
                </h1>
                <p className="text-xs sm:text-sm text-orange-100 leading-snug">
                  Please review and accept the updated Terms & Conditions to access your {companyName} Restaurant Portal.
                </p>
              </div>
            </div>

            {/* Scrollable Terms Content + Bottom Acceptance Box */}
            <div className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-10 py-6 sm:py-8 space-y-6">
              <div className="border-b border-gray-200 pb-4 space-y-1">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  {terms.title || "Restaurant Terms and Conditions"}
                </h2>
                <p className="text-xs sm:text-sm text-gray-500">
                  Powered by {companyName}
                </p>
              </div>

              <div
                className="prose prose-sm sm:prose-base max-w-none text-gray-700 leading-relaxed space-y-4 prose-headings:text-gray-900 prose-headings:font-bold prose-p:text-gray-700 prose-li:text-gray-700"
                dangerouslySetInnerHTML={{
                  __html: terms.content || "<p>Terms & Conditions content</p>",
                }}
              />

              {/* Action Box at the very end / last of terms */}
              <div className="mt-10 mb-8 p-5 sm:p-7 bg-orange-50/70 border-2 border-orange-200 rounded-2xl space-y-4 shadow-sm">
                <div className="flex items-center gap-2.5 text-orange-950 font-bold text-sm sm:text-base">
                  <ShieldCheck className="w-5 h-5 text-orange-600 shrink-0" />
                  <span>Acceptance Required</span>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 text-xs sm:text-sm text-red-700 bg-red-100 rounded-lg border border-red-200">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Checkbox agreement */}
                <label className="flex items-start gap-3 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer transition-colors"
                  />
                  <span className="text-xs sm:text-sm font-medium text-gray-800 group-hover:text-gray-900 leading-snug">
                    I have read, understood, and agree to the {companyName} Restaurant Terms & Conditions.
                  </span>
                </label>

                {/* Accept Button */}
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={!agreed || accepting}
                  className={`w-full py-3.5 px-6 rounded-xl font-semibold text-sm sm:text-base text-white shadow-md flex items-center justify-center gap-2 transition-all ${
                    agreed && !accepting
                      ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-[0.99] cursor-pointer"
                      : "bg-gray-300 cursor-not-allowed opacity-75 shadow-none"
                  }`}
                >
                  {accepting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Accepting Terms & Conditions...</span>
                    </>
                  ) : (
                    <span>Accept & Continue</span>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
