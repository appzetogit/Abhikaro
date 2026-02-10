import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft
} from "lucide-react"

export default function PrivacyPolicy() {
  const navigate = useNavigate()

  const sections = [
    {
      title: "1. Information We Collect",
      content: "We collect information you provide directly to us, such as when you create an account, place an order, or contact us. This includes your name, email address, phone number, delivery address, and payment information."
    },
    {
      title: "2. How We Use Your Information",
      content: "We use the information we collect to provide, maintain, and improve our services, process transactions, send you updates, and respond to your inquiries."
    },
    {
      title: "3. Information Sharing",
      content: "We do not sell your personal information. We may share your information with restaurants and delivery partners to fulfill your orders, and with service providers who assist us in operating our platform."
    },
    {
      title: "4. Location Information",
      content: "We collect location information to provide delivery services, estimate delivery times, and improve our services. You can control location permissions through your device settings."
    },
    {
      title: "5. Data Security",
      content: "We implement appropriate security measures to protect your personal information. However, no method of transmission over the internet is 100% secure."
    },
    {
      title: "6. Your Rights",
      content: "You have the right to access, update, or delete your personal information. You can also opt-out of certain communications from us."
    },
    {
      title: "7. Cookies and Tracking",
      content: "We use cookies and similar tracking technologies to track activity on our service and hold certain information to improve user experience."
    },
    {
      title: "8. Children's Privacy",
      content: "Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13."
    },
    {
      title: "9. Changes to This Policy",
      content: "We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page."
    },
    {
      title: "10. Contact Us",
      content: "If you have any questions about this Privacy Policy, please contact us at privacy@appzetofood.com"
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
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Privacy Policy</h1>
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

