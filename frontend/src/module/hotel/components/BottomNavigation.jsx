import { useNavigate, useLocation } from "react-router-dom"
import { Home, FileText, User, Wallet, Trophy } from "lucide-react"

export default function BottomNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => {
    if (path === "/hotel/dashboard") {
      return location.pathname === "/hotel/dashboard" || location.pathname === "/hotel"
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="flex w-full items-center justify-between py-2 px-2">
        <button
          onClick={() => navigate("/hotel/dashboard")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 p-2 text-center transition-colors ${isActive("/hotel/dashboard") ? "text-[#ff8100]" : "text-gray-600"
            }`}
        >
          <Home className="w-6 h-6" />
          <span className="text-xs">Dashboard</span>
        </button>
        <button
          onClick={() => navigate("/hotel/orders")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 p-2 text-center transition-colors ${isActive("/hotel/orders") ? "text-[#ff8100]" : "text-gray-600"
            }`}
        >
          <FileText className="w-6 h-6" />
          <span className="text-xs">Orders</span>
        </button>
        <button
          onClick={() => navigate("/hotel/leaderboard")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 p-2 text-center transition-colors ${isActive("/hotel/leaderboard") ? "text-[#ff8100]" : "text-gray-600"
            }`}
        >
          <Trophy className="w-6 h-6 text-yellow-400" />
          <span className="text-xs">Leaderboard</span>
        </button>
        <button
          onClick={() => navigate("/hotel/wallet")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 p-2 text-center transition-colors ${isActive("/hotel/wallet") ? "text-[#ff8100]" : "text-gray-600"
            }`}
        >
          <Wallet className="w-6 h-6" />
          <span className="text-xs">Wallet</span>
        </button>
        <button
          onClick={() => navigate("/hotel/profile")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 p-2 text-center transition-colors ${isActive("/hotel/profile") ? "text-[#ff8100]" : "text-gray-600"
            }`}
        >
          <User className="w-6 h-6" />
          <span className="text-xs">Profile</span>
        </button>
      </div>
    </div>
  )
}
