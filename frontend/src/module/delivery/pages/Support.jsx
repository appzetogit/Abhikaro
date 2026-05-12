import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft,
  Phone,
  Mail,
  Headphones
} from "lucide-react"

export default function Support() {
  const navigate = useNavigate()

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
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Support</h1>
      </div>

      {/* Main Content */}
      <div className="w-full px-4 py-8 pb-24 md:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col items-center text-center space-y-6"
        >
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md">
            <Headphones className="w-10 h-10 text-gray-800" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">How can we help?</h2>
            <p className="text-gray-600">Our support team is available to assist you with any questions or issues.</p>
          </div>

          <div className="w-full max-w-md space-y-4 pt-4">
            {/* Call Support */}
            <a 
              href="tel:6001756001"
              className="flex items-center gap-4 bg-white p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow group"
            >
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Phone className="w-6 h-6 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Call us</p>
                <p className="text-lg font-bold text-gray-900">6001756001</p>
              </div>
            </a>

            {/* Email Support */}
            <a 
              href="mailto:abhikaroapp@gmail.com"
              className="flex items-center gap-4 bg-white p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow group"
            >
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                <Mail className="w-6 h-6 text-purple-600" />
              </div>
              <div className="text-left">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email us</p>
                <p className="text-lg font-bold text-gray-900">abhikaroapp@gmail.com</p>
              </div>
            </a>
          </div>

          <div className="pt-8">
            <p className="text-sm text-gray-500 italic">"Always here for you"</p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
