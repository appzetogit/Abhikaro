import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"

export default function Notifications() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-gray-200">
        <button
          onClick={() => navigate("/restaurant")}
          className="p-2 rounded-full hover:bg-gray-100"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        <h1 className="text-base font-semibold text-gray-900">Notifications</h1>
      </div>

      <div className="flex-1 px-4 pt-4 pb-28">
        <div className="text-center text-sm text-gray-600 py-12">
          No notifications
        </div>
      </div>
    </div>
  )
}
