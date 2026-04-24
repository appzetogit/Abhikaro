import { motion } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft
} from "lucide-react"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"

export default function PrivacyPolicy() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [policyData, setPolicyData] = useState({ title: "Privacy Policy", content: "" })
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchPrivacy = async () => {
      try {
        setLoading(true)
        setError("")
        const response = await api.get(API_ENDPOINTS.ADMIN.DELIVERY_PRIVACY_PUBLIC)
        if (response.data?.success) {
          setPolicyData({
            title: response.data.data?.title || "Privacy Policy",
            content: response.data.data?.content || "",
          })
        } else {
          setError("Unable to load privacy policy.")
        }
      } catch (e) {
        console.error("Error fetching delivery privacy:", e)
        setError("Unable to load privacy policy.")
      } finally {
        setLoading(false)
      }
    }

    fetchPrivacy()
  }, [])

  const hasContent = useMemo(() => {
    return Boolean(policyData.content && policyData.content.replace(/<[^>]*>/g, "").trim())
  }, [policyData.content])

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4 rounded-b-3xl md:rounded-b-none">
        <button 
          onClick={() => navigate("/delivery/profile")}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-gray-900">{policyData.title || "Privacy Policy"}</h1>
      </div>

      {/* Main Content */}
      <div className="w-full px-4 py-6 pb-24 md:pb-6">
        <div className="w-full max-w-none">
          {loading ? (
            <div className="py-10 text-center text-gray-600">Loading...</div>
          ) : error ? (
            <div className="py-10 text-center text-gray-600">{error}</div>
          ) : !hasContent ? (
            <div className="py-10 text-center text-gray-600">No privacy policy published yet.</div>
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
              dangerouslySetInnerHTML={{ __html: policyData.content }}
            />
          )}
        </div>
      </div>

    </div>
  )
}

