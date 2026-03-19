import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, MapPin, Phone, Navigation } from "lucide-react"
import { restaurantAPI, diningAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"
import AnimatedPage from "../../components/AnimatedPage"
import { toast } from "sonner"

const formatAddress = (loc) => {
  if (!loc) return "Address not available"
  if (typeof loc === "string") return loc
  if (loc.formattedAddress) return loc.formattedAddress
  if (loc.address) return loc.address
  const parts = [loc.addressLine1, loc.addressLine2, loc.area, loc.city, loc.state, loc.zipCode]
    .filter(Boolean)
    .map((p) => String(p).trim())
    .filter(Boolean)
  return parts.length ? parts.join(", ") : "Address not available"
}

const getOpenCloseText = (restaurant) => {
  const timings = restaurant?.deliveryTimings || {}
  const open = timings.open || restaurant?.openingTime || "11:00 am"
  const close = timings.close || restaurant?.closingTime || "10:00 pm"
  return `Closed • Closes ${close} • Opens ${open}`
}

export default function RestaurantInfo() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const getCachedRestaurant = () => {
    if (!slug) return null
    try {
      const raw = sessionStorage.getItem(`user_restaurant_info_${slug}`)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  const [restaurant, setRestaurant] = useState(location.state?.restaurant || getCachedRestaurant() || null)
  const [loading, setLoading] = useState(!(location.state?.restaurant || getCachedRestaurant()))

  const isLikelyGenericName = (name) => /^restaurant\s*\d+$/i.test(String(name || "").trim())

  useEffect(() => {
    const fetchInfo = async () => {
      if (restaurant || !slug) return
      try {
        setLoading(true)
        let data = null
        try {
          const resp = await diningAPI.getRestaurantBySlug(slug)
          data = resp?.data?.data || null
        } catch {
          // fallback below
        }
        if (!data) {
          const resp = await restaurantAPI.getRestaurantById(slug)
          data = resp?.data?.data || null
        }
        if (data) {
          const actualRestaurant = data?.restaurant || data
          const cachedRestaurant = getCachedRestaurant()

          // If backend returns generic fallback name like "Restaurant 5021",
          // prefer known contextual name from previous page navigation.
          if (isLikelyGenericName(actualRestaurant?.name) && cachedRestaurant?.name) {
            setRestaurant({ ...actualRestaurant, name: cachedRestaurant.name })
          } else {
            setRestaurant(actualRestaurant)
          }
        }
      } catch (error) {
        toast.error("Unable to load restaurant details")
      } finally {
        setLoading(false)
      }
    }
    fetchInfo()
  }, [slug, restaurant])

  useEffect(() => {
    if (!restaurant || !slug) return
    try {
      sessionStorage.setItem(`user_restaurant_info_${slug}`, JSON.stringify(restaurant))
    } catch {
      // ignore storage errors
    }
  }, [restaurant, slug])

  const restaurantName = restaurant?.name || "Restaurant"
  const cuisines = useMemo(() => {
    if (Array.isArray(restaurant?.cuisines) && restaurant.cuisines.length) return restaurant.cuisines
    if (restaurant?.cuisine) return [restaurant.cuisine]
    return ["Cuisine details unavailable"]
  }, [restaurant])
  const address = formatAddress(restaurant?.location)
  const phone = restaurant?.phone || restaurant?.phoneNumber || restaurant?.contactPhone || ""
  const fssai = restaurant?.fssai || restaurant?.fssaiNumber || restaurant?.fssaiLicenseNo || "12345678901234"

  const handleDirection = () => {
    const lat = restaurant?.location?.coordinates?.lat || restaurant?.location?.latitude
    const lng = restaurant?.location?.coordinates?.lng || restaurant?.location?.longitude
    const q = lat && lng ? `${lat},${lng}` : encodeURIComponent(address)
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank")
  }

  const handleCall = () => {
    if (!phone) {
      toast.info("Phone number not available")
      return
    }
    window.location.href = `tel:${phone}`
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-2xl mx-auto min-h-screen bg-white px-4 pt-4 pb-6">
        <div className="flex items-center justify-between mt-2">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 mt-2 text-gray-700" aria-label="Back">
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
          <div />
        </div>

        <div className="mt-7">
          <h1 className="text-[28px] leading-tight font-bold text-gray-900">{restaurantName}</h1>
          <p className="mt-1.5 text-[15px] text-gray-700">{cuisines.join(" • ")}</p>

          <div className="mt-3.5 flex items-start gap-2 text-gray-800">
            <MapPin className="h-4 w-4 mt-0.5 text-gray-500" />
            <p className="text-[13px] leading-7">{address}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            onClick={handleCall}
            variant="outline"
            className="h-11 border-2 border-green-600 text-green-700 rounded-xl text-base font-medium"
          >
            <Phone className="h-4 w-4 mr-2" /> Call
          </Button>
          <Button
            onClick={handleDirection}
            variant="outline"
            className="h-11 border-2 border-green-600 text-green-700 rounded-xl text-base font-medium"
          >
            <Navigation className="h-4 w-4 mr-2" /> Direction
          </Button>
        </div>

        <div className="mt-6 text-gray-600">
          <p className="text-base">FSSAI Lic No</p>
          <p className="text-[17px] leading-tight text-gray-900 mt-1 font-medium">{fssai}</p>
        </div>

        {loading && <p className="mt-6 text-sm text-gray-500">Loading restaurant info...</p>}
      </div>
    </AnimatedPage>
  )
}

