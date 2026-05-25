import { useState, useMemo, useRef, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Star, Clock, Search, SlidersHorizontal, ChevronDown, Bookmark, BadgePercent, MapPin, ArrowDownUp, Timer, IndianRupee, UtensilsCrossed, ShieldCheck, X, Loader2, Plus, Minus, Share2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AddToCartAnimation from "../components/AddToCartAnimation"

// Import shared food images - prevents duplication
import { foodImages } from "@/constants/images"
import offerImage from "@/assets/offerimage.png"
import api from "@/lib/api"
import { restaurantAPI, adminAPI } from "@/lib/api"
import { useProfile } from "../context/ProfileContext"
import { useCart } from "../context/CartContext"
import { useSharedLocation } from "@/lib/context/LocationContext"

// Filter options
const filterOptions = [
  { id: 'under-30-mins', label: 'Under 30 mins' },
  { id: 'price-match', label: 'Price Match', hasIcon: true },
  { id: 'flat-50-off', label: 'Flat 50% OFF', hasIcon: true },
  { id: 'under-250', label: 'Under ₹250' },
  { id: 'rating-4-plus', label: 'Rating 4.0+' },
]

// Mock data removed - using backend data only

export default function CategoryPage() {
  const { category } = useParams()
  const navigate = useNavigate()
  const { vegMode } = useProfile()
  const { addToCart, getCartItem, updateQuantity, getCartItemId } = useCart()
  const { location, zoneId, isOutOfService } = useSharedLocation()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState(category?.toLowerCase() || 'all')
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [favorites, setFavorites] = useState(new Set())
  const [bookmarkedDishes, setBookmarkedDishes] = useState(new Set())
  const [sortBy, setSortBy] = useState(null)
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const [activeScrollSection, setActiveScrollSection] = useState('sort')
  const [isLoadingFilterResults, setIsLoadingFilterResults] = useState(false)
  const filterSectionRefs = useRef({})
  const rightContentRef = useRef(null)
  const categoryScrollRef = useRef(null)
  
  // State for categories from admin
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  
  // State for restaurants from backend
  const [restaurantsData, setRestaurantsData] = useState([])
  const [loadingRestaurants, setLoadingRestaurants] = useState(true)
  const [categoryKeywords, setCategoryKeywords] = useState({})

  const getCategoryNameFromSlug = (slugValue) => {
    if (!slugValue || typeof slugValue !== "string") return ""
    return slugValue
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }

  // Fetch categories from admin API
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true)
        const response = await adminAPI.getPublicCategories()
        
        if (response.data && response.data.success && response.data.data && response.data.data.categories) {
          const categoriesArray = response.data.data.categories
          
          // Transform API categories to match expected format
          const transformedCategories = [
            { id: 'all', name: "All", image: offerImage, slug: 'all' },
            ...categoriesArray.map((cat) => ({
              id: cat.slug || cat.id,
              name: cat.name,
              image: cat.image || foodImages[0],
              slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, '-'),
              type: cat.type,
              offerPercentage: typeof cat.offerPercentage === "number" ? cat.offerPercentage : 0,
            }))
          ]
          
          setCategories(transformedCategories)
          
          // Generate category keywords dynamically from category names
          const keywordsMap = {}
          categoriesArray.forEach((cat) => {
            const categoryId = cat.slug || cat.id
            const categoryName = cat.name.toLowerCase()
            
            // Generate keywords from category name
            const words = categoryName.split(/[\s-]+/).filter(w => w.length > 0)
            keywordsMap[categoryId] = [categoryName, ...words]
          })
          
          setCategoryKeywords(keywordsMap)
        } else {
          // Keep default "All" category on error
          setCategories([{ id: 'all', name: "All", image: offerImage, slug: 'all' }])
        }
      } catch (error) {
        console.error('Error fetching categories:', error)
        // Keep default "All" category on error
        setCategories([{ id: 'all', name: "All", image: offerImage, slug: 'all' }])
      } finally {
        setLoadingCategories(false)
      }
    }
    
    fetchCategories()
  }, [])

  // Helper function to check if menu has dishes matching category keywords
  const checkCategoryInMenu = (menu, categoryId) => {
    if (!menu || !menu.sections || !Array.isArray(menu.sections)) {
      return false
    }
    
    const keywords = categoryKeywords[categoryId] || []
    if (keywords.length === 0) {
      return false
    }
    
    for (const section of menu.sections) {
      const sectionNameLower = (section.name || '').toLowerCase()
      if (keywords.some(keyword => sectionNameLower.includes(keyword))) {
        return true
      }

      const sectionItems = Array.isArray(section.items) ? section.items : []
      const subsectionItems = Array.isArray(section.subsections)
        ? section.subsections.flatMap((subsection) =>
            Array.isArray(subsection?.items) ? subsection.items : []
          )
        : []
      const allItems = [...sectionItems, ...subsectionItems]

      if (allItems.length > 0) {
        for (const item of allItems) {
          const itemNameLower = (item.name || '').toLowerCase()
          const itemCategoryLower = (item.category || '').toLowerCase()

          if (keywords.some(keyword => 
            itemNameLower.includes(keyword) || itemCategoryLower.includes(keyword)
          )) {
            return true
          }
        }
      }
    }
    
    return false
  }

  // Helper function to get ALL dishes matching a category from menu (returns array of dish info)
  // Applies both item-level discount and optional category-level offerPercentage
  const getAllCategoryDishesFromMenu = (menu, categoryId, categoryOfferPercentage = 0) => {
    if (!menu || !menu.sections || !Array.isArray(menu.sections)) {
      return []
    }
    
    const keywords = categoryKeywords[categoryId] || []
    if (keywords.length === 0) {
      return []
    }
    
    const matchingDishes = []
    
    for (const [sectionIndex, section] of menu.sections.entries()) {
      const sectionItems = Array.isArray(section.items)
        ? section.items.map((item, itemIndex) => ({
            item,
            itemIndex,
            subsectionIndex: null,
          }))
        : []
      const subsectionItems = Array.isArray(section.subsections)
        ? section.subsections.flatMap((subsection, subsectionIndex) => {
            if (!Array.isArray(subsection?.items)) return []
            return subsection.items.map((item, itemIndex) => ({
              item,
              itemIndex,
              subsectionIndex,
            }))
          })
        : []
      const allItems = [...sectionItems, ...subsectionItems]

      if (allItems.length > 0) {
        for (const { item, itemIndex, subsectionIndex } of allItems) {
          const itemNameLower = (item.name || '').toLowerCase()
          const itemCategoryLower = (item.category || '').toLowerCase()

          if (keywords.some(keyword =>
            itemNameLower.includes(keyword) || itemCategoryLower.includes(keyword)
          )) {
            // Calculate final price considering both item discount and category offer
            const originalPrice = item.originalPrice || item.price || 0
            const itemDiscountPercent = item.discountPercent || 0
            const categoryDiscountPercent = typeof categoryOfferPercentage === "number" ? categoryOfferPercentage : 0
            const totalDiscountPercent = Math.max(
              0,
              Math.min(100, itemDiscountPercent + categoryDiscountPercent)
            )
            const finalPrice = totalDiscountPercent > 0
              ? Math.round(originalPrice * (1 - totalDiscountPercent / 100))
              : originalPrice
            
            // Get dish image (prioritize item image, then section image)
            const dishImage = item.image?.url || item.image || section.image?.url || section.image || null
            
            matchingDishes.push({
              name: item.name,
              price: finalPrice,
              image: dishImage,
              originalPrice: originalPrice,
              itemId: item._id || item.id || `${item.name}-${finalPrice}`,
              sourceSectionIndex: sectionIndex,
              sourceItemIndex: itemIndex,
              sourceSubsectionIndex: subsectionIndex,
              foodType: item.foodType, // Include foodType for vegMode filtering
              itemDiscountPercent,
              categoryOfferPercentage: categoryDiscountPercent,
              totalDiscountPercent,
            })
          }
        }
      }
    }
    
    return matchingDishes
  }

  // Helper function to get FIRST featured dish for a category from menu (for backward compatibility)
  const getCategoryDishFromMenu = (menu, categoryId) => {
    const allDishes = getAllCategoryDishesFromMenu(menu, categoryId, 0)
    return allDishes.length > 0 ? allDishes[0] : null
  }

  // Helper function to get ALL dishes from menu (used by "All" category)
  const getAllDishesFromMenu = (menu) => {
    if (!menu || !Array.isArray(menu.sections)) {
      return []
    }

    const dishes = []

    for (const [sectionIndex, section] of menu.sections.entries()) {
      const sectionItems = Array.isArray(section.items)
        ? section.items.map((item, itemIndex) => ({
            item,
            itemIndex,
            subsectionIndex: null,
          }))
        : []
      const subsectionItems = Array.isArray(section.subsections)
        ? section.subsections.flatMap((subsection, subsectionIndex) => {
            if (!Array.isArray(subsection?.items)) return []
            return subsection.items.map((item, itemIndex) => ({
              item,
              itemIndex,
              subsectionIndex,
            }))
          })
        : []
      const allItems = [...sectionItems, ...subsectionItems]

      for (const { item, itemIndex, subsectionIndex } of allItems) {
        const originalPrice = item.originalPrice || item.price || 0
        const itemDiscountPercent = item.discountPercent || 0
        const finalPrice = itemDiscountPercent > 0
          ? Math.round(originalPrice * (1 - itemDiscountPercent / 100))
          : originalPrice
        const dishImage = item.image?.url || item.image || section.image?.url || section.image || null

        dishes.push({
          name: item.name,
          price: finalPrice,
          image: dishImage,
          originalPrice,
          itemId: item._id || item.id || `${item.name}-${finalPrice}`,
          sourceSectionIndex: sectionIndex,
          sourceItemIndex: itemIndex,
          sourceSubsectionIndex: subsectionIndex,
          foodType: item.foodType,
          itemDiscountPercent,
          categoryOfferPercentage: 0,
          totalDiscountPercent: itemDiscountPercent,
        })
      }
    }

    return dishes
  }

  // Build a deterministic, collision-safe key for category dish cards.
  const createDishCardId = (restaurantId, dish, fallbackIndex) => {
    const baseDishId = String(dish?.itemId || dish?.name || "dish")
      .trim()
      .replace(/\s+/g, "-")
    const sectionIndex = dish?.sourceSectionIndex ?? "s"
    const itemIndex = dish?.sourceItemIndex ?? fallbackIndex
    return `${restaurantId}-dish-${baseDishId}-${sectionIndex}-${itemIndex}`
  }

  // Fetch restaurants from API
  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        setLoadingRestaurants(true)
        if (!zoneId) {
          setRestaurantsData([])
          return
        }
        const params = { zoneId }
        const response = await restaurantAPI.getRestaurants(params)
        
        if (response.data && response.data.success && response.data.data && response.data.data.restaurants) {
          const restaurantsArray = response.data.data.restaurants
          
          // Helper function to check if value is a default/mock value
          const isDefaultValue = (value, fieldName) => {
            if (!value) return false
            
            const defaultOffers = [
              "Flat ₹50 OFF above ₹199",
              "Flat 50% OFF",
              "Flat ₹40 OFF above ₹149"
            ]
            const defaultDeliveryTimes = ["25-30 mins", "20-25 mins", "30-35 mins"]
            const defaultDistances = ["1.2 km", "1 km", "0.8 km"]
            const defaultFeaturedPrice = 249
            
            if (fieldName === 'offer' && defaultOffers.includes(value)) return true
            if (fieldName === 'deliveryTime' && defaultDeliveryTimes.includes(value)) return true
            if (fieldName === 'distance' && defaultDistances.includes(value)) return true
            if (fieldName === 'featuredPrice' && value === defaultFeaturedPrice) return true
            
            return false
          }
          
          // Transform restaurants - filter out default values
          const restaurantsWithIds = restaurantsArray
            .filter((restaurant) => {
              const hasName = restaurant.name && restaurant.name.trim().length > 0
              const hasRealImage = restaurant.profileImage?.url || 
                                   (restaurant.coverImages && restaurant.coverImages.length > 0) ||
                                   (restaurant.menuImages && restaurant.menuImages.length > 0)
              return hasName && hasRealImage
            })
            .map((restaurant) => {
              let deliveryTime = restaurant.estimatedDeliveryTime || null
              let distance = restaurant.distance || null
              let offer = restaurant.offer || null
              
              if (isDefaultValue(deliveryTime, 'deliveryTime')) deliveryTime = null
              if (isDefaultValue(distance, 'distance')) distance = null
              if (isDefaultValue(offer, 'offer')) offer = null
              
              const cuisine = restaurant.cuisines && restaurant.cuisines.length > 0 
                ? restaurant.cuisines.join(", ")
                : null
              
              const coverImages = restaurant.coverImages && restaurant.coverImages.length > 0
                ? restaurant.coverImages.map(img => img.url || img).filter(Boolean)
                : []
              
              const fallbackImages = restaurant.menuImages && restaurant.menuImages.length > 0
                ? restaurant.menuImages.map(img => img.url || img).filter(Boolean)
                : []
              
              // Prefer onboarding.step2.profileImageUrl if available (more accurate)
              const profileImageUrl = restaurant.onboarding?.step2?.profileImageUrl?.url
                || restaurant.profileImage?.url
                || (typeof restaurant.profileImage === 'string' ? restaurant.profileImage : null)
              
              const allImages = coverImages.length > 0 
                ? coverImages 
                : (fallbackImages.length > 0
                    ? fallbackImages
                    : (profileImageUrl ? [profileImageUrl] : []))
              
              const image = allImages[0] || null
              const restaurantId = restaurant.restaurantId || restaurant._id
              
              let featuredDish = restaurant.featuredDish || null
              let featuredPrice = restaurant.featuredPrice || null
              
              if (featuredPrice && isDefaultValue(featuredPrice, 'featuredPrice')) {
                featuredPrice = null
              }
              
              return {
                id: restaurantId,
                // Prefer onboarding.step1.restaurantName if available (more accurate)
                name: restaurant.onboarding?.step1?.restaurantName || restaurant.name,
                cuisine: cuisine,
                rating: restaurant.rating || null,
                deliveryTime: deliveryTime,
                distance: distance,
                image: image,
                images: allImages,
                priceRange: restaurant.priceRange || null,
                featuredDish: featuredDish,
                featuredPrice: featuredPrice,
                offer: offer,
                slug: restaurant.slug || restaurant.name?.toLowerCase().replace(/\s+/g, '-'),
                restaurantId: restaurantId,
                // Availability flags (used to hide dishes when restaurant is closed/offline)
                isActive: restaurant.isActive,
                isAcceptingOrders: restaurant.isAcceptingOrders,
                hasPaneer: false,
                category: 'all',
              }
            })
          
          // Fetch menus for all restaurants
          const menuPromises = restaurantsWithIds.map(async (restaurant) => {
            try {
              const menuResponse = await restaurantAPI.getMenuByRestaurantId(restaurant.restaurantId)
              if (menuResponse.data && menuResponse.data.success && menuResponse.data.data && menuResponse.data.data.menu) {
                const menu = menuResponse.data.data.menu
                const hasPaneer = checkCategoryInMenu(menu, 'paneer-tikka')
                
                let featuredDish = restaurant.featuredDish
                let featuredPrice = restaurant.featuredPrice
                
                if (!featuredDish || !featuredPrice) {
                  for (const section of (menu.sections || [])) {
                    if (section.items && section.items.length > 0) {
                      const firstItem = section.items[0]
                      if (!featuredDish) featuredDish = firstItem.name
                      if (!featuredPrice) {
                        const originalPrice = firstItem.originalPrice || firstItem.price || 0
                        const discountPercent = firstItem.discountPercent || 0
                        featuredPrice = discountPercent > 0 
                          ? Math.round(originalPrice * (1 - discountPercent / 100))
                          : originalPrice
                      }
                      break
                    }
                  }
                }
                
                return {
                  ...restaurant,
                  menu: menu,
                  hasPaneer: hasPaneer,
                  featuredDish: featuredDish || null,
                  featuredPrice: featuredPrice || null,
                  categoryMatches: {},
                }
              }
              return {
                ...restaurant,
                menu: null,
                hasPaneer: false,
                categoryMatches: {},
              }
            } catch (error) {
              console.warn(`Failed to fetch menu for restaurant ${restaurant.restaurantId}:`, error)
              return {
                ...restaurant,
                menu: null,
                hasPaneer: false,
                categoryMatches: {},
              }
            }
          })
          
          const transformedRestaurants = await Promise.all(menuPromises)
          setRestaurantsData(transformedRestaurants)
        } else {
          setRestaurantsData([])
        }
      } catch (error) {
        console.error('Error fetching restaurants:', error)
        setRestaurantsData([])
      } finally {
        setLoadingRestaurants(false)
      }
    }

    fetchRestaurants()
  }, [zoneId, isOutOfService])

  // Update selected category when URL changes
  useEffect(() => {
    if (category && categories && categories.length > 0) {
      const categorySlug = category.toLowerCase()
      const matchedCategory = categories.find(cat => 
        cat.slug === categorySlug || 
        cat.id === categorySlug || 
        cat.name.toLowerCase().replace(/\s+/g, '-') === categorySlug
      )
      if (matchedCategory) {
        setSelectedCategory(matchedCategory.slug || matchedCategory.id)
      } else {
        // Keep URL-driven category visible/selectable even if backend category list is stale.
        setCategories((prev) => {
          const exists = prev.some((cat) => {
            const slug = cat.slug || cat.id
            return slug === categorySlug
          })
          if (exists) return prev
          return [
            ...prev,
            {
              id: categorySlug,
              slug: categorySlug,
              name: getCategoryNameFromSlug(categorySlug) || categorySlug,
              image: foodImages[0],
              offerPercentage: 0,
            },
          ]
        })
        setCategoryKeywords((prev) => {
          if (prev[categorySlug]) return prev
          const words = categorySlug.split(/[\s-]+/).filter(Boolean)
          return {
            ...prev,
            [categorySlug]: [categorySlug.replace(/-/g, " "), ...words],
          }
        })
        setSelectedCategory(categorySlug)
      }
    } else if (category) {
      setSelectedCategory(category.toLowerCase())
    }
  }, [category, categories])

  const toggleFilter = (filterId) => {
    setActiveFilters(prev => {
      const newSet = new Set(prev)
      if (newSet.has(filterId)) {
        newSet.delete(filterId)
      } else {
        newSet.add(filterId)
      }
      return newSet
    })
    // Show loading when filter is toggled
    setIsLoadingFilterResults(true)
    setTimeout(() => {
      setIsLoadingFilterResults(false)
    }, 500)
  }

  // Scroll tracking effect for filter modal
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

    Object.values(filterSectionRefs.current).forEach(ref => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [isFilterOpen])

  const toggleFavorite = (id) => {
    setFavorites(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const toggleDishBookmark = (id) => {
    setBookmarkedDishes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Filter restaurants based on active filters and selected category
  // If category is selected, expand restaurants into dish cards (one card per matching dish)
  const filteredRecommended = useMemo(() => {
    const sourceData = restaurantsData.length > 0 ? restaurantsData : []
    // Hide closed/offline restaurants when showing dish lists.
    // We allow undefined flags to pass to avoid hiding older data shapes.
    let filtered = [...sourceData].filter((r) => {
      if (!r) return false
      if (r.isActive === false) return false
      if (r.isAcceptingOrders === false || r.isAcceptingOrders === 0) return false
      return true
    })

    // Find current selected category offer percentage (if any)
    const currentCategory =
      categories && categories.length > 0
        ? categories.find((cat) => {
            const slug = cat.slug || cat.id
            return slug === selectedCategory
          })
        : null
    const currentCategoryOffer =
      currentCategory && typeof currentCategory.offerPercentage === "number"
        ? currentCategory.offerPercentage
        : 0

    // Filter by category - Dynamic filtering based on menu items
    if (selectedCategory) {
      const expandedDishes = []
      
      filtered.forEach(r => {
        if (r.menu) {
          const categoryDishes = selectedCategory === "all"
            ? getAllDishesFromMenu(r.menu)
            : (checkCategoryInMenu(r.menu, selectedCategory)
              ? getAllCategoryDishesFromMenu(
                  r.menu,
                  selectedCategory,
                  currentCategoryOffer
                )
              : [])

          if (categoryDishes.length > 0) {
            // Create one card per dish
            categoryDishes.forEach((dish, index) => {
              const dishCardId = createDishCardId(r.id, dish, index)
              expandedDishes.push({
                ...r,
                // Unique ID for each dish card
                id: dishCardId,
                dishId: dish.itemId || dishCardId,
                isCategoryDishRow: true,
                // Category dish info for this specific dish
                categoryDish: dish,
                categoryDishName: dish.name,
                categoryDishPrice: dish.price,
                categoryDishImage: dish.image,
                categoryOfferPercentage: dish.categoryOfferPercentage,
              })
            })
          }
        }
      })
      
      filtered = expandedDishes
    }

    // Apply filters
    if (activeFilters.has('under-30-mins')) {
      filtered = filtered.filter(r => {
        if (!r.deliveryTime) return false
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 30
      })
    }
    if (activeFilters.has('rating-4-plus')) {
      filtered = filtered.filter(r => r.rating && r.rating >= 4.0)
    }
    if (activeFilters.has('flat-50-off')) {
      filtered = filtered.filter(r => r.offer && r.offer.includes('50%'))
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(r => 
        r.name?.toLowerCase().includes(query) ||
        r.cuisine?.toLowerCase().includes(query) ||
        r.featuredDish?.toLowerCase().includes(query) ||
        r.categoryDishName?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [selectedCategory, activeFilters, searchQuery, restaurantsData, categoryKeywords, vegMode])

  const filteredAllRestaurants = useMemo(() => {
    const sourceData = restaurantsData.length > 0 ? restaurantsData : []
    // Hide closed/offline restaurants when showing dish lists.
    // We allow undefined flags to pass to avoid hiding older data shapes.
    let filtered = [...sourceData].filter((r) => {
      if (!r) return false
      if (r.isActive === false) return false
      if (r.isAcceptingOrders === false || r.isAcceptingOrders === 0) return false
      return true
    })

    // Find current selected category offer percentage (if any)
    const currentCategory =
      categories && categories.length > 0
        ? categories.find((cat) => {
            const slug = cat.slug || cat.id
            return slug === selectedCategory
          })
        : null
    const currentCategoryOffer =
      currentCategory && typeof currentCategory.offerPercentage === "number"
        ? currentCategory.offerPercentage
        : 0

    // Filter by category - Dynamic filtering based on menu items
    // If category is selected, expand restaurants into dish cards (one card per matching dish)
    if (selectedCategory) {
      const expandedDishes = []
      
      filtered.forEach(r => {
        if (r.menu) {
          const categoryDishes = selectedCategory === "all"
            ? getAllDishesFromMenu(r.menu)
            : (checkCategoryInMenu(r.menu, selectedCategory)
              ? getAllCategoryDishesFromMenu(
                  r.menu,
                  selectedCategory,
                  currentCategoryOffer
                )
              : [])

          if (categoryDishes.length > 0) {
            // Create one card per dish
            categoryDishes.forEach((dish, index) => {
              // Filter by vegMode if enabled
                // Veg-only platform: no non-veg dishes exist.

              const dishCardId = createDishCardId(r.id, dish, index)
              expandedDishes.push({
                ...r,
                // Unique ID for each dish card
                id: dishCardId,
                dishId: dish.itemId || dishCardId,
                isCategoryDishRow: true,
                // Category dish info for this specific dish
                categoryDish: dish,
                categoryDishName: dish.name,
                categoryDishPrice: dish.price,
                categoryDishImage: dish.image,
                categoryOfferPercentage: dish.categoryOfferPercentage,
              })
            })
          }
        }
      })
      
      filtered = expandedDishes
    }

    // Apply filters
    if (activeFilters.has('under-30-mins')) {
      filtered = filtered.filter(r => {
        if (!r.deliveryTime) return false
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 30
      })
    }
    if (activeFilters.has('rating-4-plus')) {
      filtered = filtered.filter(r => r.rating && r.rating >= 4.0)
    }
    if (activeFilters.has('under-250')) {
      filtered = filtered.filter((r) => {
        const effectivePrice = r.categoryDishPrice ?? r.featuredPrice
        return typeof effectivePrice === "number" && effectivePrice <= 250
      })
    }
    if (activeFilters.has('flat-50-off')) {
      filtered = filtered.filter(r => r.offer && r.offer.includes('50%'))
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(r => 
        r.name?.toLowerCase().includes(query) ||
        r.cuisine?.toLowerCase().includes(query) ||
        r.featuredDish?.toLowerCase().includes(query) ||
        r.categoryDishName?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [selectedCategory, activeFilters, searchQuery, restaurantsData, categoryKeywords, vegMode])

  const handleCategorySelect = (category) => {
    const categorySlug = category.slug || category.id
    // If already selected, don't re-navigate / re-trigger state updates
    if (!categorySlug) return
    if (selectedCategory === categorySlug || selectedCategory === category.id) {
      return
    }
    setSelectedCategory(categorySlug)
    // Update URL to reflect category change
    if (categorySlug === 'all') {
      navigate('/category/all')
    } else {
      navigate(`/category/${categorySlug}`)
    }
  }

  // Check if should show grayscale (user out of service)
  const shouldShowGrayscale = isOutOfService
  const shouldShowOnlyCategoryDishes = Boolean(selectedCategory)

  return (
    <div className={`min-h-screen bg-white dark:bg-[#0a0a0a] ${shouldShowGrayscale ? 'grayscale opacity-75' : ''}`}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-[#1a1a1a] shadow-sm">
        <div className="max-w-7xl mx-auto">
          {/* Search Bar with Back Button */}
          <div className="flex items-center gap-2 px-3 md:px-6 pt-9 pb-3 border-b border-gray-100 dark:border-gray-800">
            <button 
              onClick={() => navigate('/')}
              className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
            
            <div className="flex-1 relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Restaurant name or a dish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 h-11 md:h-12 rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] focus:bg-white dark:focus:bg-[#2a2a2a] focus:border-gray-500 dark:focus:border-gray-600 text-sm md:text-base dark:text-white placeholder:text-gray-600 dark:placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Browse Category Section */}
          <div 
            ref={categoryScrollRef}
            className="flex gap-4 md:gap-6 overflow-x-auto scrollbar-hide px-4 md:px-6 py-3 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {loadingCategories ? (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-green-600" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Loading categories...</span>
              </div>
            ) : (
              categories && categories.length > 0 ? categories.map((cat) => {
                const categorySlug = cat.slug || cat.id
                const isSelected = selectedCategory === categorySlug || selectedCategory === cat.id
                return (
                  <button
                    key={categorySlug || cat.id || cat.name}
                    onClick={() => handleCategorySelect(cat)}
                    className={`flex flex-col items-center gap-1.5 flex-shrink-0 pb-2 transition-all ${
                      isSelected ? 'border-b-2 border-green-600' : ''
                    }`}
                  >
                    {cat.image ? (
                      <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden border-2 transition-all ${
                        isSelected ? 'border-green-600 shadow-lg' : 'border-transparent'
                      }`}>
                        <img 
                          src={cat.image} 
                          alt={cat.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to default image if category image fails to load
                            e.target.src = foodImages[0] || 'https://via.placeholder.com/100'
                          }}
                        />
                      </div>
                    ) : (
                      <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-2 transition-all ${
                        isSelected ? 'border-green-600 shadow-lg bg-green-50 dark:bg-green-900/20' : 'border-transparent'
                      }`}>
                        <span className="text-xl md:text-2xl">🍽️</span>
                      </div>
                    )}
                    <span className={`text-xs md:text-sm font-medium whitespace-nowrap ${
                      isSelected ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {cat.name}
                    </span>
                    {typeof cat.offerPercentage === "number" && cat.offerPercentage > 0 && (
                      <span className="text-[10px] md:text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full mt-0.5">
                        {cat.offerPercentage}% OFF
                      </span>
                    )}
                  </button>
                )
              }) : (
                <div className="flex items-center justify-center py-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400">No categories available</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:flex-wrap gap-2 px-4 md:px-6 py-3">
            {/* Row 1 */}
            <div 
              className="flex items-center gap-2 overflow-x-auto md:overflow-x-visible scrollbar-hide pb-1 md:pb-0"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              <Button
                variant="outline"
                onClick={() => setIsFilterOpen(true)}
                className="h-7 md:h-8 px-2.5 md:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span className="text-xs md:text-sm font-bold text-black dark:text-white">Filters</span>
              </Button>
              {[
                { id: 'under-30-mins', label: 'Under 30 mins' },
                { id: 'delivery-under-45', label: 'Under 45 mins' },
                { id: 'rating-4-plus', label: 'Rating 4.0+' },
                { id: 'rating-45-plus', label: 'Rating 4.5+' },
              ].map((filter) => {
                const isActive = activeFilters.has(filter.id)
                return (
                  <Button
                    key={filter.id}
                    variant="outline"
                    onClick={() => toggleFilter(filter.id)}
                    className={`h-7 md:h-8 px-2.5 md:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
                      isActive
                        ? 'bg-green-600 text-white border border-green-600 hover:bg-green-600/90'
                        : 'bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className={`text-xs md:text-sm text-black dark:text-white font-bold ${isActive ? 'text-white' : 'text-black dark:text-white'}`}>{filter.label}</span>
                  </Button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-4 sm:py-6 md:py-8 lg:py-10 space-y-6 md:space-y-8 lg:space-y-10">
        <div className="max-w-7xl mx-auto">
          <section className="relative">
            {loadingRestaurants ? (
              <div className="flex flex-col items-center justify-center py-20 min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                <span className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {shouldShowOnlyCategoryDishes ? "Loading dishes..." : "Loading restaurants..."}
                </span>
              </div>
            ) : (
              <>
                {/* Loading Overlay */}
                {isLoadingFilterResults && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg min-h-[400px]">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-8 w-8 text-green-600 animate-spin" strokeWidth={2.5} />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {shouldShowOnlyCategoryDishes ? "Loading dishes..." : "Loading restaurants..."}
                      </span>
                    </div>
                  </div>
                )}
                
                {shouldShowOnlyCategoryDishes ? (
              <div className={`divide-y divide-gray-200 dark:divide-gray-800 ${isLoadingFilterResults ? 'opacity-50' : 'opacity-100'} transition-opacity duration-300`}>
                {filteredAllRestaurants.map((restaurant) => {
                  const dishKey = `${restaurant.id}-row`
                  const dishName = restaurant.categoryDishName || restaurant.featuredDish || "Dish"
                  const dishPrice = restaurant.categoryDishPrice ?? restaurant.featuredPrice
                  const dishDescription = restaurant.categoryDish?.description || ""
                  const dishProductId = restaurant.dishId || restaurant.id
                  const cartItemId = getCartItemId(dishProductId)
                  const cartItem = getCartItem(cartItemId)
                  const quantity = cartItem?.quantity || 0
                  const hasValidPrice = typeof dishPrice === "number" && dishPrice > 0
                  const isVegDish = restaurant.categoryDish?.foodType
                    ? restaurant.categoryDish.foodType === "Veg"
                    : true

                  return (
                    <div
                      key={dishKey}
                      className="flex gap-4 p-4 border-b border-gray-100 dark:border-gray-800 last:border-none relative"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {isVegDish ? (
                            <div className="w-4 h-4 border-2 border-green-600 flex items-center justify-center rounded-sm flex-shrink-0">
                              <div className="w-2 h-2 bg-green-600 rounded-full" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 border-2 border-orange-600 flex items-center justify-center rounded-sm flex-shrink-0">
                              <div className="w-2 h-2 bg-orange-600 rounded-full" />
                            </div>
                          )}
                        </div>
                        <h3 className="font-bold text-gray-800 dark:text-white text-lg leading-tight">
                          {dishName}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {typeof dishPrice === "number" ? `₹${dishPrice}` : "Price not available"}
                          </p>
                          {restaurant.deliveryTime && (
                            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                              <Clock size={12} className="text-gray-500" />
                              <span>{restaurant.deliveryTime}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 truncate">
                          {restaurant.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {dishDescription}
                        </p>
                        <div className="flex gap-4 mt-3">
                          <button
                            type="button"
                            onClick={() => toggleDishBookmark(dishKey)}
                            className={`p-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                              bookmarkedDishes.has(dishKey)
                                ? "border-red-500 text-red-500 bg-red-50 dark:bg-red-900/20"
                                : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                            }`}
                          >
                            <Bookmark size={18} className={bookmarkedDishes.has(dishKey) ? "fill-red-500" : ""} />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const shareText = `${dishName} - ${restaurant.name}`
                              try {
                                if (navigator.share) {
                                  await navigator.share({
                                    title: dishName,
                                    text: shareText,
                                    url: window.location.href,
                                  })
                                } else if (navigator.clipboard?.writeText) {
                                  await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`)
                                }
                              } catch {
                                // Ignore share cancellation errors
                              }
                            }}
                            className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            title="Share dish"
                          >
                            <Share2 size={18} />
                          </button>
                        </div>
                      </div>

                      <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0">
                        <div className="w-full h-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                          {(restaurant.categoryDishImage || restaurant.image) ? (
                            <img
                              src={restaurant.categoryDishImage || restaurant.image}
                              alt={dishName}
                              className="w-full h-full object-cover rounded-2xl"
                              onError={(e) => {
                                e.target.style.display = 'none'
                                const placeholder = document.createElement('div')
                                placeholder.className = 'w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-4xl'
                                placeholder.textContent = '🍽️'
                                e.target.parentElement.appendChild(placeholder)
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-4xl">
                              🍽️
                            </div>
                          )}
                        </div>
                        {quantity > 0 ? (
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white border border-green-600 text-green-600 font-bold px-3 py-1.5 rounded-lg shadow-md flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateQuantity(cartItemId, Math.max(0, quantity - 1))}
                              className="text-green-600 hover:text-green-700"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="mx-1 text-sm">{quantity}</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (!hasValidPrice) return
                                addToCart({
                                  productId: dishProductId,
                                  productName: dishName,
                                  name: dishName,
                                  price: dishPrice,
                                  image: restaurant.categoryDishImage || restaurant.image || null,
                                  restaurant: restaurant.name,
                                  restaurantId: restaurant.restaurantId || restaurant.id,
                                  description: dishDescription,
                                  originalPrice: restaurant.categoryDish?.originalPrice || dishPrice,
                                })
                              }}
                              className="text-green-600 hover:text-green-700"
                            >
                              <Plus size={14} className="stroke-[3px]" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!hasValidPrice) return
                              addToCart({
                                productId: dishProductId,
                                productName: dishName,
                                name: dishName,
                                price: dishPrice,
                                image: restaurant.categoryDishImage || restaurant.image || null,
                                restaurant: restaurant.name,
                                restaurantId: restaurant.restaurantId || restaurant.id,
                                description: dishDescription,
                                originalPrice: restaurant.categoryDish?.originalPrice || dishPrice,
                              })
                            }}
                            disabled={!hasValidPrice}
                            className={`absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white border font-bold px-5 py-1.5 rounded-lg shadow-md flex items-center gap-1 ${
                              hasValidPrice
                                ? 'border-green-600 text-green-600 hover:bg-green-50'
                                : 'border-gray-300 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            ADD <Plus size={14} className="stroke-[3px]" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 lg:gap-6 xl:gap-7 items-stretch ${isLoadingFilterResults ? 'opacity-50' : 'opacity-100'} transition-opacity duration-300`}>
                {filteredAllRestaurants.map((restaurant) => {
                  const restaurantSlug = restaurant.name.toLowerCase().replace(/\s+/g, "-")
                  const isFavorite = favorites.has(restaurant.id)

                  return (
                    <Link key={restaurant.id} to={`/user/restaurants/${restaurantSlug}`} className="h-full flex">
                    <Card className={`overflow-hidden cursor-pointer gap-0 border-0 dark:border-gray-800 group bg-white dark:bg-[#1a1a1a] shadow-md hover:shadow-xl transition-all duration-300 py-0 rounded-md h-full flex flex-col w-full ${
                      shouldShowGrayscale ? 'grayscale opacity-75' : ''
                    }`}>
                      {/* Image Section */}
                      <div className="relative h-44 sm:h-52 md:h-60 lg:h-64 xl:h-72 w-full overflow-hidden rounded-t-md flex-shrink-0">
                        {/* Use category dish image if available, otherwise restaurant image */}
                        {restaurant.categoryDishImage ? (
                          <img
                            src={restaurant.categoryDishImage}
                            alt={restaurant.categoryDishName || restaurant.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              // Fallback to restaurant image if dish image fails
                              if (restaurant.image) {
                                e.target.src = restaurant.image
                              } else {
                                // Show emoji placeholder
                                e.target.style.display = 'none'
                                const placeholder = document.createElement('div')
                                placeholder.className = 'w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-6xl'
                                placeholder.textContent = '🍽️'
                                e.target.parentElement.appendChild(placeholder)
                              }
                            }}
                          />
                        ) : restaurant.image ? (
                        <img
                          src={restaurant.image}
                          alt={restaurant.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              // Show emoji placeholder
                              e.target.style.display = 'none'
                              const placeholder = document.createElement('div')
                              placeholder.className = 'w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-6xl'
                              placeholder.textContent = '🍽️'
                              e.target.parentElement.appendChild(placeholder)
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-6xl">
                            🍽️
                          </div>
                        )}
                        
                        {/* Category Dish Badge - Top Left (shows category dish if available, otherwise featured dish) */}
                        {(restaurant.categoryDishName || restaurant.featuredDish) && (
                        <div className="absolute top-3 left-3 space-y-1">
                          <div className="bg-gray-800/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs sm:text-sm md:text-base font-medium">
                              {restaurant.categoryDishName || restaurant.featuredDish} · ₹{restaurant.categoryDishPrice || restaurant.featuredPrice}
                          </div>
                          {typeof restaurant.categoryOfferPercentage === "number" &&
                            restaurant.categoryOfferPercentage > 0 && (
                              <div className="inline-flex items-center bg-green-600/90 text-white text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded">
                                Offer of {restaurant.categoryOfferPercentage}%
                              </div>
                            )}
                        </div>
                        )}
                        
                        {/* Ad Badge */}
                        {restaurant.isAd && (
                          <div className="absolute top-3 right-14 bg-black/50 text-white text-[10px] md:text-xs px-2 py-0.5 rounded">
                            Ad
                          </div>
                        )}
                        
                        {/* Bookmark Icon - Top Right */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-3 right-3 h-9 w-9 md:h-10 md:w-10 bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-sm rounded-lg hover:bg-white dark:hover:bg-[#2a2a2a] transition-colors"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            toggleFavorite(restaurant.id)
                          }}
                        >
                          <Bookmark className={`h-5 w-5 md:h-6 md:w-6 ${isFavorite ? "fill-gray-800 dark:fill-gray-200 text-gray-800 dark:text-gray-200" : "text-gray-600 dark:text-gray-400"}`} strokeWidth={2} />
                        </Button>
                      </div>
                      
                      {/* Content Section */}
                        <CardContent className="p-3 sm:p-4 md:p-5 lg:p-6 gap-0 flex-1 flex flex-col">
                        {/* Restaurant Name & Rating */}
                        <div className="flex items-start justify-between gap-2 mb-2 lg:mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-md md:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white line-clamp-1 lg:line-clamp-2">
                              {restaurant.name}
                            </h3>
                          </div>
                          <div className="flex-shrink-0 bg-green-600 text-white px-2 md:px-3 lg:px-4 py-1 lg:py-1.5 rounded-lg flex items-center gap-1">
                            <span className="text-sm md:text-base lg:text-lg font-bold">{restaurant.rating}</span>
                            <Star className="h-3 w-3 md:h-4 md:w-4 lg:h-5 lg:w-5 fill-white text-white" />
                          </div>
                        </div>
                        
                        {/* Delivery Time & Distance */}
                        <div className="flex items-center gap-1 text-sm md:text-base lg:text-lg text-gray-500 dark:text-gray-400 mb-2 lg:mb-3">
                          <Clock className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6" strokeWidth={1.5} />
                          <span className="font-medium">{restaurant.deliveryTime || 'Not available'}</span>
                          {restaurant.distance && (
                            <>
                              <span className="mx-1">|</span>
                              <span className="font-medium">{restaurant.distance}</span>
                            </>
                          )}
                        </div>
                        
                        {/* Offer Badge */}
                        {restaurant.offer && (
                          <div className="flex items-center gap-2 text-sm md:text-base lg:text-lg mt-auto">
                            <BadgePercent className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 text-blue-600" strokeWidth={2} />
                            <span className="text-gray-700 dark:text-gray-300 font-medium">{restaurant.offer}</span>
                          </div>
                        )}
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Empty State */}
            {filteredAllRestaurants.length === 0 && (
              <div className="text-center py-12 md:py-16">
                <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base">
                  {searchQuery
                    ? `No ${shouldShowOnlyCategoryDishes ? "dishes" : "restaurants"} found for "${searchQuery}"`
                    : `No ${shouldShowOnlyCategoryDishes ? "dishes" : "restaurants"} found with selected filters`}
                </p>
                <Button
                  variant="outline"
                  className="mt-4 md:mt-6"
                  onClick={() => {
                    setActiveFilters(new Set())
                    setSearchQuery("")
                    setSelectedCategory('all')
                  }}
                >
                  Clear all filters
                </Button>
              </div>
            )}
              </>
            )}
          </section>
        </div>
      </div>

      {/* Filter Modal - Bottom Sheet */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isFilterOpen && (
              <div className="fixed inset-0 z-[100]">
                {/* Backdrop */}
                <div 
                  className="absolute inset-0 bg-black/50" 
                  onClick={() => setIsFilterOpen(false)}
                />
                
                {/* Modal Content */}
                <div className="absolute bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-4xl bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl max-h-[85vh] md:max-h-[90vh] flex flex-col animate-[slideUp_0.3s_ease-out]">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Filters and sorting</h2>
                    <button 
                      onClick={() => {
                        setActiveFilters(new Set())
                        setSortBy(null)
                        setSelectedCuisine(null)
                      }}
                      className="text-green-600 dark:text-green-400 font-medium text-sm md:text-base"
                    >
                      Clear all
                    </button>
                  </div>
                  
                  {/* Body */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Left Sidebar - Tabs */}
                    <div className="w-24 sm:w-28 md:w-32 bg-gray-50 dark:bg-[#0a0a0a] border-r border-gray-200 dark:border-gray-800 flex flex-col">
                      {[
                        { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
                        { id: 'time', label: 'Time', icon: Timer },
                        { id: 'rating', label: 'Rating', icon: Star },
                        { id: 'distance', label: 'Distance', icon: MapPin },
                        { id: 'price', label: 'Dish Price', icon: IndianRupee },
                        { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
                        { id: 'offers', label: 'Offers', icon: BadgePercent },
                        { id: 'trust', label: 'Trust', icon: ShieldCheck },
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
                            className={`flex flex-col items-center gap-1 py-4 px-2 text-center relative transition-colors ${
                              isActive ? 'bg-white dark:bg-[#1a1a1a] text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                          >
                            {isActive && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-600 rounded-r" />
                            )}
                            <Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={1.5} />
                            <span className="text-xs md:text-sm font-medium leading-tight">{tab.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    
                    {/* Right Content Area - Scrollable */}
                    <div ref={rightContentRef} className="flex-1 overflow-y-auto p-4 md:p-6">
                      {/* Sort By Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['sort'] = el}
                        data-section-id="sort"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Sort by</h3>
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
                              className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${
                                sortBy === option.id
                                  ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                                  : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                              }`}
                            >
                              <span className={`text-sm md:text-base font-medium ${sortBy === option.id ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
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
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Delivery Time</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                          <button 
                            onClick={() => toggleFilter('under-30-mins')}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${
                              activeFilters.has('under-30-mins') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <Timer className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has('under-30-mins') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('under-30-mins') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under 30 mins</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('delivery-under-45')}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${
                              activeFilters.has('delivery-under-45') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <Timer className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has('delivery-under-45') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('delivery-under-45') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under 45 mins</span>
                          </button>
                        </div>
                      </div>
                      
                      {/* Rating Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['rating'] = el}
                        data-section-id="rating"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Restaurant Rating</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                          <button 
                            onClick={() => toggleFilter('rating-35-plus')}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${
                              activeFilters.has('rating-35-plus') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <Star className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has('rating-35-plus') ? 'text-green-600 fill-green-600 dark:text-green-400 dark:fill-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('rating-35-plus') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Rated 3.5+</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('rating-4-plus')}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${
                              activeFilters.has('rating-4-plus') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <Star className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has('rating-4-plus') ? 'text-green-600 fill-green-600 dark:text-green-400 dark:fill-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('rating-4-plus') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.0+</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('rating-45-plus')}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${
                              activeFilters.has('rating-45-plus') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <Star className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has('rating-45-plus') ? 'text-green-600 fill-green-600 dark:text-green-400 dark:fill-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('rating-45-plus') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.5+</span>
                          </button>
                        </div>
                      </div>

                      {/* Distance Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['distance'] = el}
                        data-section-id="distance"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Distance</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                          <button 
                            onClick={() => toggleFilter('distance-under-1km')}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${
                              activeFilters.has('distance-under-1km') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <MapPin className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has('distance-under-1km') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('distance-under-1km') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under 1 km</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('distance-under-2km')}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${
                              activeFilters.has('distance-under-2km') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <MapPin className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has('distance-under-2km') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('distance-under-2km') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under 2 km</span>
                          </button>
                        </div>
                      </div>
                      
                      {/* Price Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['price'] = el}
                        data-section-id="price"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Dish Price</h3>
                        <div className="flex flex-col gap-3 md:gap-4">
                          <button 
                            onClick={() => toggleFilter('price-under-200')}
                            className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${
                              activeFilters.has('price-under-200') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('price-under-200') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹200</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('under-250')}
                            className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${
                              activeFilters.has('under-250') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('under-250') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹250</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('price-under-500')}
                            className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${
                              activeFilters.has('price-under-500') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('price-under-500') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹500</span>
                          </button>
                        </div>
                      </div>

                      {/* Cuisine Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['cuisine'] = el}
                        data-section-id="cuisine"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Cuisine</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                          {['Chinese', 'American', 'Japanese', 'Italian', 'Mexican', 'Indian', 'Asian', 'Seafood', 'Desserts', 'Cafe', 'Healthy'].map((cuisine) => (
                            <button
                              key={cuisine}
                              onClick={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                              className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-center transition-colors ${
                                selectedCuisine === cuisine
                                  ? 'border-green-600 bg-green-50 dark:bg-green-900/20'
                                  : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                              }`}
                            >
                              <span className={`text-sm md:text-base font-medium ${selectedCuisine === cuisine ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {cuisine}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Offers Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['offers'] = el}
                        data-section-id="offers"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Offers</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                          <button 
                            onClick={() => toggleFilter('flat-50-off')}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${
                              activeFilters.has('flat-50-off') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <BadgePercent className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has('flat-50-off') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('flat-50-off') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Flat 50% OFF</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('price-match')}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${
                              activeFilters.has('price-match') 
                                ? 'border-green-600 bg-green-50 dark:bg-green-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-green-600'
                            }`}
                          >
                            <BadgePercent className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has('price-match') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                            <span className={`text-sm md:text-base font-medium ${activeFilters.has('price-match') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Price Match</span>
                          </button>
                        </div>
                      </div>
                      
                      {/* Trust Markers Tab */}
                      {activeFilterTab === 'trust' && (
                        <div className="space-y-4">
                          <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">Trust Markers</h3>
                          <div className="flex flex-col gap-3 md:gap-4">
                            <button className="px-4 md:px-5 py-3 md:py-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-green-600 text-left transition-colors">
                              <span className="text-sm md:text-base font-medium text-gray-700 dark:text-gray-300">Top Rated</span>
                            </button>
                            <button className="px-4 md:px-5 py-3 md:py-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-green-600 text-left transition-colors">
                              <span className="text-sm md:text-base font-medium text-gray-700 dark:text-gray-300">Trusted by 1000+ users</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Footer */}
                  <div className="flex items-center gap-4 px-4 md:px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1a1a]">
                    <button 
                      onClick={() => setIsFilterOpen(false)}
                      className="flex-1 py-3 md:py-4 text-center font-semibold text-gray-700 dark:text-gray-300 text-sm md:text-base"
                    >
                      Close
                    </button>
                    <button 
                      onClick={() => {
                        setIsLoadingFilterResults(true)
                        setIsFilterOpen(false)
                        // Simulate loading for 500ms
                        setTimeout(() => {
                          setIsLoadingFilterResults(false)
                        }, 500)
                      }}
                      className={`flex-1 py-3 md:py-4 font-semibold rounded-xl transition-colors text-sm md:text-base ${
                        activeFilters.size > 0 || sortBy || selectedCuisine
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {activeFilters.size > 0 || sortBy || selectedCuisine
                        ? 'Show results'
                        : 'Show results'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      <style>{`
        @keyframes slideUp {
          0% {
            transform: translateY(100%);
          }
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
      <AddToCartAnimation linkto="/cart" bottomOffset={140} />
    </div>
  )
}
