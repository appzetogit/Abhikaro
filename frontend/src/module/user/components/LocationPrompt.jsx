import { useEffect, useState, useRef } from "react"
import { MapPin, Navigation, Map, ShieldCheck } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSharedLocation } from "@/lib/context/LocationContext"
import { motion, AnimatePresence } from "framer-motion"

export default function LocationPrompt() {
  const { location, loading, permissionGranted, requestLocation, error } = useSharedLocation()
  const [showPrompt, setShowPrompt] = useState(false)
  const hasTriggeredRef = useRef(false)

  useEffect(() => {
    // Determine if we have a "real" usable location
    const isRealLocation = location && 
                          location.latitude && 
                          location.longitude &&
                          location.address && 
                          location.address !== "Select location" && 
                          location.address !== "Current Location"

    // If we have a real location, hide prompt immediately
    if (isRealLocation) {
      setShowPrompt(false)
      document.body.style.overflow = ""
      return
    }

    // If we're already loading, don't show prompt yet
    if (loading) return

    // Show prompt if we don't have a real location after a short delay (gives init fetch a chance)
    const timer = setTimeout(() => {
      // Check again inside timeout
      const storedLocation = localStorage.getItem("userLocation")
      if (storedLocation) {
        try {
          const parsed = JSON.parse(storedLocation)
          if (parsed && parsed.latitude && parsed.address && parsed.address !== "Select location") {
            return // We have something, don't show prompt
          }
        } catch (e) {}
      }
      
      setShowPrompt(true)
      document.body.style.overflow = "hidden"
    }, 2500)

    return () => clearTimeout(timer)
  }, [location, loading, permissionGranted])

  const handleAllow = async () => {
    try {
      await requestLocation()
    } catch (err) {
      // Error is handled by context
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 sm:p-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-md"
          >
            <Card className="border-none shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-white/95 dark:bg-zinc-900/95 overflow-hidden rounded-[2rem]">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary-orange via-orange-400 to-primary-orange" />
              
              <CardHeader className="pt-10 pb-6 text-center space-y-4">
                <div className="mx-auto relative">
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.1, 1],
                      boxShadow: [
                        "0 0 0 0px rgba(255, 110, 0, 0.4)",
                        "0 0 0 20px rgba(255, 110, 0, 0)",
                        "0 0 0 0px rgba(255, 110, 0, 0)"
                      ]
                    }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="h-20 w-20 rounded-3xl bg-primary-orange/10 flex items-center justify-center relative z-10"
                  >
                    <MapPin className="h-10 w-10 text-primary-orange" strokeWidth={2.5} />
                  </motion.div>
                  <div className="absolute -bottom-2 -right-2 bg-white dark:bg-zinc-800 rounded-full p-2 shadow-lg z-20">
                    <Navigation className="h-4 w-4 text-blue-500 fill-blue-500" />
                  </div>
                </div>

                <div className="space-y-2">
                  <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-br from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
                    Where are you?
                  </CardTitle>
                  <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                    We need your location to show available <span className="text-primary-orange">restaurants</span> and <span className="text-primary-orange">offers</span> near you.
                  </p>
                </div>
              </CardHeader>

              <CardContent className="px-8 pb-10 space-y-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col items-center p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50">
                    <ShieldCheck className="h-5 w-5 text-green-500 mb-2" />
                    <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-tighter">Safe & Secure</span>
                  </div>
                  <div className="flex flex-col items-center p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50">
                    <Map className="h-5 w-5 text-blue-500 mb-2" />
                    <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-tighter">Exact Delivery</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <Button
                    onClick={handleAllow}
                    disabled={loading}
                    className="w-full h-14 bg-primary-orange hover:bg-orange-600 text-white text-lg font-bold rounded-2xl shadow-[0_10px_20px_rgba(255,110,0,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
                  >
                    {loading ? (
                      <div className="flex items-center gap-3">
                        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Locating...</span>
                      </div>
                    ) : (
                      "Share Live Location"
                    )}
                  </Button>
                  
                  <div className="flex items-center justify-center gap-2 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">
                      Live tracking required
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}


