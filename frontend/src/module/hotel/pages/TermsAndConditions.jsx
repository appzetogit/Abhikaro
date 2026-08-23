import { motion } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, CheckCircle2, ShieldCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"
import api, { hotelAPI } from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

export default function HotelTermsAndConditions() {
  const navigate = useNavigate()
  const companyName = useCompanyName()
  const [loading, setLoading] = useState(true)
  const [termsData, setTermsData] = useState({ title: "Terms and Conditions", content: "" })
  const [error, setError] = useState("")

  const isAuth = isModuleAuthenticated("hotel")
  const [requiresAcceptance, setRequiresAcceptance] = useState(false)
  const [isAccepted, setIsAccepted] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    let mounted = true
    const fetchTerms = async () => {
      try {
        setLoading(true)
        setError("")

        if (isAuth) {
          try {
            const statusRes = await hotelAPI.getTermsAcceptanceStatus()
            const statusData = statusRes?.data?.data
            if (mounted && statusData) {
              setRequiresAcceptance(Boolean(statusData.requiresAcceptance))
              setIsAccepted(Boolean(statusData.termsAcceptance?.isAccepted && !statusData.requiresAcceptance))
              if (statusData.terms) {
                setTermsData({
                  title: statusData.terms.title || "Hotel Terms and Conditions",
                  content: statusData.terms.content || "",
                })
                setLoading(false)
                return
              }
            }
          } catch (e) {
            console.warn("Could not load auth hotel terms status, falling back to public:", e)
          }
        }

        const response = await api.get(API_ENDPOINTS.ADMIN.HOTEL_TERMS_PUBLIC)
        if (response.data?.success && mounted) {
          setTermsData({
            title: response.data.data?.title || "Terms and Conditions",
            content: response.data.data?.content || "",
          })
        } else if (mounted) {
          setError("Unable to load terms and conditions.")
        }
      } catch (e) {
        console.error("Error fetching hotel terms:", e)
        if (mounted) setError("Unable to load terms and conditions.")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchTerms()
    return () => {
      mounted = false
    }
  }, [isAuth])

  const handleAccept = async () => {
    if (!agreed || accepting) return

    try {
      setAccepting(true)
      await hotelAPI.acceptTerms()
      setRequiresAcceptance(false)
      setIsAccepted(true)
      toast.success("Hotel Terms & Conditions accepted successfully!")
      window.dispatchEvent(new Event("hotel_terms_accepted"))
    } catch (err) {
      console.error("Failed to accept hotel terms:", err)
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to accept terms. Please try again."
      toast.error(msg)
    } finally {
      setAccepting(false)
    }
  }

  const hasContent = useMemo(() => {
    return Boolean(termsData.content && termsData.content.replace(/<[^>]*>/g, "").trim())
  }, [termsData.content])

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4 sticky top-0 z-20">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              navigate(-1)
            } else {
              navigate("/hotel")
            }
          }}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg md:text-xl font-bold text-gray-900">
            {termsData.title || "Terms and Conditions"}
          </h1>
          {isAuth && isAccepted && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
              <CheckCircle2 className="w-4 h-4" />
              Accepted
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-4xl mx-auto px-4 py-6 pb-12">
        <div>
          {loading ? (
            <div className="py-10 text-center text-gray-600">Loading...</div>
          ) : error ? (
            <div className="py-10 text-center text-gray-600">{error}</div>
          ) : !hasContent ? (
            <div className="py-10 text-center text-gray-600">No terms published yet.</div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="prose prose-slate max-w-none
                prose-headings:text-gray-900
                prose-p:text-gray-700
                prose-strong:text-gray-900
                prose-ul:text-gray-700
                prose-ol:text-gray-700
                prose-li:text-gray-700
                prose-a:text-blue-700
                prose-a:no-underline hover:prose-a:underline"
              dangerouslySetInnerHTML={{ __html: termsData.content }}
            />
          )}

          {/* Acceptance block if pending */}
          {isAuth && requiresAcceptance && !loading && (
            <div className="mt-10 p-5 sm:p-7 bg-blue-50/70 border-2 border-blue-200 rounded-2xl space-y-4 shadow-sm">
              <div className="flex items-center gap-2.5 text-blue-950 font-bold text-sm sm:text-base">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                <span>Action Required: Acceptance of Updated Terms</span>
              </div>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-sm text-gray-800 leading-tight">
                  I have read, understood, and agree to the updated {companyName} Hotel Terms & Conditions.
                </span>
              </label>
              <button
                type="button"
                onClick={handleAccept}
                disabled={!agreed || accepting}
                className={`py-3 px-6 rounded-xl font-semibold text-sm text-white shadow-sm flex items-center justify-center gap-2 transition-all ${
                  agreed && !accepting
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 cursor-pointer"
                    : "bg-gray-300 cursor-not-allowed opacity-75 shadow-none"
                }`}
              >
                {accepting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Accepting...</span>
                  </>
                ) : (
                  <span>Accept & Continue</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

