import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Plus, Minus, ArrowLeft, ChevronRight, Clock, MapPin, Phone, FileText, Utensils, Tag, Percent, Truck, Leaf, Share2, ChevronUp, ChevronDown, X, Check, Settings, CreditCard, Wallet, Building2, Sparkles, AlertCircle, Pencil } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"

import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCart } from "../../context/CartContext"
import { useProfile } from "../../context/ProfileContext"
import { useOrders } from "../../context/OrdersContext"
import { useSharedLocation } from "@/lib/context/LocationContext"
import api, { orderAPI, restaurantAPI, adminAPI, userAPI, API_ENDPOINTS, paymentAPI } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api/config"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"
import { preloadGoogleMaps } from "../../../../utils/mapsPreload"


// Removed hardcoded suggested items - now fetching approved addons from backend
// Coupons will be fetched from backend based on items in cart

const isPlaceholder = (str) => {
  if (!str) return true;
  const s = String(str).toLowerCase().trim();
  return s === "select location" || s === "updating location..." || s === "detecting...";
};

/**
 * Format full address string from address object
 * @param {Object} address - Address object with street, additionalDetails, city, state, zipCode, or formattedAddress
 * @returns {String} Formatted address string
 */
const formatFullAddress = (address) => {
  if (!address) return ""

  // Priority 1: Use formattedAddress if available and genuine
  if (address.formattedAddress && !isPlaceholder(address.formattedAddress)) {
    return address.formattedAddress
  }

  // Priority 2: Build address from parts (excluding any placeholders)
  const addressParts = []
  if (address.street && !isPlaceholder(address.street)) addressParts.push(address.street)
  if (address.additionalDetails && !isPlaceholder(address.additionalDetails)) addressParts.push(address.additionalDetails)
  if (address.city && !isPlaceholder(address.city)) addressParts.push(address.city)
  if (address.state && !isPlaceholder(address.state)) addressParts.push(address.state)
  if (address.zipCode && !isPlaceholder(address.zipCode)) addressParts.push(address.zipCode)

  if (addressParts.length > 0) {
    return addressParts.join(', ')
  }

  // Priority 3: Use address field if available
  if (address.address && !isPlaceholder(address.address)) {
    return address.address
  }

  return ""
}

export default function Cart() {
  const navigate = useNavigate()

  // Defensive check: Ensure CartProvider is available
  let cartContext;
  try {
    cartContext = useCart();
  } catch (error) {
    // Return early with error message
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] dark:bg-[#0a0a0a]">
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Cart Error</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Cart functionality is not available. Please refresh the page.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const { cart, updateQuantity, addToCart, getCartCount, clearCart, cleanCartForRestaurant } = cartContext;
  const { getDefaultAddress, getDefaultPaymentMethod, addresses, paymentMethods, userProfile } = useProfile()
  const { createOrder } = useOrders()
  const { location: currentLocation, zoneId, requestLocation, isManualOverrideEnabled } = useSharedLocation() // Get live location address, zone, and manual override state

  const [showCoupons, setShowCoupons] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponCode, setCouponCode] = useState("")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("razorpay") // razorpay | wallet | pay_at_hotel (COD disabled)
  const [hasHotelReference, setHasHotelReference] = useState(false) // Track if hotel reference exists
  const [isHotelOrder, setIsHotelOrder] = useState(false) // Track if this is a hotel order
  const [roomNumber, setRoomNumber] = useState(() => sessionStorage.getItem("checkout_room_number") || '') // Room number for pay_at_hotel
  const [hotelName, setHotelName] = useState('') // Hotel name for display
  const [walletBalance, setWalletBalance] = useState(0)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)
  const [deliveryFleet, setDeliveryFleet] = useState("standard") // Default to standard fleet
  const [showFleetOptions, setShowFleetOptions] = useState(false)
  const [note, setNote] = useState(() => sessionStorage.getItem("checkout_note") || "")
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [additionalAddress, setAdditionalAddress] = useState(() => sessionStorage.getItem("checkout_additional_address") || "")
  const [addressError, setAddressError] = useState(false)
  const [roomError, setRoomError] = useState(false)
  const [deliveryAddressError, setDeliveryAddressError] = useState(false)
  const [isEditingContact, setIsEditingContact] = useState(false)
  const [contactName, setContactName] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [isSavingContact, setIsSavingContact] = useState(false)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [showBillDetails, setShowBillDetails] = useState(false)
  const [showPlacingOrder, setShowPlacingOrder] = useState(false)
  const [orderProgress, setOrderProgress] = useState(0)
  const [showOrderSuccess, setShowOrderSuccess] = useState(false)
  const [placedOrderId, setPlacedOrderId] = useState(null)

  // Restaurant and pricing state
  const [restaurantData, setRestaurantData] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(false)
  const [pricing, setPricing] = useState(null)
  const [loadingPricing, setLoadingPricing] = useState(false)
  const pricingAbortRef = useRef(null)

  // Addons state
  const [addons, setAddons] = useState([])
  const [loadingAddons, setLoadingAddons] = useState(false)

  // Coupons state - fetched from backend
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [loadingCoupons, setLoadingCoupons] = useState(false)

  // Category offer (admin category offerPercentage) state
  const [categoryOffers, setCategoryOffers] = useState([])
  const [bestCategoryOffer, setBestCategoryOffer] = useState(null) // { id, percent, name, usageLimitPerDay }
  const [isCategoryOfferApplied, setIsCategoryOfferApplied] = useState(false)
  const [showCategoryOfferModal, setShowCategoryOfferModal] = useState(false)
  const categoryOfferPromptShownRef = useRef(false)
  const [hasUsedAdminOfferToday, setHasUsedAdminOfferToday] = useState(false)

  // Fee settings from database (used as fallback if pricing not available)
  const [feeSettings, setFeeSettings] = useState({
    deliveryFee: 25,
    freeDeliveryThreshold: 149,
    platformFee: 5,
    gstRate: 5,
    deliveryFeeRanges: [], // Delivery fee ranges based on order value
  })

  const [businessSettings, setBusinessSettings] = useState({
    payAtHotelMaxTotal: 699,
    minOrderAmount: 0,
  })

  const normalizePhone10 = (value) => String(value || "").replace(/\D/g, "").slice(-10)

  // Warm up Google Maps as soon as success screen appears so the tracking map renders instantly
  useEffect(() => {
    if (showOrderSuccess) {
      try {
        preloadGoogleMaps(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
      } catch {}
    }
  }, [showOrderSuccess])

  // Meta Ads Purchase Tracking
  useEffect(() => {
    if (showOrderSuccess && pricing) {
      try {
        if (typeof window !== "undefined") {
          const value = pricing.finalAmount || pricing.totalAmount || 0;
          if (window.fbq) {
            window.fbq("track", "Purchase", {
              value: value,
              currency: "INR"
            });
          }
          if (window.FB && window.FB.AppEvents) {
            window.FB.AppEvents.logEvent("Purchase", value, {
              fb_currency: "INR"
            });
          }
        }
      } catch (error) {
        // ignore tracking errors
      }
    }
  }, [showOrderSuccess, pricing])

  // Note: order placed success screen no longer shows advertise banners.
  // Checkout-only contact draft:
  // - Initialize from sessionStorage if present
  // - Otherwise initialize once from profile (if fields empty)
  useEffect(() => {
    if (userProfile) {
      try {
        const raw = sessionStorage.getItem("checkout_contact_draft")
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.name) {
            setContactName(String(parsed.name))
            if (parsed?.phone) setContactPhone(String(parsed.phone))
            return
          }
        }
      } catch {
        // ignore
      }

      // If no draft in sessionStorage, initialize/reset from profile
      setContactName(userProfile.name || userProfile.fullName || "")
      setContactPhone(userProfile.phone || "")
    }
  }, [userProfile])

  // Persist checkout contact draft for this session (does not touch profile)
  useEffect(() => {
    // Only persist if we have a non-empty name/phone, preventing empty overwrites during initial mount/load
    if (contactName || contactPhone) {
      try {
        sessionStorage.setItem(
          "checkout_contact_draft",
          JSON.stringify({
            name: contactName || "",
            phone: contactPhone || "",
          }),
        )
      } catch {
        // ignore
      }
    }
  }, [contactName, contactPhone])

  // Persist additional checkout fields for refresh resilience
  useEffect(() => {
    try {
      sessionStorage.setItem("checkout_additional_address", additionalAddress || "")
    } catch {}
  }, [additionalAddress])

  useEffect(() => {
    try {
      sessionStorage.setItem("checkout_note", note || "")
    } catch {}
  }, [note])

  useEffect(() => {
    try {
      sessionStorage.setItem("checkout_room_number", roomNumber || "")
    } catch {}
  }, [roomNumber])

  const clearCheckoutDrafts = () => {
    try {
      sessionStorage.removeItem("checkout_additional_address")
      sessionStorage.removeItem("checkout_note")
      sessionStorage.removeItem("checkout_room_number")
      sessionStorage.removeItem("checkout_contact_draft")
      if (userProfile) {
        setContactName(userProfile.name || userProfile.fullName || "")
        setContactPhone(userProfile.phone || "")
      }
    } catch (e) {
      // ignore
    }
  }

  // Clear checkout drafts when order is successfully placed
  useEffect(() => {
    if (showOrderSuccess) {
      clearCheckoutDrafts()
    }
  }, [showOrderSuccess, userProfile])

  const handleSaveContact = async () => {
    const trimmedName = String(contactName || "").trim()
    const phone10 = normalizePhone10(contactPhone)

    if (!trimmedName) {
      toast.error("Please enter your name")
      return
    }
    if (phone10.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number")
      return
    }

    try {
      setIsSavingContact(true)
      // Checkout-only: do NOT sync to profile. Keep it only for this order/session.
      setContactName(trimmedName)
      setContactPhone(phone10)
      setIsEditingContact(false)
      toast.success("Contact details saved for this order")
    } catch (e) {
      toast.error("Failed to save contact details")
    } finally {
      setIsSavingContact(false)
    }
  }



  // Helper: increment how many times current user has used this admin offer today (stored in localStorage)
  const markAdminOfferUsedToday = (categoryId, usageLimitPerDay) => {
    try {
      const userId = userProfile?.id || userProfile?._id || null
      if (!userId || !categoryId) return
      const today = new Date().toISOString().slice(0, 10)
      const key = `adminOfferUsage:${userId}:${categoryId}:${today}`
      const currentRaw = localStorage.getItem(key)
      const currentCount = currentRaw ? parseInt(currentRaw, 10) || 0 : 0
      const nextCount = currentCount + 1
      localStorage.setItem(key, String(nextCount))

      const limit =
        typeof usageLimitPerDay === "number" && usageLimitPerDay >= 0
          ? usageLimitPerDay
          : 1

      if (limit > 0 && nextCount >= limit) {
        setHasUsedAdminOfferToday(true)
      }
    } catch (e) {
      // Failed to mark admin offer used
    }
  }

  // Simple confetti animation for applying category offer
  const triggerOfferConfetti = () => {
    try {
      const duration = 1200
      const animationEnd = Date.now() + duration
      const defaults = {
        startVelocity: 35,
        spread: 360,
        ticks: 60,
        zIndex: 9999,
        scalar: 0.9,
      }

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now()
        if (timeLeft <= 0) {
          clearInterval(interval)
          return
        }

        const particleCount = Math.round(80 * (timeLeft / duration))

        confetti({
          ...defaults,
          particleCount,
          origin: { x: Math.random() * 0.4 + 0.1, y: 0.3 },
        })
        confetti({
          ...defaults,
          particleCount,
          origin: { x: Math.random() * 0.4 + 0.5, y: 0.3 },
        })
      }, 250)
    } catch (error) {
      // Error triggering offer confetti
    }
  }


  const cartCount = getCartCount()
  const savedAddress = getDefaultAddress()
  // Priority: Use live location if available, otherwise use saved address
  const defaultAddress = currentLocation?.formattedAddress && !isPlaceholder(currentLocation.formattedAddress)
    ? {
      ...savedAddress,
      label: "Live", // Explicitly set label to Live for live location
      formattedAddress: currentLocation.formattedAddress,
      address: isPlaceholder(currentLocation.address) ? "" : (currentLocation.address || currentLocation.formattedAddress),
      street: isPlaceholder(currentLocation.street) ? "" : (currentLocation.street || currentLocation.address || ""),
      city: isPlaceholder(currentLocation.city) ? "" : (currentLocation.city || ""),
      state: isPlaceholder(currentLocation.state) ? "" : (currentLocation.state || ""),
      zipCode: isPlaceholder(currentLocation.postalCode) ? "" : (currentLocation.postalCode || ""),
      area: isPlaceholder(currentLocation.area) ? "" : (currentLocation.area || ""),
      location: currentLocation.latitude && currentLocation.longitude ? {
        coordinates: [currentLocation.longitude, currentLocation.latitude]
      } : savedAddress?.location
    }
    : savedAddress
  const defaultPayment = getDefaultPaymentMethod()

  // Checkout-only delivery address: selectable on this page without mutating Home page location.
  const [checkoutDeliveryAddress, setCheckoutDeliveryAddress] = useState(() => {
    try {
      const raw = sessionStorage.getItem("checkout_delivery_address")
      if (raw) return JSON.parse(raw)
    } catch {
      // ignore
    }
    return defaultAddress || null
  })
  const [hasManuallySelectedDeliveryAddress, setHasManuallySelectedDeliveryAddress] = useState(() => {
    try {
      return sessionStorage.getItem("checkout_delivery_address_manual") === "true"
    } catch {
      return false
    }
  })

  const makeAddressSig = useCallback((addr) => {
    if (!addr) return "null"
    const coords =
      Array.isArray(addr?.location?.coordinates) && addr.location.coordinates.length >= 2
        ? [Number(addr.location.coordinates[0] || 0), Number(addr.location.coordinates[1] || 0)]
        : null

    return JSON.stringify({
      label: addr?.label || null,
      formattedAddress: addr?.formattedAddress || null,
      address: addr?.address || null,
      street: addr?.street || null,
      city: addr?.city || null,
      state: addr?.state || null,
      zipCode: addr?.zipCode || null,
      coordinates: coords,
    })
  }, [])

  // Keep checkout delivery address in sync with live/default address ONLY until user manually selects one.
  useEffect(() => {
    if (hasManuallySelectedDeliveryAddress) return
    const next = defaultAddress || null
    // Avoid infinite loops: defaultAddress can be a new object each render.
    // Only update when the meaningful address fields actually changed.
    if (makeAddressSig(checkoutDeliveryAddress) !== makeAddressSig(next)) {
      setCheckoutDeliveryAddress(next)
    }
  }, [defaultAddress, hasManuallySelectedDeliveryAddress, checkoutDeliveryAddress, makeAddressSig])

  // Persist checkout delivery address (session-only)
  useEffect(() => {
    try {
      if (checkoutDeliveryAddress) {
        sessionStorage.setItem("checkout_delivery_address", JSON.stringify(checkoutDeliveryAddress))
      } else {
        sessionStorage.removeItem("checkout_delivery_address")
      }
      sessionStorage.setItem(
        "checkout_delivery_address_manual",
        hasManuallySelectedDeliveryAddress ? "true" : "false",
      )
    } catch {
      // ignore storage failures
    }
  }, [checkoutDeliveryAddress, hasManuallySelectedDeliveryAddress])

  // Get restaurant ID from cart or restaurant data
  // Priority: restaurantData > cart[0].restaurantId
  // DO NOT use cart[0].restaurant as slug fallback - it creates wrong slugs
  const restaurantId = cart.length > 0
    ? (restaurantData?._id || restaurantData?.restaurantId || cart[0]?.restaurantId || null)
    : null

  // Stable restaurant ID for addons fetch (memoized to prevent dependency array issues)
  // Prefer restaurantData IDs (more reliable) over slug from cart
  const restaurantIdForAddons = useMemo(() => {
    // Only use restaurantData if it's loaded, otherwise wait
    if (restaurantData) {
      return restaurantData._id || restaurantData.restaurantId || null
    }
    // If restaurantData is not loaded yet, return null to wait
    return null
  }, [restaurantData])



  // Lock body scroll and scroll to top when any full-screen modal opens
  useEffect(() => {
    if (showPlacingOrder || showOrderSuccess) {
      // Lock body scroll
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.top = `-${window.scrollY}px`

      // Scroll window to top
      window.scrollTo({ top: 0, behavior: 'instant' })
    } else {
      // Restore body scroll
      const scrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1)
      }
    }

    return () => {
      // Cleanup on unmount
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
    }
  }, [showPlacingOrder, showOrderSuccess])

  // Detect hotel order context on mount
  useEffect(() => {
    const hotelRef = sessionStorage.getItem('hotelReference');
    const hotelNameStored = sessionStorage.getItem('hotelReferenceName');
    const isHotelOrderFlag = sessionStorage.getItem('isHotelOrder');

    if (hotelRef && isHotelOrderFlag === 'true') {
      setIsHotelOrder(true);
      setHotelName(hotelNameStored || 'Hotel');
      setHasHotelReference(true);
      // Default to online payment for hotel orders
      setSelectedPaymentMethod('razorpay');
    }
  }, []);

  // Fetch restaurant data when cart has items
  useEffect(() => {
    const fetchRestaurantData = async () => {
      if (cart.length === 0) {
        setRestaurantData(null)
        return
      }

      // If we already have restaurantData, don't fetch again
      if (restaurantData) {
        return
      }

      setLoadingRestaurant(true)

      // Strategy 1: Try using restaurantId from cart if available
      if (cart[0]?.restaurantId) {
        try {
          const cartRestaurantId = cart[0].restaurantId;
          const cartRestaurantName = cart[0].restaurant;

          const response = await restaurantAPI.getRestaurantById(cartRestaurantId)
          const data = response?.data?.data?.restaurant || response?.data?.restaurant

          if (data) {
            // CRITICAL: Validate that fetched restaurant matches cart items
            const fetchedRestaurantId = data.restaurantId || data._id?.toString();
            const fetchedRestaurantName = data.name;

            // Check if restaurantId matches
            const restaurantIdMatches =
              fetchedRestaurantId === cartRestaurantId ||
              data._id?.toString() === cartRestaurantId ||
              data.restaurantId === cartRestaurantId;

            // Check if restaurant name matches (if available in cart)
            const restaurantNameMatches =
              !cartRestaurantName ||
              fetchedRestaurantName?.toLowerCase().trim() === cartRestaurantName.toLowerCase().trim();

            if (!restaurantIdMatches) {
              // Don't set restaurantData if IDs don't match - this prevents wrong restaurant assignment
              setLoadingRestaurant(false);
              return;
            }

            if (!restaurantNameMatches) {
              // Still proceed but log warning
            }

            setRestaurantData(data)
            setLoadingRestaurant(false)
            return
          }
        } catch (error) {
          // Failed to fetch by cart restaurantId, trying fallback
        }
      }

      // Strategy 2: If no restaurantId in cart, search by restaurant name
      if (cart[0]?.restaurant && !restaurantData) {
        try {
          const searchResponse = await restaurantAPI.getRestaurants({ limit: 100 })
          const restaurants = searchResponse?.data?.data?.restaurants || searchResponse?.data?.data || []

          // Try exact match first
          let matchingRestaurant = restaurants.find(r =>
            r.name?.toLowerCase().trim() === cart[0].restaurant?.toLowerCase().trim()
          )

          // If no exact match, try partial match
          if (!matchingRestaurant) {
            matchingRestaurant = restaurants.find(r =>
              r.name?.toLowerCase().includes(cart[0].restaurant?.toLowerCase().trim()) ||
              cart[0].restaurant?.toLowerCase().trim().includes(r.name?.toLowerCase())
            )
          }

          if (matchingRestaurant) {
            // CRITICAL: Validate that the found restaurant matches cart items
            const cartRestaurantName = cart[0]?.restaurant?.toLowerCase().trim();
            const foundRestaurantName = matchingRestaurant.name?.toLowerCase().trim();

            if (cartRestaurantName && foundRestaurantName && cartRestaurantName !== foundRestaurantName) {
              // Don't set restaurantData if names don't match - this prevents wrong restaurant assignment
              setLoadingRestaurant(false);
              return;
            }

            setRestaurantData(matchingRestaurant)
            setLoadingRestaurant(false)
            return
          }
        } catch (searchError) {
          // Error searching restaurants by name
        }
      }

      // If all strategies fail, set to null
      setRestaurantData(null)
      setLoadingRestaurant(false)
    }

    fetchRestaurantData()
  }, [cart.length, cart[0]?.restaurantId, cart[0]?.restaurant])

  // Fetch approved addons for the restaurant
  useEffect(() => {
    const fetchAddonsWithId = async (idToUse) => {
      // Convert to string for validation
      const idString = String(idToUse)

      // Validate ID format (should be ObjectId or restaurantId format)
      const isValidIdFormat = /^[a-zA-Z0-9\-_]+$/.test(idString) && idString.length >= 3

      if (!isValidIdFormat) {
        setAddons([])
        return
      }

      try {
        setLoadingAddons(true)
        const response = await restaurantAPI.getAddonsByRestaurantId(idString)

        const data = response?.data?.data?.addons || response?.data?.addons || []
        // Filter to show only approved and available addons for users
        const approvedAddons = data.filter(addon =>
          addon.approvalStatus === 'approved' && addon.isAvailable !== false
        )

        setAddons(approvedAddons)
      } catch (error) {
        // Silently handle network errors and 404 errors
        // Network errors (ERR_NETWORK) happen when backend is not running - this is OK for development
        // 404 errors mean restaurant might not have addons or restaurant not found - also OK
        // Continue with cart even if addons fetch fails
        setAddons([])
      } finally {
        setLoadingAddons(false)
      }
    }

    const fetchAddons = async () => {
      if (cart.length === 0) {
        setAddons([])
        return
      }

      // Wait for restaurantData to be loaded (including fallback search)
      if (loadingRestaurant) {
        return
      }

      // Must have restaurantData to fetch addons
      if (!restaurantData) {
        setAddons([])
        return
      }

      // Use restaurantData ID (most reliable)
      const idToUse = restaurantData._id || restaurantData.restaurantId
      if (!idToUse) {
        setAddons([])
        return
      }

      fetchAddonsWithId(idToUse)
    }

    fetchAddons()
  }, [restaurantData, cart.length, loadingRestaurant])

  // Fetch coupons for items in cart
  useEffect(() => {
    const fetchCouponsForCartItems = async () => {
      if (cart.length === 0 || !restaurantId) {
        setAvailableCoupons([])
        return
      }

      setLoadingCoupons(true)

      const allCoupons = []
      const uniqueCouponCodes = new Set()

      // Fetch coupons for each item in cart
      for (const cartItem of cart) {
        if (!cartItem.id) {
          continue
        }

        try {
          const response = await restaurantAPI.getCouponsByItemIdPublic(restaurantId, cartItem.id)

          if (response?.data?.success && response?.data?.data?.coupons) {
            const coupons = response.data.data.coupons

            // Add coupons, avoiding duplicates
            coupons.forEach(coupon => {
              if (!uniqueCouponCodes.has(coupon.couponCode)) {
                uniqueCouponCodes.add(coupon.couponCode)
                // Convert backend coupon format to frontend format
                allCoupons.push({
                  code: coupon.couponCode,
                  discount: coupon.originalPrice - coupon.discountedPrice,
                  discountPercentage: coupon.discountPercentage,
                  minOrder: coupon.minOrderValue || 0,
                  description: `Save ₹${coupon.originalPrice - coupon.discountedPrice} with '${coupon.couponCode}'`,
                  originalPrice: coupon.originalPrice,
                  discountedPrice: coupon.discountedPrice,
                  itemId: cartItem.id,
                  itemName: cartItem.name,
                })
              }
            })
          }
        } catch (error) {
          // Error fetching coupons for item
        }
      }

      setAvailableCoupons(allCoupons)
      setLoadingCoupons(false)
    }

    fetchCouponsForCartItems()
  }, [cart, restaurantId])

  // Calculate pricing from backend whenever cart, address, or coupon changes
  useEffect(() => {
    const calculatePricing = async () => {
      if (cart.length === 0 || !checkoutDeliveryAddress) {
        pricingAbortRef.current?.abort?.()
        setPricing(null)
        return
      }

      pricingAbortRef.current?.abort?.()
      const controller = new AbortController()
      pricingAbortRef.current = controller

      try {
        setLoadingPricing(true)
        const items = cart.map(item => ({
          itemId: item.productId || item.id,
          name: item.selectedVariantName ? `${item.productName || item.name} - ${item.selectedVariantName}` : (item.productName || item.name),
          price: item.variantPrice ?? item.price,
          quantity: item.quantity || 1,
          image: item.image,
          description: item.description,
          isVeg: item.isVeg !== false,
          selectedVariantId: item.selectedVariantId || null,
          selectedVariantName: item.selectedVariantName || null,
        }))

        const response = await orderAPI.calculateOrder({
          items,
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
          deliveryAddress: checkoutDeliveryAddress,
          couponCode: appliedCoupon?.code || couponCode || null,
          deliveryFleet: deliveryFleet || 'standard'
        }, { signal: controller.signal })

        if (controller.signal.aborted) return

        if (response?.data?.success && response?.data?.data?.pricing) {
          setPricing(response.data.data.pricing)

          // Update applied coupon if backend returns one
          if (response.data.data.pricing.appliedCoupon && !appliedCoupon) {
            const coupon = availableCoupons.find(c => c.code === response.data.data.pricing.appliedCoupon.code)
            if (coupon) {
              setAppliedCoupon(coupon)
            }
          }
        }
      } catch (error) {
        // Abort/cancel is expected when inputs change quickly; keep last-known pricing to avoid flicker.
        if (controller.signal.aborted) return
        if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || error?.name === "AbortError") return
        // For transient failures, keep last-known pricing; UI already falls back to fee settings where needed.
      } finally {
        if (pricingAbortRef.current === controller) {
          setLoadingPricing(false)
        }
      }
    }

    calculatePricing()
    return () => {
      pricingAbortRef.current?.abort?.()
    }
  }, [cart, checkoutDeliveryAddress, appliedCoupon, couponCode, deliveryFleet, restaurantId, restaurantData])

  // Fetch wallet balance
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        setIsLoadingWallet(true)
        const response = await userAPI.getWallet()
        if (response?.data?.success && response?.data?.data?.wallet) {
          setWalletBalance(response.data.data.wallet.balance || 0)
        }
      } catch (error) {
        setWalletBalance(0)
      } finally {
        setIsLoadingWallet(false)
      }
    }
    fetchWalletBalance()
  }, [])

  // Fetch fee settings on mount
  useEffect(() => {
    const fetchFeeSettings = async () => {
      try {
        const response = await adminAPI.getPublicFeeSettings()
        if (response.data.success && response.data.data.feeSettings) {
          setFeeSettings({
            deliveryFee: response.data.data.feeSettings.deliveryFee || 25,
            freeDeliveryThreshold: response.data.data.feeSettings.freeDeliveryThreshold || 149,
            platformFee: response.data.data.feeSettings.platformFee || 5,
            gstRate: response.data.data.feeSettings.gstRate || 5,
            deliveryFeeRanges: response.data.data.feeSettings.deliveryFeeRanges || [], // Include delivery fee ranges
          })
        }
      } catch (error) {
        // Keep default values on error
      }
    }
    fetchFeeSettings()
  }, [])

  // Fetch business settings on mount
  useEffect(() => {
    const fetchBusinessSettings = async () => {
      try {
        const response = await adminAPI.getPublicBusinessSettings()
        if (response.data.success && response.data.data) {
          setBusinessSettings({
            payAtHotelMaxTotal: response.data.data.payAtHotelMaxTotal ?? 699,
            minOrderAmount: response.data.data.minOrderAmount ?? 0,
          })
        }
      } catch (error) {
        // Keep default values on error
      }
    }
    fetchBusinessSettings()
  }, [])

  // Fetch admin category offers (offerPercentage) for matching flat offers
  useEffect(() => {
    const fetchCategoryOffers = async () => {
      try {
        const response = await adminAPI.getPublicCategories()
        if (response.data?.success && response.data.data?.categories) {
          const offers = response.data.data.categories
            .filter(
              (cat) =>
                typeof cat.offerPercentage === "number" &&
                cat.offerPercentage > 0
            )
            .map((cat) => {
              const lowerName = (cat.name || "").toLowerCase()
              const words = lowerName
                .split(/[\s-]+/)
                .filter((w) => w.length > 0)
              return {
                id: cat.id || cat._id,
                name: cat.name,
                offerPercentage: cat.offerPercentage,
                usageLimitPerDay:
                  typeof cat.offerUsageLimitPerDay === "number"
                    ? cat.offerUsageLimitPerDay
                    : 1,
                keywords: [lowerName, ...words],
              }
            })
          setCategoryOffers(offers)
        } else {
          setCategoryOffers([])
        }
      } catch (error) {
        setCategoryOffers([])
      }
    }

    fetchCategoryOffers()
  }, [])

  // Helper: get best matching category offer for a given cart item
  const getCategoryOfferForCartItem = (item) => {
    if (!item || categoryOffers.length === 0) return null

    const itemCategory = (item.category || item.type || "").toLowerCase()
    const itemName = (item.productName || item.name || "").toLowerCase()

    for (const cat of categoryOffers) {
      const keywords = cat.keywords || []
      if (
        keywords.some(
          (kw) => kw && (itemCategory.includes(kw) || itemName.includes(kw)),
        )
      ) {
        return {
          id: cat.id,
          percent:
            typeof cat.offerPercentage === "number" ? cat.offerPercentage : 0,
          name: cat.name,
          usageLimitPerDay:
            typeof cat.usageLimitPerDay === "number"
              ? cat.usageLimitPerDay
              : 1,
        }
      }
    }

    return null
  }

  // Determine best category offer present in cart and trigger popup once
  useEffect(() => {
    if (cart.length === 0 || categoryOffers.length === 0) {
      setBestCategoryOffer(null)
      setIsCategoryOfferApplied(false)
      setShowCategoryOfferModal(false)
      categoryOfferPromptShownRef.current = false
      return
    }

    let best = null
    cart.forEach((item) => {
      const offer = getCategoryOfferForCartItem(item)
      if (offer && offer.percent > 0) {
        if (!best || offer.percent > best.percent) {
          best = offer
        }
      }
    })

    setBestCategoryOffer(best)

    // Decide whether to show offer popup based on per‑user per‑day usage limit
    if (!best || isCategoryOfferApplied || categoryOfferPromptShownRef.current) {
      return
    }

    try {
      const userId = userProfile?.id || userProfile?._id || null
      if (!userId) return

      const today = new Date().toISOString().slice(0, 10)
      const key = `adminOfferUsage:${userId}:${best.id}:${today}`
      const raw = localStorage.getItem(key)
      const usedCount = raw ? parseInt(raw, 10) || 0 : 0
      const limit =
        typeof best.usageLimitPerDay === "number" && best.usageLimitPerDay >= 0
          ? best.usageLimitPerDay
          : 1

      if (limit > 0 && usedCount >= limit) {
        // User has already used this offer max times today → don't show popup
        setHasUsedAdminOfferToday(true)
        return
      }

      setHasUsedAdminOfferToday(false)
      setShowCategoryOfferModal(true)
      categoryOfferPromptShownRef.current = true
    } catch (e) {
      // Failed to determine admin offer usage
    }
  }, [cart, categoryOffers, isCategoryOfferApplied, userProfile])

  // Calculate delivery fee based on order value ranges
  const calculateDeliveryFeeFromRanges = (orderValue) => {
    // Check if coupon provides free delivery
    if (appliedCoupon?.freeDelivery) {
      return 0
    }

    // PRIORITY: Check delivery fee ranges FIRST if configured
    // This ensures admin-configured ranges take precedence over freeDeliveryThreshold
    if (feeSettings.deliveryFeeRanges && Array.isArray(feeSettings.deliveryFeeRanges) && feeSettings.deliveryFeeRanges.length > 0) {
      // Sort ranges by min value to ensure proper checking
      const sortedRanges = [...feeSettings.deliveryFeeRanges].sort((a, b) => a.min - b.min)
      
      // Find matching range (orderValue >= min && orderValue < max)
      // For the last range, we check orderValue >= min && orderValue <= max
      for (let i = 0; i < sortedRanges.length; i++) {
        const range = sortedRanges[i]
        const isLastRange = i === sortedRanges.length - 1
        
        if (isLastRange) {
          // Last range: include max value
          if (orderValue >= range.min && orderValue <= range.max) {
            return range.fee // Return the fee from range (could be 0 if admin set it to 0)
          }
        } else {
          // Other ranges: exclude max value (handled by next range)
          if (orderValue >= range.min && orderValue < range.max) {
            return range.fee // Return the fee from range (could be 0 if admin set it to 0)
          }
        }
      }
    }

    // Only check freeDeliveryThreshold if NO ranges are configured or NO range matched
    // This allows admin to set ranges that override the freeDeliveryThreshold
    if (orderValue >= feeSettings.freeDeliveryThreshold) {
      return 0
    }

    // Fallback to default delivery fee if no range matches and order value is below threshold
    return feeSettings.deliveryFee
  }

  // Use backend pricing if available, otherwise fallback to database settings
  const subtotal = pricing?.subtotal || cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
  const deliveryFee = pricing?.deliveryFee ?? calculateDeliveryFeeFromRanges(subtotal)
  const platformFee = pricing?.platformFee || feeSettings.platformFee
  const gstCharges = pricing?.tax || Math.round(subtotal * (feeSettings.gstRate / 100))

  // Base discount from backend pricing or applied coupon (restaurant‑impacting discount)
  const baseDiscount = pricing?.discount || (appliedCoupon ? Math.min(appliedCoupon.discount, subtotal * 0.5) : 0)

  // Total bill before any discounts (items + delivery + platform + GST)
  const totalBeforeAnyDiscount = subtotal + deliveryFee + platformFee + gstCharges

  // Extra discount funded by admin/category offer – percentage of full bill, should NOT reduce restaurant share
  const categoryOfferDiscount =
    isCategoryOfferApplied && bestCategoryOffer && totalBeforeAnyDiscount > 0
      ? (totalBeforeAnyDiscount * bestCategoryOffer.percent) / 100
      : 0

  // Total that restaurant sees (used for commission) still based on baseDiscount only
  const totalAfterBaseDiscount = totalBeforeAnyDiscount - baseDiscount

  // User actually pays after admin offer as well
  const total = Math.max(0, totalAfterBaseDiscount - categoryOfferDiscount)

  // Pay at Hotel rule: allow only up to the configured limit
  const PAY_AT_HOTEL_MAX_TOTAL = businessSettings.payAtHotelMaxTotal
  const canShowPayAtHotel = Boolean(isHotelOrder) && Number(total || 0) <= PAY_AT_HOTEL_MAX_TOTAL

  // If total crosses limit, force selection back to online
  useEffect(() => {
    if (!canShowPayAtHotel && selectedPaymentMethod === "pay_at_hotel") {
      setSelectedPaymentMethod("razorpay")
    }
  }, [canShowPayAtHotel, selectedPaymentMethod])

  const MIN_ORDER_AMOUNT = businessSettings.minOrderAmount || 0
  const isBelowMinOrderAmount = total < MIN_ORDER_AMOUNT

  const savings =
    (pricing?.savings || (baseDiscount + (subtotal > 500 ? 32 : 0))) +
    categoryOfferDiscount

  // Restaurant name and slug from data or cart (slug for Edit navigation)
  const restaurantName = restaurantData?.name || cart[0]?.restaurant || "Restaurant"
  const restaurantSlug = restaurantData?.slug || restaurantData?.name?.toLowerCase?.()?.replace(/\s+/g, "-") || cart[0]?.restaurant?.toLowerCase?.()?.replace(/\s+/g, "-") || ""

  // Handler to select address by label (Live, Home, Office, Other)
  const handleSelectAddressByLabel = async (label) => {
    try {
      if (label === "Live") {
        // Reset manual override and sync with live location
        setHasManuallySelectedDeliveryAddress(false)
        setCheckoutDeliveryAddress(defaultAddress)
        sessionStorage.removeItem("checkout_delivery_address")
        sessionStorage.removeItem("checkout_delivery_address_manual")
        toast.success("Switched to live location")
        return
      }

      // Find address with matching label
      const address = addresses.find(addr => addr.label === label)

      if (!address) {
        toast.error(`No ${label} address found. Please add an address first.`)
        return
      }

      // Checkout-only: selecting an address should NOT update global (Home page) location.
      // Just update the address used for pricing + order payload on this page.
      const formattedAddress = address.additionalDetails
        ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
        : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`

      setCheckoutDeliveryAddress({
        ...address,
        formattedAddress,
        address: address.address || formattedAddress,
      })
      setHasManuallySelectedDeliveryAddress(true)
      toast.success(`${label} selected for this order`)
    } catch (error) {
      toast.error(`Failed to select ${label} address. Please try again.`)
    }
  }

  const handleApplyCoupon = async (coupon) => {
    if (subtotal >= coupon.minOrder) {
      setAppliedCoupon(coupon)
      setCouponCode(coupon.code)
      setShowCoupons(false)

      // Recalculate pricing with new coupon
      if (cart.length > 0 && checkoutDeliveryAddress) {
        try {
          const items = cart.map(item => ({
            itemId: item.productId || item.id,
            name: item.selectedVariantName ? `${item.productName || item.name} - ${item.selectedVariantName}` : (item.productName || item.name),
            price: item.variantPrice ?? item.price,
            quantity: item.quantity || 1,
            image: item.image,
            description: item.description,
            isVeg: item.isVeg !== false,
            selectedVariantId: item.selectedVariantId || null,
            selectedVariantName: item.selectedVariantName || null,
          }))

          const response = await orderAPI.calculateOrder({
            items,
            restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
            deliveryAddress: checkoutDeliveryAddress,
            couponCode: coupon.code,
            deliveryFleet: deliveryFleet || 'standard'
          })

          if (response?.data?.success && response?.data?.data?.pricing) {
            setPricing(response.data.data.pricing)
          }
        } catch (error) {
          // Error recalculating pricing
        }
      }
    }
  }


  const handleRemoveCoupon = async () => {
    setAppliedCoupon(null)
    setCouponCode("")

    // Recalculate pricing without coupon
    if (cart.length > 0 && checkoutDeliveryAddress) {
      try {
        const items = cart.map(item => ({
          itemId: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity || 1,
          image: item.image,
          description: item.description,
          isVeg: item.isVeg !== false
        }))

        const response = await orderAPI.calculateOrder({
          items,
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
          deliveryAddress: checkoutDeliveryAddress,
          couponCode: null,
          deliveryFleet: deliveryFleet || 'standard'
        })

        if (response?.data?.success && response?.data?.data?.pricing) {
          setPricing(response.data.data.pricing)
        }
      } catch (error) {
        // Error recalculating pricing
      }
    }
  }


  const handlePlaceOrder = async () => {
    // 1. Initial cart and field validation
    if (cart.length === 0) {
      alert("Your cart is empty")
      return
    }

    const minAmount = businessSettings.minOrderAmount || 0
    if (total < minAmount) {
      toast.error(`Minimum order amount is ₹${minAmount}. Add ₹${(minAmount - total).toFixed(2)} more to place order.`)
      return
    }

    if (isHotelOrder) {
      if (!roomNumber || roomNumber.trim() === '') {
        setRoomError(true)
        const element = document.getElementById('room-number-input')
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setTimeout(() => element.focus(), 500)
        }
        return;
      }
    }

    // Validate additional address (make it mandatory)
    if (!additionalAddress || !additionalAddress.trim()) {
      setAddressError(true)
      // Scroll and focus the field
      const element = document.getElementById('additional-address-input')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => element.focus(), 500)
      }
      return
    }

    setIsPlacingOrder(true)

    let finalAddress = checkoutDeliveryAddress;

    // 2. Fetch/force fresh live GPS coordinates if user is using Live location and no manual override is active
    if (!hasManuallySelectedDeliveryAddress && !isManualOverrideEnabled) {
      const toastId = toast.loading("Verifying your precise live location...")
      try {
        const freshLoc = await requestLocation()
        toast.dismiss(toastId)

        if (freshLoc && freshLoc.latitude && freshLoc.longitude && !isPlaceholder(freshLoc.formattedAddress)) {
          finalAddress = {
            ...checkoutDeliveryAddress,
            label: "Live", // Explicitly set label to Live for live location
            formattedAddress: freshLoc.formattedAddress,
            address: isPlaceholder(freshLoc.address) ? "" : (freshLoc.address || freshLoc.formattedAddress),
            street: isPlaceholder(freshLoc.street) ? "" : (freshLoc.street || freshLoc.address || ""),
            city: isPlaceholder(freshLoc.city) ? "" : (freshLoc.city || ""),
            state: isPlaceholder(freshLoc.state) ? "" : (freshLoc.state || ""),
            zipCode: isPlaceholder(freshLoc.postalCode) ? "" : (freshLoc.postalCode || ""),
            area: isPlaceholder(freshLoc.area) ? "" : (freshLoc.area || ""),
            location: {
              coordinates: [freshLoc.longitude, freshLoc.latitude]
            }
          }
          setCheckoutDeliveryAddress(finalAddress)
          toast.success("Precise location verified!")
        } else {
          // If fresh location is a placeholder or has invalid coordinates, but the existing checkoutDeliveryAddress is valid,
          // we gracefully fall back to the existing one!
          const existingCoords = checkoutDeliveryAddress?.location?.coordinates;
          const existingHasValidCoords = existingCoords && Array.isArray(existingCoords) && existingCoords.length === 2 && (existingCoords[0] !== 0 || existingCoords[1] !== 0);
          const existingIsNotPlaceholder = checkoutDeliveryAddress && !isPlaceholder(checkoutDeliveryAddress.formattedAddress);

          if (existingIsNotPlaceholder && existingHasValidCoords) {
            finalAddress = checkoutDeliveryAddress;
            console.log("Fresh location verification returned placeholder, falling back to existing valid checkout address");
          } else {
            toast.error("Could not acquire precise GPS coordinates. Please allow location permissions or select a saved address.")
            setIsPlacingOrder(false)
            return
          }
        }
      } catch (err) {
        toast.dismiss(toastId)
        
        // If fresh location fetch throws an error, but the existing checkoutDeliveryAddress is valid,
        // we gracefully fall back to the existing one!
        const existingCoords = checkoutDeliveryAddress?.location?.coordinates;
        const existingHasValidCoords = existingCoords && Array.isArray(existingCoords) && existingCoords.length === 2 && (existingCoords[0] !== 0 || existingCoords[1] !== 0);
        const existingIsNotPlaceholder = checkoutDeliveryAddress && !isPlaceholder(checkoutDeliveryAddress.formattedAddress);

        if (existingIsNotPlaceholder && existingHasValidCoords) {
          finalAddress = checkoutDeliveryAddress;
          console.log("Fresh location verification failed, falling back to existing valid checkout address");
        } else {
          toast.error("Location access denied or timed out. Please allow location permissions or select a saved address.")
          setIsPlacingOrder(false)
          return
        }
      }
    }

    // 3. Final validation on coordinates and placeholders
    const isAddrPlaceholder = finalAddress && (
      isPlaceholder(finalAddress.formattedAddress)
    );

    const coords = finalAddress?.location?.coordinates;
    const hasValidCoords = coords && Array.isArray(coords) && coords.length === 2 && (coords[0] !== 0 || coords[1] !== 0);

    if (!finalAddress || isAddrPlaceholder || !hasValidCoords) {
      setDeliveryAddressError(true)
      const element = document.getElementById('delivery-address-section')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      toast.error("Please select a valid delivery address with precise map location.")
      setIsPlacingOrder(false)
      return
    }

    // Clear delivery address error if it was set
    if (deliveryAddressError) setDeliveryAddressError(false)

    // Use API_BASE_URL from config (supports both dev and production)

    try {
      // Ensure couponCode is included in pricing; total must include delivery fee and other charges
      const orderPricing = pricing ? { ...pricing } : {
        subtotal,
        deliveryFee,
        tax: gstCharges,
        platformFee,
        discount: baseDiscount, // restaurant-impacting discount only
        total,
        couponCode: appliedCoupon?.code || null
      };
      if (orderPricing.deliveryFee == null) orderPricing.deliveryFee = deliveryFee;
      const withDelivery = (orderPricing.subtotal || 0) - (orderPricing.discount || 0) + (orderPricing.deliveryFee || 0) + (orderPricing.platformFee ?? platformFee) + (orderPricing.tax ?? gstCharges);
      // Total user pays should equal "total" (after admin offer). Override with our computed total.
      orderPricing.total = Math.round(total);

      if (!orderPricing.couponCode && appliedCoupon?.code) {
        orderPricing.couponCode = appliedCoupon.code;
      }

      // Attach admin-funded offer info (category offer) so admin reports & backend know it's platform-funded
      if (isCategoryOfferApplied && bestCategoryOffer && categoryOfferDiscount > 0) {
        orderPricing.adminOfferDiscount = categoryOfferDiscount;
        orderPricing.adminOfferName = bestCategoryOffer.name;
        orderPricing.adminOfferPercent = bestCategoryOffer.percent;
        if (bestCategoryOffer.id) {
          orderPricing.adminOfferCategoryId = bestCategoryOffer.id;
        }
      }

      // Include all cart items (main items + addons)
      // Note: Addons are added as separate cart items when user clicks the + button
      const orderItems = cart.map(item => ({
        itemId: item.productId || item.id,
        name: item.selectedVariantName
          ? `${item.productName || item.name} - ${item.selectedVariantName}`
          : (item.productName || item.name),
        price: item.variantPrice ?? item.price,
        quantity: item.quantity || 1,
        image: item.image || "",
        description: item.description || "",
        isVeg: item.isVeg !== false,
        selectedVariantId: item.selectedVariantId || null,
        selectedVariantName: item.selectedVariantName || null,
      }))

      // Check API base URL before making request (for debugging)
      const fullUrl = `${API_BASE_URL}${API_ENDPOINTS.ORDER.CREATE}`;

      // CRITICAL: Validate restaurant ID before placing order
      // Ensure we're using the correct restaurant from restaurantData (most reliable)
      const finalRestaurantId = restaurantData?.restaurantId || restaurantData?._id || null;
      const finalRestaurantName = restaurantData?.name || null;

      if (!finalRestaurantId) {
        toast.error('Restaurant information is missing. Please refresh the page and try again.', {
          duration: 5000
        });
        setIsPlacingOrder(false);
        return;
      }

      // FIXED: Validate restaurant location before placing order
      const hasRestaurantLocation = restaurantData?.location && 
        restaurantData.location.coordinates && 
        Array.isArray(restaurantData.location.coordinates) &&
        restaurantData.location.coordinates.length >= 2 &&
        restaurantData.location.coordinates[0] !== 0 &&
        restaurantData.location.coordinates[1] !== 0

      if (!hasRestaurantLocation) {
        toast.error("This restaurant's location is not configured. Please contact support or try ordering from another restaurant.", {
          duration: 7000,
          style: {
            background: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            fontSize: '14px',
            padding: '12px 16px',
          }
        });
        setIsPlacingOrder(false);
        return;
      }

      // CRITICAL: Validate that ALL cart items belong to the SAME restaurant
      const cartRestaurantIds = cart
        .map(item => item.restaurantId)
        .filter(Boolean)
        .map(id => String(id).trim()); // Normalize to string and trim

      const cartRestaurantNames = cart
        .map(item => item.restaurant)
        .filter(Boolean)
        .map(name => name.trim().toLowerCase()); // Normalize names

      // Get unique values (after normalization)
      const uniqueRestaurantIds = [...new Set(cartRestaurantIds)];
      const uniqueRestaurantNames = [...new Set(cartRestaurantNames)];

      // Check if cart has items from multiple restaurants
      // Note: If restaurant names match, allow even if IDs differ (same restaurant, different ID format)
      if (uniqueRestaurantNames.length > 1) {
        // Different restaurant names = definitely different restaurants
        // Automatically clean cart to keep items from the restaurant matching restaurantData
        if (finalRestaurantId && finalRestaurantName) {
          cleanCartForRestaurant(finalRestaurantId, finalRestaurantName);
          toast.error('Cart contained items from different restaurants. Items from other restaurants have been removed.');
        } else {
          // If restaurantData is not available, keep items from first restaurant in cart
          const firstRestaurantId = cart[0]?.restaurantId;
          const firstRestaurantName = cart[0]?.restaurant;
          if (firstRestaurantId && firstRestaurantName) {
            cleanCartForRestaurant(firstRestaurantId, firstRestaurantName);
            toast.error('Cart contained items from different restaurants. Items from other restaurants have been removed.');
          } else {
            toast.error('Cart contains items from different restaurants. Please clear cart and try again.');
          }
        }

        setIsPlacingOrder(false);
        return;
      }

      // If restaurant names match but IDs differ, that's OK (same restaurant, different ID format)
      // But log a warning in development
      if (uniqueRestaurantIds.length > 1 && uniqueRestaurantNames.length === 1) {
        // Cart items have different restaurant IDs but same name - OK if IDs are in different formats
      }

      // Validate that cart items' restaurantId matches the restaurantData
      if (cartRestaurantIds.length > 0) {
        const cartRestaurantId = cartRestaurantIds[0];

        // Check if cart restaurantId matches restaurantData
        const cartIdStr = String(cartRestaurantId).trim();
        const finalIdStr = String(finalRestaurantId).trim();
        const dataIdStr = restaurantData?._id?.toString()?.trim();
        const dataRestaurantIdStr = restaurantData?.restaurantId?.toString()?.trim();

        const restaurantIdMatches =
          cartIdStr === finalIdStr ||
          cartIdStr === dataIdStr ||
          cartIdStr === dataRestaurantIdStr;

        if (!restaurantIdMatches) {
          alert(`Error: Cart items belong to a different restaurant. Please clear cart and try again.`);
          setIsPlacingOrder(false);
          return;
        }
      }

      // Validate restaurant name matches (only if IDs don't provide a strong match)
      // If IDs match, we allow name mismatch (e.g. after rename)
      if (cartRestaurantNames.length > 0 && finalRestaurantName) {
        const cartRestaurantName = cartRestaurantNames[0];
        const cartIdStr = cartRestaurantIds[0] ? String(cartRestaurantIds[0]).trim() : '';
        const finalIdStr = finalRestaurantId ? String(finalRestaurantId).trim() : '';

        const idsMatch = cartIdStr && finalIdStr && cartIdStr === finalIdStr;

        if (!idsMatch && cartRestaurantName.toLowerCase().trim() !== finalRestaurantName.toLowerCase().trim()) {
          alert(`Error: Cart items belong to "${cartRestaurantName}" but restaurant data shows "${finalRestaurantName}". Please refresh the page and try again.`);
          setIsPlacingOrder(false);
          return;
        }
      }

      // Order validation passed

      // FINAL VALIDATION: Double-check restaurantId before sending to backend
      const cartRestaurantId = cart[0]?.restaurantId;
      const cartIdStr = cartRestaurantId ? String(cartRestaurantId).trim() : '';
      const finalIdStr = finalRestaurantId ? String(finalRestaurantId).trim() : '';
      const dataIdStr = restaurantData?._id?.toString()?.trim();
      const dataRestaurantIdStr = restaurantData?.restaurantId?.toString()?.trim();

      const finalValidationMatches =
        cartIdStr === finalIdStr ||
        cartIdStr === dataIdStr ||
        cartIdStr === dataRestaurantIdStr;

      if (cartIdStr && !finalValidationMatches) {
        alert('Error: Restaurant information mismatch detected. Please refresh the page and try again.');
        setIsPlacingOrder(false);
        return;
      }

      // Get hotel reference from sessionStorage if available (set when user scans hotel QR code)
      const hotelReference = sessionStorage.getItem("hotelReference");
      const hotelName = sessionStorage.getItem("hotelReferenceName");

      const orderPayload = {
        items: orderItems,
        address: finalAddress,
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        pricing: orderPricing,
        deliveryFleet: deliveryFleet,
        note: note,
        sendCutlery: true,
        paymentMethod: selectedPaymentMethod,
        zoneId: zoneId, // CRITICAL: Pass zoneId for strict zone validation
        additionalAddress: additionalAddress.trim(), // Additional address details (required)
        userName: String(contactName || "").trim(),
        userPhone: String(contactPhone || "").trim(),
        // Hotel order fields
        hotelReference: isHotelOrder ? sessionStorage.getItem('hotelReference') : null,
        hotelName: isHotelOrder ? sessionStorage.getItem('hotelReferenceName') : null,
        roomNumber: isHotelOrder ? roomNumber.trim() : null
      };


      // Check wallet balance if wallet payment selected
      if (selectedPaymentMethod === "wallet" && walletBalance < total) {
        toast.error(`Insufficient wallet balance. Required: ₹${total.toFixed(2)}, Available: ₹${walletBalance.toFixed(2)}`)
        setIsPlacingOrder(false)
        return
      }

      // Online payment via intent flow (do NOT create order yet)
      if (selectedPaymentMethod === "razorpay" || !selectedPaymentMethod) {
        const intentResp = await paymentAPI.createIntent(orderPayload)
        const { intentId, razorpay } = intentResp.data.data

        if (!razorpay || !razorpay.orderId || !razorpay.key) {
          throw new Error("Failed to initialize payment")
        }

        // Get user info for Razorpay prefill (use edited contact values if provided)
        const userInfo = userProfile || {}
        const userEmail = userInfo.email || ""
        const userName = String(contactName || userInfo.name || userInfo.fullName || "").trim()
        const userPhone = normalizePhone10(contactPhone || userInfo.phone || defaultAddress?.phone || "")
        const formattedPhone = normalizePhone10(userPhone)
        const companyName = await getCompanyNameAsync()

        await initRazorpayPayment({
          key: razorpay.key,
          amount: razorpay.amount,
          currency: razorpay.currency || 'INR',
          order_id: razorpay.orderId,
          name: companyName,
          description: `Order Payment - ₹${(razorpay.amount / 100).toFixed(2)}`,
          prefill: { name: userName, email: userEmail, contact: formattedPhone },
          notes: {
            userId: userInfo.id || "",
            restaurantId: restaurantId || "unknown"
          },
          handler: async (response) => {
            try {
              // Server-side verify; backend will create Order
              const verify = await paymentAPI.verify({
                intentId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })

              if (verify?.data?.success && verify?.data?.data?.orderId) {
                const createdOrderId = verify.data.data.orderId
                // Success UI and cleanups
                toast.success("Payment successful. Order placed!")
                clearCheckoutDrafts()
                setPlacedOrderId(createdOrderId)
                setShowOrderSuccess(true)
                window.dispatchEvent(new Event('orderStatusUpdated'))

                // Clear cart and checkout-specific address overrides
                clearCart()
                sessionStorage.removeItem("checkout_delivery_address")
                sessionStorage.removeItem("checkout_delivery_address_manual")
                setHasManuallySelectedDeliveryAddress(false)

                setIsPlacingOrder(false)
                return
              }

              // Try reconcile once if verify didn't return order id
              try {
                const recon = await paymentAPI.reconcile({
                  intentId,
                  razorpay_payment_id: response.razorpay_payment_id
                })
                if (recon?.data?.success && recon?.data?.data?.orderId) {
                  const oid = recon.data.data.orderId
                  toast.success("Payment successful. Order placed!")
                  clearCheckoutDrafts()
                  setPlacedOrderId(oid)
                  setShowOrderSuccess(true)
                  window.dispatchEvent(new Event('orderStatusUpdated'))
                  clearCart()
                  setIsPlacingOrder(false)
                  return
                }
              } catch (_) {
                // fall through to polling
              }

              // Poll as fallback if server responded without order id
              const started = Date.now()
              const poll = async () => {
                const st = await paymentAPI.getStatus(intentId)
                const s = st?.data?.data?.status
                const oid = st?.data?.data?.orderId
                if (s === 'succeeded' && oid) {
                  toast.success("Order placed!")
                  clearCheckoutDrafts()
                  setPlacedOrderId(oid)
                  setShowOrderSuccess(true)
                  window.dispatchEvent(new Event('orderStatusUpdated'))
                  clearCart()
                  setIsPlacingOrder(false)
                } else if (s === 'failed') {
                  alert("Payment failed. Please try again.")
                  setIsPlacingOrder(false)
                } else if (Date.now() - started < 90000) {
                  setTimeout(poll, 2000)
                } else {
                  alert("Payment processing. Please check Orders after a minute.")
                  setIsPlacingOrder(false)
                }
              }
              await poll()
            } catch (err) {
              const msg = err?.response?.data?.message || err?.message || "Payment verification failed."
              alert(msg)
              setIsPlacingOrder(false)
            }
          },
          onError: (error) => {
            if (error?.code !== 'PAYMENT_CANCELLED' && error?.message !== 'PAYMENT_CANCELLED') {
              const errorMessage = error?.description || error?.message || "Payment failed. Please try again."
              alert(errorMessage)
            }
            setIsPlacingOrder(false)
          },
          onClose: () => {
            setIsPlacingOrder(false)
          }
        })
        return
      }

      // Create order in backend (non-online flows)
      const orderResponse = await orderAPI.createOrder(orderPayload)

      const { order, razorpay } = orderResponse.data.data

      // Clear hotel reference after successful order (optional - you can keep it for tracking)
      // Uncomment below if you want to clear hotel reference after order
      // if (hotelReference) {
      //   sessionStorage.removeItem("hotelReference")
      //   sessionStorage.removeItem("hotelReferenceName")
      //   sessionStorage.removeItem("hotelReferenceTimestamp")
      // }

      // Pay at Hotel flow: order placed with payment at hotel
      if (selectedPaymentMethod === "pay_at_hotel") {
        const hotelName = localStorage.getItem("hotelReferenceName") || "Hotel"
        toast.success(`Order placed - Pay at ${hotelName}`)
        try {
          createOrder({
            id: order.id || order._id || order.orderId,
            orderId: order.orderId,
            status: order.status || "confirmed",
            restaurant: restaurantName,
            restaurantName,
            items: order.items || cart,
            estimatedDeliveryTime: order.estimatedDeliveryTime || restaurantData?.estimatedDeliveryTime || 35,
            createdAt: order.createdAt
          })
        } catch (e) {
          // Failed to create local tracking order
        }
        if (isCategoryOfferApplied && categoryOfferDiscount > 0 && bestCategoryOffer) {
          markAdminOfferUsedToday(bestCategoryOffer.id, bestCategoryOffer.usageLimitPerDay)
        }
        setPlacedOrderId(order?.orderId || order?.id || null)
        clearCheckoutDrafts()
        setShowOrderSuccess(true)
        // Notify home screen tracking card to refresh active orders
        window.dispatchEvent(new Event('orderStatusUpdated'))
        
        // Clear cart and checkout-specific address overrides
        clearCart()
        sessionStorage.removeItem("checkout_delivery_address")
        sessionStorage.removeItem("checkout_delivery_address_manual")
        setHasManuallySelectedDeliveryAddress(false)
        
        setIsPlacingOrder(false)
        return
      }

      // Wallet flow: order placed with wallet payment (already processed in backend)
      if (selectedPaymentMethod === "wallet") {
        toast.success("Order placed with Wallet payment")
        try {
          createOrder({
            id: order.id || order._id || order.orderId,
            orderId: order.orderId,
            status: order.status || "confirmed",
            restaurant: restaurantName,
            restaurantName,
            items: order.items || cart,
            estimatedDeliveryTime: order.estimatedDeliveryTime || restaurantData?.estimatedDeliveryTime || 35,
            createdAt: order.createdAt
          })
        } catch (e) {
          // Failed to create local tracking order
        }
        setPlacedOrderId(order?.orderId || order?.id || null)
        clearCheckoutDrafts()
        setShowOrderSuccess(true)
        // Notify home screen tracking card to refresh active orders
        window.dispatchEvent(new Event('orderStatusUpdated'))
        
        // Clear cart and checkout-specific address overrides
        clearCart()
        sessionStorage.removeItem("checkout_delivery_address")
        sessionStorage.removeItem("checkout_delivery_address_manual")
        setHasManuallySelectedDeliveryAddress(false)
        
        setIsPlacingOrder(false)
        // Refresh wallet balance
        try {
          const walletResponse = await userAPI.getWallet()
          if (walletResponse?.data?.success && walletResponse?.data?.data?.wallet) {
            setWalletBalance(walletResponse.data.data.wallet.balance || 0)
          }
        } catch (error) {
          // Error refreshing wallet balance
        }
        if (isCategoryOfferApplied && categoryOfferDiscount > 0 && bestCategoryOffer) {
          markAdminOfferUsedToday(bestCategoryOffer.id, bestCategoryOffer.usageLimitPerDay)
        }
        return
      }

      if (!razorpay || !razorpay.orderId || !razorpay.key) {
        throw new Error(razorpay ? "Razorpay payment gateway is not configured. Please contact support." : "Failed to initialize payment")
      }

      // Get user info for Razorpay prefill (use edited contact values if provided)
      const userInfo = userProfile || {}
      const userEmail = userInfo.email || ""
      const userName = String(contactName || userInfo.name || userInfo.fullName || "").trim()
      const userPhone = normalizePhone10(contactPhone || userInfo.phone || defaultAddress?.phone || "")

      // Format phone number (remove non-digits, take last 10 digits)
      const formattedPhone = normalizePhone10(userPhone)

      // Get company name for Razorpay
      const companyName = await getCompanyNameAsync()

      // Initialize Razorpay payment
      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount, // Already in paise from backend
        currency: razorpay.currency || 'INR',
        order_id: razorpay.orderId,
        name: companyName,
        description: `Order ${order.orderId} - ₹${(razorpay.amount / 100).toFixed(2)}`,
        prefill: {
          name: userName,
          email: userEmail,
          contact: formattedPhone
        },
        notes: {
          orderId: order.orderId,
          userId: userInfo.id || "",
          restaurantId: restaurantId || "unknown"
        },
        handler: async (response) => {
          try {
            // Verify payment with backend
            const verifyResponse = await orderAPI.verifyPayment({
              orderId: order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            })

            if (verifyResponse.data.success) {
              // Payment successful
              try {
                createOrder({
                  id: order.id || order._id || order.orderId,
                  orderId: order.orderId,
                  status: order.status || "confirmed",
                  restaurant: restaurantName,
                  restaurantName,
                  items: order.items || cart,
                  estimatedDeliveryTime: order.estimatedDeliveryTime || restaurantData?.estimatedDeliveryTime || 35,
                  createdAt: order.createdAt
                })
              } catch (e) {
                // Failed to create local tracking order
              }
              if (isCategoryOfferApplied && categoryOfferDiscount > 0 && bestCategoryOffer) {
                markAdminOfferUsedToday(bestCategoryOffer.id, bestCategoryOffer.usageLimitPerDay)
              }
              clearCheckoutDrafts()
              setPlacedOrderId(order.orderId)
              setShowOrderSuccess(true)
              // Notify home screen tracking card to refresh active orders
              window.dispatchEvent(new Event('orderStatusUpdated'))
              clearCart()
              setIsPlacingOrder(false)
            } else {
              throw new Error(verifyResponse.data.message || "Payment verification failed")
            }
          } catch (error) {
            const errorMessage = error?.response?.data?.message || error?.message || "Payment verification failed. Please contact support."
            alert(errorMessage)
            setIsPlacingOrder(false)
          }
        },
        onError: (error) => {
          // Don't show alert for user cancellation
          if (error?.code !== 'PAYMENT_CANCELLED' && error?.message !== 'PAYMENT_CANCELLED') {
            const errorMessage = error?.description || error?.message || "Payment failed. Please try again."
            alert(errorMessage)
          }
          setIsPlacingOrder(false)
        },
        onClose: () => {
          setIsPlacingOrder(false)
        }
      })
    } catch (error) {
      let errorMessage = "Failed to create order. Please try again."

      // Handle network errors
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        const backendUrl = API_BASE_URL.replace('/api', '');
        errorMessage = `Network Error: Cannot connect to backend server.\n\n` +
          `Expected backend URL: ${backendUrl}\n\n` +
          `Please check:\n` +
          `1. Backend server is running\n` +
          `2. Backend is accessible at ${backendUrl}\n` +
          `3. Check browser console (F12) for more details\n\n` +
          `If backend is not running, start it with:\n` +
          `cd backend && npm start`
      }
      // Handle timeout errors
      else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = "Request timed out. The server is taking too long to respond. Please try again."
      }
      // Handle other axios errors
      else if (error.response) {
        // Server responded with error status
        const backendMessage = error.response.data?.message || `Server error: ${error.response.status}`
        
        // FIXED: Handle restaurant location error specifically with user-friendly message
        if (backendMessage.includes('location') && (backendMessage.includes('not set') || backendMessage.includes('not found'))) {
          errorMessage = "This restaurant's location is not configured. Please contact support or try ordering from another restaurant."
          toast.error(errorMessage, {
            duration: 7000,
            style: {
              background: '#fee2e2',
              color: '#991b1b',
              border: '1px solid #fecaca',
              fontSize: '14px',
              padding: '12px 16px',
            }
          })
          setIsPlacingOrder(false)
          return
        } else if (error.response.status === 400) {
          // Bad request - validation error
          errorMessage = backendMessage

          // If backend says admin offer usage limit is reached, mark it locally so popup doesn't show again
          if (
            backendMessage.toLowerCase().includes("already used") &&
            backendMessage.toLowerCase().includes("offer")
          ) {
            if (bestCategoryOffer) {
              markAdminOfferUsedToday(
                bestCategoryOffer.id,
                bestCategoryOffer.usageLimitPerDay,
              )
            }
            setIsCategoryOfferApplied(false)
          }
          toast.error(errorMessage, {
            duration: 6000,
            style: {
              background: '#fee2e2',
              color: '#991b1b',
              border: '1px solid #fecaca',
              fontSize: '14px',
              padding: '12px 16px',
            }
          })
          setIsPlacingOrder(false)
          return
        } else if (error.response.status === 403) {
          // Forbidden - zone/availability error
          errorMessage = backendMessage
          toast.error(errorMessage, {
            duration: 6000,
            style: {
              background: '#fee2e2',
              color: '#991b1b',
              border: '1px solid #fecaca',
              fontSize: '14px',
              padding: '12px 16px',
            }
          })
          setIsPlacingOrder(false)
          return
        } else {
          errorMessage = backendMessage
        }
      }
      // Handle other errors
      else if (error.message) {
        errorMessage = error.message
      }

      // Use toast for user-friendly errors, alert for critical network errors
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        alert(errorMessage)
      } else {
        toast.error(errorMessage, {
          duration: 5000,
          style: {
            background: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            fontSize: '14px',
            padding: '12px 16px',
          }
        })
      }
      setIsPlacingOrder(false)
    }
  }

  const handleGoToOrders = () => {
    // Kick off a last-moment preload (non-blocking) to minimize first render latency
    try {
      preloadGoogleMaps(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
    } catch {}
    setShowOrderSuccess(false)
    navigate(`/user/orders/${placedOrderId}?confirmed=true`)
  }

  // Layout helpers - behave differently for hotel QR orders vs normal orders
  const scrollContainerClass = isHotelOrder
    ? "pt-16 md:pt-20 pb-16 md:pb-24"
    : "overflow-y-auto overflow-x-hidden pt-16 md:pt-20 pb-44 md:pb-56"

  const scrollContainerStyle = isHotelOrder
    ? {
        WebkitOverflowScrolling: "touch",
        paddingTop: "64px", // Header height
        paddingBottom: "75px", // Space for sticky payment + button (reduced more)
      }
    : {
        height: "100vh",
        WebkitOverflowScrolling: "touch",
        paddingTop: "64px", // Header height
        paddingBottom: "200px", // Bottom button height + extra space
      }

  // Empty cart state - but don't show if order success or placing order modal is active
  if (cart.length === 0 && !showOrderSuccess && !showPlacingOrder) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
        <div className="bg-white dark:bg-[#1a1a1a] border-b dark:border-gray-800 sticky top-0 z-10">
          <div className="flex items-center gap-3 px-4 pt-7 pb-3">
            <Link onClick={() => navigate(-1)}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <span className="font-semibold text-gray-800 dark:text-white">Cart</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Utensils className="h-10 w-10 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">Your cart is empty</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">Add items from a restaurant to start a new order</p>
          <Link to="/">
            <Button className="bg-primary-orange hover:opacity-90 text-white">Browse Restaurants</Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <div className="relative bg-white dark:bg-[#0a0a0a]">
      {/* Header - Fixed at top */}
      <div className="bg-white dark:bg-[#1a1a1a] border-b dark:border-gray-800 fixed top-0 left-0 right-0 z-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between px-3 md:px-6 pt-10 pb-2 md:pt-9 md:pb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Link onClick={() => navigate(-1)}>
                <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8 flex-shrink-0">
                  <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
              </Link>
              <div className="min-w-0">
                <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">{restaurantName}</p>
                <p className="text-sm md:text-base font-medium text-gray-800 dark:text-white truncate">
                  {restaurantData?.estimatedDeliveryTime || "10-15 mins"} to <span className="font-semibold">Location</span>
                  <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs md:text-sm">{checkoutDeliveryAddress ? (formatFullAddress(checkoutDeliveryAddress) || checkoutDeliveryAddress?.formattedAddress || checkoutDeliveryAddress?.address || checkoutDeliveryAddress?.city || "Select address") : "Select address"}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div
        className={scrollContainerClass}
        style={scrollContainerStyle}
      >
        {/* FIXED: Restaurant Location Missing Alert */}
        {restaurantData && (!restaurantData.location || 
          !restaurantData.location.coordinates || 
          !Array.isArray(restaurantData.location.coordinates) ||
          restaurantData.location.coordinates.length < 2 ||
          restaurantData.location.coordinates[0] === 0 ||
          restaurantData.location.coordinates[1] === 0) && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-4 mt-4 mb-4 rounded-lg px-4 py-3 bg-red-50 border border-red-200"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-800 mb-1">
                  Restaurant location is not set
                </p>
                <p className="text-xs text-red-700">
                  This restaurant's location is not configured. Please contact support or try ordering from another restaurant.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Savings Banner */}
        {savings > 0 && (
          <div className="bg-blue-100 dark:bg-blue-900/20 px-4 md:px-6 py-2 md:py-3 flex-shrink-0">
            <div className="max-w-7xl mx-auto">
              <p className="text-sm md:text-base font-medium text-blue-800 dark:text-blue-200">
                🎉 You saved ₹{savings} on this order
              </p>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 px-4 md:px-6 py-4 md:py-6">
            {/* Left Column - Cart Items and Details */}
            <div className="lg:col-span-2 space-y-2 md:space-y-4">
              {/* Cart Items */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <div className="space-y-3 md:space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 md:gap-4">
                      {/* Veg/Non-veg indicator */}
                      <div className={`w-4 h-4 md:w-5 md:h-5 border-2 ${item.isVeg !== false ? 'border-green-600' : 'border-red-600'} flex items-center justify-center mt-1 flex-shrink-0`}>
                        <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${item.isVeg !== false ? 'bg-green-600' : 'bg-red-600'}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm md:text-base font-medium text-gray-800 dark:text-gray-200 leading-tight">
                          {item.selectedVariantName
                            ? `${item.productName || item.name} - ${item.selectedVariantName}`
                            : (item.productName || item.name)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 md:gap-4">
                        {/* Edit: go to restaurant menu to change variant/options */}
                        {restaurantSlug && (
                          <button
                            type="button"
                            onClick={() => navigate(`/user/restaurants/${restaurantSlug}${(item.productId || (item.id && String(item.id).split("__")[0])) ? `?dish=${item.productId || String(item.id).split("__")[0]}` : ""}`)}
                            className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
                            title="Edit item"
                            aria-label="Edit item"
                          >
                            <Pencil className="h-4 w-4 md:h-4 md:w-4" />
                          </button>
                        )}
                        {/* Quantity controls */}
                        <div className="flex items-center border border-red-600 dark:border-red-500 rounded">
                          <button
                            className="px-2 md:px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3 md:h-4 md:w-4" />
                          </button>
                          <span className="px-2 md:px-3 text-sm md:text-base font-semibold text-red-600 dark:text-red-400 min-w-[20px] md:min-w-[24px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            className="px-2 md:px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3 md:h-4 md:w-4" />
                          </button>
                        </div>

                        <p className="text-sm md:text-base font-medium text-gray-800 dark:text-gray-200 min-w-[50px] md:min-w-[70px] text-right">
                          ₹{((item.price || 0) * (item.quantity || 1)).toFixed(0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add more items */}
                <button
                  onClick={() => navigate(-1)}
                  className="flex items-center gap-2 mt-4 md:mt-6 text-red-600 dark:text-red-400"
                >
                  <Plus className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="text-sm md:text-base font-medium">Add more items</span>
                </button>
              </div>


              {/* Note */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <button
                  onClick={() => setShowNoteInput(!showNoteInput)}
                  className="w-full flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 border border-gray-200 dark:border-gray-700 rounded-lg md:rounded-xl text-sm md:text-base text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <FileText className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="truncate">{note || "Add a note for the restaurant"}</span>
                </button>
              </div>

              {/* Note Input */}
              {showNoteInput && (
                <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add cooking instructions, allergies, etc."
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg md:rounded-xl p-3 md:p-4 text-sm md:text-base resize-none h-20 md:h-24 focus:outline-none focus:border-red-600 dark:focus:border-red-500 bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100"
                  />
                </div>
              )}

              {/* Complete your meal section - Approved Addons */}
              {addons.length > 0 && (
                <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                  <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                    <div className="w-6 h-6 md:w-8 md:h-8 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
                      <span className="text-xs md:text-base">🍽️</span>
                    </div>
                    <span className="text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200">Complete your meal with</span>
                  </div>
                  {loadingAddons ? (
                    <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 -mx-4 md:-mx-6 px-4 md:px-6 scrollbar-hide">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex-shrink-0 w-28 md:w-36 animate-pulse">
                          <div className="w-full h-28 md:h-36 bg-gray-200 dark:bg-gray-700 rounded-lg md:rounded-xl" />
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mt-1 w-2/3" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 -mx-4 md:-mx-6 px-4 md:px-6 scrollbar-hide">
                      {addons.map((addon) => (
                        <div key={addon.id} className="flex-shrink-0 w-28 md:w-36">
                          <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg md:rounded-xl overflow-hidden">
                            <img
                              src={addon.image || (addon.images && addon.images[0]) || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop"}
                              alt={addon.name}
                              className="w-full h-28 md:h-36 object-cover rounded-lg md:rounded-xl"
                              onError={(e) => {
                                e.target.onerror = null
                                e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop"
                              }}
                            />
                            <div className="absolute top-1 md:top-2 left-1 md:left-2">
                              <div className="w-3.5 h-3.5 md:w-4 md:h-4 bg-white border border-green-600 flex items-center justify-center rounded">
                                <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-600" />
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                // Use restaurant info from existing cart items to ensure format consistency
                                const cartRestaurantId = cart[0]?.restaurantId || restaurantId;
                                const cartRestaurantName = cart[0]?.restaurant || restaurantName;

                                if (!cartRestaurantId || !cartRestaurantName) {
                                  // Cannot add addon: Missing restaurant information
                                  toast.error('Restaurant information is missing. Please refresh the page.');
                                  return;
                                }

                                addToCart({
                                  id: addon.id,
                                  name: addon.name,
                                  price: addon.price,
                                  image: addon.image || (addon.images && addon.images[0]) || "",
                                  description: addon.description || "",
                                  isVeg: true,
                                  restaurant: cartRestaurantName,
                                  restaurantId: cartRestaurantId
                                });
                              }}
                              className="absolute bottom-1 md:bottom-2 right-1 md:right-2 w-6 h-6 md:w-7 md:h-7 bg-white border border-red-600 rounded flex items-center justify-center shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5 md:h-4 md:w-4 text-red-600" />
                            </button>
                          </div>
                          <p className="text-xs md:text-sm font-medium text-gray-800 dark:text-gray-200 mt-1.5 md:mt-2 line-clamp-2 leading-tight">{addon.name}</p>
                          {addon.description && (
                            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{addon.description}</p>
                          )}
                          <p className="text-xs md:text-sm text-gray-800 dark:text-gray-200 font-semibold mt-0.5">₹{addon.price}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Coupon Section */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg md:rounded-xl p-3 md:p-4">
                    <div className="flex items-center gap-2 md:gap-3">
                      <Tag className="h-4 w-4 md:h-5 md:w-5 text-red-600 dark:text-red-400" />
                      <div>
                        <p className="text-sm md:text-base font-medium text-red-700 dark:text-red-300">'{appliedCoupon.code}' applied</p>
                        <p className="text-xs md:text-sm text-red-600 dark:text-red-400">You saved ₹{baseDiscount}</p>
                      </div>
                    </div>
                    <button onClick={handleRemoveCoupon} className="text-gray-500 dark:text-gray-400 text-xs md:text-sm font-medium">Remove</button>
                  </div>
                ) : loadingCoupons ? (
                  <div className="flex items-center gap-2 md:gap-3">
                    <Percent className="h-4 w-4 md:h-5 md:w-5 text-gray-600 dark:text-gray-400" />
                    <p className="text-sm md:text-base text-gray-500 dark:text-gray-400">Loading coupons...</p>
                  </div>
                ) : availableCoupons.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 md:gap-3">
                        <Percent className="h-4 w-4 md:h-5 md:w-5 text-gray-600 dark:text-gray-400" />
                        <div>
                          <p className="text-sm md:text-base font-medium text-gray-800 dark:text-gray-200">
                            Save ₹{availableCoupons[0].discount} with '{availableCoupons[0].code}'
                          </p>
                          {availableCoupons.length > 1 && (
                            <button onClick={() => setShowCoupons(!showCoupons)} className="text-xs md:text-sm text-blue-600 dark:text-blue-400 font-medium">
                              View all coupons →
                            </button>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 md:h-8 text-xs md:text-sm border-red-600 dark:border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => handleApplyCoupon(availableCoupons[0])}
                        disabled={subtotal < availableCoupons[0].minOrder}
                      >
                        {subtotal < availableCoupons[0].minOrder ? `Min ₹${availableCoupons[0].minOrder}` : 'APPLY'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 md:gap-3">
                    <Percent className="h-4 w-4 md:h-5 md:w-5 text-gray-600 dark:text-gray-400" />
                    <p className="text-sm md:text-base text-gray-500 dark:text-gray-400">No coupons available</p>
                  </div>
                )}

                {/* Coupons List */}
                {showCoupons && !appliedCoupon && availableCoupons.length > 0 && (
                  <div className="mt-3 md:mt-4 space-y-2 md:space-y-3 border-t dark:border-gray-700 pt-3 md:pt-4">
                    {availableCoupons.map((coupon) => (
                      <div key={coupon.code} className="flex items-center justify-between py-2 md:py-3 border-b border-dashed dark:border-gray-700 last:border-0">
                        <div>
                          <p className="text-sm md:text-base font-medium text-gray-800 dark:text-gray-200">{coupon.code}</p>
                          <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">{coupon.description}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 md:h-7 text-xs md:text-sm border-red-600 dark:border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => handleApplyCoupon(coupon)}
                          disabled={subtotal < coupon.minOrder}
                        >
                          {subtotal < coupon.minOrder ? `Min ₹${coupon.minOrder}` : 'APPLY'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delivery Time */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <div className="flex items-center gap-3 md:gap-4">
                  <Clock className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm md:text-base text-gray-800 dark:text-gray-200">Delivery in <span className="font-semibold">{restaurantData?.estimatedDeliveryTime || "10-15 mins"}</span></p>
                  </div>
                </div>
              </div>

              {/* Delivery Address */}
              <div id="delivery-address-section" className={`bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl transition-all ${deliveryAddressError ? 'ring-2 ring-red-500 shadow-lg shadow-red-500/10' : ''}`}>
                <Link className="flex items-center justify-between" onClick={() => deliveryAddressError && setDeliveryAddressError(false)}>
                  <div className="flex items-center gap-3 md:gap-4">
                    <MapPin className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
                    <div className="flex-1">
                      <p className="text-sm md:text-base text-gray-800 dark:text-gray-200">
                        Delivery at <span className="font-semibold">Location</span>
                      </p>
                      <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                        {checkoutDeliveryAddress ? (formatFullAddress(checkoutDeliveryAddress) || checkoutDeliveryAddress?.formattedAddress || checkoutDeliveryAddress?.address || "Add delivery address") : "Add delivery address"}
                      </p>
                      {/* Address Selection Buttons */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {["Live", "Home", "Office", "Other"].map((label) => {
                          const isLive = label === "Live"
                          const addressExists = isLive || addresses.some(addr => addr.label === label)
                          const isSelected = isLive 
                            ? !hasManuallySelectedDeliveryAddress 
                            : hasManuallySelectedDeliveryAddress && String(checkoutDeliveryAddress?.label || "").toLowerCase() === String(label).toLowerCase()
                          
                          return (
                            <button
                              key={label}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleSelectAddressByLabel(label)
                              }}
                              disabled={!addressExists}
                              className={`text-xs md:text-sm px-2 md:px-3 py-1 md:py-1.5 rounded-md border transition-all ${
                                !addressExists
                                  ? 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                                  : isSelected
                                    ? isLive 
                                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                      : 'border-green-600 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 bg-white dark:bg-[#1a1a1a]'
                              } ${isLive && !isSelected ? 'border-blue-200 text-blue-500' : ''}`}
                            >
                              {isLive ? "📍 Live" : label}
                            </button>
                          )
                        })}
                      </div>
                      {deliveryAddressError && (
                        <p className="text-red-500 text-[11px] md:text-xs mt-2 font-medium flex items-center gap-1 animate-bounce">
                          <AlertCircle className="h-3 w-3" />
                          Please select a delivery address
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
                </Link>
              </div>

              {/* Additional Address (Required) */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <div className="flex items-center gap-3 md:gap-4 mb-2">
                  <MapPin className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
                  <label className="text-sm md:text-base text-gray-800 dark:text-gray-200 font-medium flex items-center gap-1">
                    <span>Additional Address</span>
                    <span className="text-red-500">*</span>
                  </label>
                </div>
                <motion.div
                  animate={addressError ? { x: [-2, 2, -2, 2, 0], transition: { duration: 0.4 } } : {}}
                >
                  <Input
                    id="additional-address-input"
                    type="text"
                    placeholder="Enter additional address details (e.g., Flat no., Floor, Landmark)"
                    value={additionalAddress}
                    onChange={(e) => {
                      setAdditionalAddress(e.target.value)
                      if (addressError) setAddressError(false)
                    }}
                    className={`w-full text-sm md:text-base text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-red-500 dark:focus:border-red-500 ${addressError ? 'border-red-500 ring-2 ring-red-500 shadow-sm' : ''}`}
                  />
                </motion.div>
                {addressError && (
                  <p className="text-red-500 text-[11px] md:text-xs mt-1.5 font-bold flex items-center gap-1">
                    <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded uppercase">Required</span>
                    Please fill this field to proceed
                  </p>
                )}
              </div>

              {/* Contact */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                    <Phone className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                    {!isEditingContact ? (
                      <p className="text-sm md:text-base text-gray-800 dark:text-gray-200 truncate">
                        {contactName || userProfile?.name || "Your Name"},{" "}
                        <span className="font-medium">
                          {contactPhone || userProfile?.phone || "+91-XXXXXXXXXX"}
                        </span>
                      </p>
                    ) : (
                      <div className="flex-1 min-w-0 space-y-2">
                        <Input
                          type="text"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          placeholder="Enter your name"
                          className="w-full text-sm md:text-base text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        />
                        <Input
                          type="tel"
                          inputMode="numeric"
                          value={contactPhone}
                          onChange={(e) => {
                            // Keep only digits and enforce 10-digit Indian mobile format.
                            // If user pastes +91XXXXXXXXXX, take the LAST 10 digits.
                            const digitsOnly = String(e.target.value || "").replace(/\D/g, "")
                            const phone10 = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly
                            setContactPhone(phone10)
                          }}
                          placeholder="Enter mobile number"
                          maxLength={10}
                          className="w-full text-sm md:text-base text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setIsEditingContact(false)
                              try {
                                const raw = sessionStorage.getItem("checkout_contact_draft")
                                if (raw) {
                                  const parsed = JSON.parse(raw)
                                  setContactName(parsed?.name || "")
                                  setContactPhone(parsed?.phone || "")
                                } else {
                                  setContactName(contactName)
                                  setContactPhone(contactPhone)
                                }
                              } catch {
                                setContactName(contactName)
                                setContactPhone(contactPhone)
                              }
                            }}
                            disabled={isSavingContact}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 bg-primary-orange hover:opacity-90 text-white"
                            onClick={handleSaveContact}
                            disabled={isSavingContact}
                          >
                            {isSavingContact ? "Saving..." : "Save"}
                          </Button>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Mobile number should be 10 digits (we’ll auto-format it).
                        </p>
                      </div>
                    )}
                  </div>

                  {!isEditingContact ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsEditingContact(true)}
                      className="h-8 w-8 flex-shrink-0"
                      title="Edit contact"
                    >
                      <Pencil className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </Button>
                  ) : null}
                </div>

                {/* Checkout-only: no profile linkage from this editor */}
              </div>

              {/* Total Bill card removed (duplicate of Order Summary) */}
              <div className="mb-8 md:mb-12" />

            </div>

            {/* Right Column - Order Summary (Desktop) */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-24 space-y-4 md:space-y-6">
                {/* Bill Summary Card */}
                <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-4 md:py-5 rounded-lg md:rounded-xl border border-gray-200 dark:border-gray-700">
                  <h3 className="text-base md:text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 md:mb-4">Order Summary</h3>
                  <div className="space-y-2 md:space-y-3">
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">Item Total</span>
                      <span className="text-gray-800 dark:text-gray-200">₹{subtotal.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">Delivery Fee</span>
                      <span className={deliveryFee === 0 ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-gray-200"}>
                        {deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">Platform Fee</span>
                      <span className="text-gray-800 dark:text-gray-200">₹{platformFee}</span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">GST</span>
                      <span className="text-gray-800 dark:text-gray-200">₹{gstCharges}</span>
                    </div>
                    {baseDiscount > 0 && (
                      <div className="flex justify-between text-sm md:text-base text-red-600 dark:text-red-400">
                        <span>Discount</span>
                      <span>-₹{baseDiscount}</span>
                      </div>
                    )}
                    {categoryOfferDiscount > 0 && bestCategoryOffer && (
                      <div className="flex justify-between text-sm md:text-base text-red-600 dark:text-red-400">
                        <span>{bestCategoryOffer.name} Offer</span>
                        <span>-₹{categoryOfferDiscount}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base md:text-lg font-bold pt-3 md:pt-4 border-t dark:border-gray-700">
                      <span>Total</span>
                      <span className="text-green-600 dark:text-green-400">₹{total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sticky - Place Order (hotel QR orders use sticky, others use fixed) */}
      <div
        className={`bg-white dark:bg-[#1a1a1a] border-t dark:border-gray-800 shadow-lg z-30 flex-shrink-0 ${
          isHotelOrder ? "sticky bottom-0" : "fixed bottom-0 left-0 right-0"
        }`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="px-4 md:px-6 py-3 md:py-4">
            <div className="w-full max-w-md md:max-w-lg mx-auto">
              {/* Pay Using */}
              <div className={`mb-2 md:mb-3 ${isHotelOrder ? "flex justify-center" : "flex items-center justify-between"}`}>
                <div className="relative w-full">
                  <div className="mb-4">
                    {isHotelOrder ? (
                      // Hotel orders: show 2 exclusive toggle buttons (single-select)
                      canShowPayAtHotel ? (
                        <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                          <button
                            type="button"
                            onClick={() => setSelectedPaymentMethod("razorpay")}
                            className={`w-full px-3 py-3 rounded-lg border text-sm font-semibold transition-colors ${
                              selectedPaymentMethod === "razorpay"
                                ? "bg-orange-600 border-orange-600 text-white"
                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:border-orange-400"
                            }`}
                          >
                            💰 Online Payment
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPaymentMethod("pay_at_hotel")}
                            className={`w-full px-3 py-3 rounded-lg border text-sm font-semibold transition-colors ${
                              selectedPaymentMethod === "pay_at_hotel"
                                ? "bg-orange-600 border-orange-600 text-white"
                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:border-orange-400"
                            }`}
                          >
                            💳 Pay at Hotel
                          </button>
                        </div>
                      ) : (
                        <div className="max-w-md mx-auto">
                          <button
                            type="button"
                            onClick={() => setSelectedPaymentMethod("razorpay")}
                            className={`w-full px-3 py-3 rounded-lg border text-sm font-semibold transition-colors ${
                              selectedPaymentMethod === "razorpay"
                                ? "bg-orange-600 border-orange-600 text-white"
                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:border-orange-400"
                            }`}
                          >
                            💰 Online Payment
                          </button>
                        </div>
                      )
                    ) : (
                      // Regular orders: show 2 exclusive toggle buttons (single-select)
                      <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                        <button
                          type="button"
                          onClick={() => setSelectedPaymentMethod("razorpay")}
                          className={`w-full px-3 py-3 rounded-lg border text-sm font-semibold transition-colors ${
                            selectedPaymentMethod === "razorpay"
                              ? "bg-orange-600 border-orange-600 text-white"
                              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:border-orange-400"
                          }`}
                        >
                          💰 Online
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPaymentMethod("wallet")}
                          className={`w-full px-3 py-3 rounded-lg border text-sm font-semibold transition-colors ${
                            selectedPaymentMethod === "wallet"
                              ? "bg-orange-600 border-orange-600 text-white"
                              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:border-orange-400"
                          }`}
                        >
                          👛 Wallet{isLoadingWallet ? " (Loading...)" : ` (₹${walletBalance || 0})`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Room Number Field - Shown for all hotel orders (online + pay-at-hotel) */}
                  {isHotelOrder && (
                    <div className="mb-3 p-3 bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 rounded-lg border-2 border-orange-200 dark:border-orange-700 max-w-md mx-auto">
                      <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                        🏨 Room Number <span className="text-red-500">*</span>
                      </label>
                      <motion.div
                        animate={roomError ? { x: [-2, 2, -2, 2, 0], transition: { duration: 0.4 } } : {}}
                      >
                        <Input
                          id="room-number-input"
                          type="text"
                          placeholder="e.g., 101, 202, etc."
                          value={roomNumber}
                          onChange={(e) => {
                            setRoomNumber(e.target.value)
                            if (roomError) setRoomError(false)
                          }}
                          className={`w-full bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-red-500 focus:border-red-500 ${roomError ? 'border-red-500 ring-2 ring-red-500 shadow-sm' : ''}`}
                        />
                      </motion.div>
                      {roomError && (
                        <p className="text-red-500 text-[11px] mt-1.5 font-bold flex items-center gap-1">
                          <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded uppercase">Missing</span>
                          Please enter room number
                        </p>
                      )}   
                      {isHotelOrder && hotelName && (
                        <p className="mt-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                          📍 Ordering from: {hotelName}
                        </p>
                      )}
                    </div>
                  )}
                  {/* Chevron removed: payment is now buttons (no dropdown) */}
                </div>
              </div>

              {isBelowMinOrderAmount && (
                <div className="mb-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-xs text-center font-medium">
                  ⚠️ Order amount must be at least ₹{MIN_ORDER_AMOUNT} to checkout. Add ₹{(MIN_ORDER_AMOUNT - total).toFixed(2)} more.
                </div>
              )}

              <Button
                size="lg"
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || (selectedPaymentMethod === "wallet" && walletBalance < total) || isBelowMinOrderAmount}
                className="w-full bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white px-6 md:px-10 h-14 md:h-16 rounded-lg md:rounded-xl text-base md:text-lg font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(selectedPaymentMethod === "razorpay" || selectedPaymentMethod === "wallet") && !isBelowMinOrderAmount && (
                  <div className="text-left mr-3 md:mr-4">
                    <p className="text-sm md:text-base opacity-90">₹{total.toFixed(2)}</p>
                    <p className="text-xs md:text-sm opacity-75">TOTAL</p>
                  </div>
                )}
                <span className="font-bold text-base md:text-lg">
                  {isPlacingOrder
                    ? "Processing..."
                    : isBelowMinOrderAmount
                      ? `Minimum Order ₹${MIN_ORDER_AMOUNT} Required`
                      : selectedPaymentMethod === "razorpay"
                        ? "Place Order"
                        : selectedPaymentMethod === "wallet"
                          ? walletBalance >= total
                            ? "Place Order"
                            : "Insufficient Balance"
                          : selectedPaymentMethod === "pay_at_hotel"
                            ? "Place Order (Pay at Hotel)"
                            : "Place Order"}
                </span>
                <ChevronRight className="h-5 w-5 md:h-6 md:w-6 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Category Offer Apply Modal */}
      {showCategoryOfferModal && bestCategoryOffer && (
        <div className="fixed inset-0 z-[55] h-screen w-screen overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowCategoryOfferModal(false)}
          />

          {/* Modal Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ animation: "slideUpModal 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg md:text-xl font-bold text-gray-900">
                  Apply {bestCategoryOffer.name} offer?
                </h2>
                <button
                  onClick={() => setShowCategoryOfferModal(false)}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>

              <p className="text-sm md:text-base text-gray-600 mb-4">
                You have items from <span className="font-semibold">{bestCategoryOffer.name}</span> category in your cart.
                Apply <span className="font-semibold">{bestCategoryOffer.percent}% FLAT OFF</span> on your total bill.
              </p>

              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
                <p className="text-sm text-green-800 font-medium">
                  Estimated savings: ₹{((totalBeforeAnyDiscount * bestCategoryOffer.percent) / 100).toFixed(2)}
                </p>
              </div>

              <div className="flex gap-3 mt-2">
                <Button
                  variant="outline"
                  className="flex-1 border-gray-300 text-gray-700"
                  onClick={() => {
                    setIsCategoryOfferApplied(false)
                    setShowCategoryOfferModal(false)
                  }}
                >
                  Not now
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    setIsCategoryOfferApplied(true)
                    setShowCategoryOfferModal(false)
                    triggerOfferConfetti()
                  }}
                >
                  Apply offer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Placing Order Modal */}
      {showPlacingOrder && (
        <div className="fixed inset-0 z-[60] h-screen w-screen overflow-hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ animation: 'slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className="px-6 py-8">
              {/* Title */}
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Placing your order</h2>

              {/* Payment Info */}
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-xl border border-gray-200 flex items-center justify-center bg-white shadow-sm">
                  <CreditCard className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedPaymentMethod === "razorpay"
                      ? `Pay ₹${total.toFixed(2)} online (Razorpay)`
                      : selectedPaymentMethod === "wallet"
                        ? `Pay ₹${total.toFixed(2)} from Wallet`
                        : selectedPaymentMethod === "pay_at_hotel"
                          ? `Pay at hotel on arrival`
                          : `Pay online`}
                  </p>
                </div>
              </div>

              {/* Delivery Address */}
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-xl border border-gray-200 flex items-center justify-center bg-gray-50">
                  <svg className="w-7 h-7 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path d="M9 22V12h6v10" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">Delivering to Location</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {checkoutDeliveryAddress ? (formatFullAddress(checkoutDeliveryAddress) || checkoutDeliveryAddress?.formattedAddress || checkoutDeliveryAddress?.address || "Address") : "Add address"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {checkoutDeliveryAddress ? (formatFullAddress(checkoutDeliveryAddress) || "Address") : "Address"}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative mb-6">
                <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-100 ease-linear"
                    style={{
                      width: `${orderProgress}%`,
                      boxShadow: '0 0 10px rgba(34, 197, 94, 0.5)'
                    }}
                  />
                </div>
                {/* Animated shimmer effect */}
                <div
                  className="absolute inset-0 h-2.5 rounded-full overflow-hidden pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    animation: 'shimmer 1.5s infinite',
                    width: `${orderProgress}%`
                  }}
                />
              </div>

              {/* Cancel Button */}
              <button
                onClick={() => {
                  setShowPlacingOrder(false)
                  setIsPlacingOrder(false)
                }}
                className="w-full text-right"
              >
                <span className="text-green-600 font-semibold text-base hover:text-green-700 transition-colors">
                  CANCEL
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Success Celebration Page */}
      {showOrderSuccess && (
        <div
          className="fixed inset-0 z-[70] bg-white flex flex-col items-center justify-center h-screen w-screen overflow-hidden"
          style={{ animation: 'fadeIn 0.3s ease-out' }}
        >
          {/* Confetti Background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Animated confetti pieces */}
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
          <div className="relative z-10 flex flex-col items-center px-6">
            {/* Success Tick Circle */}
            <div
              className="relative mb-8"
              style={{ animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}
            >
              {/* Outer ring animation */}
              <div
                className="absolute inset-0 w-32 h-32 rounded-full border-4 border-green-500"
                style={{
                  animation: 'ringPulse 1.5s ease-out infinite',
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
                  style={{ animation: 'checkDraw 0.5s ease-out 0.5s both' }}
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
                    top: '50%',
                    left: '50%',
                    animation: `sparkle 0.6s ease-out ${0.3 + i * 0.1}s both`,
                    transform: `rotate(${i * 60}deg) translateY(-80px)`,
                  }}
                />
              ))}
            </div>

            {/* Location Info */}
            <div
              className="text-center"
              style={{ animation: 'slideUp 0.5s ease-out 0.6s both' }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-5 h-5 text-red-500">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {checkoutDeliveryAddress?.city || "Your Location"}
                </h2>
              </div>
              <p className="text-gray-500 text-base">
                {checkoutDeliveryAddress ? (formatFullAddress(checkoutDeliveryAddress) || checkoutDeliveryAddress?.formattedAddress || checkoutDeliveryAddress?.address || "Delivery Address") : "Delivery Address"}
              </p>
            </div>

            {/* Order Placed Message */}
            <div
              className="mt-12 text-center"
              style={{ animation: 'slideUp 0.5s ease-out 0.8s both' }}
            >
              <h3 className="text-3xl font-bold text-green-600 mb-2">Order Placed!</h3>
              <p className="text-gray-600">Your delicious food is on its way</p>
            </div>

            {/* Action Button */}
            <button
              onClick={handleGoToOrders}
              className="mt-10 bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-12 rounded-xl shadow-lg transition-all hover:shadow-xl hover:scale-105"
              style={{ animation: 'slideUp 0.5s ease-out 1s both' }}
            >
              Track Your Order
            </button>
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style>{`
        @keyframes fadeInBackdrop {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUpBannerSmooth {
          from {
            transform: translateY(100%) scale(0.95);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes slideUpBanner {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes shimmerBanner {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes scaleInBounce {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes pulseRing {
          0% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.4);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
        @keyframes checkMarkDraw {
          0% {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            stroke-dasharray: 100;
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }
        @keyframes slideUpFull {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes slideUpModal {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
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
        .animate-slideUpFull {
          animation: slideUpFull 0.3s ease-out;
        }
        .check-path {
          stroke-dasharray: 100;
          stroke-dashoffset: 0;
        }
      `}</style>
    </div>
  )
}
