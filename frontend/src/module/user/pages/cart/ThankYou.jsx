import React, { useEffect, useState, useMemo } from "react"
import { useNavigate, useLocation, useSearchParams } from "react-router-dom"
import { preloadGoogleMaps } from "@/utils/mapsPreload"
import { useProfile } from "../../context/ProfileContext"
import { useOrders } from "../../context/OrdersContext"
import { useSharedLocation } from "@/lib/context/LocationContext"
import { orderAPI } from "@/lib/api"

const isPlaceholder = (str) => {
  if (!str) return true
  const s = String(str).toLowerCase().trim()
  return s === "select location" || s === "updating location..." || s === "detecting..."
}

const formatFullAddress = (address) => {
  if (!address) return ""
  if (address.formattedAddress && !isPlaceholder(address.formattedAddress)) {
    return address.formattedAddress
  }
  const addressParts = []
  if (address.street && !isPlaceholder(address.street)) addressParts.push(address.street)
  if (address.additionalDetails && !isPlaceholder(address.additionalDetails)) addressParts.push(address.additionalDetails)
  if (address.city && !isPlaceholder(address.city)) addressParts.push(address.city)
  if (address.state && !isPlaceholder(address.state)) addressParts.push(address.state)
  if (address.zipCode && !isPlaceholder(address.zipCode)) addressParts.push(address.zipCode)

  if (addressParts.length > 0) {
    return addressParts.join(', ')
  }
  return address.address || ""
}

export default function ThankYou() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { getDefaultAddress, addresses } = useProfile()
  const { getOrderById } = useOrders()
  const { location: sharedLocation } = useSharedLocation()

  const orderIdFromUrl = searchParams.get("orderId") || ""
  const orderIdFromState = location.state?.orderId || ""
  const orderId = orderIdFromUrl || orderIdFromState

  const [addressData, setAddressData] = useState(() => location.state?.address || null)
  const [orderDetails, setOrderDetails] = useState(null)

  // Warm up Google Maps as soon as thank you page mounts
  useEffect(() => {
    try {
      preloadGoogleMaps(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
    } catch {}
  }, [])

  // Lock body scroll and scroll to top on mount
  useEffect(() => {
    document.body.style.overflow = "hidden"
    document.body.style.position = "fixed"
    document.body.style.width = "100%"
    window.scrollTo({ top: 0, behavior: "instant" })

    return () => {
      document.body.style.overflow = ""
      document.body.style.position = ""
      document.body.style.width = ""
    }
  }, [])

  // Fetch order details if address wasn't passed in state
  useEffect(() => {
    if (addressData) return
    if (!orderId) return

    let isMounted = true
    const localOrder = getOrderById(orderId)
    if (localOrder?.deliveryAddress || localOrder?.address) {
      setAddressData(localOrder.deliveryAddress || localOrder.address)
      setOrderDetails(localOrder)
      return
    }

    orderAPI.getOrderDetails(orderId)
      .then((res) => {
        if (!isMounted) return
        const order = res.data?.data?.order
        if (order) {
          setOrderDetails(order)
          if (order.deliveryAddress || order.address) {
            setAddressData(order.deliveryAddress || order.address)
          }
        }
      })
      .catch(() => {
        // Fallback gracefully
      })

    return () => {
      isMounted = false
    }
  }, [orderId, addressData, getOrderById])

  // Meta Pixel Purchase Tracking
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const pricing = location.state?.pricing
        const value = pricing?.finalAmount || pricing?.totalAmount || orderDetails?.totalAmount || 0
        if (value > 0) {
          if (window.fbq) {
            window.fbq("track", "Purchase", {
              value: value,
              currency: "INR"
            })
          }
          if (window.FB && window.FB.AppEvents) {
            window.FB.AppEvents.logEvent("Purchase", value, {
              fb_currency: "INR"
            })
          }
        }
      }
    } catch {
      // ignore tracking errors
    }
  }, [location.state?.pricing, orderDetails])

  // Determine delivery address display
  const effectiveAddress = useMemo(() => {
    if (addressData) return addressData
    const defaultAddr = getDefaultAddress() || addresses?.[0]
    if (defaultAddr) return defaultAddr
    if (sharedLocation?.address) {
      return {
        city: sharedLocation.city || "Your Location",
        formattedAddress: sharedLocation.address
      }
    }
    return null
  }, [addressData, getDefaultAddress, addresses, sharedLocation])

  const cityName = effectiveAddress?.city || sharedLocation?.city || "Your Location"
  const formattedAddressStr = effectiveAddress
    ? (formatFullAddress(effectiveAddress) || effectiveAddress?.formattedAddress || effectiveAddress?.address || "Delivery Address")
    : "Delivery Address"

  const handleGoToOrders = () => {
    try {
      preloadGoogleMaps(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
    } catch {}

    if (orderId) {
      navigate(`/user/orders/${orderId}?confirmed=true`)
    } else {
      navigate("/user/orders")
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-white flex flex-col items-center justify-center h-screen w-screen overflow-hidden"
      style={{ animation: "fadeIn 0.3s ease-out" }}
    >
      {/* Confetti Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="absolute w-3 h-3 rounded-sm"
            style={{
              left: `${Math.random() * 100}%`,
              top: `-10%`,
              backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][Math.floor(Math.random() * 6)],
              animation: `confettiFall ${2 + Math.random() * 2}s linear ${Math.random() * 2}s infinite`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          />
        ))}
      </div>

      {/* Success Content */}
      <div className="relative z-10 flex flex-col items-center px-6 max-w-lg w-full text-center">
        {/* Success Tick Circle */}
        <div
          className="relative mb-8"
          style={{ animation: "scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both" }}
        >
          {/* Outer ring animation */}
          <div
            className="absolute inset-0 w-32 h-32 rounded-full border-4 border-green-500"
            style={{
              animation: "ringPulse 1.5s ease-out infinite",
              opacity: 0.3
            }}
          />
          {/* Main circle */}
          <div className="w-32 h-32 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-2xl">
            <svg
              className="w-16 h-16 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: "checkDraw 0.5s ease-out 0.5s both" }}
            >
              <path d="M5 12l5 5L19 7" className="check-path" />
            </svg>
          </div>
          {/* Sparkles */}
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-yellow-400 rounded-full"
              style={{
                top: "50%",
                left: "50%",
                animation: `sparkle 0.6s ease-out ${0.3 + i * 0.1}s both`,
                transform: `rotate(${i * 60}deg) translateY(-80px)`,
              }}
            />
          ))}
        </div>

        {/* Location Info */}
        <div
          className="text-center w-full"
          style={{ animation: "slideUp 0.5s ease-out 0.6s both" }}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-5 h-5 text-red-500 flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              {cityName}
            </h2>
          </div>
          <p className="text-gray-500 text-base max-w-md mx-auto line-clamp-2">
            {formattedAddressStr}
          </p>
        </div>

        {/* Order Placed Message */}
        <div
          className="mt-12 text-center"
          style={{ animation: "slideUp 0.5s ease-out 0.8s both" }}
        >
          <h3 className="text-3xl font-bold text-green-600 mb-2">Order Placed!</h3>
          <p className="text-gray-600">Your delicious food is on its way</p>
        </div>

        {/* Action Button */}
        <button
          onClick={handleGoToOrders}
          className="mt-10 bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-12 rounded-xl shadow-lg transition-all hover:shadow-xl hover:scale-105 cursor-pointer"
          style={{ animation: "slideUp 0.5s ease-out 1s both" }}
        >
          Track Your Order
        </button>
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes scaleIn {
          from {
            transform: scale(0);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes checkDraw {
          0% {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
          }
          100% {
            stroke-dasharray: 100;
            stroke-dashoffset: 0;
          }
        }
        @keyframes ringPulse {
          0% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.3);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
        @keyframes sparkle {
          0% {
            transform: rotate(var(--rotation, 0deg)) translateY(0) scale(0);
            opacity: 1;
          }
          100% {
            transform: rotate(var(--rotation, 0deg)) translateY(-80px) scale(1);
            opacity: 0;
          }
        }
        @keyframes slideUp {
          from {
            transform: translateY(30px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes confettiFall {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
        .check-path {
          stroke-dasharray: 100;
          stroke-dashoffset: 0;
        }
      `}</style>
    </div>
  )
}
