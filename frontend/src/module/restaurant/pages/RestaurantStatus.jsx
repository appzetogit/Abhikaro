import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import Lenis from "lenis"
import { ArrowLeft, Settings, Clock } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { restaurantAPI } from "@/lib/api"
import { useRestaurantNotifications } from "../hooks/useRestaurantNotifications"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function RestaurantStatus() {
  // Initialize socket connection for real-time notifications and status updates
  useRestaurantNotifications()
  const navigate = useNavigate()
  const [deliveryStatus, setDeliveryStatus] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deliveryStatusLoaded, setDeliveryStatusLoaded] = useState(false)
  const [suppressSwitchAnimation, setSuppressSwitchAnimation] = useState(true)
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [isWithinTimings, setIsWithinTimings] = useState(null) // null = not calculated yet
  const [showOutletClosedDialog, setShowOutletClosedDialog] = useState(false)
  const [showOutsideTimingsDialog, setShowOutsideTimingsDialog] = useState(false)
  const [isDayClosed, setIsDayClosed] = useState(false)
  const [outletTimings, setOutletTimings] = useState(null)
  // Tracks the timestamp of the last MANUAL toggle by the owner.
  // Used to prevent incoming socket/polling events from overriding a fresh manual change.
  const lastManualChangeTimeRef = useRef(0)

  // Auto On/Off schedule state
  const [isAutoOnOff, setIsAutoOnOff] = useState(false)
  const [openHour, setOpenHour] = useState("04")
  const [openMin, setOpenMin] = useState("00")
  const [openAmpm, setOpenAmpm] = useState("AM")
  const [closeHour, setCloseHour] = useState("08")
  const [closeMin, setCloseMin] = useState("00")
  const [closeAmpm, setCloseAmpm] = useState("PM")
  const [savingTimings, setSavingTimings] = useState(false)

  // 12-hour / 24-hour helpers
  const convertTo24Hour = (hour, minute, ampm) => {
    let h = parseInt(hour, 10)
    if (ampm === "PM" && h < 12) h += 12
    if (ampm === "AM" && h === 12) h = 0
    return `${h.toString().padStart(2, "0")}:${minute.padStart(2, "0")}`
  }

  const convertFrom24Hour = (time24) => {
    if (!time24) return { hour: "04", minute: "00", ampm: "AM" }
    const [hStr, mStr] = time24.split(":")
    let h = parseInt(hStr, 10)
    const ampm = h >= 12 ? "PM" : "AM"
    h = h % 12 || 12
    return {
      hour: h.toString().padStart(2, "0"),
      minute: mStr || "00",
      ampm
    }
  }

  // Load schedule timings when restaurantData is fetched
  useEffect(() => {
    if (restaurantData?.deliveryTimings) {
      const timings = restaurantData.deliveryTimings
      setIsAutoOnOff(!!timings.isAutoOnOffEnabled)
      
      if (timings.openingTime) {
        const { hour, minute, ampm } = convertFrom24Hour(timings.openingTime)
        setOpenHour(hour)
        setOpenMin(minute)
        setOpenAmpm(ampm)
      }
      if (timings.closingTime) {
        const { hour, minute, ampm } = convertFrom24Hour(timings.closingTime)
        setCloseHour(hour)
        setCloseMin(minute)
        setCloseAmpm(ampm)
      }
    }
  }, [restaurantData])

  // Save timings helper
  const handleSaveTimings = async (autoOnOffVal = isAutoOnOff, oH = openHour, oM = openMin, oA = openAmpm, cH = closeHour, cM = closeMin, cA = closeAmpm) => {
    setSavingTimings(true)
    const openingTime24 = convertTo24Hour(oH, oM, oA)
    const closingTime24 = convertTo24Hour(cH, cM, cA)

    try {
      const response = await restaurantAPI.updateProfile({
        deliveryTimings: {
          openingTime: openingTime24,
          closingTime: closingTime24,
          isAutoOnOffEnabled: autoOnOffVal
        }
      })
      
      const updatedRest = response?.data?.data?.restaurant || response?.data?.restaurant
      if (updatedRest) {
        setRestaurantData(updatedRest)
        // Also update local storage timings to keep it in sync
        const currentTimings = localStorage.getItem("restaurant_outlet_timings")
        if (currentTimings) {
          try {
            const parsed = JSON.parse(currentTimings)
            // Update every open day with the new timings
            Object.keys(parsed).forEach(day => {
              if (parsed[day].isOpen) {
                parsed[day].openingTime = openingTime24
                parsed[day].closingTime = closingTime24
              }
            })
            localStorage.setItem("restaurant_outlet_timings", JSON.stringify(parsed))
            window.dispatchEvent(new CustomEvent("outletTimingsUpdated"))
          } catch (e) {
            console.error("Error updating local timings:", e)
          }
        }
      }
    } catch (error) {
      console.error("Error updating timings:", error)
    } finally {
      setSavingTimings(false)
    }
  }

  const handleAutoOnOffToggle = async (checked) => {
    setIsAutoOnOff(checked)
    await handleSaveTimings(checked)
  }

  // Update current date/time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDateTime(new Date())
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  // Fetch restaurant data from backend
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) {
          setRestaurantData(data)
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          console.error("Error fetching restaurant data:", error)
        }
        // Continue with default values if fetch fails
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantData()
  }, [])

  // Load outlet timings from localStorage
  useEffect(() => {
    const loadOutletTimings = () => {
      try {
        const saved = localStorage.getItem("restaurant_outlet_timings")
        if (saved) {
          const data = JSON.parse(saved)
          setOutletTimings(data)
        }
      } catch (error) {
        console.error("Error loading outlet timings:", error)
      }
    }

    loadOutletTimings()

    // Listen for outlet timings updates
    window.addEventListener("outletTimingsUpdated", loadOutletTimings)
    
    return () => {
      window.removeEventListener("outletTimingsUpdated", loadOutletTimings)
    }
  }, [])

  // Check if restaurant is currently open based on timings
  useEffect(() => {
    if (!restaurantData) return

    const checkIfOpen = () => {
      const now = new Date()
      const currentDayFull = now.toLocaleDateString('en-US', { weekday: 'long' }) // "Monday", "Tuesday", etc.
      const currentDay = now.toLocaleDateString('en-US', { weekday: 'short' }) // "Mon", "Tue", etc.
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const currentTimeInMinutes = currentHour * 60 + currentMinute

      // First check outlet timings from localStorage (OutletTimings.jsx stores it there)
      const STORAGE_KEY = "restaurant_outlet_timings"
      let outletTimingsData = null
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          outletTimingsData = JSON.parse(saved)
          setOutletTimings(outletTimingsData)
        }
      } catch (error) {
        console.error("Error loading outlet timings:", error)
      }

      // Check if current day is closed in outlet timings (for display only, not for blocking)
      if (outletTimingsData && outletTimingsData[currentDayFull]) {
        const dayData = outletTimingsData[currentDayFull]
        if (dayData.isOpen === false) {
          // Day is closed in outlet timings (for info only, don't block manual control)
          setIsDayClosed(true)
          setIsWithinTimings(false)
          // Don't automatically show dialog - let owner control manually
          return
        }
        
        // Check time range if day is open and has timings
        if (dayData.isOpen && dayData.openingTime && dayData.closingTime) {
          // Parse opening and closing times (format: "HH:mm")
          const [openHour, openMinute] = dayData.openingTime.split(':').map(Number)
          const [closeHour, closeMinute] = dayData.closingTime.split(':').map(Number)
          
          const openingTimeInMinutes = openHour * 60 + openMinute
          const closingTimeInMinutes = closeHour * 60 + closeMinute

          // Handle case where closing time is next day (e.g., 22:00 to 02:00)
          let isWithin = false
          if (closingTimeInMinutes > openingTimeInMinutes) {
            // Normal case: same day
            isWithin = currentTimeInMinutes >= openingTimeInMinutes && currentTimeInMinutes <= closingTimeInMinutes
          } else {
            // Overnight case: closing time is next day
            isWithin = currentTimeInMinutes >= openingTimeInMinutes || currentTimeInMinutes <= closingTimeInMinutes
          }

          setIsWithinTimings(isWithin)
          setIsDayClosed(false)
          return
        }
      }

      setIsDayClosed(false)

      // Check if current day is in openDays (from backend)
      const openDays = restaurantData.openDays || []
      const isDayOpen = openDays.some(day => {
        const dayAbbr = day.substring(0, 3) // "Mon", "Tue", etc.
        return dayAbbr === currentDay
      })

      if (!isDayOpen) {
        setIsWithinTimings(false)
        return
      }

      // Check if current time is within delivery timings
      const deliveryTimings = restaurantData.deliveryTimings
      if (!deliveryTimings || !deliveryTimings.openingTime || !deliveryTimings.closingTime) {
        setIsWithinTimings(true) // Default to open if no timings set
        return
      }

      // Parse opening and closing times (format: "HH:mm")
      const [openHour, openMinute] = deliveryTimings.openingTime.split(':').map(Number)
      const [closeHour, closeMinute] = deliveryTimings.closingTime.split(':').map(Number)
      
      const openingTimeInMinutes = openHour * 60 + openMinute
      const closingTimeInMinutes = closeHour * 60 + closeMinute

      // Handle case where closing time is next day (e.g., 22:00 to 02:00)
      let isWithin = false
      if (closingTimeInMinutes > openingTimeInMinutes) {
        // Normal case: same day
        isWithin = currentTimeInMinutes >= openingTimeInMinutes && currentTimeInMinutes <= closingTimeInMinutes
      } else {
        // Overnight case: closing time is next day
        isWithin = currentTimeInMinutes >= openingTimeInMinutes || currentTimeInMinutes <= closingTimeInMinutes
      }

      setIsWithinTimings(isWithin)
    }

    checkIfOpen()
    // Recheck every minute
    const interval = setInterval(checkIfOpen, 60000)
    
    // Listen for outlet timings updates
    const handleOutletTimingsUpdate = () => {
      checkIfOpen()
    }
    window.addEventListener("outletTimingsUpdated", handleOutletTimingsUpdate)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener("outletTimingsUpdated", handleOutletTimingsUpdate)
    }
  }, [restaurantData, currentDateTime])

  // Note: Delivery status is now manually controlled by user via toggle
  // We don't automatically set it based on timings anymore
  // The isWithinTimings is only used to show warning messages

  // Load delivery status from backend and sync with localStorage
  useEffect(() => {
    const loadDeliveryStatus = async () => {
      try {
        // First try to get from backend
        const response = await restaurantAPI.getCurrentRestaurant()
        const restaurant = response?.data?.data?.restaurant || response?.data?.restaurant
        if (restaurant?.isAcceptingOrders !== undefined) {
          setDeliveryStatus(restaurant.isAcceptingOrders)
          // Sync localStorage with backend
          localStorage.setItem('restaurant_online_status', JSON.stringify(restaurant.isAcceptingOrders))
          // Dispatch event to update navbar
          window.dispatchEvent(new CustomEvent('restaurantStatusChanged', { 
            detail: { isOnline: restaurant.isAcceptingOrders } 
          }))
        } else {
          // Fallback to localStorage
          const savedStatus = localStorage.getItem('restaurant_online_status')
          if (savedStatus !== null) {
            const status = JSON.parse(savedStatus)
            setDeliveryStatus(status)
            // Dispatch event to update navbar
            window.dispatchEvent(new CustomEvent('restaurantStatusChanged', { 
              detail: { isOnline: status } 
            }))
          } else {
            // Default to false if not set
            setDeliveryStatus(false)
            // Dispatch event to update navbar
            window.dispatchEvent(new CustomEvent('restaurantStatusChanged', { 
              detail: { isOnline: false } 
            }))
          }
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          console.error("Error loading delivery status:", error)
        }
        // Fallback to localStorage
        try {
          const savedStatus = localStorage.getItem('restaurant_online_status')
          if (savedStatus !== null) {
            const status = JSON.parse(savedStatus)
            setDeliveryStatus(status)
            window.dispatchEvent(new CustomEvent('restaurantStatusChanged', { 
              detail: { isOnline: status } 
            }))
          } else {
            setDeliveryStatus(false)
            window.dispatchEvent(new CustomEvent('restaurantStatusChanged', { 
              detail: { isOnline: false } 
            }))
          }
        } catch (localError) {
          setDeliveryStatus(false)
          window.dispatchEvent(new CustomEvent('restaurantStatusChanged', { 
            detail: { isOnline: false } 
          }))
        }
      } finally {
        setDeliveryStatusLoaded(true)
        // Allow animations after initial state is stable (prevents flicker on mount)
        setTimeout(() => setSuppressSwitchAnimation(false), 150)
      }
    }

    loadDeliveryStatus()
  }, [])

  // Listen for real-time restaurant status changes (e.g., from other devices or auto-schedule).
  // Ignore events that arrive within 10 seconds of a manual owner toggle — prevents flicker
  // caused by the backend cron briefly overriding manual changes.
  useEffect(() => {
    const MANUAL_CHANGE_IGNORE_MS = 10000 // 10 seconds
    const handleStatusChange = (event) => {
      if (event.detail && typeof event.detail.isOnline === "boolean") {
        // If a manual toggle happened within the cooldown window, ignore incoming events
        const msSinceManualChange = Date.now() - lastManualChangeTimeRef.current
        if (msSinceManualChange < MANUAL_CHANGE_IGNORE_MS) {
          console.log('[Status] Ignoring incoming status event — within manual change cooldown:', msSinceManualChange, 'ms')
          return
        }
        setSuppressSwitchAnimation(true)
        setDeliveryStatus(event.detail.isOnline)
        setTimeout(() => setSuppressSwitchAnimation(false), 200)
      }
    }

    window.addEventListener("restaurantStatusChanged", handleStatusChange)
    return () => {
      window.removeEventListener("restaurantStatusChanged", handleStatusChange)
    }
  }, [])


  // Handle delivery status change - FULL MANUAL CONTROL (no automatic restrictions)
  const handleDeliveryStatusChange = async (checked) => {
    // Restaurant owner has full manual control - no automatic restrictions
    // They can turn delivery ON/OFF anytime regardless of timings
    
    // Stamp the time of this manual change immediately.
    // The event listener above will ignore any incoming socket/polling events
    // for the next 10 seconds to prevent the switch from flickering back.
    const now = Date.now()
    lastManualChangeTimeRef.current = now
    // Also persist to localStorage so RestaurantSocketContext can read the same cooldown
    localStorage.setItem('restaurant_manual_change_time', String(now))

    setDeliveryStatus(checked)
    try {
      // Save to localStorage
      localStorage.setItem('restaurant_online_status', JSON.stringify(checked))
      
      // Update backend
      try {
        await restaurantAPI.updateDeliveryStatus(checked)
        console.log('✅ Delivery status updated in backend:', checked)
      } catch (apiError) {
        console.error('Error updating delivery status in backend:', apiError)
        // Still continue with local update even if backend fails
      }
      
      // Dispatch custom event for navbar to listen
      window.dispatchEvent(new CustomEvent('restaurantStatusChanged', { 
        detail: { isOnline: checked } 
      }))
    } catch (error) {
      console.error("Error saving delivery status:", error)
    }
  }

  // Handle dialog close and navigate to outlet timings
  const handleGoToOutletTimings = () => {
    setShowOutletClosedDialog(false)
    navigate("/restaurant/outlet-info")
  }

  // Format time from 24-hour to 12-hour format
  const formatTime12Hour = (time24) => {
    if (!time24) return ""
    const [hours, minutes] = time24.split(':').map(Number)
    const period = hours >= 12 ? 'pm' : 'am'
    const hours12 = hours % 12 || 12
    const minutesStr = minutes.toString().padStart(2, '0')
    return `${hours12}:${minutesStr} ${period}`
  }

  // Format current date and time
  const formatCurrentDateTime = () => {
    const now = currentDateTime
    const dateStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    const timeStr = now.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
    return `${dateStr}, ${timeStr}`
  }

  // Get delivery timings for current day (from outlet timings first, then backend)
  const getCurrentDayTimings = () => {
    const now = new Date()
    const currentDayFull = now.toLocaleDateString('en-US', { weekday: 'long' }) // "Monday", "Tuesday", etc.
    
    // First try to get from outlet timings (localStorage)
    if (outletTimings && outletTimings[currentDayFull]) {
      const dayData = outletTimings[currentDayFull]
      if (dayData.isOpen && dayData.openingTime && dayData.closingTime) {
        return {
          openingTime: formatTime12Hour(dayData.openingTime),
          closingTime: formatTime12Hour(dayData.closingTime)
        }
      }
    }
    
    // Fallback to backend delivery timings
    if (restaurantData?.deliveryTimings) {
      const openingTime = formatTime12Hour(restaurantData.deliveryTimings.openingTime)
      const closingTime = formatTime12Hour(restaurantData.deliveryTimings.closingTime)
      return { openingTime, closingTime }
    }
    
    return null
  }

  // Format address
  const formatAddress = (location) => {
    if (!location) return ""
    const parts = []
    if (location.area) parts.push(location.area.trim())
    if (location.city) parts.push(location.city.trim())
    return parts.join(", ") || ""
  }

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Restaurant status</h1>
            <p className="text-sm text-gray-500 mt-0.5">You are mapped to 1 restaurant</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {/* Restaurant Information Card */}
        <Card className="bg-gray-50 border-none py-0 shadow-sm rounded-b-none rounded-t-lg">
          <CardContent className="p-4 gap-6 flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-gray-900 mb-1">
                  {loading ? "Loading..." : (restaurantData?.name || "Restaurant")}
                </h2>
                <p className="text-sm text-gray-500">
                  {loading ? "Loading..." : (
                    <>
                      {restaurantData?.id ? `ID: ${String(restaurantData.id).slice(-5)}` : ""}
                      {restaurantData?.location && formatAddress(restaurantData.location) ? (
                        <> | {formatAddress(restaurantData.location)}</>
                      ) : ""}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-base font-bold text-gray-900 mb-1.5">Restaurant On/Off</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${deliveryStatus ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                <p className="text-sm text-gray-500">
                  {deliveryStatus ? 'Receiving orders' : 'Not receiving orders'}
                </p>
              </div>
            </div>
            <Switch
              checked={deliveryStatus}
              onCheckedChange={handleDeliveryStatusChange}
              disabled={!deliveryStatusLoaded}
              className={[
                "ml-4 data-[state=unchecked]:bg-gray-300 data-[state=checked]:bg-green-600",
                suppressSwitchAnimation ? "transition-none [&_[data-slot=switch-thumb]]:transition-none" : "",
              ].join(" ")}
            />
          </div>

          <p className="text-sm text-gray-700 mb-2">Current delivery slot</p>
          <div>
            <p className="text-base font-bold text-gray-900">
              {loading ? "Loading..." : (
                (() => {
                  // If current day is closed, show "Today is Off"
                  if (isDayClosed) {
                    return "Today is Off"
                  }
                  const timings = getCurrentDayTimings()
                  if (timings) {
                    const dateStr = currentDateTime.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                    return `${dateStr}, ${timings.openingTime} - ${timings.closingTime}`
                  }
                  return "Not configured"
                })()
              )}
            </p>
          </div>

          

          </CardContent>
        </Card>


      {/* Auto On/Off Timings Scheduler Card */}
      <Card className="mt-4 bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden">
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="text-base font-bold text-gray-900">Auto On/Off Schedule</h3>
                <p className="text-xs text-gray-500 mt-0.5">Automatically open and close restaurant</p>
              </div>
            </div>
            <Switch
              checked={isAutoOnOff}
              onCheckedChange={handleAutoOnOffToggle}
              className="data-[state=unchecked]:bg-gray-300 data-[state=checked]:bg-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Opening Time Selector */}
            <div className="flex flex-col gap-2 bg-gray-50/50 p-3 rounded-lg border border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Opening Time (e.g. 4 AM)</span>
              <div className="flex items-center gap-1.5 mt-1">
                {/* Hour dropdown */}
                <select
                  value={openHour}
                  onChange={(e) => {
                    setOpenHour(e.target.value)
                    handleSaveTimings(isAutoOnOff, e.target.value, openMin, openAmpm, closeHour, closeMin, closeAmpm)
                  }}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => (i + 1).toString()).map(h => (
                    <option key={h} value={h.padStart(2, "0")}>{h}</option>
                  ))}
                </select>
                <span className="text-gray-400 font-bold">:</span>
                {/* Minute dropdown */}
                <select
                  value={openMin}
                  onChange={(e) => {
                    setOpenMin(e.target.value)
                    handleSaveTimings(isAutoOnOff, openHour, e.target.value, openAmpm, closeHour, closeMin, closeAmpm)
                  }}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                >
                  {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {/* AM/PM selector */}
                <select
                  value={openAmpm}
                  onChange={(e) => {
                    setOpenAmpm(e.target.value)
                    handleSaveTimings(isAutoOnOff, openHour, openMin, e.target.value, closeHour, closeMin, closeAmpm)
                  }}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            {/* Closing Time Selector */}
            <div className="flex flex-col gap-2 bg-gray-50/50 p-3 rounded-lg border border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Closing Time (e.g. 8 PM)</span>
              <div className="flex items-center gap-1.5 mt-1">
                {/* Hour dropdown */}
                <select
                  value={closeHour}
                  onChange={(e) => {
                    setCloseHour(e.target.value)
                    handleSaveTimings(isAutoOnOff, openHour, openMin, openAmpm, e.target.value, closeMin, closeAmpm)
                  }}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => (i + 1).toString()).map(h => (
                    <option key={h} value={h.padStart(2, "0")}>{h}</option>
                  ))}
                </select>
                <span className="text-gray-400 font-bold">:</span>
                {/* Minute dropdown */}
                <select
                  value={closeMin}
                  onChange={(e) => {
                    setCloseMin(e.target.value)
                    handleSaveTimings(isAutoOnOff, openHour, openMin, openAmpm, closeHour, e.target.value, closeAmpm)
                  }}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                >
                  {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {/* AM/PM selector */}
                <select
                  value={closeAmpm}
                  onChange={(e) => {
                    setCloseAmpm(e.target.value)
                    handleSaveTimings(isAutoOnOff, openHour, openMin, openAmpm, closeHour, closeMin, e.target.value)
                  }}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>
          
          {savingTimings && (
            <p className="text-xs text-blue-600 font-semibold animate-pulse text-right">Saving changes...</p>
          )}
        </CardContent>
      </Card>

      {/* Outlet Closed Dialog */}
      <Dialog open={showOutletClosedDialog} onOpenChange={setShowOutletClosedDialog}>
        <DialogContent className="sm:max-w-md p-4 w-[90%] gap-2 flex flex-col">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
              <span className="text-3xl">⚠️</span>
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900 text-center">
              Outlet Timings Closed
            </DialogTitle>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => setShowOutletClosedDialog(false)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGoToOutletTimings}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
            >
              Go to Outlet Timings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outside Timings Dialog */}
      <Dialog open={showOutsideTimingsDialog} onOpenChange={setShowOutsideTimingsDialog}>
        <DialogContent className="sm:max-w-md p-4 w-[90%] gap-2 flex flex-col">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
              <span className="text-3xl">⚠️</span>
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900 text-center">
              Outside Delivery Timings
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-gray-600">
              You are currently outside your scheduled delivery timings. Please change outlet timings to enable delivery status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => setShowOutsideTimingsDialog(false)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowOutsideTimingsDialog(false)
                navigate("/restaurant/outlet-info")
              }}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
            >
              View Outlet Info
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      </div>
    </div>
  )
}
