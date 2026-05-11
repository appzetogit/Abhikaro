import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  ChevronLeft,
  Phone,
  Mail,
  ExternalLink,
  Clock,
  ShieldCheck,
  Headset
} from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"

export default function SupportPage() {
  const navigate = useNavigate()

  const contactMethods = [
    {
      id: "phone",
      icon: Phone,
      title: "Call Us",
      value: "+91 6001756001",
      description: "Available for immediate assistance",
      action: "tel:+916001756001",
      color: "bg-blue-50 text-blue-600"
    },
    {
      id: "email",
      icon: Mail,
      title: "Email Us",
      value: "abhikaroapp@gmail.com",
      description: "Send us your queries anytime",
      action: "mailto:abhikaroapp@gmail.com",
      color: "bg-purple-50 text-purple-600"
    }
  ]

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white z-50 border-b border-slate-200">
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-slate-700" />
          </button>
          <h1 className="text-xl font-bold text-slate-900">Support</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6 space-y-6">
        {/* Hero Section */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Headset className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">How can we help?</h2>
          <p className="text-slate-500 text-sm max-w-[250px] mx-auto">
            Our support team is here to help you with any restaurant-related concerns.
          </p>
        </div>

        {/* Contact Methods */}
        <div className="grid gap-4">
          {contactMethods.map((method, index) => {
            const Icon = method.icon
            return (
              <motion.div
                key={method.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 transition-all"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${method.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-900">{method.title}</h3>
                  <p className="text-slate-500 text-sm mb-0.5 select-all">{method.value}</p>
                  <p className="text-slate-400 text-xs">{method.description}</p>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Quick Info */}
        <div className="bg-slate-900 rounded-2xl p-6 text-white overflow-hidden relative">
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Response Time</p>
                <p className="text-sm font-semibold">Under 15 minutes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-green-300" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Support Hours</p>
                <p className="text-sm font-semibold">9:00 AM - 11:00 PM</p>
              </div>
            </div>
          </div>
          {/* Abstract Background Element */}
          <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl"></div>
        </div>
      </div>

      {/* Bottom Nav Spacer */}
      <div className="h-20"></div>
      
      {/* Bottom Navigation */}
      <BottomNavOrders />
    </div>
  )
}
