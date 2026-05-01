import { motion } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"

export default function HotelTermsAndConditions() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [termsData, setTermsData] = useState({ title: "Terms and Conditions", content: "" })
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        setLoading(true)
        setError("")
        const response = await api.get(API_ENDPOINTS.ADMIN.HOTEL_TERMS_PUBLIC)
        if (response.data?.success) {
          setTermsData({
            title: response.data.data?.title || "Terms and Conditions",
            content: response.data.data?.content || "",
          })
        } else {
          setError("Unable to load terms and conditions.")
        }
      } catch (e) {
        console.error("Error fetching hotel terms:", e)
        setError("Unable to load terms and conditions.")
      } finally {
        setLoading(false)
      }
    }

    fetchTerms()
  }, [])

  const hasContent = useMemo(() => {
    return Boolean(termsData.content && termsData.content.replace(/<[^>]*>/g, "").trim())
  }, [termsData.content])

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4">
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
        <h1 className="text-lg md:text-xl font-bold text-gray-900">
          {termsData.title || "Terms and Conditions"}
        </h1>
      </div>

      {/* Main Content */}
      <div className="w-full px-4 py-6 pb-10">
        <div className="w-full max-w-none">
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
        </div>
      </div>
    </div>
  )
}

