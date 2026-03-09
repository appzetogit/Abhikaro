import { useState, useEffect, useRef, useMemo } from "react"
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
import { useLocation as useUserLocation } from "../../hooks/useLocation"
import { useZone } from "../../hooks/useZone"
import { orderAPI, restaurantAPI, adminAPI, userAPI, API_ENDPOINTS } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api/config"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"


// Removed hardcoded suggested items - now fetching approved addons from backend
// Coupons will be fetched from backend based on items in cart

/**
 * Format full address string from address object
 * @param {Object} address - Address object with street, additionalDetails, city, state, zipCode, or formattedAddress
 * @returns {String} Formatted address string
 */
const formatFullAddress = (address) => {
  if (!address) return ""

  // Priority 1: Use formattedAddress if available (for live location addresses)
  if (address.formattedAddress && address.formattedAddress !== "Select location") {
    return address.formattedAddress
  }

  // Priority 2: Build address from parts
  const addressParts = []
  if (address.street) addressParts.push(address.street)
  if (address.additionalDetails) addressParts.push(address.additionalDetails)
  if (address.city) addressParts.push(address.city)
  if (address.state) addressParts.push(address.state)
  if (address.zipCode) addressParts.push(address.zipCode)

  if (addressParts.length > 0) {
    return addressParts.join(', ')
  }

  // Priority 3: Use address field if available
  if (address.address && address.address !== "Select location") {
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
  const { location: currentLocation } = useUserLocation() // Get live location address
  const { zoneId } = useZone(currentLocation) // Get user's zone

  const [showCoupons, setShowCoupons] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponCode, setCouponCode] = useState("")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("razorpay") // razorpay | wallet | pay_at_hotel (COD disabled)
  const [hasHotelReference, setHasHotelReference] = useState(false) // Track if hotel reference exists
  const [isHotelOrder, setIsHotelOrder] = useState(false) // Track if this is a hotel order
  const [roomNumber, setRoomNumber] = useState('') // Room number for pay_at_hotel
  const [hotelName, setHotelName] = useState('') // Hotel name for display
  const [walletBalance, setWalletBalance] = useState(0)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)
  const [deliveryFleet, setDeliveryFleet] = useState("standard") // Default to standard fleet
  const [showFleetOptions, setShowFleetOptions] = useState(false)
  const [note, setNote] = useState("")
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [sendCutlery, setSendCutlery] = useState(true)
  const [additionalAddress, setAdditionalAddress] = useState("")
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
  const defaultAddress = currentLocation?.formattedAddress && currentLocation.formattedAddress !== "Select location"
    ? {
      ...savedAddress,
      formattedAddress: currentLocation.formattedAddress,
      address: currentLocation.address || currentLocation.formattedAddress,
      street: currentLocation.street || currentLocation.address,
      city: currentLocation.city,
      state: currentLocation.state,
      zipCode: currentLocation.postalCode,
      area: currentLocation.area,
      location: currentLocation.latitude && currentLocation.longitude ? {
        coordinates: [currentLocation.longitude, currentLocation.latitude]
      } : savedAddress?.location
    }
    : savedAddress
  const defaultPayment = getDefaultPaymentMethod()

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
      // Auto-select pay_at_hotel for hotel orders
      setSelectedPaymentMethod('pay_at_hotel');
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
      if (cart.length === 0 || !defaultAddress) {
        setPricing(null)
        return
      }

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
          deliveryAddress: defaultAddress,
          couponCode: appliedCoupon?.code || couponCode || null,
          deliveryFleet: deliveryFleet || 'standard'
        })

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
        // Network errors or 404 errors - silently handle, fallback to frontend calculation
        // Fallback to frontend calculation if backend fails
        setPricing(null)
      } finally {
        setLoadingPricing(false)
      }
    }

    calculatePricing()
  }, [cart, defaultAddress, appliedCoupon, couponCode, deliveryFleet, restaurantId])

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

  const savings =
    (pricing?.savings || (baseDiscount + (subtotal > 500 ? 32 : 0))) +
    categoryOfferDiscount

  // Restaurant name and slug from data or cart (slug for Edit navigation)
  const restaurantName = restaurantData?.name || cart[0]?.restaurant || "Restaurant"
  const restaurantSlug = restaurantData?.slug || restaurantData?.name?.toLowerCase?.()?.replace(/\s+/g, "-") || cart[0]?.restaurant?.toLowerCase?.()?.replace(/\s+/g, "-") || ""

  // Handler to select address by label (Home, Office, Other)
  const handleSelectAddressByLabel = async (label) => {
    try {
      // Find address with matching label
      const address = addresses.find(addr => addr.label === label)

      if (!address) {
        toast.error(`No ${label} address found. Please add an address first.`)
        return
      }

      // Get coordinates from address location
      const coordinates = address.location?.coordinates || []
      const longitude = coordinates[0]
      const latitude = coordinates[1]

      if (!latitude || !longitude) {
        toast.error(`Invalid coordinates for ${label} address`)
        return
      }

      // Update location in backend
      await userAPI.updateLocation({
        latitude,
        longitude,
        address: `${address.street}, ${address.city}`,
        city: address.city,
        state: address.state,
        area: address.additionalDetails || "",
        formattedAddress: address.additionalDetails
          ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
          : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
      })

      // Update the location in localStorage
      const locationData = {
        city: address.city,
        state: address.state,
        address: `${address.street}, ${address.city}`,
        area: address.additionalDetails || "",
        zipCode: address.zipCode,
        latitude,
        longitude,
        formattedAddress: address.additionalDetails
          ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
          : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
      }
      localStorage.setItem("userLocation", JSON.stringify(locationData))

      toast.success(`${label} address selected!`)

      // Force page reload to update location
      window.location.reload()
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
      if (cart.length > 0 && defaultAddress) {
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
            deliveryAddress: defaultAddress,
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
    if (cart.length > 0 && defaultAddress) {
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
          deliveryAddress: defaultAddress,
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
    if (!defaultAddress) {
      alert("Please add a delivery address")
      return
    }

    // Validate additional address (make it mandatory)
    if (!additionalAddress || !additionalAddress.trim()) {
      toast.error("Please enter additional address details (e.g., Flat no., Floor, Landmark)")
      return
    }

    if (cart.length === 0) {
      alert("Your cart is empty")
      return
    }

    // Validate room number for pay_at_hotel
    if (selectedPaymentMethod === 'pay_at_hotel') {
      if (!roomNumber || roomNumber.trim() === '') {
        toast.error('Please enter your room number');
        return;
      }
    }

    setIsPlacingOrder(true)

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
        address: defaultAddress,
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        pricing: orderPricing,
        deliveryFleet: deliveryFleet,
        note: note,
        sendCutlery: sendCutlery,
        paymentMethod: selectedPaymentMethod,
        zoneId: zoneId, // CRITICAL: Pass zoneId for strict zone validation
        additionalAddress: additionalAddress.trim(), // Additional address details (required)
        // Hotel order fields
        hotelReference: isHotelOrder ? sessionStorage.getItem('hotelReference') : null,
        hotelName: isHotelOrder ? sessionStorage.getItem('hotelReferenceName') : null,
        roomNumber: selectedPaymentMethod === 'pay_at_hotel' ? roomNumber : null
      };


      // Check wallet balance if wallet payment selected
      if (selectedPaymentMethod === "wallet" && walletBalance < total) {
        toast.error(`Insufficient wallet balance. Required: ₹${total.toFixed(2)}, Available: ₹${walletBalance.toFixed(2)}`)
        setIsPlacingOrder(false)
        return
      }

      // Create order in backend
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
        setShowOrderSuccess(true)
        // Notify home screen tracking card to refresh active orders
        window.dispatchEvent(new Event('orderStatusUpdated'))
        clearCart()
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
        setShowOrderSuccess(true)
        // Notify home screen tracking card to refresh active orders
        window.dispatchEvent(new Event('orderStatusUpdated'))
        clearCart()
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

      // Get user info for Razorpay prefill
      const userInfo = userProfile || {}
      const userPhone = userInfo.phone || defaultAddress?.phone || ""
      const userEmail = userInfo.email || ""
      const userName = userInfo.name || ""

      // Format phone number (remove non-digits, take last 10 digits)
      const formattedPhone = userPhone.replace(/\D/g, "").slice(-10)

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
    setShowOrderSuccess(false)
    navigate(`/user/orders/${placedOrderId}?confirmed=true`)
  }

  // Layout helpers - behave differently for hotel QR orders vs normal orders
  const scrollContainerClass = isHotelOrder
    ? "pt-16 md:pt-20 pb-72 md:pb-80"
    : "overflow-y-auto overflow-x-hidden pt-16 md:pt-20 pb-44 md:pb-56"

  const scrollContainerStyle = isHotelOrder
    ? {
        WebkitOverflowScrolling: "touch",
        paddingTop: "64px", // Header height
        paddingBottom: "260px", // Extra space below Order Summary + button
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
          <div className="flex items-center gap-3 px-4 py-3">
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
          <Link>
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
          <div className="flex items-center justify-between px-3 md:px-6 py-2 md:py-3">
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
                  <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs md:text-sm">{defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || defaultAddress?.city || "Select address") : "Select address"}</span>
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8 flex-shrink-0">
              <Share2 className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
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


              {/* Note & Cutlery */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl flex flex-col sm:flex-row gap-2 md:gap-3">
                <button
                  onClick={() => setShowNoteInput(!showNoteInput)}
                  className="flex-1 flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 border border-gray-200 dark:border-gray-700 rounded-lg md:rounded-xl text-sm md:text-base text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <FileText className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="truncate">{note || "Add a note for the restaurant"}</span>
                </button>
                <button
                  onClick={() => setSendCutlery(!sendCutlery)}
                  className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 border rounded-lg md:rounded-xl text-sm md:text-base ${sendCutlery ? 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300' : 'border-red-600 dark:border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'}`}
                >
                  <Utensils className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="whitespace-nowrap">{sendCutlery ? "Don't send cutlery" : "No cutlery"}</span>
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
                        <p className="text-xs md:text-sm text-red-600 dark:text-red-400">You saved ₹{discount}</p>
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
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <Link className="flex items-center justify-between">
                  <div className="flex items-center gap-3 md:gap-4">
                    <MapPin className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
                    <div className="flex-1">
                      <p className="text-sm md:text-base text-gray-800 dark:text-gray-200">
                        Delivery at <span className="font-semibold">Location</span>
                      </p>
                      <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                        {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Add delivery address") : "Add delivery address"}
                      </p>
                      {/* Address Selection Buttons */}
                      <div className="flex gap-2 mt-2">
                        {["Home", "Office", "Other"].map((label) => {
                          const addressExists = addresses.some(addr => addr.label === label)
                          return (
                            <button
                              key={label}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleSelectAddressByLabel(label)
                              }}
                              disabled={!addressExists}
                              className={`text-xs md:text-sm px-2 md:px-3 py-1 md:py-1.5 rounded-md border transition-colors ${addressExists
                                ? 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 bg-white dark:bg-[#1a1a1a]'
                                : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                                }`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
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
                <Input
                  type="text"
                  placeholder="Enter additional address details (e.g., Flat no., Floor, Landmark)"
                  value={additionalAddress}
                  onChange={(e) => setAdditionalAddress(e.target.value)}
                  className="w-full text-sm md:text-base text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-red-500 dark:focus:border-red-500"
                />
              </div>

              {/* Contact */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <Link to="/user/profile" className="flex items-center justify-between">
                  <div className="flex items-center gap-3 md:gap-4">
                    <Phone className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
                    <p className="text-sm md:text-base text-gray-800 dark:text-gray-200">
                      {userProfile?.name || "Your Name"}, <span className="font-medium">{userProfile?.phone || "+91-XXXXXXXXXX"}</span>
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
                </Link>
              </div>

              {/* Bill Details - extra margin for spacing between total bill and footer */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl mb-8 md:mb-12 pb-4 md:pb-6">
                <button
                  onClick={() => setShowBillDetails(!showBillDetails)}
                  className="flex items-center justify-between w-full"
                >
                  <div className="flex items-center gap-3 md:gap-4">
                    <FileText className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
                    <div className="text-left">
                      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                        <span className="text-sm md:text-base text-gray-800 dark:text-gray-200">Total Bill</span>
                        <span className="text-sm md:text-base text-gray-400 dark:text-gray-500 line-through">₹{totalBeforeAnyDiscount.toFixed(2)}</span>
                        <span className="text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200">₹{total.toFixed(2)}</span>
                        {savings > 0 && (
                          <span className="text-xs md:text-sm bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-1.5 md:px-2 py-0.5 rounded font-medium">You saved ₹{savings}</span>
                        )}
                      </div>
                      <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Incl. taxes and charges</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
                </button>

                {showBillDetails && (
                  <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-dashed dark:border-gray-700 space-y-2 md:space-y-3">
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
                      <span className="text-gray-600 dark:text-gray-400">GST and Restaurant Charges</span>
                      <span className="text-gray-800 dark:text-gray-200">₹{gstCharges}</span>
                    </div>
                    {baseDiscount > 0 && (
                      <div className="flex justify-between text-sm md:text-base text-red-600 dark:text-red-400">
                        <span>Coupon Discount</span>
                      <span>-₹{baseDiscount}</span>
                      </div>
                    )}
                    {categoryOfferDiscount > 0 && bestCategoryOffer && (
                      <div className="flex justify-between text-sm md:text-base text-red-600 dark:text-red-400">
                        <span>{bestCategoryOffer.name} Offer</span>
                        <span>-₹{categoryOfferDiscount}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm md:text-base font-semibold pt-2 md:pt-3 border-t dark:border-gray-700">
                      <span>To Pay</span>
                      <span>₹{total.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

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
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                  <div className="leading-tight">
                    <p className="text-[11px] md:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      PAY USING
                    </p>
                    <p className="text-sm md:text-base font-medium text-gray-800 dark:text-gray-200">
                      {selectedPaymentMethod === "razorpay"
                        ? "Online"
                        : selectedPaymentMethod === "wallet"
                          ? "Wallet"
                          : selectedPaymentMethod === "pay_at_hotel"
                            ? "Pay at Hotel"
                            : "Online Payment"}
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Payment Method <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedPaymentMethod}
                      onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent appearance-none"
                    >
                      {isHotelOrder ? (
                        // Show only Pay at Hotel and Razorpay for hotel orders
                        <>
                          <option value="pay_at_hotel">💳 Pay at Hotel</option>
                          <option value="razorpay">💰 Online Payment</option>
                        </>
                      ) : (
                        // Show online payment and wallet for regular orders (COD disabled)
                        <>
                          <option value="razorpay">💰 Online</option>
                          <option value="wallet">
                            👛 Wallet{isLoadingWallet ? ' (Loading...)' : walletBalance > 0 ? ` (₹${walletBalance})` : ' (₹0)'}
                          </option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Room Number Field - Only for Pay at Hotel */}
                  {selectedPaymentMethod === 'pay_at_hotel' && (
                    <div className="mb-4 p-4 bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 rounded-lg border-2 border-orange-200 dark:border-orange-700">
                      <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                        🏨 Room Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={roomNumber}
                        onChange={(e) => setRoomNumber(e.target.value)}
                        placeholder="Enter your room number (e.g., 101)"
                        className="w-full px-4 py-3 border-2 border-orange-300 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent font-medium"
                        required
                      />   
                      {isHotelOrder && hotelName && (
                        <p className="mt-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                          📍 Ordering from: {hotelName}
                        </p>
                      )}
                    </div>
                  )}
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                </div>
              </div>

              <Button
                size="lg"
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || (selectedPaymentMethod === "wallet" && walletBalance < total)}
                className="w-full bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white px-6 md:px-10 h-14 md:h-16 rounded-lg md:rounded-xl text-base md:text-lg font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(selectedPaymentMethod === "razorpay" || selectedPaymentMethod === "wallet") && (
                  <div className="text-left mr-3 md:mr-4">
                    <p className="text-sm md:text-base opacity-90">₹{total.toFixed(2)}</p>
                    <p className="text-xs md:text-sm opacity-75">TOTAL</p>
                  </div>
                )}
                <span className="font-bold text-base md:text-lg">
                  {isPlacingOrder
                    ? "Processing..."
                    : selectedPaymentMethod === "razorpay"
                      ? "Select Payment"
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
                    {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Address") : "Add address"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {defaultAddress ? (formatFullAddress(defaultAddress) || "Address") : "Address"}
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
                  {defaultAddress?.city || "Your Location"}
                </h2>
              </div>
              <p className="text-gray-500 text-base">
                {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Delivery Address") : "Delivery Address"}
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
