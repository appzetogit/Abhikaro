import { useSearchParams, Link, useNavigate } from "react-router-dom"
import React, { useRef, useEffect, useState, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import Lenis from "lenis"
import { Star, Clock, MapPin, Heart, Search, Tag, Flame, ShoppingBag, ShoppingCart, SlidersHorizontal, CheckCircle2, Bookmark, BadgePercent, X, ArrowDownUp, Timer, CalendarClock, ShieldCheck, IndianRupee, UtensilsCrossed, Leaf, AlertCircle, Loader2, Plus, Check, Share2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import Footer from "../components/Footer"
import AddToCartButton from "../components/AddToCartButton"
import StickyCartCard from "../components/StickyCartCard"
import OrderTrackingCard from "../components/OrderTrackingCard"
import { useProfile } from "../context/ProfileContext"
import { useCart } from "../context/CartContext"
import { HorizontalCarousel } from "@/components/ui/horizontal-carousel"
import { DotPattern } from "@/components/ui/dot-pattern"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useSearchOverlay, useLocationSelector } from "../components/UserLayout"
import PageNavbar from "../components/PageNavbar"

// Import shared food images - prevents duplication
import { foodImages } from "@/constants/images"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSharedLocation } from "@/lib/context/LocationContext"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { extractDistanceKm } from "@/lib/utils/distance"
import offerImage from "@/assets/offerimage.png"
import closeappImage from "@/assets/closeapp.png"
import api, { restaurantAPI, orderAPI } from "@/lib/api"
import { API_BASE_URL, API_ENDPOINTS } from "@/lib/api/config"
import OptimizedImage from "@/components/OptimizedImage"
import FlipBadge from "@/components/FlipBadge"
// Explore More Icons
import exploreOffers from "@/assets/explore more icons/offers.png"
import exploreGourmet from "@/assets/explore more icons/gourmet.png"
import exploreTop10 from "@/assets/explore more icons/top 10.png"
import exploreCollection from "@/assets/explore more icons/collection.png"

// Extracted Components
import HeroBannerCarousel from "../components/HeroBannerCarousel"
import SearchBar from "../components/SearchBar"
import VegModeToggle from "../components/VegModeToggle"
import VegModePopup from "../components/VegModePopup"
import SwitchOffVegModePopup from "../components/SwitchOffVegModePopup"
import CategoryCarousel from "../components/CategoryCarousel"
import { RestaurantImageCarousel } from "../components/RestaurantImageCarousel"

const RATING_POPUP_STORAGE_KEY = "ratedOrdersForFeedback"

export default function Home() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const query = searchParams.get("q") || ""
  const [heroSearch, setHeroSearch] = useState("")
  const { openSearch, closeSearch, searchValue, setSearchValue, isSearchOpen } = useSearchOverlay()
  const { openLocationSelector } = useLocationSelector()
  const { vegMode, setVegMode: setVegModeContext } = useProfile()
  const [prevVegMode, setPrevVegMode] = useState(vegMode)
  const [showVegModePopup, setShowVegModePopup] = useState(false)
  const [showSwitchOffPopup, setShowSwitchOffPopup] = useState(false)
  const [vegModeOption, setVegModeOption] = useState("all") // "all" or "pure-veg"
  const [isApplyingVegMode, setIsApplyingVegMode] = useState(false)
  const [isSwitchingOffVegMode, setIsSwitchingOffVegMode] = useState(false)
  const [popupPosition, setPopupPosition] = useState({ top: 0, right: 0 })
  const vegModeToggleRef = useRef(null)
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0)
  const [heroBannerImages, setHeroBannerImages] = useState([])
  const [heroBannersData, setHeroBannersData] = useState([]) // Store full banner data with linked restaurants
  const [loadingBanners, setLoadingBanners] = useState(true)
  const [landingCategories, setLandingCategories] = useState([])
  const [landingExploreMore, setLandingExploreMore] = useState([])
  const [exploreMoreHeading, setExploreMoreHeading] = useState("Explore More")
  const [showRecommendedSection, setShowRecommendedSection] = useState(false)
  const [loadingLandingConfig, setLoadingLandingConfig] = useState(true)
  const [restaurantsData, setRestaurantsData] = useState([])
  const [loadingRestaurants, setLoadingRestaurants] = useState(true)
  const [realCategories, setRealCategories] = useState([])
  const [loadingRealCategories, setLoadingRealCategories] = useState(true)
  const [showAllCategoriesModal, setShowAllCategoriesModal] = useState(false)
  const [allCategories, setAllCategories] = useState([])
  const [loadingAllCategories, setLoadingAllCategories] = useState(false)
  const isHandlingSwitchOff = useRef(false)

  // Rating & feedback popup (after order delivered)
  const [ratingModal, setRatingModal] = useState({ open: false, order: null })
  const ratingModalOpenRef = useRef(ratingModal.open)
  const [selectedRating, setSelectedRating] = useState(null)
  const [feedbackText, setFeedbackText] = useState("")
  const [submittingRating, setSubmittingRating] = useState(false)

  // Track orders that have shown rating popup - persist in localStorage
  const [shownRatingForOrders, setShownRatingForOrders] = useState(() => {
    try {
      const stored = localStorage.getItem(RATING_POPUP_STORAGE_KEY)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  const shownRatingForOrdersRef = useRef(shownRatingForOrders)
  const ratingPopupTimeoutRef = useRef(null)
  const scheduledRatingOrderIdRef = useRef(null)
  const latestOrdersRef = useRef([])

  // Swipe functionality for hero banner carousel
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchEndX = useRef(0)
  const touchEndY = useRef(0)
  const isSwiping = useRef(false)
  const autoSlideIntervalRef = useRef(null)

  // Sync prevVegMode when vegMode changes from context
  useEffect(() => {
    if (!isModuleAuthenticated("user")) return

    if (vegMode !== prevVegMode && !isHandlingSwitchOff.current) {
      setPrevVegMode(vegMode)
    }
  }, [vegMode])

  // Persist shown orders so the popup is only shown once per order.
  useEffect(() => {
    shownRatingForOrdersRef.current = shownRatingForOrders
    try {
      localStorage.setItem(
        RATING_POPUP_STORAGE_KEY,
        JSON.stringify(Array.from(shownRatingForOrders))
      )
    } catch (error) {
      // Ignore localStorage errors (private mode, disabled storage, etc.)
    }
  }, [shownRatingForOrders])

  useEffect(() => {
    ratingModalOpenRef.current = ratingModal.open
  }, [ratingModal.open])

  // Handle vegMode toggle - show popup when turned ON or OFF
  const handleVegModeChange = (newValue) => {
    // Skip if we're handling switch off confirmation
    if (isHandlingSwitchOff.current) {
      return
    }

    if (newValue && !prevVegMode) {
      // Veg mode was just turned ON
      // Calculate popup position relative to toggle
      if (vegModeToggleRef.current) {
        const rect = vegModeToggleRef.current.getBoundingClientRect()
        setPopupPosition({
          top: rect.bottom + 10,
          right: window.innerWidth - rect.right
        })
      }
      setShowVegModePopup(true)
      // Don't update context yet - wait for user to apply or cancel
    } else if (!newValue && prevVegMode) {
      // Veg mode was just turned OFF - show switch off confirmation popup
      isHandlingSwitchOff.current = true
      setShowSwitchOffPopup(true)
      // Don't update context yet - wait for user to confirm
    } else {
      // Normal state change - update context directly
      setVegModeContext(newValue)
      setPrevVegMode(newValue)
    }
  }

  // Update popup position on scroll/resize
  useEffect(() => {
    if (!showVegModePopup) return

    const updatePosition = () => {
      if (vegModeToggleRef.current) {
        const rect = vegModeToggleRef.current.getBoundingClientRect()
        setPopupPosition({
          top: rect.bottom + 10,
          right: window.innerWidth - rect.right
        })
      }
    }

    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [showVegModePopup])

  // -----------------------------
  // Delivered-order rating popup
  // -----------------------------
  const normalizeOrderForRating = useCallback((order) => {
    const id =
      order?.orderId ||
      order?._id?.toString?.() ||
      order?.id ||
      order?.mongoId ||
      null

    return {
      id,
      mongoId: order?._id || order?.mongoId || null,
      restaurantId: order?.restaurantId?._id || order?.restaurantId || null,
      restaurant:
        order?.restaurantId?.name ||
        order?.restaurantName ||
        "Restaurant",
      total: order?.pricing?.total || order?.total || 0,
    }
  }, [])

  const handleOpenRatingModal = useCallback(
    (order) => {
      if (!order) return

      const normalized = normalizeOrderForRating(order)
      if (!normalized.id) return

      scheduledRatingOrderIdRef.current = null
      if (ratingPopupTimeoutRef.current) {
        clearTimeout(ratingPopupTimeoutRef.current)
        ratingPopupTimeoutRef.current = null
      }

      setRatingModal({ open: true, order: normalized })
      setSelectedRating(null)
      setFeedbackText("")
    },
    [normalizeOrderForRating]
  )

  const handleCloseRatingModal = useCallback(() => {
    scheduledRatingOrderIdRef.current = null
    if (ratingPopupTimeoutRef.current) {
      clearTimeout(ratingPopupTimeoutRef.current)
      ratingPopupTimeoutRef.current = null
    }

    setRatingModal({ open: false, order: null })
    setSelectedRating(null)
    setFeedbackText("")
  }, [])

  const handleSubmitRating = useCallback(async () => {
    if (!ratingModal.order || selectedRating === null) {
      toast.error("Please select a rating first")
      return
    }

    const order = ratingModal.order

    try {
      setSubmittingRating(true)

      await api.post(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE_CREATE, {
        rating: selectedRating,
        module: "user",
        restaurantId: order.restaurantId || null,
        metadata: {
          orderId: order.id?.toString?.() || order.id || undefined,
          orderMongoId:
            order.mongoId?.toString?.() || order.mongoId || undefined,
          orderTotal: order.total,
          restaurantName: order.restaurant,
          comment: feedbackText || undefined,
        },
      })

      // Persist only rated orders (not merely shown), so unrated delivered
      // orders are never permanently suppressed due to stale local storage.
      setShownRatingForOrders((prev) => new Set([...prev, order.id]))

      // Close modal & allow next order popup in future (for other orders)
      toast.success("Thanks for rating your order! 🎉")
      handleCloseRatingModal()
    } catch (error) {
      console.error("Error submitting rating:", error)
      toast.error(
        error?.response?.data?.message ||
          "Failed to submit rating. Please try again."
      )
    } finally {
      setSubmittingRating(false)
    }
  }, [
    ratingModal.order,
    selectedRating,
    feedbackText,
    handleCloseRatingModal
  ])

  // Poll user orders and show rating modal as soon as an unrated delivered order is detected.
  useEffect(() => {
    if (ratingModal.open) return

    const getDeliveredAtValue = (order) => {
      // Support multiple backend field names (some UI components use these fallbacks)
      return (
        order?.deliveredAt ||
        order?.delivered_on ||
        order?.deliveredOn ||
        order?.delivered_on_at ||
        null
      )
    }

    const isDelivered = (order) => {
      const status = order?.status
      const deliveredAt = getDeliveredAtValue(order)
      const deliveryDelivered =
        order?.tracking?.delivered === true ||
        order?.tracking?.delivered?.status === true ||
        order?.deliveryState?.status === "delivered" ||
        order?.deliveryState?.currentPhase === "completed"

      return (
        status === "delivered" ||
        status === "completed" ||
        deliveryDelivered ||
        (deliveredAt !== null &&
          deliveredAt !== undefined &&
          deliveredAt !== "")
      )
    }

    const hasRated = (order) => {
      const rating =
        order?.review?.rating ?? order?.rating ?? order?.review?.review?.rating
      return rating !== null && rating !== undefined && Number(rating) > 0
    }

    const getOrderId = (order) => {
      return order?.orderId || order?._id?.toString?.() || order?.id
    }

    const computeEarliestCandidate = (orders) => {
      const candidates = (orders || [])
        .filter((order) => {
          const orderId = getOrderId(order)
          if (!orderId) return false

          if (shownRatingForOrdersRef.current.has(orderId)) return false
          if (!isDelivered(order)) return false
          if (hasRated(order)) return false

          return true
        })
        .map((order) => ({
          order,
          orderId: getOrderId(order),
          deliveredTs: getDeliveredAtValue(order)
            ? new Date(getDeliveredAtValue(order)).getTime()
            : 0,
        }))

      // Prefer earliest delivered order first to preserve expected ordering.
      candidates.sort((a, b) => (a.deliveredTs || 0) - (b.deliveredTs || 0))
      return candidates[0] || null
    }

    let cancelled = false
    const isAbortLikeError = (error) => {
      if (!error) return false
      return (
        error.name === "AbortError" ||
        error.name === "CanceledError" ||
        error.code === "ERR_CANCELED" ||
        error.code === "ECONNABORTED" ||
        error.message === "Request aborted"
      )
    }

    const pollAndMaybeSchedule = async () => {
      if (!isModuleAuthenticated("user")) return
      try {
        const response = await orderAPI.getOrders({ limit: 100, page: 1 })
        if (cancelled) return

        let ordersData = []
        if (response?.data?.success && response?.data?.data?.orders) {
          ordersData = response.data.data.orders || []
        } else if (response?.data?.orders) {
          ordersData = response.data.orders || []
        } else if (response?.data?.data && Array.isArray(response.data.data)) {
          ordersData = response.data.data || []
        }

        latestOrdersRef.current = ordersData

        const candidate = computeEarliestCandidate(ordersData)
        if (!candidate) return

        if (import.meta.env.DEV) {
          console.log("🟧 [RatingPopup] candidate found:", {
            orderId: candidate.orderId,
            status: candidate.order?.status,
            deliveredAt: getDeliveredAtValue(candidate.order),
            deliveredTs: candidate.deliveredTs || null,
          })
        }

        // Avoid re-scheduling if we already have the same order scheduled.
        if (
          scheduledRatingOrderIdRef.current === candidate.orderId &&
          ratingPopupTimeoutRef.current
        ) {
          return
        }

        // Clear previous timer before scheduling new one.
        if (ratingPopupTimeoutRef.current) {
          clearTimeout(ratingPopupTimeoutRef.current)
          ratingPopupTimeoutRef.current = null
        }

        scheduledRatingOrderIdRef.current = candidate.orderId

        // Open immediately when eligible order appears.
        if (!ratingModalOpenRef.current) {
          handleOpenRatingModal(candidate.order)
        }
      } catch (error) {
        // Silently ignore polling errors; home page should still work.
        if (error?.response?.status === 401) return
        if (isAbortLikeError(error)) return
        if (import.meta.env.DEV) {
          console.error("Order rating popup polling failed:", error)
        }
      }
    }

    pollAndMaybeSchedule()
    const intervalId = setInterval(pollAndMaybeSchedule, 60_000) // Poll every 1 minute instead of 10 seconds to reduce load

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      if (ratingPopupTimeoutRef.current) {
        clearTimeout(ratingPopupTimeoutRef.current)
        ratingPopupTimeoutRef.current = null
      }
      scheduledRatingOrderIdRef.current = null
    }
  }, [ratingModal.open, shownRatingForOrders, handleOpenRatingModal, normalizeOrderForRating])

  // Fetch hero banners from API
  useEffect(() => {
    const fetchHeroBanners = async () => {
      try {
        setLoadingBanners(true)
        const response = await api.get('/hero-banners/public')
        if (response.data.success && response.data.data.banners) {
          const banners = response.data.data.banners
          setHeroBannersData(banners)
          // Extract image URLs for display
          setHeroBannerImages(banners.map(b => b.imageUrl || b))
        }
      } catch (error) {
        // Fallback to empty array if API fails
        setHeroBannerImages([])
        setHeroBannersData([])
      } finally {
        setLoadingBanners(false)
      }
    }

    fetchHeroBanners()
  }, [])

  // Fetch real categories from backend API
  useEffect(() => {
    const fetchRealCategories = async () => {
      try {
        setLoadingRealCategories(true)
        const response = await api.get('/categories/public?home=true')
        if (response.data.success && response.data.data.categories) {
          const adminCategories = response.data.data.categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            image: cat.image || foodImages[0], // Fallback to default image if not provided
            slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, '-'),
            label: cat.name // For compatibility with existing code
          }))
          setRealCategories(adminCategories)
        } else {
          setRealCategories([])
        }
      } catch (error) {
        setRealCategories([])
      } finally {
        setLoadingRealCategories(false)
      }
    }

    fetchRealCategories()
  }, [])

  // Fetch ALL active categories for the "See all" modal (not limited by home config)
  useEffect(() => {
    if (!showAllCategoriesModal) return

    const fetchAllCategories = async () => {
      try {
        setLoadingAllCategories(true)
        const response = await api.get('/categories/public')
        if (response.data.success && response.data.data.categories) {
          const adminCategories = response.data.data.categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            image: cat.image || foodImages[0],
            slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, '-'),
            label: cat.name
          }))
          setAllCategories(adminCategories)
        } else {
          setAllCategories([])
        }
      } catch (error) {
        setAllCategories([])
      } finally {
        setLoadingAllCategories(false)
      }
    }

    fetchAllCategories()
  }, [showAllCategoriesModal])

  // Fetch landing page config (categories, explore more, settings)
  useEffect(() => {
    const fetchLandingConfig = async () => {
      try {
        setLoadingLandingConfig(true)
        const response = await api.get('/hero-banners/landing/public')
        if (response.data.success && response.data.data) {
          const apiCategories = response.data.data.categories || []
          const apiExploreMore = response.data.data.exploreMore || []

          // Extra safety: only keep active items and ensure order ascending
          setLandingCategories(
            apiCategories
              .filter((c) => c.isActive !== false)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          )
          setLandingExploreMore(
            apiExploreMore
              .filter((e) => e.isActive !== false)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          )
          setExploreMoreHeading(response.data.data.settings?.exploreMoreHeading || "Explore More")
          setShowRecommendedSection(response.data.data.settings?.showRecommendedSection === true)
        }
      } catch (error) {
        // Fallback to empty arrays and default heading
        setLandingCategories([])
        setLandingExploreMore([])
        setExploreMoreHeading("Explore More")
        setShowRecommendedSection(false)
      } finally {
        setLoadingLandingConfig(false)
      }
    }

    fetchLandingConfig()
  }, [])

  // Auto-cycle hero banner images
  useEffect(() => {
    if (heroBannerImages.length === 0) return

    autoSlideIntervalRef.current = setInterval(() => {
      if (!isSwiping.current) {
        setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length)
      }
    }, 10000) // Change every 10 seconds

    return () => {
      if (autoSlideIntervalRef.current) {
        clearInterval(autoSlideIntervalRef.current)
      }
    }
  }, [heroBannerImages.length])

  // Lenis smooth scrolling initialization
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: false, // Disabled to prevent double-click issues on touch-enabled devices
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

  // Helper function to reset auto-slide timer
  const resetAutoSlide = useCallback(() => {
    if (autoSlideIntervalRef.current) {
      clearInterval(autoSlideIntervalRef.current)
    }
    if (heroBannerImages.length > 0) {
      autoSlideIntervalRef.current = setInterval(() => {
        if (!isSwiping.current) {
          setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length)
        }
      }, 10000)
    }
  }, [heroBannerImages.length])

  // Swipe handlers for hero banner carousel
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isSwiping.current = true
  }

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX
    touchEndY.current = e.touches[0].clientY
  }

  const handleTouchEnd = () => {
    if (!isSwiping.current || heroBannerImages.length === 0) return

    const deltaX = touchEndX.current - touchStartX.current
    const deltaY = Math.abs(touchEndY.current - touchStartY.current)
    const minSwipeDistance = 50 // Minimum distance for a swipe

    // Check if it's a horizontal swipe (not vertical scroll)
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        // Swipe right - go to previous image
        setCurrentBannerIndex((prev) => (prev - 1 + heroBannerImages.length) % heroBannerImages.length)
      } else {
        // Swipe left - go to next image
        setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length)
      }
      // Reset auto-slide timer after manual swipe
      resetAutoSlide()
    }

    // Reset swipe state after a short delay
    setTimeout(() => {
      isSwiping.current = false
    }, 300)

    // Reset touch positions
    touchStartX.current = 0
    touchStartY.current = 0
    touchEndX.current = 0
    touchEndY.current = 0
  }

  // Mouse handlers for desktop drag support
  const handleMouseDown = (e) => {
    touchStartX.current = e.clientX
    touchStartY.current = e.clientY
    isSwiping.current = true
  }

  const handleMouseMove = (e) => {
    if (!isSwiping.current) return
    touchEndX.current = e.clientX
    touchEndY.current = e.clientY
  }

  const handleMouseUp = () => {
    if (!isSwiping.current || heroBannerImages.length === 0) return

    const deltaX = touchEndX.current - touchStartX.current
    const deltaY = Math.abs(touchEndY.current - touchStartY.current)
    const minSwipeDistance = 50

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        setCurrentBannerIndex((prev) => (prev - 1 + heroBannerImages.length) % heroBannerImages.length)
      } else {
        setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length)
      }
      // Reset auto-slide timer after manual swipe
      resetAutoSlide()
    }

    setTimeout(() => {
      isSwiping.current = false
    }, 300)

    touchStartX.current = 0
    touchStartY.current = 0
    touchEndX.current = 0
    touchEndY.current = 0
  }
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [sortBy, setSortBy] = useState(null) // null, 'price-low', 'price-high', 'rating-high', 'rating-low'
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [appliedFilters, setAppliedFilters] = useState({
    activeFilters: new Set(),
    sortBy: null,
    selectedCuisine: null
  })
  const [isLoadingFilterResults, setIsLoadingFilterResults] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const categoryScrollRef = useRef(null)
  const gsapAnimationsRef = useRef([])
  // Safely get profile context - handle case when ProfileProvider is not available
  let profileContext = null
  try {
    profileContext = useProfile()
  } catch (error) {
    // Fallback values when ProfileProvider is not available
    profileContext = {
      addFavorite: () => {},
      removeFavorite: () => {},
      isFavorite: () => false,
      getFavorites: () => []
    }
  }

  const { addFavorite, removeFavorite, isFavorite, getFavorites } = profileContext
  const { addToCart, cart } = useCart()
  const { location, loading, requestLocation, zoneId, zoneStatus, isInService, isOutOfService, zoneLoading } = useSharedLocation()
  const [showToast, setShowToast] = useState(false)
  const [showManageCollections, setShowManageCollections] = useState(false)
  const [selectedRestaurantSlug, setSelectedRestaurantSlug] = useState(null)

  // Memoize cartCount to prevent recalculation on every render - use cart directly
  const cartCount = useMemo(() =>
    cart.reduce((total, item) => total + (item.quantity || 0), 0),
    [cart]
  )

  const cityName = location?.city || "Select"
  const stateName = location?.state || "Location"

  // Mock points value - replace with actual points from context/store
  const userPoints = 99

  // Simple filter toggle function (with distance exclusivity)
  const toggleFilter = (filterId) => {
    setActiveFilters(prev => {
      const newSet = new Set(prev)

      // Enforce mutual exclusivity between distance-under-1km and distance-under-2km
      if (filterId === 'distance-under-1km') {
        newSet.delete('distance-under-2km')
      } else if (filterId === 'distance-under-2km') {
        newSet.delete('distance-under-1km')
      }

      if (newSet.has(filterId)) {
        newSet.delete(filterId)
      } else {
        newSet.add(filterId)
      }
      return newSet
    })
  }

  // Refs for scroll tracking
  const filterSectionRefs = useRef({})
  const [activeScrollSection, setActiveScrollSection] = useState('sort')
  const rightContentRef = useRef(null)

  // Scroll tracking effect
  useEffect(() => {
    if (!isFilterOpen || !rightContentRef.current) return

    const observerOptions = {
      root: rightContentRef.current,
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute('data-section-id')
          if (sectionId) {
            setActiveScrollSection(sectionId)
            setActiveFilterTab(sectionId)
          }
        }
      })
    }, observerOptions)

    // Observe all filter sections
    Object.values(filterSectionRefs.current).forEach(ref => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [isFilterOpen])

  // Fetch restaurants from API with filters
  const fetchRestaurants = useCallback(async (filters = {}) => {
    try {
      setLoadingRestaurants(true)
      if (!zoneId) {
        setRestaurantsData([])
        setLoadingRestaurants(false)
        return
      }
      const backendUrl = API_BASE_URL.replace('/api', '')

      const normalizeImageUrl = (rawUrl) => {
        if (!rawUrl || typeof rawUrl !== 'string') return null
        const url = rawUrl.trim()
        if (!url) return null
        if (url.startsWith('data:')) return url
        if (url.startsWith('//')) {
          return `${window.location.protocol}${url}`
        }
        if (url.startsWith('http://') && window.location.protocol === 'https:') {
          return `https://${url.slice('http://'.length)}`
        }
        if (url.startsWith('/')) {
          return `${backendUrl}${url}`
        }
        if (!/^https?:\/\//i.test(url)) {
          return `${backendUrl}/${url.replace(/^\/+/, '')}`
        }
        return url
      }

      // First, test backend connection
      try {
        const healthCheck = await fetch(`${backendUrl}/health`)
        if (!healthCheck.ok) {
          throw new Error(`Backend health check failed: ${healthCheck.status}`)
        }
      } catch (healthError) {
        // Backend connection error - handled silently, toast notifications shown via axios interceptor
        setRestaurantsData([])
        setLoadingRestaurants(false)
        return
      }

      // Build query parameters from filters
      const params = {}

      // Sort by
      if (filters.sortBy) {
        params.sortBy = filters.sortBy
      }

      // Cuisine
      if (filters.selectedCuisine) {
        params.cuisine = filters.selectedCuisine
      }

      // Rating filters
      if (filters.activeFilters?.has('rating-45-plus')) {
        params.minRating = 4.5
      } else if (filters.activeFilters?.has('rating-4-plus')) {
        params.minRating = 4.0
      } else if (filters.activeFilters?.has('rating-35-plus')) {
        params.minRating = 3.5
      }

      // Delivery time filters
      if (filters.activeFilters?.has('delivery-under-30')) {
        params.maxDeliveryTime = 30
      } else if (filters.activeFilters?.has('delivery-under-45')) {
        params.maxDeliveryTime = 45
      }

      // Distance filters
      if (filters.activeFilters?.has('distance-under-1km')) {
        params.maxDistance = 1.0
      } else if (filters.activeFilters?.has('distance-under-2km')) {
        params.maxDistance = 2.0
      }

      // Price filters
      if (filters.activeFilters?.has('price-under-200')) {
        params.maxPrice = 200
      } else if (filters.activeFilters?.has('price-under-500')) {
        params.maxPrice = 500
      }

      // Offers filter
      if (filters.activeFilters?.has('has-offers')) {
        params.hasOffers = 'true'
      }

      // Trust filters
      if (filters.activeFilters?.has('top-rated')) {
        params.topRated = 'true'
      } else if (filters.activeFilters?.has('trusted')) {
        params.trusted = 'true'
      }

      // Strict zone mode: user discovery always scoped to detected zone.
      params.zoneId = zoneId
      
      // CRITICAL: Add user coordinates for MongoDB geospatial queries (replaces Google Places API)
      // This enables $near queries to find nearby restaurants without calling Google Places API
      if (location?.latitude && location?.longitude) {
        params.latitude = location.latitude
        params.longitude = location.longitude
        // Default maxDistance is 5km (can be overridden by filters)
        if (!params.maxDistance) {
          params.maxDistance = 5
        }
      }
      // Note: We show all restaurants regardless of zone, but apply grayscale styling if user is out of service

      const response = await restaurantAPI.getRestaurants(params)

      if (response.data && response.data.success && response.data.data && response.data.data.restaurants) {
        const restaurantsArray = response.data.data.restaurants

        if (restaurantsArray.length === 0) {
          setRestaurantsData([])
          setLoadingRestaurants(false)
          return
        }

        // Calculate distance helper function
        const calculateDistance = (lat1, lng1, lat2, lng2) => {
          const R = 6371 // Earth's radius in kilometers
          const dLat = (lat2 - lat1) * Math.PI / 180
          const dLng = (lng2 - lng1) * Math.PI / 180
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2)
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
          return R * c // Distance in kilometers
        }

        // Get user coordinates
        const userLat = location?.latitude
        const userLng = location?.longitude

        // Transform API data to match expected format
        const transformedRestaurants = restaurantsArray.map((restaurant, index) => {
          // Use restaurant data if available, otherwise use defaults
          const deliveryTime = restaurant.estimatedDeliveryTime || "25-30 mins"

          // Calculate distance from user to restaurant
          let distance = restaurant.distance || "1.2 km"

          // Get restaurant coordinates
          const restaurantLocation = restaurant.location
          const restaurantLat = restaurantLocation?.latitude || (restaurantLocation?.coordinates && Array.isArray(restaurantLocation.coordinates) ? restaurantLocation.coordinates[1] : null)
          const restaurantLng = restaurantLocation?.longitude || (restaurantLocation?.coordinates && Array.isArray(restaurantLocation.coordinates) ? restaurantLocation.coordinates[0] : null)

          // Calculate distance if both user and restaurant coordinates are available
          let distanceInKm = null
          if (userLat && userLng && restaurantLat && restaurantLng &&
            !isNaN(userLat) && !isNaN(userLng) && !isNaN(restaurantLat) && !isNaN(restaurantLng)) {
            distanceInKm = calculateDistance(userLat, userLng, restaurantLat, restaurantLng)
            // Format distance: show 1 decimal place if >= 1km, otherwise show in meters
            if (distanceInKm >= 1) {
              distance = `${distanceInKm.toFixed(1)} km`
            } else {
              const distanceInMeters = Math.round(distanceInKm * 1000)
              distance = `${distanceInMeters} m`
            }
          }

          // Get first cuisine or default
          const cuisine = restaurant.cuisines && restaurant.cuisines.length > 0
            ? restaurant.cuisines[0]
            : "Multi-cuisine"

          // Always prefer restaurant menu photos for user discovery cards.
          const menuImagesPrimary = Array.isArray(restaurant.menuImages) && restaurant.menuImages.length > 0
            ? restaurant.menuImages
              .map((img) => normalizeImageUrl(img?.url || img))
              .filter(Boolean)
            : []
          const menuImages = Array.from(new Set(menuImagesPrimary))

          // Strict: only menu images are allowed on delivery discovery cards.
          const allImages = menuImages.length > 0
            ? menuImages
            : []

          // Keep single image for backward compatibility
          const image = allImages[0] || null

          const rating = (() => {
            const candidates = [
              restaurant.averageRating,
              restaurant.avgRating,
              restaurant.rating,
            ]
            for (const value of candidates) {
              const parsed = Number(value)
              if (Number.isFinite(parsed) && parsed > 0) return parsed
            }
            return 0
          })()

          return {
            id: restaurant.restaurantId || restaurant._id,
            // Prefer onboarding.step1.restaurantName if available (more accurate)
            name: restaurant.onboarding?.step1?.restaurantName || restaurant.name,
            cuisine: cuisine,
            rating,
            deliveryTime: deliveryTime,
            distance: distance,
            distanceInKm: distanceInKm, // Store numeric distance for sorting
            image: image,
            images: allImages, // Array of images for carousel (menu only)
            menuImages: menuImages, // Preserve menuImages for components that prefer food photos
            priceRange: restaurant.priceRange || "$$", // Use from API or default
            featuredDish: restaurant.featuredDish || (restaurant.cuisines && restaurant.cuisines.length > 0
              ? `${restaurant.cuisines[0]} Special`
              : "Special Dish"),
            featuredPrice: restaurant.featuredPrice || 249, // Use from API or default
            offer: restaurant.offer || "Flat ₹50 OFF above ₹199", // Use from API or default
            slug: restaurant.slug,
            restaurantId: restaurant.restaurantId,
            location: restaurant.location, // Store location for distance recalculation
            isActive: restaurant.isActive !== false, // Default to true if not specified
            isAcceptingOrders: restaurant.isAcceptingOrders === false || restaurant.isAcceptingOrders === 0 ? false : (restaurant.isAcceptingOrders !== undefined ? restaurant.isAcceptingOrders : true), // Preserve false/0, default to true if undefined
          }
        })

        // Sort restaurants by distance (nearby first) - only if user location is available
        if (userLat && userLng) {
          transformedRestaurants.sort((a, b) => {
            // Available restaurants first, then unavailable
            const aAvailable = a.isActive && (a.isAcceptingOrders !== false && a.isAcceptingOrders !== 0)
            const bAvailable = b.isActive && (b.isAcceptingOrders !== false && b.isAcceptingOrders !== 0)

            if (aAvailable !== bAvailable) {
              return aAvailable ? -1 : 1 // Available restaurants come first
            }

            // If both have same availability, sort by distance
            const aDistance = a.distanceInKm !== null ? a.distanceInKm : Infinity
            const bDistance = b.distanceInKm !== null ? b.distanceInKm : Infinity
            return aDistance - bDistance
          })
        }

        setRestaurantsData(transformedRestaurants)
      } else {
        setRestaurantsData([])
      }
    } catch (error) {
      // Don't set hardcoded data here - let the useMemo fallback handle it
      // This way, if API succeeds later, it will show the real data
      setRestaurantsData([])
    } finally {
      setLoadingRestaurants(false)
    }
  }, [zoneId])

  // Sync activeFilters, sortBy, and selectedCuisine to appliedFilters
  useEffect(() => {
    setAppliedFilters({
      activeFilters,
      sortBy,
      selectedCuisine
    })
  }, [activeFilters, sortBy, selectedCuisine])

  // Fetch restaurants when appliedFilters change
  useEffect(() => {
    fetchRestaurants(appliedFilters)
  }, [appliedFilters, fetchRestaurants])

  // Warm image cache for first visible cards so menu images appear instantly on app open.
  useEffect(() => {
    if (!Array.isArray(restaurantsData) || restaurantsData.length === 0) return

    const connection = navigator?.connection
    const isSaveData = Boolean(connection?.saveData)
    const isSlowNetwork = typeof connection?.effectiveType === 'string' && /2g/.test(connection.effectiveType)
    if (isSaveData || isSlowNetwork) return

    const preloadCandidates = restaurantsData
      .slice(0, 6)
      .map((r) => (Array.isArray(r.menuImages) && r.menuImages.length > 0 ? r.menuImages[0] : null))
      .filter((src) => typeof src === 'string' && src.trim() !== '')

    if (preloadCandidates.length === 0) return

    const warmed = []
    preloadCandidates.forEach((src) => {
      const img = new Image()
      img.decoding = 'async'
      img.fetchPriority = 'high'
      img.src = src
      warmed.push(img)
    })

    return () => {
      warmed.forEach((img) => {
        img.src = ''
      })
    }
  }, [restaurantsData])

  // Recalculate distances when user location updates
  useEffect(() => {
    if (!restaurantsData || restaurantsData.length === 0 || !location?.latitude || !location?.longitude) return

    const calculateDistance = (lat1, lng1, lat2, lng2) => {
      const R = 6371 // Earth's radius in kilometers
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLng = (lng2 - lng1) * Math.PI / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return R * c // Distance in kilometers
    }

    const userLat = location.latitude
    const userLng = location.longitude

    // Recalculate distances for all restaurants
    const updatedRestaurants = restaurantsData.map(restaurant => {
      if (!restaurant.location) return restaurant

      const restaurantLat = restaurant.location?.latitude || (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) ? restaurant.location.coordinates[1] : null)
      const restaurantLng = restaurant.location?.longitude || (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) ? restaurant.location.coordinates[0] : null)

      if (!restaurantLat || !restaurantLng ||
        isNaN(restaurantLat) || isNaN(restaurantLng)) {
        return restaurant
      }

      const distanceInKm = calculateDistance(userLat, userLng, restaurantLat, restaurantLng)
      let calculatedDistance = null

      // Format distance: show 1 decimal place if >= 1km, otherwise show in meters
      if (distanceInKm >= 1) {
        calculatedDistance = `${distanceInKm.toFixed(1)} km`
      } else {
        const distanceInMeters = Math.round(distanceInKm * 1000)
        calculatedDistance = `${distanceInMeters} m`
      }

      return {
        ...restaurant,
        distance: calculatedDistance,
        distanceInKm: distanceInKm // Preserve numeric distance for sorting
      }
    })

    setRestaurantsData(updatedRestaurants)
  }, [location?.latitude, location?.longitude])

  // Filter restaurants and foods based on active filters
  const filteredRestaurants = useMemo(() => {
    // Use only API data - no mock data fallback
    let filtered = [...restaurantsData]

    // Apply filters
    if (activeFilters.has('price-under-200')) {
      filtered = filtered.filter(r => r.priceRange === "$" || r.priceRange === "$$")
    }
    if (activeFilters.has('price-under-500')) {
      filtered = filtered.filter(r => r.priceRange !== "$$$")
    }
    if (activeFilters.has('delivery-under-30')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 30
      })
    }
    if (activeFilters.has('delivery-under-45')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 45
      })
    }
    if (activeFilters.has('rating-35-plus')) {
      filtered = filtered.filter(r => r.rating >= 3.5)
    }
    if (activeFilters.has('rating-4-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.0)
    }
    if (activeFilters.has('rating-45-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.5)
    }
    if (activeFilters.has('distance-under-1km')) {
      filtered = filtered.filter(r => {
        const km = extractDistanceKm({ distanceInKm: r.distanceInKm, distance: r.distance })
        return km !== null && km <= 1.0
      })
    }
    if (activeFilters.has('distance-under-2km')) {
      filtered = filtered.filter(r => {
        const km = extractDistanceKm({ distanceInKm: r.distanceInKm, distance: r.distance })
        return km !== null && km <= 2.0
      })
    }
    if (activeFilters.has('delivery-under-45')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 45
      })
    }
    if (activeFilters.has('top-rated')) {
      filtered = filtered.filter(r => r.rating >= 4.5)
    }
    if (activeFilters.has('trusted')) {
      filtered = filtered.filter(r => r.rating >= 4.0)
    }
    if (activeFilters.has('has-offers')) {
      filtered = filtered.filter(r => r.offer && r.offer.length > 0)
    }
    if (selectedCuisine) {
      filtered = filtered.filter(r => r.cuisine === selectedCuisine)
    }

    // Apply sorting
    if (sortBy === 'price-low') {
      filtered.sort((a, b) => {
        const aPrice = a.priceRange === "$" ? 1 : a.priceRange === "$$" ? 2 : 3
        const bPrice = b.priceRange === "$" ? 1 : b.priceRange === "$$" ? 2 : 3
        return aPrice - bPrice
      })
    } else if (sortBy === 'price-high') {
      filtered.sort((a, b) => {
        const aPrice = a.priceRange === "$" ? 1 : a.priceRange === "$$" ? 2 : 3
        const bPrice = b.priceRange === "$" ? 1 : b.priceRange === "$$" ? 2 : 3
        return bPrice - aPrice
      })
    } else if (sortBy === 'rating-high') {
      filtered.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === 'rating-low') {
      filtered.sort((a, b) => a.rating - b.rating)
    } else {
      // Default sorting: Available restaurants first, then by distance (nearby first)
      // This ensures all restaurants in zone are shown, but nearby ones appear first
      filtered.sort((a, b) => {
        // Available restaurants first, then unavailable
        const aAvailable = a.isActive && (a.isAcceptingOrders !== false && a.isAcceptingOrders !== 0)
        const bAvailable = b.isActive && (b.isAcceptingOrders !== false && b.isAcceptingOrders !== 0)

        if (aAvailable !== bAvailable) {
          return aAvailable ? -1 : 1 // Available restaurants come first
        }

        // If both have same availability, sort by distance
        const aDistance = a.distanceInKm !== null && a.distanceInKm !== undefined ? a.distanceInKm : Infinity
        const bDistance = b.distanceInKm !== null && b.distanceInKm !== undefined ? b.distanceInKm : Infinity
        return aDistance - bDistance
      })
    }

    return filtered
  }, [restaurantsData, activeFilters, selectedCuisine, sortBy])

  // Featured foods removed - will be handled by restaurants data from API
  const filteredFeaturedFoods = useMemo(() => {
    // Return empty array - featured foods will come from API if needed
    return []
  }, [activeFilters, sortBy])
  const recommendedRestaurants = filteredRestaurants.slice(0, 12)

  // Memoize callbacks to prevent unnecessary re-renders
  const handleLocationClick = useCallback(() => {
    openLocationSelector()
  }, [openLocationSelector])

  const handleSearchFocus = useCallback(() => {
    // Sync heroSearch with global searchValue when opening overlay
    if (heroSearch) {
      setSearchValue(heroSearch)
    }
    openSearch()
  }, [heroSearch, openSearch, setSearchValue])

  const handleSearchClose = useCallback(() => {
    closeSearch()
    setHeroSearch("")
  }, [closeSearch])

  // Removed GSAP animations - using CSS and ScrollReveal components instead for better performance
  // Auto-scroll removed - manual scroll only
  // Placeholder cycling is now handled inside SearchBar component

  // Lightweight ScrollReveal replacement - CSS only, no IntersectionObserver
  const ScrollRevealSimple = ({ children, delay = 0, className = "" }) => (
    <div className={className}>
      {children}
    </div>
  )

  // Lightweight TextReveal replacement - CSS only
  const TextRevealSimple = ({ children, className = "" }) => (
    <div className={className}>
      {children}
    </div>
  )

  // Lightweight ShimmerCard replacement - no animations
  const ShimmerCardSimple = ({ children, className = "" }) => (
    <div className={className}>
      {children}
    </div>
  )

  // Out of Zone Screen - shows when user is outside the service area
  if (isOutOfService && !zoneLoading) {
    return (
      <div className="relative min-h-screen bg-white dark:bg-[#0a0a0a] pb-28 md:pb-24">
        {/* Out of Zone Full Screen */}
        <div className="relative w-full min-h-screen">
          {/* Background Image - closeapp.png */}
          <div className="absolute inset-0 z-0">
            <img
              src={closeappImage}
              alt="Service not available"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Top Overlay Content */}
          <div className="relative z-10">
            {/* Navbar - Location, Wallet, Cart */}
            <div className="pt-7 sm:pt-7 lg:pt-7">
              <PageNavbar textColor="black" zIndex={20} mobileTranslateYClass="translate-y-[12px]" />
            </div>

            {/* Search Bar and VEG MODE Container */}
            <div className="w-full py-6 sm:py-8 md:py-12 lg:py-12">
              <div className="max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-3 sm:px-6 lg:px-8">
                <div className="flex items-center gap-3 sm:gap-4 lg:gap-6">
                  {/* Search Bar */}
                  <SearchBar
                    value={heroSearch}
                    onChange={setHeroSearch}
                    onFocus={handleSearchFocus}
                    onClose={handleSearchClose}
                    isSearchOpen={isSearchOpen}
                  />

                  {/* VEG MODE Toggle */}
                  <VegModeToggle
                    checked={vegMode}
                    onCheckedChange={handleVegModeChange}
                    toggleRef={vegModeToggleRef}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Veg Mode Popups - keep functional */}
        <VegModePopup
          open={showVegModePopup}
          onClose={() => setShowVegModePopup(false)}
          onApply={(option) => {
            setIsApplyingVegMode(true)
            setVegModeOption(option)
            setVegModeContext(true)
            setShowVegModePopup(false)
            setTimeout(() => setIsApplyingVegMode(false), 300)
          }}
          position={popupPosition}
          vegModeOption={vegModeOption}
          setVegModeOption={setVegModeOption}
          isApplying={isApplyingVegMode}
        />
        <SwitchOffVegModePopup
          open={showSwitchOffPopup}
          onClose={() => {
            setShowSwitchOffPopup(false)
            isHandlingSwitchOff.current = false
          }}
          onConfirm={() => {
            setIsSwitchingOffVegMode(true)
            setVegModeContext(false)
            setShowSwitchOffPopup(false)
            setTimeout(() => {
              setIsSwitchingOffVegMode(false)
              isHandlingSwitchOff.current = false
            }, 300)
          }}
          position={popupPosition}
          isSwitching={isSwitchingOffVegMode}
        />

        <StickyCartCard />
        <OrderTrackingCard />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0a0a0a] pb-28 md:pb-24">
      {/* Unified Background for Entire Page - Vibrant Food Theme */}
      <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none overflow-hidden z-0">
        {/* Main Background */}
        <div className="absolute inset-0 bg-white dark:bg-[#0a0a0a]">
        </div>
        {/* Background Elements - Reduced to 2 blobs with CSS animations for better performance */}
        <div className="absolute inset-0 overflow-hidden opacity-20">
          {/* Top right blob - CSS animation */}
          <div
            style={{
              animation: 'blob 8s ease-in-out infinite',
              willChange: 'transform'
            }}
          />
          {/* Bottom left blob - CSS animation */}
          <div
            style={{
              animation: 'blob-reverse 10s ease-in-out infinite',
              willChange: 'transform'
            }}
          />
        </div>
        {/* CSS keyframes for animations */}
        <style>{`
          @keyframes blob {
            0%, 100% {
              transform: translate(0, 0) scale(1);
            }
            50% {
              transform: translate(50px, -30px) scale(1.2);
            }
          }
          @keyframes blob-reverse {
            0%, 100% {
              transform: translate(0, 0) scale(1);
            }
            50% {
              transform: translate(-40px, 40px) scale(1.3);
            }
          }
          @keyframes fade-in {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes gradient {
            0%, 100% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
          }
          @keyframes fade-in-up {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes wiggle {
            0%, 100% {
              transform: rotate(0deg);
            }
            25% {
              transform: rotate(10deg);
            }
            75% {
              transform: rotate(-10deg);
            }
          }
          @keyframes placeholderFade {
            0% {
              opacity: 0;
              transform: translateY(20px);
            }
            100% {
              opacity: 0.6;
              transform: translateY(0);
            }
          }
          @keyframes gradientShift {
            0%, 100% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
          }
          @keyframes slideUp {
            0% {
              opacity: 0;
              transform: translateY(15px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>

      {/* Unified Navbar & Hero Section */}
      <div className="relative w-full overflow-hidden min-h-[39vh] lg:min-h-[50vh] md:pt-36">
        {/* Hero Banner Carousel Background */}
        <HeroBannerCarousel banners={heroBannersData} loading={loadingBanners} />

        {/* Navbar */}
        <motion.div
          className="relative z-20 pt-7 sm:pt-7 lg:pt-7"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <PageNavbar textColor="black" zIndex={20} mobileTranslateYClass="translate-y-[12px]" />
        </motion.div>

        {/* Hero Section */}
        <section className="relative z-20 w-full py-6 sm:py-8 md:py-12 lg:py-12">
          {/* Content */}
          <div className="relative z-20 max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-3 sm:px-6 lg:px-8">
            {/* Search Bar and VEG MODE Container - Sticky */}
            {!isSearchOpen && (
            <motion.div
              className="sticky top-6 z-30 flex items-center gap-3 sm:gap-4 lg:gap-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            >
              {/* Enhanced Search Bar */}
              <SearchBar
                value={heroSearch}
                onChange={setHeroSearch}
                onFocus={handleSearchFocus}
                onClose={handleSearchClose}
                isSearchOpen={isSearchOpen}
              />

              {/* VEG MODE Toggle */}
              <VegModeToggle
                checked={vegMode}
                onCheckedChange={handleVegModeChange}
                toggleRef={vegModeToggleRef}
              />
            </motion.div>
            )}
          </div>
        </section>
      </div>

      {/* Rest of Content - Container Width with Unified Background */}
      <motion.div
        className="relative max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 space-y-0 pt-2 sm:pt-3 lg:pt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        {/* Food Categories - Horizontal Scroll */}
        <CategoryCarousel
          categories={realCategories}
          landingCategories={landingCategories}
          loading={loadingRealCategories}
          limit={10}
          onShowAllClick={() => setShowAllCategoriesModal(true)}
        />

        {/* Filters */}
        <motion.section
          className="py-1 lg:py-2"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div
            className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 overflow-x-auto scrollbar-hide pb-1 lg:pb-2"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {/* Filter Button - Opens Modal */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                variant="outline"
                onClick={() => setIsFilterOpen(true)}
                className="h-7 sm:h-8 px-2 sm:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 font-medium transition-all bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-white"
              >
                <SlidersHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm font-bold text-black dark:text-white">Filters</span>
              </Button>
            </motion.div>

            {/* Filter Buttons */}
            {[
              { id: 'delivery-under-30', label: 'Under 30 mins' },
              { id: 'delivery-under-45', label: 'Under 45 mins' },
              { id: 'distance-under-1km', label: 'Under 1km', icon: MapPin },
              { id: 'distance-under-2km', label: 'Under 2km', icon: MapPin },
            ].map((filter, index) => {
              const Icon = filter.icon
              const isActive = activeFilters.has(filter.id)
              return (
                <motion.div
                  key={filter.id}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    variant="outline"
                    onClick={() => {
                      toggleFilter(filter.id)
                      setIsLoadingFilterResults(true)
                      // Simulate loading for 1 second
                      setTimeout(() => {
                        setIsLoadingFilterResults(false)
                      }, 500)
                    }
                    }
                    className={`h-7 sm:h-8 px-2 sm:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition-all font-medium ${isActive
                      ? 'bg-green-600 text-white border border-green-600 hover:bg-green-600/90'
                      : 'bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}
                  >
                    {Icon && <Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${isActive ? 'fill-white' : ''}`} />}
                    <span className="text-xs sm:text-sm font-bold text-black dark:text-white">{filter.label}</span>
                  </Button>
                </motion.div>
              )
            })}
          </div>
        </motion.section>

        {/* Recommended For You Section */}
        {showRecommendedSection && recommendedRestaurants.length > 0 && (
          <motion.section
            className="pt-2 sm:pt-3"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
          >
            <motion.h2
              className="text-xs sm:text-sm lg:text-base font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-2 sm:mb-3 px-1"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              RECOMMENDED FOR YOU
            </motion.h2>

            <div
              className="grid grid-rows-2 grid-flow-col auto-cols-[32%] sm:auto-cols-[24%] lg:auto-cols-[20%] gap-2 sm:gap-3 lg:gap-4 overflow-x-scroll scrollbar-hide pb-1 pr-2 snap-x snap-mandatory"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {recommendedRestaurants.map((restaurant, index) => {
                const restaurantName = restaurant.name || "Restaurant"
                const restaurantSlug = restaurant.slug || restaurantName.toLowerCase().replace(/\s+/g, "-")
                const restaurantEta =
                  restaurant.deliveryTime ||
                  restaurant.estimatedDeliveryTime ||
                  "25-30 mins"
                return (
                  <Link
                    key={`recommended-${restaurant.id || restaurantSlug}`}
                    to={`/user/restaurants/${restaurantSlug}`}
                    className="block snap-start"
                  >
                    <div className="group min-w-0">
                      <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                        {restaurant.image ? (
                          <img
                            src={restaurant.image}
                            alt={restaurantName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              e.target.style.display = "none"
                              const placeholder = document.createElement("div")
                              placeholder.className = "w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-4xl"
                              placeholder.textContent = "🍽️"
                              e.target.parentElement.appendChild(placeholder)
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-4xl">
                            🍽️
                          </div>
                        )}

                        <div className="absolute bottom-1 left-1 bg-green-600 text-white text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 leading-none">
                          <Star className="h-2.5 w-2.5 fill-white text-white" />
                          <span>
                            {Number(restaurant.rating || 0) > 0
                              ? Number(restaurant.rating).toFixed(1)
                              : "0"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-1">
                        <h3 className="text-[11px] sm:text-xs font-semibold text-gray-900 dark:text-white line-clamp-1 leading-tight">
                          {restaurantName}
                        </h3>
                        <div className="mt-0.5">
                          <FlipBadge etaText={restaurantEta} staggerMs={index * 250} />
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </motion.section>
        )}

        {/* Explore More Section */}
        <motion.section
          className="pt-2 sm:pt-3 lg:pt-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
        >
          <motion.h2
            className="text-xs sm:text-sm lg:text-base font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-2 sm:mb-3 lg:mb-4 px-1"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {exploreMoreHeading}
          </motion.h2>
          <div
            className="flex gap-2 sm:gap-3 lg:gap-4 overflow-x-auto scrollbar-hide pb-2 lg:pb-3"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {loadingLandingConfig ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : landingExploreMore.length === 0 ? (
              // Fallback to hardcoded explore more if API returns empty
              [
                {
                  id: 'offers',
                  label: 'Offers',
                  image: exploreOffers,
                  href: '/user/offers'
                },
                {
                  id: 'gourmet',
                  label: 'Gourmet',
                  image: exploreGourmet,
                  href: '/user/gourmet'
                },
                {
                  id: 'top10',
                  label: 'Top 10',
                  image: exploreTop10,
                  href: '/user/top-10'
                },
                {
                  id: 'collection',
                  label: 'Collections',
                  image: exploreCollection,
                  href: '/user/profile/favorites'
                },
              ].map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.1,
                    type: "spring",
                    stiffness: 100
                  }}
                  whileHover={{ scale: 1.1, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link to={item.href} className="flex-shrink-0 bg-white  dark:bg-[#1a1a1a]/80 dark:text-white">
                    <div className="flex flex-col items-center gap-2.5 w-[88px] sm:w-[104px] md:w-[112px] group">
                      <div className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] md:w-[96px] md:h-[96px] rounded-2xl bg-white dark:bg-[#1a1a1a]/80 dark:text-white flex items-center justify-center shadow-sm group-hover:shadow-lg transition-all duration-300 overflow-hidden p-2.5">
                        <OptimizedImage
                          src={item.image}
                          alt={item.label}
                          className="w-full h-full dark:rounded-md"
                          width={112}
                          height={112}
                          sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, 112px"
                          objectFit="contain"
                          placeholder="blur"
                        />
                      </div>
                      <span className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">
                        {item.label}
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))
            ) : (
              landingExploreMore
                .filter(item => item.id !== 'giftcard' && item.label?.toLowerCase() !== 'gift card')
                .map((item, index) => (
                  <motion.div
                    key={item._id}
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.4,
                      delay: index * 0.1,
                      type: "spring",
                      stiffness: 100
                    }}
                    whileHover={{ scale: 1.1, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Link to={item.link} className="flex-shrink-0 bg-white dark:bg-[#1a1a1a]/80 dark:text-white">
                      <div className="flex flex-col items-center gap-2.5 w-[88px] sm:w-[104px] md:w-[112px] group">
                        <div className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] md:w-[96px] md:h-[96px] rounded-2xl bg-white dark:bg-[#1a1a1a]/80 dark:text-white  flex items-center justify-center shadow-sm group-hover:shadow-lg transition-all duration-300 overflow-hidden p-2.5">
                          <OptimizedImage
                            src={item.imageUrl}
                            alt={item.label}
                            className="w-full h-full"
                            width={112}
                            height={112}
                            sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, 112px"
                            objectFit="contain"
                            placeholder="blur"
                            onError={() => { }}
                          />
                        </div>
                        <span className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">
                          {item.label}
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))
            )}
          </div>
        </motion.section>

        {/* Featured Foods - Horizontal Scroll */}

        {/* Restaurants - Enhanced with Animations */}
        <motion.section
          className="space-y-0 pt-3 sm:pt-4 lg:pt-6 pb-20 md:pb-24"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="px-1 mb-3 lg:mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col gap-0.5 lg:gap-1">
              <h2 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-400 tracking-widest uppercase">
                {filteredRestaurants.length} Restaurants Delivering to You
              </h2>
              <span className="text-base sm:text-lg lg:text-2xl text-gray-500 font-normal">Featured</span>
            </div>
          </motion.div>
          <div className="relative">
            {/* Loading Overlay */}
            <AnimatePresence>
              {(isLoadingFilterResults || loadingRestaurants) && (
                <motion.div
                  className="absolute inset-0 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg min-h-[400px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 text-green-600 animate-spin" strokeWidth={2.5} />
                    <span className="text-sm font-medium text-gray-700 dark:text-white">Loading restaurants...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3  gap-3 sm:gap-4 lg:gap-5 xl:gap-6 pt-1 sm:pt-1.5 lg:pt-2 items-stretch ${isLoadingFilterResults || loadingRestaurants ? 'opacity-50' : 'opacity-100'} transition-opacity duration-300`}>
              {filteredRestaurants.map((restaurant, index) => {
                const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-")
                // Direct favorite check - isFavorite is already memoized in context
                const favorite = isFavorite(restaurantSlug)

                const handleToggleFavorite = (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (favorite) {
                    // If already bookmarked, show Manage Collections modal
                    setSelectedRestaurantSlug(restaurantSlug)
                    setShowManageCollections(true)
                  } else {
                    // Add to favorites and show toast
                    addFavorite({
                      slug: restaurantSlug,
                      name: restaurant.name,
                      cuisine: restaurant.cuisine,
                      rating: restaurant.rating,
                      deliveryTime: restaurant.deliveryTime,
                      distance: restaurant.distance,
                      priceRange: restaurant.priceRange,
                      image: restaurant.image
                    })
                    setShowToast(true)
                    setTimeout(() => {
                      setShowToast(false)
                    }, 3000)
                  }
                }

                return (
                  <div
                    key={restaurant.id}
                    className="h-full transform transition-all duration-300 hover:-translate-y-3 hover:scale-[1.02]"
                    style={{
                      perspective: 1000,
                      animation: index < 10 ? `fade-in-up 0.5s ease-out ${index * 0.05}s backwards` : 'none'
                    }}
                  >
                    <div className="h-full group">
                      {(restaurant.isAcceptingOrders === false || restaurant.isAcceptingOrders === 0) ? (
                        <div className="h-full flex cursor-not-allowed">
                          <Card className={`overflow-hidden gap-0 cursor-not-allowed border-0 dark:border-gray-800 group bg-white dark:bg-[#1a1a1a] border-background transition-all duration-500 py-0 rounded-2xl sm:rounded-3xl flex flex-col h-full w-full relative grayscale-[100%] opacity-80`}>
                          {/* Image Section with Carousel */}
                          <div className="relative">
                            <RestaurantImageCarousel
                              restaurant={restaurant}
                              priority={index < 4}
                              menuOnly
                            />

                            {/* CURRENTLY CLOSED Banner - Center Overlay (when restaurant is offline) */}
                            {(restaurant.isAcceptingOrders === false || restaurant.isAcceptingOrders === 0) && (
                              <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                <div className="bg-gray-800/95 backdrop-blur-sm text-white px-4 py-2 md:px-6 md:py-3 rounded-lg transform -rotate-12 shadow-2xl border-2 border-gray-700">
                                  <span className="text-sm md:text-base lg:text-lg font-bold tracking-wide">
                                    CURRENTLY CLOSED
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Featured Dish Badge - Top Left */}
                            <div className="absolute top-3 left-3 md:top-4 md:left-4 flex items-center z-10 transform transition-transform duration-300 group-hover:scale-105 group-hover:-translate-y-0.5">
                              <div className="bg-gray-800/90 backdrop-blur-sm text-white px-2 py-1 md:px-4 md:py-1.5 rounded-md text-xs font-medium flex items-center shadow-lg">
                                {restaurant.featuredDish} · ₹{restaurant.featuredPrice}
                              </div>
                            </div>

                            {/* Bookmark Icon - Top Right */}
                            <div className="absolute top-3 right-3 md:top-4 md:right-4 z-10 transform transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleToggleFavorite}
                                aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                                className={`h-9 w-9 md:h-11 md:w-11 rounded-full border flex items-center justify-center transition-all duration-300 ${favorite
                                  ? "border-red-500 bg-red-50 text-red-500"
                                  : "border-white bg-white/90 text-gray-600 hover:bg-white"
                                  }`}
                              >
                                <Bookmark
                                  className={`h-5 w-5 lg:h-6 lg:w-6 transition-all duration-300 ${favorite ? "fill-red-500" : ""
                                    }`} />
                              </Button>
                            </div>

                            {/* FREE delivery Badge - Bottom Left (only for first 3 restaurants) */}
                            {index < 3 && (
                              <div className="absolute bottom-2 left-0 sm:bottom-2 sm:left-0 z-10 transform transition-all duration-300 group-hover:translate-x-1">
                                <div className="bg-gradient-to-r from-blue-600 via-blue-500/80 to-transparent text-white px-2.5 py-1 rounded-r-sm text-[10px] sm:text-xs font-bold shadow-lg backdrop-blur-sm">
                                  FREE delivery
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Content Section */}
                          <div className="transform transition-transform duration-300 group-hover:-translate-y-1">
                            <CardContent className="p-3 sm:p-4 lg:p-5 pt-3 sm:pt-4 lg:pt-5 flex flex-col flex-grow">
                              {/* Restaurant Name & Rating */}
                              <div className="flex items-start justify-between gap-2 mb-2 lg:mb-3">
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-md sm:text-md lg:text-xl font-bold text-gray-900 dark:text-white line-clamp-1 lg:line-clamp-2 transition-colors duration-300 group-hover:text-green-600">
                                    {restaurant.name}
                                  </h3>
                                </div>
                                <div className="flex-shrink-0 bg-green-600 text-white px-2 py-1 lg:px-3 lg:py-1.5 rounded-lg flex items-center gap-1 transform transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                                  <span className="text-sm lg:text-base font-bold">{restaurant.rating}</span>
                                  <Star className="h-3 w-3 lg:h-4 lg:w-4 fill-white text-white" />
                                </div>
                              </div>

                              {/* Delivery Time & Distance */}
                              <div className="flex items-center gap-1 text-sm lg:text-base text-gray-500 mb-2 lg:mb-3 transition-opacity duration-300 opacity-70 group-hover:opacity-100">
                                <Clock className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500 dark:text-gray-400" strokeWidth={1.5} />
                                <span className="font-medium dark:text-gray-300 text-gray-700">{restaurant.deliveryTime}</span>
                                <span className="mx-1">|</span>
                                <span className="font-medium dark:text-gray-300 text-gray-700">{restaurant.distance}</span>
                              </div>

                              {/* Offer Badge */}
                              {restaurant.offer && (
                                <div className="flex items-center gap-2 text-sm lg:text-base mt-auto transform transition-transform duration-300 group-hover:translate-x-1">
                                  <BadgePercent className="h-4 w-4 lg:h-5 lg:w-5 text-black" strokeWidth={2} />
                                  <span className="text-gray-700 dark:text-gray-300 font-medium">{restaurant.offer}</span>
                                </div>
                              )}
                            </CardContent>
                          </div>

                          {/* Border Glow Effect */}
                          <div className="absolute inset-0 rounded-2xl sm:rounded-3xl pointer-events-none z-0 transition-all duration-300 border border-transparent group-hover:border-green-500/30 group-hover:shadow-[inset_0_0_0_1px_rgba(34,197,94,0.2)]" />
                        </Card>
                      </div>
                      ) : (
                        <Link 
                          to={`/user/restaurants/${restaurantSlug}`} 
                          state={{ restaurant }}
                          className="h-full flex"
                        >
                          <Card className={`overflow-hidden gap-0 cursor-pointer border-0 dark:border-gray-800 group bg-white dark:bg-[#1a1a1a] border-background transition-all duration-500 py-0 rounded-2xl sm:rounded-3xl flex flex-col h-full w-full relative ${isOutOfService ? 'grayscale-[100%] opacity-80' : ''
                            }`}>
                            {/* Image Section with Carousel */}
                            <div className="relative">
                              <RestaurantImageCarousel
                                restaurant={restaurant}
                                priority={index < 4}
                                menuOnly
                              />

                              {/* Featured Dish Badge - Top Left */}
                              <div className="absolute top-3 left-3 md:top-4 md:left-4 flex items-center z-10 transform transition-transform duration-300 group-hover:scale-105 group-hover:-translate-y-0.5">
                                <div className="bg-gray-800/90 backdrop-blur-sm text-white px-2 py-1 md:px-4 md:py-1.5 rounded-md text-xs font-medium flex items-center shadow-lg">
                                  {restaurant.featuredDish} · ₹{restaurant.featuredPrice}
                                </div>
                              </div>

                              {/* Bookmark Icon - Top Right */}
                              <div className="absolute top-3 right-3 md:top-4 md:right-4 z-10 transform transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={handleToggleFavorite}
                                  aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                                  className={`h-9 w-9 md:h-11 md:w-11 rounded-full border flex items-center justify-center transition-all duration-300 ${favorite
                                    ? "border-red-500 bg-red-50 text-red-500"
                                    : "border-white bg-white/90 text-gray-600 hover:bg-white"
                                    }`}
                                >
                                  <Bookmark
                                    className={`h-5 w-5 lg:h-6 lg:w-6 transition-all duration-300 ${favorite ? "fill-red-500" : ""
                                      }`} />
                                </Button>
                              </div>

                              {/* FREE delivery Badge - Bottom Left (only for first 3 restaurants) */}
                              {index < 3 && (
                                <div className="absolute bottom-2 left-0 sm:bottom-2 sm:left-0 z-10 transform transition-all duration-300 group-hover:translate-x-1">
                                  <div className="bg-gradient-to-r from-blue-600 via-blue-500/80 to-transparent text-white px-2.5 py-1 rounded-r-sm text-[10px] sm:text-xs font-bold shadow-lg backdrop-blur-sm">
                                    FREE delivery
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Content Section */}
                            <div className="transform transition-transform duration-300 group-hover:-translate-y-1">
                              <CardContent className="p-3 sm:p-4 lg:p-5 pt-3 sm:pt-4 lg:pt-5 flex flex-col flex-grow">
                                {/* Restaurant Name & Rating */}
                                <div className="flex items-start justify-between gap-2 mb-2 lg:mb-3">
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-md sm:text-md lg:text-xl font-bold text-gray-900 dark:text-white line-clamp-1 lg:line-clamp-2 transition-colors duration-300 group-hover:text-green-600">
                                      {restaurant.name}
                                    </h3>
                                  </div>
                                  <div className="flex-shrink-0 bg-green-600 text-white px-2 py-1 lg:px-3 lg:py-1.5 rounded-lg flex items-center gap-1 transform transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                                    <span className="text-sm lg:text-base font-bold">{restaurant.rating}</span>
                                    <Star className="h-3 w-3 lg:h-4 lg:w-4 fill-white text-white" />
                                  </div>
                                </div>

                                {/* Delivery Time & Distance */}
                                <div className="flex items-center gap-1 text-sm lg:text-base text-gray-500 mb-2 lg:mb-3 transition-opacity duration-300 opacity-70 group-hover:opacity-100">
                                  <Clock className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500 dark:text-gray-400" strokeWidth={1.5} />
                                  <span className="font-medium dark:text-gray-300 text-gray-700">{restaurant.deliveryTime}</span>
                                  <span className="mx-1">|</span>
                                  <span className="font-medium dark:text-gray-300 text-gray-700">{restaurant.distance}</span>
                                </div>

                                {/* Offer Badge */}
                                {restaurant.offer && (
                                  <div className="flex items-center gap-2 text-sm lg:text-base mt-auto transform transition-transform duration-300 group-hover:translate-x-1">
                                    <BadgePercent className="h-4 w-4 lg:h-5 lg:w-5 text-black" strokeWidth={2} />
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">{restaurant.offer}</span>
                                  </div>
                                )}
                              </CardContent>
                            </div>

                            {/* Border Glow Effect */}
                            <div className="absolute inset-0 rounded-2xl sm:rounded-3xl pointer-events-none z-0 transition-all duration-300 border border-transparent group-hover:border-green-500/30 group-hover:shadow-[inset_0_0_0_1px_rgba(34,197,94,0.2)]" />
                          </Card>
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex justify-center pt-2 sm:pt-3">
            {/* <Link to="/restaurants">
              <Button variant="outline" className="bg-transparent outline-none text-green-600 hover:opacity-80 border-none underline shadow-none  text-xs sm:text-sm md:text-base sm:hidden">
                See All Restaurants
              </Button>
            </Link> */}
          </div>
        </motion.section>
      </motion.div>

      {/* Filter Modal - Bottom Sheet */}
      <AnimatePresence>
        {isFilterOpen && (
          <div className="fixed inset-0 z-[100]">
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/50"
              onClick={() => setIsFilterOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />

            {/* Modal Content */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] rounded-t-3xl max-h-[85vh] flex flex-col"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 400,
                duration: 0.3
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b dark:border-gray-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Filters and sorting</h2>
                <button
                  onClick={() => {
                    setActiveFilters(new Set())
                    setSortBy(null)
                    setSelectedCuisine(null)
                  }}
                  className="text-green-600 font-medium text-sm"
                >
                  Clear all
                </button>
              </div>

              {/* Body */}
              <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar - Tabs */}
                <div className="w-24 sm:w-28 bg-gray-50 dark:bg-[#0a0a0a] border-r dark:border-gray-800 flex flex-col">
                  {[
                    { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
                    { id: 'rating', label: 'Rating', icon: Star },
                    { id: 'distance', label: 'Distance', icon: MapPin },
                    { id: 'price', label: 'Dish Price', icon: IndianRupee },
                    { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
                  ].map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeScrollSection === tab.id || activeFilterTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveFilterTab(tab.id)
                          const section = filterSectionRefs.current[tab.id]
                          if (section) {
                            section.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                        }}
                        className={`flex flex-col items-center gap-1 py-4 px-2 text-center relative transition-colors ${isActive ? 'bg-white dark:bg-[#1a1a1a] text-green-600' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-600 rounded-r" />
                        )}
                        <Icon className="h-5 w-5" strokeWidth={1.5} />
                        <span className="text-xs font-medium leading-tight">{tab.label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Right Content Area - Scrollable */}
                <div ref={rightContentRef} className="flex-1 overflow-y-auto p-4">
                  {/* Sort By Tab */}
                  <div
                    ref={el => filterSectionRefs.current['sort'] = el}
                    data-section-id="sort"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Sort by</h3>
                    <div className="flex flex-col gap-3">
                      {[
                        { id: null, label: 'Relevance' },
                        { id: 'price-low', label: 'Price: Low to High' },
                        { id: 'price-high', label: 'Price: High to Low' },
                        { id: 'rating-high', label: 'Rating: High to Low' },
                        { id: 'rating-low', label: 'Rating: Low to High' },
                      ].map((option) => (
                        <button
                          key={option.id || 'relevance'}
                          onClick={() => setSortBy(option.id)}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${sortBy === option.id
                            ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                            }`}
                        >
                          <span className={`text-sm font-medium ${sortBy === option.id ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Tab */}
                  <div
                    ref={el => filterSectionRefs.current['time'] = el}
                    data-section-id="time"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Delivery Time</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('delivery-under-30')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('delivery-under-30')
                          ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                          }`}
                      >
                        <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-30') ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('delivery-under-30') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Under 30 mins</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('delivery-under-45')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('delivery-under-45')
                          ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                          }`}
                      >
                        <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-45') ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('delivery-under-45') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Under 45 mins</span>
                      </button>
                    </div>
                  </div>

                  {/* Rating Tab */}
                  <div
                    ref={el => filterSectionRefs.current['rating'] = el}
                    data-section-id="rating"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900  dark:text-white mb-4">Restaurant Rating</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('rating-35-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-35-plus')
                          ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-35-plus') ? 'text-green-600 fill-green-600' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-35-plus') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Rated 3.5+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-4-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-4-plus')
                          ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-4-plus') ? 'text-green-600 fill-green-600' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-4-plus') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.0+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-45-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-45-plus')
                          ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-45-plus') ? 'text-green-600 fill-green-600' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-45-plus') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.5+</span>
                      </button>
                    </div>
                  </div>

                  {/* Distance Tab */}
                  <div
                    ref={el => filterSectionRefs.current['distance'] = el}
                    data-section-id="distance"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Distance</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('distance-under-1km')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('distance-under-1km')
                          ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                          }`}
                      >
                        <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-1km') ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('distance-under-1km') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Under 1 km</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('distance-under-2km')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('distance-under-2km')
                          ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                          }`}
                      >
                        <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-2km') ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('distance-under-2km') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Under 2 km</span>
                      </button>
                    </div>
                  </div>

                  {/* Price Tab */}
                  <div
                    ref={el => filterSectionRefs.current['price'] = el}
                    data-section-id="price"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Dish Price</h3>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => toggleFilter('price-under-200')}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('price-under-200')
                          ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                          }`}
                      >
                        <span className={`text-sm font-medium ${activeFilters.has('price-under-200') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹200</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('price-under-500')}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('price-under-500')
                          ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                          }`}
                      >
                        <span className={`text-sm font-medium ${activeFilters.has('price-under-500') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹500</span>
                      </button>
                    </div>
                  </div>

                  {/* Cuisine Tab */}
                  <div
                    ref={el => filterSectionRefs.current['cuisine'] = el}
                    data-section-id="cuisine"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cuisine</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {['Chinese', 'American', 'Japanese', 'Italian', 'Mexican', 'Indian', 'Asian', 'Seafood', 'Desserts', 'Cafe', 'Healthy'].map((cuisine) => (
                        <button
                          key={cuisine}
                          onClick={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                          className={`px-4 py-3 rounded-xl border text-center transition-colors ${selectedCuisine === cuisine
                            ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                            }`}
                        >
                          <span className={`text-sm font-medium ${selectedCuisine === cuisine ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>
                            {cuisine}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Trust Markers Tab */}
                  {activeFilterTab === 'trust' && (
                    <div
                      ref={el => filterSectionRefs.current['trust'] = el}
                      data-section-id="trust"
                      className="space-y-4 mb-8"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Trust Markers</h3>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => toggleFilter('top-rated')}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('top-rated')
                            ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                            }`}
                        >
                          <span className={`text-sm font-medium ${activeFilters.has('top-rated') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Top Rated</span>
                        </button>
                        <button
                          onClick={() => toggleFilter('trusted')}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('trusted')
                            ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                            }`}
                        >
                          <span className={`text-sm font-medium ${activeFilters.has('trusted') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Trusted by 1000+ users</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Offers Tab */}
                  {activeFilterTab === 'offers' && (
                    <div
                      ref={el => filterSectionRefs.current['offers'] = el}
                      data-section-id="offers"
                      className="space-y-4 mb-8"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Offers</h3>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => toggleFilter('has-offers')}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('has-offers')
                            ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:border-green-600'
                            }`}
                        >
                          <span className={`text-sm font-medium ${activeFilters.has('has-offers') ? 'text-green-600' : 'text-gray-700 dark:text-gray-300'}`}>Restaurants with offers</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 px-4 py-4 border-t dark:border-gray-800 bg-white dark:bg-[#1a1a1a]">
                <button
                  onClick={() => setIsFilterOpen(false)}
                  className="flex-1 py-3 text-center font-semibold text-gray-700 dark:text-gray-300"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    // Apply filters
                    setAppliedFilters({
                      activeFilters: new Set(activeFilters),
                      sortBy,
                      selectedCuisine
                    })
                    setIsLoadingFilterResults(true)
                    setIsFilterOpen(false)

                    // Refetch restaurants with new filters
                    try {
                      await fetchRestaurants({
                        activeFilters: new Set(activeFilters),
                        sortBy,
                        selectedCuisine
                      })
                    } catch (error) {
                    } finally {
                      setIsLoadingFilterResults(false)
                    }
                  }}
                  className={`flex-1 py-3 font-semibold rounded-xl transition-colors ${activeFilters.size > 0 || sortBy || selectedCuisine
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-200 text-gray-500'
                    }`}
                  disabled={isLoadingFilterResults}
                >
                  {isLoadingFilterResults ? (
                    'Loading...'
                  ) : activeFilters.size > 0 || sortBy || selectedCuisine ? (
                    `Show results`
                  ) : (
                    'Show results'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Veg Mode Popup */}
      <VegModePopup
        isOpen={showVegModePopup}
        onClose={() => {
          setShowVegModePopup(false)
          setVegModeContext(false)
          setPrevVegMode(false)
        }}
        position={popupPosition}
        vegModeOption={vegModeOption}
        onOptionChange={setVegModeOption}
        onApply={() => {
          setShowVegModePopup(false)
          setIsApplyingVegMode(true)
          setVegModeContext(true)
          setPrevVegMode(true)
          setTimeout(() => {
            setIsApplyingVegMode(false)
          }, 2000)
        }}
        onMoreSettings={() => {
          setShowVegModePopup(false)
          setVegModeContext(false)
          setPrevVegMode(false)
        }}
      />

      {/* Switch Off Veg Mode Popup */}
      <SwitchOffVegModePopup
        isOpen={showSwitchOffPopup}
        onClose={() => {
          setShowSwitchOffPopup(false)
          isHandlingSwitchOff.current = false
          setVegMode(true)
        }}
        onSwitchOff={() => {
          setShowSwitchOffPopup(false)
          setIsSwitchingOffVegMode(true)
          setTimeout(() => {
            setIsSwitchingOffVegMode(false)
            isHandlingSwitchOff.current = false
            setVegModeContext(false)
            setPrevVegMode(false)
          }, 2000)
        }}
        onKeepUsing={() => {
          setShowSwitchOffPopup(false)
          isHandlingSwitchOff.current = false
          setVegModeContext(true)
        }}
      />

      {/* All Categories Modal */}
      <AnimatePresence>
        {showAllCategoriesModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowAllCategoriesModal(false)}
              className="fixed inset-0 bg-black/40 z-[9998] backdrop-blur-sm"
            />

            {/* Modal - Full screen with rounded corners */}
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 300
              }}
              className="fixed inset-x-0 bottom-0 top-12 sm:top-16 md:top-20 z-[9999] bg-white dark:bg-[#1a1a1a] rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  All Categories
                </h2>
                <button
                  onClick={() => setShowAllCategoriesModal(false)}
                  className="p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              {/* Categories Grid - Scrollable */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 sm:py-5">
                <div className="grid grid-cols-3 gap-4 sm:gap-5 md:gap-6">
                  {(allCategories.length > 0 ? allCategories : (realCategories.length > 0 ? realCategories : landingCategories)).map((category, index) => {
                    const isAdminCategory = allCategories.length > 0 || realCategories.length > 0
                    const categoryData = isAdminCategory
                      ? { name: category.name, image: category.image, slug: category.slug }
                      : { name: category.label, image: category.imageUrl, slug: category.slug }

                    return (
                      <motion.div
                        key={category.id || category._id || index}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          duration: 0.3,
                          delay: index * 0.02,
                          type: "spring",
                          stiffness: 100
                        }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Link
                          to={`/user/category/${categoryData.slug || categoryData.name.toLowerCase().replace(/\s+/g, '-')}`}
                          onClick={() => setShowAllCategoriesModal(false)}
                          className="block"
                        >
                          <div className="flex flex-col items-center gap-2 sm:gap-2.5 cursor-pointer w-full">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full overflow-hidden shadow-md transition-all hover:shadow-lg flex-shrink-0">
                              <OptimizedImage
                                src={categoryData.image}
                                alt={categoryData.name}
                                className="w-full h-full bg-white rounded-full"
                                sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, 112px"
                                objectFit="cover"
                                placeholder="blur"
                                onError={() => { }}
                              />
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 text-center leading-tight px-1 break-words w-full min-w-0">
                              {categoryData.name}
                            </span>
                          </div>
                        </Link>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Loading Screen - Applying Veg Mode */}
      {/* <AnimatePresence>
        {isApplyingVegMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[10000] bg-white/95 backdrop-blur-md flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="relative w-32 h-32 flex items-center justify-center">
                {[...Array(8)].map((_, i) => {
                  const baseSize = 112 // Starting size (w-28 = 112px)
                  const maxSize = 600 // Maximum size to expand to
                  return (
                    <motion.div
                      key={i}
                      initial={{ 
                        scale: 1,
                        opacity: 0
                      }}
                      animate={{ 
                        scale: maxSize / baseSize,
                        opacity: [0, 0.4, 0.2, 0]
                      }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        ease: "easeOut",
                        delay: i * 0.3 // Stagger each circle by 0.3s so they appear one at a time
                      }}
                      className="absolute rounded-full border border-green-300"
                      style={{
                        width: baseSize,
                        height: baseSize,
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        transformOrigin: 'center center'
                      }}
                    />
                  )
                })}
                
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                    delay: 0.1
                  }}
                  className="relative z-10 w-28 h-28 rounded-full border-2 border-green-300 bg-white flex flex-col items-center justify-center shadow-sm"
                >
                  <motion.div
                    className="flex flex-col items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <span className="text-green-700 font-bold text-xs leading-none">100%</span>
                    <span className="text-green-700 font-bold text-xl leading-none mt-0.5">VEG</span>
                  </motion.div>
                </motion.div>
              </div>
              
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-gray-800 font-normal text-base text-center relative z-10"
              >
                Explore veg dishes from all restaurants
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence> */}

      <AnimatePresence>
        {isApplyingVegMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[10000] bg-white dark:bg-[#0a0a0a] flex items-center justify-center"
          >
            <div className="relative w-32 h-32 flex items-center justify-center w-full">
              {/* Animated circles - positioned absolutely at the center */}
              {[...Array(8)].map((_, i) => {
                const baseSize = 112
                const maxSize = 600
                return (
                  <motion.div
                    key={i}
                    initial={{
                      scale: 1,
                      opacity: 0,
                    }}
                    animate={{
                      scale: maxSize / baseSize,
                      opacity: [0, 0.4, 0.2, 0],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeOut",
                      delay: i * 0.15,
                    }}
                    className="absolute rounded-full border border-green-300 dark:border-green-600"
                    style={{
                      width: baseSize,
                      height: baseSize,
                      // left: "50%",
                      // top: "50%",
                      // transform: "translate(-50%, -50%)",
                      // transformOrigin: "center center",
                    }}
                  />
                )
              })}

              {/* 100% VEG badge - absolute positioning at exact center */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.1,
                }}
                className="absolute z-10 w-28 h-28 rounded-full border-2 border-green-600 dark:border-green-500 bg-white dark:bg-[#1a1a1a] flex flex-col items-center justify-center shadow-sm"
                style={{
                  // left: "50%",
                  // top: "50%",
                  // transform: "translate(-50%, -50%)",
                }}
              >
                <motion.div
                  className="flex flex-col items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <span className="text-green-600 dark:text-green-400 font-extrabold text-3xl leading-none">100%</span>
                  <span className="text-green-600 dark:text-green-400 font-extrabold text-3xl leading-none mt-0.5">VEG</span>
                </motion.div>
              </motion.div>

              {/* Text below badge */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-xl font-normal text-gray-800 dark:text-gray-200 text-center relative z-10 mt-56 w-full"
              >
                Explore veg dishes from all restaurants
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Loading Screen - Switching Off Veg Mode */}
      <AnimatePresence>
        {isSwitchingOffVegMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[10000] bg-white dark:bg-[#0a0a0a] flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-6">
              {/* Two Circles Spinning in Opposite Directions */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.1
                }}
                className="relative w-16 h-16 flex items-center justify-center"
              >
                {/* Outer Circle - Spins Clockwise */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    rotate: {
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "linear"
                    }
                  }}
                  className="absolute w-16 h-16 border-[4px] border-transparent border-t-pink-500 dark:border-t-pink-400 border-r-pink-500 dark:border-r-pink-400 rounded-full"
                />

                {/* Inner Circle - Spins Counter-clockwise */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{
                    rotate: {
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear"
                    }
                  }}
                  className="absolute w-12 h-12 border-[4px] border-transparent border-r-pink-500 dark:border-r-pink-400 rounded-full"
                />
              </motion.div>

              {/* Loading Text */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-center"
              >
                <motion.h2
                  className="text-xl font-normal text-gray-800 dark:text-gray-200 mb-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  Switching off
                </motion.h2>
                <motion.p
                  className="text-xl font-normal text-gray-800 dark:text-gray-200"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  Veg Mode for you
                </motion.p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification - Fixed to viewport bottom */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showToast && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ duration: 0.3, type: "spring", damping: 25 }}
                className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[10001] bg-black text-white px-6 py-3 rounded-lg shadow-2xl"
              >
                <p className="text-sm font-medium">Added to bookmark</p>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Manage Collections Modal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showManageCollections && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black/40 z-[9999]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowManageCollections(false)}
                />

                {/* Manage Collections Bottom Sheet */}
                <motion.div
                  className="fixed left-0 right-0 bottom-0 z-[10000] bg-white rounded-t-3xl shadow-2xl"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.2, type: "spring", damping: 30, stiffness: 400 }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Manage Collections</h2>
                    <button
                      onClick={() => setShowManageCollections(false)}
                      className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-800 transition-colors"
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </div>

                  {/* Collections List */}
                  <div className="px-4 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
                    {/* Bookmarks Collection */}
                    <div
                      className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Don't close modal on click, let checkbox handle it
                      }}
                    >
                      <div className="h-12 w-12 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                        <Bookmark className="h-6 w-6 text-red-500 fill-red-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-base font-medium text-gray-900">Bookmarks</span>
                          {selectedRestaurantSlug && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isFavorite(selectedRestaurantSlug)}
                                onCheckedChange={(checked) => {
                                  if (!checked) {
                                    removeFavorite(selectedRestaurantSlug)
                                    setSelectedRestaurantSlug(null)
                                    setShowManageCollections(false)
                                  }
                                }}
                                className="h-5 w-5 rounded border-2 border-red-500 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                              />
                            </div>
                          )}
                          {!selectedRestaurantSlug && (
                            <div className="h-5 w-5 rounded border-2 border-red-500 bg-red-500 flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {getFavorites().length} restaurant{getFavorites().length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Create new Collection */}
                    <button
                      className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                      onClick={() => setShowManageCollections(false)}
                    >
                      <div className="h-12 w-12 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                        <Plus className="h-6 w-6 text-red-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-base font-medium text-gray-900">
                          Create new Collection
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Done Button */}
                  <div className="border-t border-gray-200 px-4 py-4">
                    <Button
                      className="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 py-3 rounded-lg font-medium"
                      onClick={() => {
                        setSelectedRestaurantSlug(null)
                        setShowManageCollections(false)
                      }}
                    >
                      Done
                    </Button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Rating & Feedback Modal (delivered orders) */}
      {ratingModal.open && ratingModal.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-gradient-to-r from-[#E23744] to-red-600 px-6 py-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Star className="w-5 h-5 fill-white" />
                  Rate Your Order
                </h2>
                <button
                  type="button"
                  onClick={handleCloseRatingModal}
                  className="text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
                >
                  <span className="text-xl">✕</span>
                </button>
              </div>
              <p className="text-sm text-white/90">
                {ratingModal.order.restaurant} • Order #{ratingModal.order.id}
              </p>
            </div>

            <div className="px-6 py-6">
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-900 mb-4 text-center">
                  How was your overall experience?
                </p>
                <div className="flex items-center justify-center gap-2 mb-3">
                  {Array.from({ length: 5 }, (_, i) => i + 1).map((num) => {
                    const isActive = (selectedRating || 0) >= num
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSelectedRating(num)}
                        className="p-2 transition-transform hover:scale-125 active:scale-95"
                      >
                        <Star
                          className={`w-10 h-10 transition-all ${
                            isActive
                              ? "text-yellow-400 fill-yellow-400 drop-shadow-lg"
                              : "text-gray-300 hover:text-yellow-200"
                          }`}
                        />
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between mt-2 px-2">
                  <span className="text-xs text-red-500 font-medium">Poor</span>
                  <span className="text-xs text-gray-400">Average</span>
                  <span className="text-xs text-green-600 font-medium">
                    Excellent
                  </span>
                </div>
                {selectedRating && (
                  <p className="text-center mt-3 text-sm font-medium text-gray-700">
                    {selectedRating === 5 && "⭐⭐⭐⭐⭐ Excellent!"}
                    {selectedRating === 4 && "⭐⭐⭐⭐ Great!"}
                    {selectedRating === 3 && "⭐⭐⭐ Good"}
                    {selectedRating === 2 && "⭐⭐ Fair"}
                    {selectedRating === 1 && "⭐ Poor"}
                  </p>
                )}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Share your feedback{" "}
                  <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={4}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E23744] focus:border-[#E23744] resize-none transition-all"
                  placeholder="What did you like or dislike about this order? Share your experience..."
                />
                <p className="text-xs text-gray-400 mt-1">
                  Your feedback helps us improve our service
                </p>
              </div>

              <button
                type="button"
                disabled={submittingRating || selectedRating === null}
                onClick={handleSubmitRating}
                className="w-full rounded-xl bg-gradient-to-r from-[#E23744] to-red-600 text-white text-base font-bold py-3.5 hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-red-500/30 flex items-center justify-center gap-2"
              >
                {submittingRating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Star className="w-5 h-5 fill-white" />
                    Submit Rating
                  </>
                )}
              </button>

              {selectedRating === null && (
                <p className="text-xs text-center text-red-500 mt-2">
                  Please select a rating to continue
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <StickyCartCard />
      <OrderTrackingCard />
    </div>
  )
}
