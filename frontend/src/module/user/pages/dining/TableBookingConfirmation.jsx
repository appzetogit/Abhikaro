import { useState, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, Calendar, Users, MapPin, Ticket, ChevronRight, Edit2, ShieldCheck, Info, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import AnimatedPage from "../../components/AnimatedPage"
import { diningAPI, authAPI } from "@/lib/api"
import { toast } from "sonner"
import Loader from "@/components/Loader"
import { motion, AnimatePresence } from "framer-motion"

export default function TableBookingConfirmation() {
    const location = useLocation()
    const navigate = useNavigate()
    const { restaurant, guests, date, timeSlot, discount } = location.state || {}

    const [specialRequest, setSpecialRequest] = useState("")
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false)
    const [tempRequest, setTempRequest] = useState("")
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [bookingInProgress, setBookingInProgress] = useState(false)

    useEffect(() => {
        if (!restaurant) {
            navigate("/dining")
            return
        }

        const fetchUser = async () => {
            try {
                const response = await authAPI.getCurrentUser()
                if (response.data.success) {
                    setUser(response.data.data)
                }
            } catch (error) {
                console.error("Error fetching user:", error)
                // If not logged in, navigate to sign-in but the ProtectedRoute should handle this
            } finally {
                setLoading(false)
            }
        }
        fetchUser()
    }, [restaurant, navigate])

    const handleBooking = async () => {
        try {
            setBookingInProgress(true)
            const response = await diningAPI.createBooking({
                restaurant: restaurant._id,
                guests,
                date,
                timeSlot,
                specialRequest
            })

            if (response.data.success) {
                toast.success("Table booked successfully!")
                // Navigate to success page with booking details
                navigate("/dining/book-success", { state: { booking: response.data.data } })
            }
        } catch (error) {
            console.error("Booking error:", error)
            toast.error(error.response?.data?.message || "Failed to confirm booking")
        } finally {
            setBookingInProgress(false)
        }
    }

    const handleSaveRequest = () => {
        setSpecialRequest(tempRequest)
        setIsRequestModalOpen(false)
    }

    if (loading) return <Loader />

    const formattedDate = new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

    return (
        <AnimatedPage className="bg-slate-50 min-h-screen pb-24">
            {/* Header */}
            <div className="bg-[#1e3a8a] text-white px-4 py-4 sticky top-0 z-50 shadow-md">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <p className="font-semibold text-sm">Reach the restaurant 15 minutes before your booking time for a hassle-free experience</p>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Booking Summary Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-4 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="bg-blue-50 p-2 rounded-xl">
                                <Calendar className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900">{formattedDate} at {timeSlot}</p>
                                <div className="flex items-center gap-2 text-gray-500 text-sm mt-0.5">
                                    <Users className="w-4 h-4" />
                                    <span>{guests} guests</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 pt-4 border-t border-dashed border-slate-100">
                            <div className="bg-red-50 p-2 rounded-xl">
                                <MapPin className="w-5 h-5 text-red-500" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900">{restaurant.name}</p>
                                <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">
                                    {typeof restaurant.location === 'string'
                                        ? restaurant.location
                                        : (restaurant.location?.formattedAddress || restaurant.location?.address || `${restaurant.location?.city || ''}${restaurant.location?.area ? ', ' + restaurant.location.area : ''}`)}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-4 border-t border-dashed border-slate-100 text-purple-600">
                            <Ticket className="w-5 h-5" />
                            <span className="font-bold text-sm">10% cashback</span>
                        </div>
                    </div>
                </div>

                {/* Special Request */}
                <button
                    onClick={() => {
                        setTempRequest(specialRequest)
                        setIsRequestModalOpen(true)
                    }}
                    className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between group"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-100 p-2 rounded-xl group-hover:bg-slate-200 transition-colors">
                            <Info className="w-5 h-5 text-slate-600" />
                        </div>
                        <div className="text-left">
                            <span className="font-bold text-gray-700 block">{specialRequest ? "Special Request Added" : "Add special request"}</span>
                            {specialRequest && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{specialRequest}</p>}
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>

                {/* Preferences Section */}
                <div className="pt-4">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Guest Preferences</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <div className="space-y-2">
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                            <div className="flex items-start gap-3">
                                <div className="text-green-500 mt-1">
                                    <Edit2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">Modification available</p>
                                    <p className="text-xs text-slate-400">Valid till {timeSlot}, today</p>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                        </div>

                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                            <div className="flex items-start gap-3">
                                <div className="text-red-400 mt-1">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">Cancellation available</p>
                                    <p className="text-xs text-slate-400">Valid till {timeSlot}, today</p>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                        </div>
                    </div>
                </div>

                {/* Your Details */}
                <div className="pt-4">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Details</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="font-bold text-gray-900">{user?.name || "Shailu"}</p>
                            <p className="text-sm text-slate-400 mt-1">{user?.phone || user?.email || "8090512291"}</p>
                        </div>
                        <button className="text-red-500 text-sm font-bold hover:underline">Edit</button>
                    </div>
                </div>

                {/* Terms and Conditions */}
                <div className="pt-4">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Terms and Conditions</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <ul className="space-y-4">
                            {[
                                "Please arrive 15 minutes prior to your reservation time.",
                                "Booking valid for the specified number of guests entered during reservation",
                                "Cover charges upon entry are subject to the discretion of the restaurant",
                                "House rules are to be observed at all times",
                                "Special requests will be accommodated at the restaurant's discretion",
                                "Offers can be availed only by paying via Tastizo",
                                "Cover charges cannot be refunded if slot is cancelled within 30 minutes of slot start time",
                                "Additional service charges on the bill are at the restaurant's discretion"
                            ].map((term, i) => (
                                <li key={i} className="flex gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 flex-shrink-0"></div>
                                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{term}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Sticky Action Button */}
            <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-50">
                <Button
                    onClick={handleBooking}
                    disabled={bookingInProgress}
                    className="w-full h-14 bg-[#ef4444] hover:bg-red-600 text-white font-bold text-lg rounded-2xl shadow-xl shadow-red-200 transition-all active:scale-[0.98]"
                >
                    {bookingInProgress ? "Confirming..." : "Confirm your seat"}
                </Button>
            </div>
            {/* Special Request Modal */}
            <AnimatePresence>
                {isRequestModalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsRequestModalOpen(false)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed bottom-0 left-0 w-full bg-white rounded-t-[32px] p-6 z-[101] max-h-[80vh] overflow-y-auto"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-gray-900">Add Special Request</h3>
                                <button
                                    onClick={() => setIsRequestModalOpen(false)}
                                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                                >
                                    <X className="w-6 h-6 text-slate-500" />
                                </button>
                            </div>

                            <p className="text-slate-500 text-sm mb-4 leading-relaxed">
                                Share any preferences like window seat, food allergies, or special occasion requests. We'll pass them to the restaurant.
                            </p>

                            <div className="relative group">
                                <textarea
                                    value={tempRequest}
                                    onChange={(e) => setTempRequest(e.target.value)}
                                    placeholder="e.g. It's our anniversary, would love a quiet table by the window."
                                    className="w-full h-40 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-[#ef4444] focus:bg-white outline-none transition-all resize-none font-medium text-gray-700"
                                    maxLength={250}
                                />
                                <div className="absolute bottom-4 right-4 text-[10px] font-bold text-slate-400">
                                    {tempRequest.length}/250
                                </div>
                            </div>

                            <div className="flex gap-4 mt-8">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsRequestModalOpen(false)}
                                    className="flex-1 h-14 rounded-2xl border-2 font-bold text-slate-600"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSaveRequest}
                                    className="flex-1 h-14 bg-[#ef4444] hover:bg-red-600 rounded-2xl font-bold shadow-lg shadow-red-100"
                                >
                                    Save Request
                                </Button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </AnimatedPage>
    )
}
