import { useState, useMemo, useRef, useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Search, Loader2, Clock, Bookmark, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import StickyCartCard from "../components/StickyCartCard"
import { useSharedLocation } from "@/lib/context/LocationContext"
import { useZone } from "../hooks/useZone"
import { restaurantAPI, adminAPI } from "@/lib/api"
import allFoodImage from "@/assets/allfodd.png"

// Import shared food images - prevents duplication
import { foodImages } from "@/constants/images"

// Mock data removed - using backend data only

export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get("q") || ""
  const categoryParam = searchParams.get("cat") || ""
  const navigate = useNavigate()
  const { location } = useSharedLocation()
  const { zoneId, isOutOfService } = useZone(location)
  const [searchQuery, setSearchQuery] = useState(query)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const categoryScrollRef = useRef(null)
  const [restaurantsData, setRestaurantsData] = useState([])
  const [loadingRestaurants, setLoadingRestaurants] = useState(true)
  const [categories, setCategories] = useState([
    { id: 'all', name: "All", image: allFoodImage }
  ])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [categoryKeywords, setCategoryKeywords] = useState({})
  const categoryIdsSignature = useMemo(
    () => categories.map((cat) => String(cat.id)).join("|"),
    [categories]
  )

  const getCategoryKey = (cat = {}) => {
    const rawName = typeof cat?.name === "string" ? cat.name.trim() : ""
    return (
      cat?.slug ||
      cat?.id ||
      cat?._id ||
      (rawName ? rawName.toLowerCase().replace(/\s+/g, "-") : "")
    )
  }

  const normalizeCategoryValue = (value) => String(value || "").trim().toLowerCase()

  const categoryMatchesParam = (cat, param) => {
    const normalizedParam = normalizeCategoryValue(param)
    if (!normalizedParam) return false

    const byId = normalizeCategoryValue(cat?.id)
    const bySlug = normalizeCategoryValue(cat?.slug)
    const byName = normalizeCategoryValue(cat?.name).replace(/\s+/g, "-")

    return normalizedParam === byId || normalizedParam === bySlug || normalizedParam === byName
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
            { id: 'all', name: "All", image: allFoodImage, offerPercentage: 0 },
            ...categoriesArray.map((cat) => ({
              id: getCategoryKey(cat),
              name: cat.name,
              image: cat.image || foodImages[0],
              type: cat.type,
              offerPercentage: typeof cat.offerPercentage === "number" ? cat.offerPercentage : 0,
            }))
          ]
          
          setCategories(transformedCategories)
          
          // Generate category keywords dynamically from category names
          const keywordsMap = {}
          categoriesArray.forEach((cat) => {
            const categoryId = getCategoryKey(cat)
            const categoryName = cat.name.toLowerCase()
            
            // Generate keywords from category name
            // Split by common separators and use individual words
            const words = categoryName.split(/[\s-]+/).filter(w => w.length > 0)
            keywordsMap[categoryId] = [categoryName, ...words]
          })
          
          setCategoryKeywords(keywordsMap)
        }
      } catch (error) {
        console.error('Error fetching categories:', error)
        // Keep default "All" category on error
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
    
    // Get keywords for this category
    const keywords = categoryKeywords[categoryId] || []
    if (keywords.length === 0) {
      return false
    }
    
    // Check sections and items for category keywords
    for (const section of menu.sections) {
      // Check section name
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
          // Check item name
          const itemNameLower = (item.name || '').toLowerCase()
          if (keywords.some(keyword => itemNameLower.includes(keyword))) {
            return true
          }
          // Check item category
          const itemCategoryLower = (item.category || '').toLowerCase()
          if (keywords.some(keyword => itemCategoryLower.includes(keyword))) {
            return true
          }
        }
      }
    }
    
    return false
  }

  // Fetch restaurants from API
  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        setLoadingRestaurants(true)
        console.log('🔄 Fetching restaurants from API...')
        if (!zoneId) {
          setRestaurantsData([])
          return
        }
        const params = { zoneId }
        const response = await restaurantAPI.getRestaurants(params)
        
        console.log('📦 Full API Response:', response)
        console.log('📦 Response Data:', response?.data)
        
        if (response.data && response.data.success && response.data.data && response.data.data.restaurants) {
          const restaurantsArray = response.data.data.restaurants
          console.log(`✅ Got ${restaurantsArray.length} restaurants from API`)
          
          // Check if we have actual data or just defaults
          if (restaurantsArray.length > 0) {
            console.log('📋 First restaurant sample:', {
              id: restaurantsArray[0]._id || restaurantsArray[0].restaurantId,
              name: restaurantsArray[0].name,
              rating: restaurantsArray[0].rating,
              offer: restaurantsArray[0].offer,
              featuredDish: restaurantsArray[0].featuredDish,
              featuredPrice: restaurantsArray[0].featuredPrice,
            })
          }
          
          // Helper function to check if value is a default/mock value
          const isDefaultValue = (value, fieldName) => {
            if (!value) return false
            
            // Common default values from backend model
            const defaultOffers = [
              "Flat ₹50 OFF above ₹199",
              "Flat 50% OFF",
              "Flat ₹40 OFF above ₹149"
            ]
            const defaultDeliveryTimes = ["25-30 mins", "20-25 mins", "30-35 mins"]
            const defaultDistances = ["1.2 km", "1 km", "0.8 km"]
            const defaultFeaturedPrice = 249
            
            if (fieldName === 'offer' && defaultOffers.includes(value)) {
              return true
            }
            if (fieldName === 'deliveryTime' && defaultDeliveryTimes.includes(value)) {
              return true
            }
            if (fieldName === 'distance' && defaultDistances.includes(value)) {
              return true
            }
            if (fieldName === 'featuredPrice' && value === defaultFeaturedPrice) {
              return true
            }
            
            return false
          }
          
          // First transform restaurants without menu data - USE ONLY BACKEND DATA
          // Filter out restaurants with only default/mock data
          const restaurantsWithIds = restaurantsArray
            .filter((restaurant) => {
              // Only include restaurants with real data (not just defaults)
              // At minimum, restaurant should have a name and either images or menu
              const hasName = restaurant.name && restaurant.name.trim().length > 0
              const hasRealImage = restaurant.profileImage?.url || 
                                   (restaurant.coverImages && restaurant.coverImages.length > 0) ||
                                   (restaurant.menuImages && restaurant.menuImages.length > 0)
              
              return hasName && hasRealImage
            })
            .map((restaurant) => {
              // Use backend data directly - filter out default values
              let deliveryTime = restaurant.estimatedDeliveryTime || null
              let distance = restaurant.distance || null
              let offer = restaurant.offer || null
              
              // Filter out default values
              if (isDefaultValue(deliveryTime, 'deliveryTime')) {
                deliveryTime = null
              }
              if (isDefaultValue(distance, 'distance')) {
                distance = null
              }
              if (isDefaultValue(offer, 'offer')) {
                offer = null
              }
              
              const cuisine = restaurant.cuisines && restaurant.cuisines.length > 0 
                ? restaurant.cuisines.join(", ")
                : null
              
              // Get images from backend only
              const coverImages = restaurant.coverImages && restaurant.coverImages.length > 0
                ? restaurant.coverImages.map(img => img.url || img).filter(Boolean)
                : []
              
              const fallbackImages = restaurant.menuImages && restaurant.menuImages.length > 0
                ? restaurant.menuImages.map(img => img.url || img).filter(Boolean)
                : []
              
              // Use backend images only - no fallback placeholder
              // Prefer onboarding.step2.profileImageUrl if available (more accurate)
              const profileImageUrl = restaurant.onboarding?.step2?.profileImageUrl?.url
                || restaurant.profileImage?.url
                || (typeof restaurant.profileImage === 'string' ? restaurant.profileImage : null)
              
              const allImages = coverImages.length > 0 
                ? coverImages 
                : (fallbackImages.length > 0
                    ? fallbackImages
                    : (profileImageUrl ? [profileImageUrl] : []))
              
              const image = allImages[0] || null // Will be handled in UI
              const restaurantId = restaurant.restaurantId || restaurant._id
              
              let featuredDish = restaurant.featuredDish || null
              let featuredPrice = restaurant.featuredPrice || null
              
              // Filter out default featured price
              if (featuredPrice && isDefaultValue(featuredPrice, 'featuredPrice')) {
                featuredPrice = null
              }
              
              return {
                id: restaurantId,
                // Prefer onboarding.step1.restaurantName if available (more accurate)
                name: restaurant.onboarding?.step1?.restaurantName || restaurant.name,
                cuisine: cuisine,
                rating: restaurant.rating || null, // Use backend rating or null
                deliveryTime: deliveryTime,
                distance: distance,
                image: image,
                images: allImages,
                priceRange: restaurant.priceRange || null,
                featuredDish: featuredDish, // Will be set from menu if available
                featuredPrice: featuredPrice, // Will be set from menu if available
                offer: offer, // Use backend offer or null (defaults filtered out)
                slug: restaurant.slug || restaurant.name?.toLowerCase().replace(/\s+/g, '-'),
                restaurantId: restaurantId,
                hasPaneer: false, // Will be updated after menu fetch
                category: 'all',
              }
            })
          
          // Fetch menus for all restaurants in one bulk request to prevent rate limiting (Deep Fix)
          const restaurantIds = restaurantsWithIds.map(r => r.restaurantId);
          let transformedRestaurants = restaurantsWithIds;
          
          if (restaurantIds.length > 0) {
            try {
              const bulkMenusResponse = await restaurantAPI.getBulkMenus(restaurantIds);
              if (bulkMenusResponse.data?.success && bulkMenusResponse.data?.data?.menus) {
                const bulkMenus = bulkMenusResponse.data.data.menus;
                
                // Map menus back to restaurants
                transformedRestaurants = restaurantsWithIds.map(restaurant => {
                  const menu = bulkMenus.find(m => 
                    String(m.restaurantId) === String(restaurant.restaurantId) || 
                    String(m.restaurant) === String(restaurant.id)
                  );
                  
                  if (menu) {
                    const hasPaneer = checkCategoryInMenu(menu, 'paneer-tikka');
                    
                    let featuredDish = restaurant.featuredDish;
                    let featuredPrice = restaurant.featuredPrice;
                    
                    if (!featuredDish || !featuredPrice) {
                      for (const section of (menu.sections || [])) {
                        const items = section.items || [];
                        if (items.length > 0) {
                          if (!featuredDish) featuredDish = items[0].name;
                          if (!featuredPrice) {
                            featuredPrice = items[0].price || 0;
                          }
                          break;
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
                    };
                  }
                  
                  return {
                    ...restaurant,
                    menu: null,
                    hasPaneer: false,
                    categoryMatches: {},
                  };
                });
              }
            } catch (err) {
              console.error("Failed to fetch bulk menus, falling back to basic data:", err);
            }
          }
          
          console.log(`✅ Final transformed restaurants: ${transformedRestaurants.length}`)
          setRestaurantsData(transformedRestaurants)
        } else {
          console.warn('⚠️ No restaurants in API response. Response structure:', {
            hasData: !!response.data,
            hasSuccess: response.data?.success,
            hasDataField: !!response.data?.data,
            hasRestaurants: !!response.data?.data?.restaurants,
            fullResponse: response.data
          })
          setRestaurantsData([])
        }
      } catch (error) {
        console.error('❌ Error fetching restaurants:', error)
        console.error('❌ Error response:', error.response?.data)
        setRestaurantsData([])
      } finally {
        setLoadingRestaurants(false)
      }
    }
    
    fetchRestaurants()
  }, [zoneId, isOutOfService])

  // Sync selected category and search query from URL params
  useEffect(() => {
    setSearchQuery(query)

    if (categoryParam) {
      const matchedCategory = categories.find((cat) => categoryMatchesParam(cat, categoryParam))
      setSelectedCategory(matchedCategory ? matchedCategory.id : "all")
      return
    }

    if (query) {
      const matchedCategory = categories.find((cat) =>
        cat.name.toLowerCase() === query.toLowerCase() ||
        cat.id === query.toLowerCase().replace(/\s+/g, '-')
      )
      if (matchedCategory) {
        setSelectedCategory(matchedCategory.id)
      } else {
        setSelectedCategory("all")
      }
    } else {
      setSelectedCategory("all")
    }
  }, [query, categoryParam, categoryIdsSignature])

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      const nextParams = { q: searchQuery.trim() }
      if (selectedCategory && selectedCategory !== "all") {
        nextParams.cat = selectedCategory
      }
      setSearchParams(nextParams)
    } else if (selectedCategory && selectedCategory !== "all") {
      setSearchParams({ cat: selectedCategory })
    } else {
      setSearchParams({})
    }
  }

  const handleCategorySelect = (catId) => {
    setSelectedCategory(catId)
    const category = categories.find(c => c.id === catId)
    if (category && category.id !== 'all') {
      // Category click should open only that category in search page.
      setSearchQuery("")
      setSearchParams({ cat: category.id })
    } else {
      setSearchQuery("")
      setSearchParams({})
    }
  }

  const filteredFoodItems = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase()
    const selectedKeywords = categoryKeywords[selectedCategory] || []
    const allFoods = []

    restaurantsData.forEach((restaurant) => {
      const sections = Array.isArray(restaurant?.menu?.sections) ? restaurant.menu.sections : []
      sections.forEach((section) => {
        const sectionItems = Array.isArray(section?.items) ? section.items : []
        const subsectionItems = Array.isArray(section?.subsections)
          ? section.subsections.flatMap((subsection) => Array.isArray(subsection?.items) ? subsection.items : [])
          : []
        const items = [...sectionItems, ...subsectionItems]

        items.forEach((item, index) => {
          const name = item?.name || item?.dishName || item?.itemName
          if (!name) return
          const originalPrice = Number(item?.originalPrice ?? item?.price ?? 0)
          const discountPercent = Number(item?.discountPercent ?? 0)
          const finalPrice = discountPercent > 0
            ? Math.round(originalPrice * (1 - discountPercent / 100))
            : originalPrice
          const image = item?.image || item?.imageUrl || item?.thumbnail || null

          allFoods.push({
            id: item?._id || item?.id || `${restaurant.id}-${name}-${index}`,
            name,
            category: item?.category || section?.name || "",
            image,
            finalPrice,
            discountPercent,
            restaurantName: restaurant.name,
            restaurantSlug: restaurant.slug || restaurant.name?.toLowerCase().replace(/\s+/g, "-"),
            restaurantDeliveryTime: restaurant.deliveryTime || "",
            restaurantRating: restaurant.rating || null,
            restaurantOffer: restaurant.offer || "",
          })
        })
      })
    })

    const filtered = allFoods.filter((food) => {
      if (lowerQuery) {
        const queryMatches =
          food.name.toLowerCase().includes(lowerQuery) ||
          food.category.toLowerCase().includes(lowerQuery) ||
          food.restaurantName.toLowerCase().includes(lowerQuery)
        if (!queryMatches) return false
      }

      if (selectedCategory !== "all" && selectedKeywords.length > 0) {
        const combinedText = `${food.name} ${food.category}`.toLowerCase()
        const matchesCategory = selectedKeywords.some((keyword) => combinedText.includes(keyword))
        if (!matchesCategory) return false
      }

      return true
    })

    const uniqueByRestaurantAndFood = new Map()
    filtered.forEach((food) => {
      const key = `${food.restaurantSlug}-${food.name.toLowerCase()}`
      if (!uniqueByRestaurantAndFood.has(key)) {
        uniqueByRestaurantAndFood.set(key, food)
      }
    })

    return Array.from(uniqueByRestaurantAndFood.values())
  }, [query, selectedCategory, restaurantsData, categoryKeywords])

  // Check if should show grayscale (user out of service)
  const shouldShowGrayscale = isOutOfService

  return (
    <div className={`min-h-screen bg-white dark:bg-[#0a0a0a] ${shouldShowGrayscale ? 'grayscale opacity-75' : ''}`}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-[#1a1a1a] shadow-sm">
        <div className="max-w-7xl mx-auto">
        {/* Search Bar with Back Button */}
        <div className="flex items-center gap-2 px-3 sm:px-4 md:px-6 lg:px-8 pt-8 pb-3 md:pt-9 md:pb-4 border-b border-gray-100 dark:border-gray-800">
          <button 
            onClick={() => navigate('/user')}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          </button>
          
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
              placeholder="Restaurant name or a dish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 h-11 rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] focus:bg-white dark:focus:bg-[#2a2a2a] focus:border-gray-500 dark:focus:border-gray-600 text-sm dark:text-white placeholder:text-gray-600 dark:placeholder:text-gray-400"
              />
          </form>
            </div>

        {/* Browse Category Section */}
        <div 
          ref={categoryScrollRef}
          className="flex gap-3 sm:gap-4 lg:gap-5 overflow-x-auto scrollbar-hide px-4 sm:px-6 md:px-8 lg:px-10 py-3 md:py-4 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat.id)}
                className={`flex flex-col items-center gap-1.5 flex-shrink-0 pb-2 transition-all ${
                  isSelected ? 'border-b-2 border-green-600' : ''
                }`}
              >
                {cat.image ? (
                  <div className={`w-16 h-16 rounded-full overflow-hidden border-2 transition-all ${
                    isSelected ? 'border-green-600 dark:border-green-500 shadow-lg' : 'border-transparent'
                  }`}>
                    <img 
                      src={cat.image} 
                      alt={cat.name}
                      className={`w-full h-full object-cover ${cat.id === "all" ? "scale-90" : ""}`}
                    />
                  </div>
                ) : (
                  <div className={`w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-2 transition-all ${
                    isSelected ? 'border-green-600 dark:border-green-500 shadow-lg bg-green-50 dark:bg-green-900/20' : 'border-transparent'
                  }`}>
                    <span className="text-xl">🍽️</span>
                  </div>
                )}
                <span className={`text-xs font-medium whitespace-nowrap ${
                  isSelected ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'
                }`}>
                  {cat.name}
                </span>
              </button>
            )
          })}
        </div>

      </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-4 sm:py-6 md:py-8 lg:py-10 space-y-6 md:space-y-8 lg:space-y-10">
        {/* Loading State */}
        {loadingRestaurants && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-3 text-gray-600">Loading restaurants...</span>
          </div>
        )}
        
        <section>
          <h2 className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-4">
            ALL FOODS
          </h2>
          
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredFoodItems.map((food) => {
              return (
                <div
                  key={food.id}
                  className={`flex gap-4 p-4 border-b border-gray-100 dark:border-gray-800 last:border-none ${
                    shouldShowGrayscale ? 'grayscale opacity-75' : ''
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/user/restaurants/${food.restaurantSlug}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        navigate(`/user/restaurants/${food.restaurantSlug}`)
                      }
                    }}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-4 h-4 border-2 border-green-600 flex items-center justify-center rounded-sm flex-shrink-0">
                        <div className="w-2 h-2 bg-green-600 rounded-full" />
                      </div>
                    </div>
                    <h3 className="font-bold text-gray-800 dark:text-white text-lg leading-tight line-clamp-1">
                      {food.name}
                    </h3>
                    {food.finalPrice > 0 && (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-semibold text-gray-900 dark:text-white">₹{food.finalPrice}</span>
                        {food.restaurantDeliveryTime && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                            <Clock className="h-3 w-3 text-gray-500" />
                            {food.restaurantDeliveryTime}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      The Taste is Yummy
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 truncate">
                      {food.restaurantName}
                    </p>

                    <div className="flex gap-4 mt-3">
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Bookmark className="h-[18px] w-[18px]" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Share2 className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                  </div>

                  <div className="relative w-32 h-32 flex-shrink-0">
                    <div className="w-full h-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                    {food.image ? (
                      <img
                        src={food.image}
                        alt={food.name}
                        className="w-full h-full object-cover rounded-2xl shadow-sm"
                        onError={(e) => {
                          e.target.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-800">
                        <span className="text-4xl">🍽️</span>
                      </div>
                    )}
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate(`/user/restaurants/${food.restaurantSlug}`)}
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white border border-green-600 text-green-600 hover:bg-green-50 dark:bg-[#1a1a1a] dark:text-green-400 dark:border-green-500 font-bold px-4 py-1.5 rounded-lg shadow-md min-w-[104px]"
                    >
                      ADD +
                    </button>
                  </div>
                </div>
              )
            })}
            
            {/* Empty State */}
            {filteredFoodItems.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">
                  {query
                    ? `No foods found for "${query}"`
                    : "No foods found with selected filters"}
                </p>
                <Button
                  variant="outline"
                  className="mt-4 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  onClick={() => {
                    setSearchQuery("")
                    setSelectedCategory('all')
                    setSearchParams({})
                  }}
                >
                  Clear all filters
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
      <StickyCartCard />
    </div>
  )
}
