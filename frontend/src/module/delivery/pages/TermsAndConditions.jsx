import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft
} from "lucide-react"

export default function TermsAndConditions() {
  const navigate = useNavigate()

  const sections = [
    {
      title: "1. Acceptance of Terms",
      content: "By accessing and using this delivery service, you accept and agree to be bound by the terms and provision of this agreement."
    },
    {
      title: "2. Service Description",
      content: "We provide food delivery services connecting customers with restaurants. We act as an intermediary between you and the restaurant."
    },
    {
      title: "3. User Responsibilities",
      content: "You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account."
    },
    {
      title: "4. Payment Terms",
      content: "Payment for orders must be made at the time of delivery or through the app. We accept cash, credit cards, and other payment methods as specified."
    },
    {
      title: "5. Delivery Terms",
      content: "Delivery times are estimates and not guaranteed. We are not responsible for delays due to weather, traffic, or other circumstances beyond our control."
    },
    {
      title: "6. Cancellation Policy",
      content: "Orders can be cancelled within 5 minutes of placement. After this time, cancellation may not be possible if the restaurant has started preparation."
    },
    {
      title: "7. Limitation of Liability",
      content: "We shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the service."
    },
    {
      title: "8. Changes to Terms",
      content: "We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms."
    }
  ]

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
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Terms and Conditions</h1>
      </div>

      {/* Main Content */}
      <div className="w-full px-4 py-6 pb-24 md:pb-6">
        <div className="w-full max-w-none">
          <p className="text-gray-600 text-sm md:text-base mb-6">
            Last updated: January 1, 2024
          </p>
          
          <div className="space-y-6">
            {sections.map((section, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <h3 className="text-gray-900 font-bold text-base md:text-lg mb-2">
                  {section.title}
                </h3>
                <p className="text-gray-600 text-sm md:text-base leading-relaxed">
                  {section.content}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

