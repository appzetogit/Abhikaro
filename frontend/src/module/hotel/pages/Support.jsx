import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Phone, Mail, MessageSquare, Clock, ShieldCheck } from "lucide-react"

export default function HotelSupport() {
  const navigate = useNavigate()

  const contactMethods = [
    {
      icon: <Phone className="w-6 h-6 text-orange-500" />,
      title: "Call Us",
      value: "6001756001",
      action: "tel:6001756001",
      description: "Speak directly with our support team"
    },
    {
      icon: <Mail className="w-6 h-6 text-blue-500" />,
      title: "Email Us",
      value: "abhikaroapp@gmail.com",
      action: "mailto:abhikaroapp@gmail.com",
      description: "Send us your queries anytime"
    },
    {
      icon: <MessageSquare className="w-6 h-6 text-green-500" />,
      title: "WhatsApp",
      value: "+91 6001756001",
      action: "https://wa.me/916001756001",
      description: "Chat with us for quick solutions"
    }
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Help & Support</h1>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-6">
        {/* Welcome Section */}
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-10 h-10 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">How can we help?</h2>
          <p className="text-slate-600 mt-2">We're here to assist you with any issues or questions you might have.</p>
        </div>

        {/* Contact Grid */}
        <div className="grid gap-4">
          {contactMethods.map((method, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-100 transition-all group"
            >
              <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-blue-50 transition-colors">
                {method.icon}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{method.title}</p>
                <p className="text-lg font-bold text-slate-900">{method.value}</p>
                <p className="text-sm text-slate-500">{method.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Office Hours */}
        <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
          <div className="relative z-10 flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-md">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Operational Hours</h3>
              <p className="text-blue-100 text-sm">Mon - Sun: 9:00 AM - 11:00 PM</p>
            </div>
          </div>
          {/* Decorative Circle */}
          <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        </div>

        {/* Footer Note */}
        <p className="text-center text-slate-500 text-sm pb-8">
          Typically responds within 15-30 minutes during operational hours.
        </p>
      </div>
    </div>
  )
}
