import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import Lenis from "lenis"
import { ArrowLeft, CheckCircle2, ShieldCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"
import BottomNavbar from "../components/BottomNavbar"
import MenuOverlay from "../components/MenuOverlay"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import api, { restaurantAPI } from "@/lib/api"

export default function TermsAndConditionsPage() {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const companyName = useCompanyName()
  const [loading, setLoading] = useState(true)
  const [terms, setTerms] = useState({ title: "Terms & Conditions", content: "" })
  const [loadError, setLoadError] = useState("")

  // Acceptance state for authenticated restaurants
  const isAuth = isModuleAuthenticated("restaurant")
  const [requiresAcceptance, setRequiresAcceptance] = useState(false)
  const [isAccepted, setIsAccepted] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [accepting, setAccepting] = useState(false)

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setLoading(true)
        setLoadError("")

        if (isAuth) {
          try {
            const statusRes = await restaurantAPI.getTermsAcceptanceStatus()
            const statusData = statusRes?.data?.data
            if (mounted && statusData) {
              setRequiresAcceptance(Boolean(statusData.requiresAcceptance))
              setIsAccepted(Boolean(statusData.termsAcceptance?.isAccepted && !statusData.requiresAcceptance))
              if (statusData.terms) {
                setTerms({
                  title: statusData.terms.title || "Terms & Conditions",
                  content: statusData.terms.content || "",
                })
                setLoading(false)
                return
              }
            }
          } catch (e) {
            console.warn("Could not load auth terms status, falling back to public:", e)
          }
        }

        const res = await api.get("/restaurant/public/terms")
        const data = res?.data?.data
        if (mounted && data) {
          setTerms({
            title: data.title || "Terms & Conditions",
            content: data.content || "",
          })
        }
      } catch (e) {
        console.error("Failed to load restaurant terms:", e)
        if (mounted) setLoadError("Failed to load Terms & Conditions.")
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [isAuth])

  const handleAccept = async () => {
    if (!agreed || accepting) return

    try {
      setAccepting(true)
      await restaurantAPI.acceptTerms()
      setRequiresAcceptance(false)
      setIsAccepted(true)
      toast.success("Terms & Conditions accepted successfully!")
      window.dispatchEvent(new Event("restaurant_terms_accepted"))
    } catch (err) {
      console.error("Failed to accept terms:", err)
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to accept terms. Please try again."
      toast.error(msg)
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <button 
          onClick={() => navigate(-1)}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Terms & Conditions</h1>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <div className="space-y-2 border-b border-gray-100 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-bold text-gray-900">
                {terms.title || "Terms & Conditions"}
              </h2>
              {isAuth && isAccepted && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
                  <CheckCircle2 className="w-4 h-4" />
                  Accepted
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">Powered by {companyName}</p>
          </div>

          {loading ? (
            <div className="text-sm text-gray-600 py-6 text-center">Loading...</div>
          ) : loadError ? (
            <div className="text-sm text-red-600 py-6 text-center">{loadError}</div>
          ) : (
            <div
              className="prose prose-sm max-w-none prose-p:leading-relaxed prose-li:leading-relaxed prose-headings:text-gray-900 prose-p:text-gray-700"
              dangerouslySetInnerHTML={{ __html: terms.content || "" }}
            />
          )}

          {/* Acceptance block if pending */}
          {isAuth && requiresAcceptance && !loading && (
            <div className="mt-8 p-5 bg-orange-50/70 border border-orange-200 rounded-xl space-y-4">
              <div className="flex items-center gap-2 text-orange-900 font-semibold text-sm">
                <ShieldCheck className="w-5 h-5 text-orange-600" />
                <span>Action Required: Acceptance of Updated Terms</span>
              </div>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                />
                <span className="text-sm text-gray-800 leading-tight">
                  I have read, understood, and agree to the updated {companyName} Restaurant Terms & Conditions.
                </span>
              </label>
              <button
                type="button"
                onClick={handleAccept}
                disabled={!agreed || accepting}
                className={`py-2.5 px-6 rounded-lg font-semibold text-sm text-white shadow-sm flex items-center justify-center gap-2 transition-all ${
                  agreed && !accepting
                    ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 cursor-pointer"
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
        </motion.div>
      </div>

      {/* Bottom Navigation Bar */}
      <BottomNavbar onMenuClick={() => setShowMenu(true)} />
      
      {/* Menu Overlay */}
      <MenuOverlay showMenu={showMenu} setShowMenu={setShowMenu} />
    </div>
  )
}

