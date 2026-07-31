import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, Clock, CheckCircle, XCircle, TrendingUp, CreditCard, QrCode, Download, Loader2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import BottomNavigation from "../components/BottomNavigation"
import { hotelAPI } from "@/lib/api"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"
import { useForegroundNotifications } from "@/lib/hooks/useForegroundNotifications"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import qrPosterTemplate from "@/assets/qrcode.png"

// Normalize hotel QR code value
const normalizeHotelQrValue = (rawValue, hotelId) => {
  const origin = window.location.origin
  const fallback = hotelId ? `${origin}/hotel-menu?ref=${encodeURIComponent(hotelId)}` : `${origin}/hotel-menu`

  if (!rawValue || typeof rawValue !== "string") return fallback
  if (rawValue.startsWith("data:image/")) return fallback
  if (rawValue.includes("/hotel-menu") && rawValue.includes("ref=")) return rawValue

  try {
    const url = new URL(rawValue, origin)
    const ref =
      url.searchParams.get("ref") ||
      url.searchParams.get("hotelRef") ||
      url.pathname.match(/\/hotel\/view\/([^/?]+)/)?.[1] ||
      hotelId ||
      null
    if (ref) return `${origin}/hotel-menu?ref=${encodeURIComponent(ref)}`
  } catch {
    // ignore
  }

  return fallback
}

export default function HotelDashboard() {
  const navigate = useNavigate()
  const [hotel, setHotel] = useState(null)
  const [leaderboardBanners, setLeaderboardBanners] = useState([])
  const [leaderboardBannerIndex, setLeaderboardBannerIndex] = useState(0)
  const [touchStartX, setTouchStartX] = useState(null)
  const [qrCodeData, setQrCodeData] = useState(null)
  const [loadingQR, setLoadingQR] = useState(false)
  const [downloadingQR, setDownloadingQR] = useState(false)
  const [stats, setStats] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    completedRequests: 0,
    totalRevenue: 0,
  })
  const [settlementSummary, setSettlementSummary] = useState({
    totalCashCollected: 0,
    adminCommissionDue: 0,
    settlementPaid: 0,
    remainingSettlement: 0
  })
  const [loading, setLoading] = useState(true)

  // Handle foreground push notifications while hotel panel is open
  useForegroundNotifications({
    onNotificationClick: (data) => {
      // If notification is about a specific order, go to orders page
      if (data?.orderId) {
        navigate("/hotel/orders")
        return
      }

      // If notification is about a specific hotel request, go to requests page
      if (data?.requestId) {
        navigate("/hotel/requests?filter=pending")
        return
      }

      // Fallback: stay on / go back to dashboard
      navigate("/hotel/dashboard")
    },
    showToasts: true,
  })

  // Load business settings (title and favicon)
  useEffect(() => {
    loadBusinessSettings().catch(() => {
      // Silently fail - not critical
    })
  }, [])

  useEffect(() => {
    // Check authentication
    if (!isModuleAuthenticated("hotel")) {
      navigate("/hotel", { replace: true })
      return
    }

    // Fetch hotel data and stats
    const fetchData = async () => {
      try {
        // Fetch hotel data
        const hotelResponse = await hotelAPI.getCurrentHotel()
        const hotelPayload = hotelResponse.data?.data?.hotel || null
        if (hotelResponse.data?.success && hotelPayload) {
          setHotel(hotelPayload)
          if (hotelPayload.qrCode) {
            setQrCodeData(hotelPayload.qrCode)
          } else {
            // Fetch/Generate QR code automatically
            hotelAPI.getQRCode().then(res => {
              if (res.data?.success) {
                const qrData = res.data.data?.qrData || res.data.data?.qrCode
                setQrCodeData(qrData)
              }
            }).catch(() => {})
          }
        }

        // Fetch request stats
        try {
          const statsResponse = await hotelAPI.getRequestStats()
          if (statsResponse.data?.success) {
            const statsData = statsResponse.data.data || statsResponse.data
            setStats({
              totalRequests: statsData.totalRequests || 0,
              pendingRequests: statsData.pendingRequests || 0,
              completedRequests: statsData.completedRequests || 0,
              totalRevenue: statsData.totalRevenue || 0,
              totalHotelRevenue: statsData.totalHotelRevenue || 0,
            })
          }
        } catch (statsError) {
          console.error("Error fetching request stats:", statsError)
          if (statsError.response?.status === 401 || statsError.response?.status === 403) {
            setStats({
              totalRequests: 0,
              pendingRequests: 0,
              completedRequests: 0,
            })
          } else {
            try {
              const requestsResponse = await hotelAPI.getRequests()
              const requests = requestsResponse.data?.data?.requests || requestsResponse.data?.data || []
              const pending = requests.filter((r) => r.status?.toLowerCase() === "pending").length
              const completed = requests.filter((r) =>
                r.status?.toLowerCase() === "completed" || r.status?.toLowerCase() === "accepted"
              ).length
              setStats({
                totalRequests: requests.length,
                pendingRequests: pending,
                completedRequests: completed,
                totalRevenue: requests
                  .filter((r) => r.status?.toLowerCase() === "delivered")
                  .reduce((sum, r) => sum + (r.pricing?.total || 0), 0),
              })
            } catch (err) {
              console.warn("Could not fetch request stats, using defaults:", err)
              setStats({
                totalRequests: 0,
                pendingRequests: 0,
                completedRequests: 0,
              })
            }
          }
        }

        if (hotelPayload?.isActive) {
          try {
            const settlementResponse = await hotelAPI.getSettlementSummary()
            if (settlementResponse.data?.success) {
              setSettlementSummary(settlementResponse.data.data)
            }
          } catch (settlementError) {
            if (settlementError?.response?.status !== 401) {
              console.error("Error fetching settlement summary:", settlementError)
            }
          }
        } else {
          setSettlementSummary({
            totalCashCollected: 0,
            adminCommissionDue: 0,
            settlementPaid: 0,
            remainingSettlement: 0,
          })
        }

        try {
          const res = await hotelAPI.getLeaderboardRewards()
          const banners = res?.data?.data?.banners
          const urls = (Array.isArray(banners) ? banners : [])
            .map((b) => (typeof b?.url === "string" ? b.url.trim() : ""))
            .filter(Boolean)
          setLeaderboardBanners(urls)
          setLeaderboardBannerIndex(0)
        } catch {
          setLeaderboardBanners([])
          setLeaderboardBannerIndex(0)
        }
      } catch (error) {
        console.error("Error fetching hotel data:", error)
        if (error.response?.status === 401 || error.response?.status === 403) {
          navigate("/hotel", { replace: true })
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [navigate])

  const handleGenerateQR = async () => {
    setLoadingQR(true)
    try {
      const response = await hotelAPI.getQRCode()
      if (response.data?.success) {
        const qrData = response.data.data?.qrData || response.data.data?.qrCode
        setQrCodeData(qrData)
        if (hotel) {
          setHotel({ ...hotel, qrCode: qrData })
        }
      }
    } catch (error) {
      console.error("Error generating QR code:", error)
      toast.error("Failed to generate QR code. Please try again.")
    } finally {
      setLoadingQR(false)
    }
  }

  const handleDownloadQR = async () => {
    if (!qrCodeData || !hotel) return

    setDownloadingQR(true)
    try {
      const qrElement = document.getElementById("dashboard-hotel-qr-code")
      if (!qrElement) throw new Error("QR code element not found")

      const svg = qrElement.querySelector("svg")
      if (!svg) throw new Error("QR code SVG not found")

      const svgData = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
      const svgUrl = URL.createObjectURL(svgBlob)

      const qrImage = new Image()
      await new Promise((resolve, reject) => {
        qrImage.onload = resolve
        qrImage.onerror = reject
        qrImage.src = svgUrl
      })

      const templateImage = new Image()
      templateImage.src = qrPosterTemplate
      await new Promise((resolve, reject) => {
        templateImage.onload = resolve
        templateImage.onerror = reject
      })

      const canvas = document.createElement("canvas")
      const posterWidth = templateImage.width
      const posterHeight = templateImage.height
      canvas.width = posterWidth
      canvas.height = posterHeight
      const ctx = canvas.getContext("2d")

      ctx.drawImage(templateImage, 0, 0, posterWidth, posterHeight)
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "#DC2626"

      const getFittedFontSize = ({ lines, maxWidth, fontFamily = "Arial, sans-serif", fontWeight = "bold", maxFontSize, minFontSize }) => {
        const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : []
        const finalLines = safeLines.length ? safeLines : ["Hotel"]

        for (let size = maxFontSize; size >= minFontSize; size -= 1) {
          ctx.font = `${fontWeight} ${size}px ${fontFamily}`
          const fits = finalLines.every((line) => ctx.measureText(String(line)).width <= maxWidth)
          if (fits) return size
        }
        return minFontSize
      }

      ctx.font = "bold " + Math.round(posterHeight * 0.032) + "px Arial, sans-serif"
      const welcomeY = posterHeight * 0.09
      ctx.fillText("Welcome To", posterWidth / 2, welcomeY)

      const hotelNameSingleLine = String(hotel?.hotelName || "Hotel").trim()
      const nameMaxWidth = posterWidth * 0.86
      const hotelNameFontSize = getFittedFontSize({
        lines: [hotelNameSingleLine],
        maxWidth: nameMaxWidth,
        maxFontSize: Math.round(posterHeight * 0.05),
        minFontSize: Math.round(posterHeight * 0.02),
      })
      ctx.font = "bold " + hotelNameFontSize + "px Arial, sans-serif"

      const hotelNameY = welcomeY + posterHeight * 0.048
      ctx.fillText(hotelNameSingleLine, posterWidth / 2, hotelNameY)

      const qrSize = posterWidth * 0.45
      const qrX = posterWidth * 0.1
      const qrY = posterHeight * 0.45

      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40)
      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize)

      canvas.toBlob((blob) => {
        if (!blob) throw new Error("Failed to create image blob")
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `${hotel.hotelName || "hotel"}-qr-code-poster-${hotel.hotelId || hotel._id}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        URL.revokeObjectURL(svgUrl)
        toast.success("QR code poster downloaded successfully!")
      }, "image/png")
    } catch (error) {
      console.error("Error downloading QR code poster:", error)
      toast.error("Failed to download QR code poster. Please try again.")
    } finally {
      setDownloadingQR(false)
    }
  }

  // Auto-slide leaderboard banner every 15 seconds
  useEffect(() => {
    if (!Array.isArray(leaderboardBanners) || leaderboardBanners.length <= 1) return
    const id = setInterval(() => {
      setLeaderboardBannerIndex((prev) => (prev + 1) % leaderboardBanners.length)
    }, 15000)
    return () => clearInterval(id)
  }, [leaderboardBanners])

  const goNextBanner = () => {
    if (!Array.isArray(leaderboardBanners) || leaderboardBanners.length <= 1) return
    setLeaderboardBannerIndex((prev) => (prev + 1) % leaderboardBanners.length)
  }

  const goPrevBanner = () => {
    if (!Array.isArray(leaderboardBanners) || leaderboardBanners.length <= 1) return
    setLeaderboardBannerIndex((prev) => (prev - 1 + leaderboardBanners.length) % leaderboardBanners.length)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!hotel) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load hotel data</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{hotel.hotelName}</h1>
              <p className="text-sm text-gray-500 mt-1">Dashboard Overview</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Leaderboard Banner (above Overview) */}
        {leaderboardBanners.length > 0 ? (
          <div
            className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm cursor-pointer select-none"
            onClick={() => navigate("/hotel/leaderboard")}
            role="button"
            onTouchStart={(e) => {
              if (!leaderboardBanners || leaderboardBanners.length <= 1) return
              setTouchStartX(e.touches?.[0]?.clientX ?? null)
            }}
            onTouchEnd={(e) => {
              if (!leaderboardBanners || leaderboardBanners.length <= 1) return
              const endX = e.changedTouches?.[0]?.clientX
              if (touchStartX == null || endX == null) return
              const dx = endX - touchStartX
              const threshold = 40
              if (dx > threshold) {
                goPrevBanner()
              } else if (dx < -threshold) {
                goNextBanner()
              }
              setTouchStartX(null)
            }}
          >
            <img
              src={leaderboardBanners[Math.min(leaderboardBannerIndex, leaderboardBanners.length - 1)]}
              alt="Leaderboard banner"
              className="h-32 w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : null}

        {/* Overview Section */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Overview</h2>

          {/* Hotel QR Code Card (Scan to order food) */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
            <p className="text-sm font-bold text-gray-800 text-center uppercase tracking-wide mb-4">
              Scan to order food
            </p>

            {!qrCodeData ? (
              <div className="text-center py-6">
                <QrCode className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-xs text-gray-500 mb-4">
                  Generate a QR code for guests to scan and order food
                </p>
                <Button
                  onClick={handleGenerateQR}
                  disabled={loadingQR}
                  className="bg-[#ff8100] hover:bg-[#ff8100]/90 text-white text-xs px-4 py-2"
                >
                  {loadingQR ? "Generating..." : "Generate QR Code"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-3">
                <div
                  id="dashboard-hotel-qr-code"
                  className="bg-white p-1"
                >
                  <QRCodeSVG
                    value={normalizeHotelQrValue(qrCodeData, hotel?.hotelId || hotel?._id)}
                    size={210}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-gray-900 mb-0.5">
                    {hotel.hotelName}
                  </p>
                  <p className="text-xs text-gray-500 font-medium">
                    Hotel ID: {hotel.hotelId || hotel._id}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Stats Cards (Pushed down below QR Code) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-4">
            {/* Total Requests */}
            <div
              onClick={() => navigate("/hotel/orders")}
              className="bg-white rounded-lg shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-gray-400"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 bg-gray-100 rounded-lg">
                  <FileText className="w-5 h-5 text-gray-600" />
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mb-1">Total Requests</p>
              <p className="text-lg font-bold text-gray-900">{stats.totalRequests}</p>
            </div>

            {/* Total Amount (Revenue) */}
            <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-2.5 opacity-10">
                <TrendingUp size={38} className="text-green-500" />
              </div>
              <div className="flex flex-col">
                <div className="p-1.5 bg-green-50 rounded-lg w-fit mb-1.5">
                  <TrendingUp size={16} className="text-green-500" />
                </div>
                <p className="text-gray-500 text-[11px] font-medium">Total Amount</p>
                <h3 className="text-lg font-bold text-gray-800 mt-1">
                  ₹{stats?.totalRevenue || 0}
                </h3>
              </div>
            </div>

            {/* New Card: Hotel Revenue (Commission) */}
            <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-2.5 opacity-10">
                <CreditCard size={38} className="text-purple-500" />
              </div>
              <div className="flex flex-col">
                <div className="p-1.5 bg-purple-50 rounded-lg w-fit mb-1.5">
                  <CreditCard size={16} className="text-purple-500" />
                </div>
                <p className="text-gray-500 text-[11px] font-medium">Your Earnings (Commission)</p>
                <h3 className="text-lg font-bold text-gray-800 mt-1">
                  ₹{stats?.totalHotelRevenue || 0}
                </h3>
              </div>
            </div>
          </div>
        </div>

        {/* Settlement Summary Section Removed */}

        {/* Welcome Message */}
        {!hotel.isActive && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  Account Pending Approval
                </h3>
                <p className="text-sm text-yellow-800">
                  Your hotel account is currently pending admin approval. You will be able to access all features once your account is approved.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  )
}
