import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, Clock, MapPin, X } from "lucide-react"
import { deliveryAPI } from "@/lib/api"

export default function NewOrderPopup({
  isOpen,
  order,
  restaurant,
  onAccept,
  onReject,
  onMinimize,
  isMinimized,
  countdownSeconds = 300
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [acceptButtonProgress, setAcceptButtonProgress] = useState(0)
  const [isAnimatingToComplete, setIsAnimatingToComplete] = useState(false)
  const popupRef = useRef(null)
  const acceptButtonRef = useRef(null)
  const touchStartY = useRef(0)
  const acceptTouchStartX = useRef(0)

  const orderData = order || restaurant

  // Calculate time away from distance
  const calculateTimeAway = (distance) => {
    if (!distance || distance === '0 km' || distance === 'Calculating...') return 'Calculating...'
    const km = parseFloat(distance.replace(' km', ''))
    const minutes = Math.round(km * 2) // Rough estimate: 2 minutes per km
    return `${minutes} mins`
  }

  // Handle popup drag
  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const deltaY = touchStartY.current - currentY
    setDragY(Math.max(0, deltaY))
  }

  const handleTouchEnd = () => {
    if (dragY > 100) {
      onMinimize()
    }
    setIsDragging(false)
    setDragY(0)
    touchStartY.current = 0
  }

  // Handle accept button swipe
  const handleAcceptTouchStart = (e) => {
    acceptTouchStartX.current = e.touches[0].clientX
  }

  const handleAcceptTouchMove = (e) => {
    if (!acceptButtonRef.current) return
    const currentX = e.touches[0].clientX
    const deltaX = currentX - acceptTouchStartX.current
    const buttonWidth = acceptButtonRef.current.offsetWidth
    const progress = Math.min(1, Math.max(0, deltaX / (buttonWidth - 56 - 32)))
    setAcceptButtonProgress(progress)

    if (progress >= 0.95) {
      setIsAnimatingToComplete(true)
      setTimeout(() => {
        onAccept()
      }, 300)
    }
  }

  const handleAcceptTouchEnd = () => {
    if (acceptButtonProgress < 0.95) {
      setAcceptButtonProgress(0)
    }
    acceptTouchStartX.current = 0
  }

  // Calculate earnings
  const getEarnings = () => {
    const earnings = orderData?.estimatedEarnings || 0
    let value = 0

    if (earnings) {
      if (typeof earnings === 'object') {
        if (earnings.basePayout != null) {
          value = Number(earnings.basePayout) || 0
        } else if (earnings.totalEarning != null) {
          value = Number(earnings.totalEarning) || 0
        }
      } else if (typeof earnings === 'number') {
        value = earnings > 0 ? Number(earnings) : 0
      }
    }

    return value > 0 ? value.toFixed(2) : '0.00'
  }

  if (!isOpen || !orderData) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          {!isMinimized && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-[100]"
            />
          )}

          {/* Minimized Handle */}
          {isMinimized && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed bottom-0 left-0 right-0 z-[115] flex justify-center pb-2"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ touchAction: 'none' }}
            >
              <div className="bg-green-500 rounded-t-2xl px-6 py-3 shadow-lg cursor-grab active:cursor-grabbing">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-1 bg-white/80 rounded-full" />
                  <span className="text-white text-sm font-semibold">Swipe up to view order</span>
                  <div className="w-8 h-1 bg-white/80 rounded-full" />
                </div>
              </div>
            </motion.div>
          )}

          {/* Popup */}
          <motion.div
            ref={popupRef}
            initial={{ y: "100%" }}
            animate={{
              y: isDragging
                ? dragY
                : isMinimized
                  ? (popupRef.current?.offsetHeight || 600)
                  : 0
            }}
            transition={isDragging
              ? { duration: 0 }
              : isMinimized
                ? { duration: 0.3, ease: "easeOut" }
                : {
                  type: "spring",
                  damping: 30,
                  stiffness: 300
                }
            }
            exit={{ y: "100%" }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="fixed bottom-0 left-0 right-0 bg-transparent rounded-t-3xl z-[110] overflow-visible"
            style={{ touchAction: 'none' }}
          >
            {/* Swipe Handle */}
            <div className="flex justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 bg-white/30 rounded-full" />
            </div>

            {/* Green Countdown Header */}
            <div className="relative scale-110 mb-0 bg-green-500 rounded-t-3xl overflow-visible">
              {/* Countdown Badge */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-5 z-20">
                <div className="relative inline-flex items-center justify-center">
                  {/* Animated border */}
                  <svg
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{
                      width: 'calc(100% + 10px)',
                      height: 'calc(100% + 10px)',
                      zIndex: 35
                    }}
                    viewBox="0 0 200 60"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <defs>
                      <linearGradient id="newOrderCountdownGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="1" />
                        <stop offset="100%" stopColor="#16a34a" stopOpacity="1" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 30,5 L 170,5 A 25,25 0 0,1 195,30 L 195,30 A 25,25 0 0,1 170,55 L 30,55 A 25,25 0 0,1 5,30 L 5,30 A 25,25 0 0,1 30,5 Z"
                      fill="none"
                      stroke="white"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <motion.path
                      d="M 100,5 L 170,5 A 25,25 0 0,1 195,30 L 195,30 A 25,25 0 0,1 170,55 L 30,55 A 25,25 0 0,1 5,30 L 5,30 A 25,25 0 0,1 30,5 L 100,5"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="450"
                      initial={{ strokeDashoffset: 0 }}
                      animate={{
                        strokeDashoffset: `${450 * (1 - countdownSeconds / 300)}`
                      }}
                      transition={{ duration: 1, ease: "linear" }}
                    />
                    <rect
                      x="95"
                      y="0"
                      width="10"
                      height="8"
                      fill="white"
                      rx="1"
                    />
                  </svg>
                  <div className="relative bg-white rounded-full px-6 py-2 shadow-lg" style={{ zIndex: 30 }}>
                    <div className="text-sm font-bold text-gray-900">
                      New order
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* White Content Card */}
            <div className="bg-white rounded-t-3xl">
              <div className="p-6">
                {/* Estimated Earnings */}
                <div className="mb-5">
                  <p className="text-gray-500 text-sm mb-1">Estimated earnings</p>
                  <p className="text-4xl font-bold text-gray-900 mb-2">
                    ₹{getEarnings()}
                  </p>
                  {/* Earnings Breakdown */}
                  {orderData?.estimatedEarnings && typeof orderData.estimatedEarnings === 'object' && orderData.estimatedEarnings.breakdown && (
                    <div className="bg-green-50 rounded-lg p-3 mb-2">
                      <p className="text-green-800 text-xs font-medium mb-1">Earnings Breakdown:</p>
                      <p className="text-green-700 text-xs">
                        Base payout (Admin): ₹{orderData.estimatedEarnings.basePayout?.toFixed(0) || '0'}
                        {orderData.estimatedEarnings.distanceCommission > 0 && (
                          <> + Distance ({orderData.estimatedEarnings.distance?.toFixed(1)} km × ₹{orderData.estimatedEarnings.commissionPerKm?.toFixed(0)}/km) = ₹{orderData.estimatedEarnings.distanceCommission?.toFixed(0)}</>
                        )}
                      </p>
                    </div>
                  )}
                  <p className="text-gray-400 text-xs">
                    Pickup: {orderData?.pickupDistance || orderData?.pickupDistance || '0 km'} | Drop: {orderData?.deliveryDistance || orderData?.dropDistance || '0 km'}
                  </p>
                </div>

                {/* Order ID */}
                <div className="mb-4">
                  <p className="text-gray-500 text-xs mb-1">Order ID</p>
                  <p className="text-base font-semibold text-gray-900">
                    {orderData?.orderId || 'ORD1234567890'}
                  </p>
                </div>

                {/* Pickup Details */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <div className="mb-3">
                    <span className="bg-gray-200 text-gray-700 text-xs font-medium px-2 py-1 rounded-lg">
                      Pick up
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    {orderData?.restaurantName || orderData?.name || 'Restaurant'}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3 leading-relaxed">
                    {orderData?.restaurantLocation?.address || orderData?.address || 'Address'}
                  </p>

                  <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-2">
                    <Clock className="w-4 h-4" />
                    <span>
                      {orderData?.timeAway && orderData.timeAway !== 'Calculating...'
                        ? `${orderData.timeAway} away`
                        : (orderData?.pickupDistance && orderData.pickupDistance !== '0 km' && orderData.pickupDistance !== 'Calculating...'
                          ? `${calculateTimeAway(orderData.pickupDistance)} away`
                          : 'Calculating...')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-gray-500 text-sm">
                    <MapPin className="w-4 h-4" />
                    <span>
                      {orderData?.distance && orderData.distance !== '0 km' && orderData.distance !== 'Calculating...'
                        ? `${orderData.distance} away`
                        : (orderData?.pickupDistance && orderData.pickupDistance !== '0 km' && orderData.pickupDistance !== 'Calculating...'
                          ? `${orderData.pickupDistance} away`
                          : 'Calculating...')}
                    </span>
                  </div>
                </div>

                {/* Accept Order Button with Swipe */}
                <div className="relative w-full">
                  <motion.div
                    ref={acceptButtonRef}
                    className="relative w-full bg-green-600 rounded-full overflow-hidden shadow-xl"
                    style={{ touchAction: 'pan-x' }}
                    onTouchStart={handleAcceptTouchStart}
                    onTouchMove={handleAcceptTouchMove}
                    onTouchEnd={handleAcceptTouchEnd}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Swipe progress background */}
                    <motion.div
                      className="absolute inset-0 bg-green-500 rounded-full"
                      animate={{
                        width: `${acceptButtonProgress * 100}%`
                      }}
                      transition={isAnimatingToComplete ? {
                        type: "spring",
                        stiffness: 200,
                        damping: 25
                      } : { duration: 0 }}
                    />

                    {/* Button content container */}
                    <div className="relative flex items-center h-[64px] px-1">
                      {/* Left: Black circle with arrow */}
                      <motion.div
                        className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                        animate={{
                          x: acceptButtonProgress * (acceptButtonRef.current ? (acceptButtonRef.current.offsetWidth - 56 - 32) : 240)
                        }}
                        transition={isAnimatingToComplete ? {
                          type: "spring",
                          stiffness: 300,
                          damping: 30
                        } : { duration: 0 }}
                      >
                        <ArrowRight className="w-5 h-5 text-white" />
                      </motion.div>

                      {/* Text - centered and stays visible */}
                      <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
                        <motion.span
                          className="text-white font-semibold flex items-center justify-center text-center text-base select-none"
                          animate={{
                            opacity: acceptButtonProgress > 0.5 ? Math.max(0.2, 1 - acceptButtonProgress * 0.8) : 1,
                            x: acceptButtonProgress > 0.5 ? acceptButtonProgress * 15 : 0
                          }}
                          transition={isAnimatingToComplete ? {
                            type: "spring",
                            stiffness: 200,
                            damping: 25
                          } : { duration: 0 }}
                        >
                          {acceptButtonProgress > 0.5 ? 'Release to Accept' : 'Accept order'}
                        </motion.span>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Reject Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="fixed top-4 right-4 z-[115]"
          >
            <button
              onClick={onReject}
              className="bg-black border-2 border-white text-white text-bold px-5 p-2 rounded-full font-semibold text-sm hover:bg-red-50 transition-colors shadow-2xl"
            >
              Deny
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
