import { useEffect } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import Lenis from "lenis"
import { ArrowLeft } from "lucide-react"
import BottomNavbar from "../components/BottomNavbar"
import MenuOverlay from "../components/MenuOverlay"
import { useState } from "react"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import api from "@/lib/api"

export default function TermsAndConditionsPage() {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const companyName = useCompanyName()
  const [loading, setLoading] = useState(true)
  const [terms, setTerms] = useState({ title: "Terms & Conditions", content: "" })
  const [loadError, setLoadError] = useState("")

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
  }, [])

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-24 md:pb-6">
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
      <div className="px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6"
        >
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-gray-900">
              {terms.title || "Terms & Conditions"}
            </h2>
            <p className="text-xs text-gray-500">Powered by {companyName}</p>
          </div>

          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : loadError ? (
            <div className="text-sm text-red-600">{loadError}</div>
          ) : (
            <div
              className="prose prose-sm max-w-none prose-p:leading-relaxed prose-li:leading-relaxed"
              dangerouslySetInnerHTML={{ __html: terms.content || "" }}
            />
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

