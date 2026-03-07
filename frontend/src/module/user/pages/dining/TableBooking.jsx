import { useState, useMemo } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ChevronDown, Calendar, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import AnimatedPage from "../../components/AnimatedPage"
import { useEffect } from "react"
import { diningAPI, restaurantAPI } from "@/lib/api"
import Loader from "@/components/Loader"

export default function TableBooking() {
    const { slug } = useParams()
    const location = useLocation()
    const navigate = useNavigate()
    const [restaurant, setRestaurant] = useState(null)
    const [loading, setLoading] = useState(true)

    const [selectedGuests, setSelectedGuests] = useState(location.state?.guestCount || 2)
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [activeTimeOfDay, setActiveTimeOfDay] = useState("Lunch")
    const [selectedSlot, setSelectedSlot] = useState(null)

    useEffect(() => {
        const fetchRestaurant = async () => {
            if (!slug) return
            try {
                // Try fetch by ID/Slug using restaurantAPI which seems more robust in other components
                const response = await restaurantAPI.getRestaurantById(slug)
                if (response.data && response.data.success) {
                    const apiRestaurant = response.data.data
                    const actualRestaurant = apiRestaurant?.restaurant || apiRestaurant
                    setRestaurant(actualRestaurant)
                } else {
                    // Try diningAPI as backup
                    const diningResponse = await diningAPI.getRestaurantBySlug(slug)
                    if (diningResponse.data && diningResponse.data.success) {
                        const apiRestaurant = diningResponse.data.data
                        const actualRestaurant = apiRestaurant?.restaurant || apiRestaurant
                        setRestaurant(actualRestaurant)
                    } else {
                        throw new Error("Restaurant not found in direct lookups")
                    }
                }
            } catch (error) {
                console.error("Error fetching restaurant:", error)
                // FAILSAFE: Try to get list and find match
                try {
                    const listResp = await restaurantAPI.getRestaurants()
                    if (listResp.data?.data?.restaurants) {
                        const match = listResp.data.data.restaurants.find(r =>
                            r.slug === slug ||
                            r.name.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase()
                        )
                        if (match) {
                            const actualMatch = match?.restaurant || match
                            setRestaurant(actualMatch)
                        } else {
                            // Last resort: try dining restaurants list
                            const diningListResp = await diningAPI.getRestaurants()
                            if (diningListResp.data?.data) {
                                const dMatch = (diningListResp.data.data.restaurants || diningListResp.data.data).find(r =>
                                    r.slug === slug ||
                                    r.name.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase()
                                )
                                if (dMatch) {
                                    setRestaurant(dMatch?.restaurant || dMatch)
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("Failsafe search failed", e)
                }
            } finally {
                setLoading(false)
            }
        }
        fetchRestaurant()
    }, [slug])

    // Generate next 7 days
    const dates = useMemo(() => {
        const items = []
        for (let i = 0; i < 7; i++) {
            const date = new Date()
            date.setDate(date.getDate() + i)
            items.push(date)
        }
        return items
    }, [])

    const formatDate = (date) => {
        const today = new Date()
        const tomorrow = new Date()
        tomorrow.setDate(today.getDate() + 1)

        if (date.toDateString() === today.toDateString()) return "Today"
        if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow"

        return date.toLocaleDateString('en-GB', { weekday: 'short' })
    }

    const formatDayNum = (date) => {
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    }

    const slots = {
        Lunch: [
            { time: "12:00 PM", discount: "20% OFF" },
            { time: "12:30 PM", discount: "20% OFF" },
            { time: "1:00 PM", discount: "15% OFF" },
            { time: "1:30 PM", discount: "15% OFF" },
            { time: "2:00 PM", discount: "10% OFF" },
            { time: "2:30 PM", discount: "10% OFF" },
            { time: "3:00 PM", discount: "30% OFF" },
            { time: "3:30 PM", discount: "30% OFF" },
            { time: "3:45 PM", discount: "30% OFF" },
            { time: "4:00 PM", discount: "30% OFF" },
            { time: "4:15 PM", discount: "30% OFF" },
            { time: "4:30 PM", discount: "30% OFF" },
        ],
        Dinner: [
            { time: "7:00 PM", discount: "10% OFF" },
            { time: "7:30 PM", discount: "10% OFF" },
            { time: "8:00 PM", discount: "5% OFF" },
            { time: "8:30 PM", discount: "5% OFF" },
            { time: "9:00 PM", discount: "No OFF" },
            { time: "9:30 PM", discount: "No OFF" },
            { time: "10:00 PM", discount: "15% OFF" },
            { time: "10:30 PM", discount: "20% OFF" },
        ]
    }

    // Parse time strings like "10:30 PM" or "23:30" into minutes since midnight
    const parseTimeToMinutes = (timeStr) => {
        if (!timeStr || typeof timeStr !== "string") return null

        const trimmed = timeStr.trim()

        // 12-hour format with AM/PM
        const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
        if (ampmMatch) {
            let hours = parseInt(ampmMatch[1], 10)
            const minutes = parseInt(ampmMatch[2], 10)
            const period = ampmMatch[3].toUpperCase()

            if (period === "PM" && hours !== 12) hours += 12
            if (period === "AM" && hours === 12) hours = 0

            return hours * 60 + minutes
        }

        // 24-hour format "HH:mm"
        const twentyFourMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/)
        if (twentyFourMatch) {
            const hours = parseInt(twentyFourMatch[1], 10)
            const minutes = parseInt(twentyFourMatch[2], 10)
            if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
            return hours * 60 + minutes
        }

        return null
    }

    // Determine restaurant closing time in minutes (if available)
    const closingTimeStr =
        restaurant?.diningConfig?.basicDetails?.closingTime ||
        restaurant?.diningSettings?.closingTime ||
        restaurant?.deliveryTimings?.closingTime ||
        null

    const closingMinutes = closingTimeStr ? parseTimeToMinutes(closingTimeStr) : null

    const isSlotAfterClosing = (slotTime) => {
        if (closingMinutes == null) return false
        const slotMinutes = parseTimeToMinutes(slotTime)
        if (slotMinutes == null) return false
        return slotMinutes > closingMinutes
    }

    if (loading) return <Loader />
    if (!restaurant) return <div>Restaurant not found</div>

    // Max guests:
    // - Admin sets an upper limit (restaurant.diningSettings.maxGuests)
    // - Restaurant chooses seatingCapacity within that range in Dining Management
    // - For users, we show the restaurant's seatingCapacity but never above the admin limit
    const adminMaxGuests = restaurant.diningSettings?.maxGuests ?? null
    const restaurantCapacity = restaurant.diningConfig?.seatingCapacity ?? null
    let maxGuests = restaurantCapacity ?? adminMaxGuests ?? 10
    if (adminMaxGuests != null && maxGuests > adminMaxGuests) {
        maxGuests = adminMaxGuests
    }

    const handleProceed = () => {
        if (!selectedSlot) return
        if (isSlotAfterClosing(selectedSlot.time)) {
            // Guard: do not allow proceeding with a slot beyond closing time
            return
        }
        navigate("/dining/book-confirmation", {
            state: {
                restaurant,
                guests: selectedGuests,
                date: selectedDate,
                timeSlot: selectedSlot.time,
                discount: selectedSlot.discount
            }
        })
    }

    return (
        <AnimatedPage className="bg-slate-50 min-h-screen pb-24">
            {/* Header */}
            <div className="bg-white px-4 pt-4 pb-12 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#2B9C64]/5 rounded-full blur-3xl opacity-50 -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#2B9C64]/20 rounded-full blur-3xl opacity-30 -ml-16 -mb-16"></div>

                <div className="relative z-10">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 mb-4 bg-white shadow-sm rounded-full">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-gray-900">Book a table</h1>
                        <p className="text-gray-500 font-medium">{restaurant.name}</p>
                    </div>
                </div>
            </div>

            <div className="px-4 -mt-6 relative z-20 space-y-4">
                {/* Guest Selector */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-700">Select number of guests</span>
                    <div className="relative">
                        <select
                            value={selectedGuests}
                            onChange={(e) => setSelectedGuests(parseInt(e.target.value))}
                            className="appearance-none bg-slate-50 border border-slate-200 rounded-lg py-2 pl-4 pr-10 font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#2B9C64]"
                        >
                            {Array.from({ length: maxGuests }, (_, i) => i + 1).map(num => (
                                <option key={num} value={num}>{num}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                </div>

                {/* Date Selector */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#2B9C64]" />
                        Select date
                    </h3>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                        {dates.map((date, idx) => (
                            <button
                                key={idx}
                                onClick={() => setSelectedDate(date)}
                                className={`min-w-[110px] p-3 rounded-2xl border transition-all flex flex-col items-center gap-1 ${selectedDate.toDateString() === date.toDateString()
                                    ? "bg-[#2B9C64]/10 border-[#2B9C64] shadow-[0_0_15px_rgba(43,156,100,0.1)]"
                                    : "bg-white border-slate-100 hover:border-slate-200"
                                    }`}
                            >
                                <span className={`text-xs font-bold uppercase tracking-wider ${selectedDate.toDateString() === date.toDateString() ? "text-[#2B9C64]" : "text-gray-400"
                                    }`}>
                                    {formatDate(date)}
                                </span>
                                <span className={`font-bold ${selectedDate.toDateString() === date.toDateString() ? "text-gray-900" : "text-gray-500"
                                    }`}>
                                    {formatDayNum(date)}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Time Selector */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 min-h-[400px]">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#2B9C64]" />
                        Select time of day
                    </h3>

                    {/* Tabs */}
                    <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
                        {["Lunch", "Dinner"].map(type => (
                            <button
                                key={type}
                                onClick={() => setActiveTimeOfDay(type)}
                                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTimeOfDay === type
                                    ? "bg-[#2B9C64] text-white shadow-sm"
                                    : "text-gray-500 hover:text-[#2B9C64]"
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    {/* Slots Grid */}
                    <div className="grid grid-cols-3 gap-3">
                        {slots[activeTimeOfDay].map((slot, idx) => {
                            const disabled = isSlotAfterClosing(slot.time)
                            const isSelected = selectedSlot?.time === slot.time && !disabled

                            return (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        if (!disabled) setSelectedSlot(slot)
                                    }}
                                    disabled={disabled}
                                    className={`p-3 rounded-xl border transition-all text-center flex flex-col gap-0.5 ${
                                        disabled
                                            ? "bg-slate-100 border-slate-100 text-slate-400 cursor-not-allowed opacity-60"
                                            : isSelected
                                                ? "bg-[#2B9C64] border-[#2B9C64] text-white shadow-lg shadow-[#2B9C64]/20"
                                                : "bg-white border-slate-100 hover:border-slate-200"
                                    }`}
                                >
                                    <span className={`text-sm font-bold ${isSelected ? "text-white" : "text-gray-800"
                                        }`}>
                                        {slot.time}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Floating action bar - fixed to bottom with safe area */}
            <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
                <Button
                    disabled={!selectedSlot}
                    onClick={handleProceed}
                    className={`w-full h-14 rounded-2xl font-bold text-lg transition-all ${selectedSlot
                        ? "bg-[#2B9C64] hover:bg-[#218a56] text-white shadow-lg shadow-[#2B9C64]/25"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                >
                    {selectedSlot ? "Continue" : "Select a time slot"}
                </Button>
            </div>
        </AnimatedPage>
    )
}
