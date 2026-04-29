import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { X, Search, Loader2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { adminAPI, api, API_ENDPOINTS, restaurantAPI } from "@/lib/api"
import { searchAPI } from "@/lib/api/search"
import { useSharedLocation } from "@/lib/context/LocationContext"

// LocalStorage key for recent searches
const RECENT_SEARCHES_KEY = 'userRecentSearches'
const MAX_RECENT_SEARCHES = 8

export default function SearchOverlay({ isOpen, onClose, searchValue, onSearchChange }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const { zoneId: contextZoneId } = useSharedLocation()
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [restaurants, setRestaurants] = useState([])
  const [loadingRestaurants, setLoadingRestaurants] = useState(false)
  const [recentSearches, setRecentSearches] = useState([])
  const [filteredFoods, setFilteredFoods] = useState([])
  const [liveFoodSuggestions, setLiveFoodSuggestions] = useState([])
  const [loadingLiveSuggestions, setLoadingLiveSuggestions] = useState(false)
  const [cachedMenuFoods, setCachedMenuFoods] = useState([])
  const [menuFoodsLoaded, setMenuFoodsLoaded] = useState(false)
  const [imageErrors, setImageErrors] = useState(new Set())
  const zoneId = contextZoneId || localStorage.getItem("userZoneId")

  const isLikelyGenericRestaurantName = (name) =>
    /^restaurant\s*\d+$/i.test(String(name || "").trim())

  const restaurantNameById = useMemo(() => {
    const map = new Map()
    restaurants.forEach((r) => {
      const id = r?.id
      const name = r?.name
      if (id && name) map.set(String(id), String(name).trim())
    })
    return map
  }, [restaurants])

  const getFoodImage = (item) => {
    if (!item || typeof item !== "object") return null

    if (typeof item.image === "string" && item.image.trim()) return item.image
    if (typeof item.imageUrl === "string" && item.imageUrl.trim()) return item.imageUrl
    if (typeof item.thumbnail === "string" && item.thumbnail.trim()) return item.thumbnail

    if (Array.isArray(item.images) && item.images.length > 0) {
      const firstImage = item.images[0]
      if (typeof firstImage === "string" && firstImage.trim()) return firstImage
      if (firstImage && typeof firstImage.url === "string" && firstImage.url.trim()) {
        return firstImage.url
      }
    }

    return null
  }

  const highlightMatch = (text) => {
    const q = searchValue?.trim();
    const t = String(text || '');
    if (!q) return t;
    const idx = t.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return t;
    const before = t.slice(0, idx);
    const match = t.slice(idx, idx + q.length);
    const after = t.slice(idx + q.length);
    return (
      <>
        {before}
        <span className="text-primary-orange dark:text-orange-400 font-semibold">{match}</span>
        {after}
      </>
    );
  };

  const normalizeFoodSuggestions = (responseData) => {
    const candidates = [
      ...(Array.isArray(responseData?.data?.items) ? responseData.data.items : []),
      ...(Array.isArray(responseData?.data?.foods) ? responseData.data.foods : []),
      ...(Array.isArray(responseData?.data?.results) ? responseData.data.results : []),
      ...(Array.isArray(responseData?.items) ? responseData.items : []),
      ...(Array.isArray(responseData?.foods) ? responseData.foods : []),
      ...(Array.isArray(responseData?.results) ? responseData.results : []),
    ]

    const normalized = candidates
      .map((item, index) => {
        const name = item?.name || item?.dishName || item?.itemName || item?.title
        if (!name || typeof name !== "string") return null

        const id = item?.id || item?._id || item?.menuItemId || `${name}-${index}`
        const restaurantName =
          item?.restaurantName ||
          item?.restaurant?.name ||
          item?.restaurant?.restaurantName ||
          item?.outletName ||
          item?.vendorName ||
          null
        const restaurantId =
          item?.restaurantId ||
          item?.restaurant?._id ||
          item?.restaurant?.id ||
          null

        const enrichedRestaurantName = (() => {
          const candidateName = typeof restaurantName === "string" ? restaurantName.trim() : null
          if (!restaurantId) return candidateName
          const byId = restaurantNameById.get(String(restaurantId)) || null
          if (!candidateName) return byId
          if (isLikelyGenericRestaurantName(candidateName) && byId) return byId
          return candidateName
        })()

        const restaurantSlug =
          item?.restaurantSlug ||
          item?.restaurant?.slug ||
          (typeof enrichedRestaurantName === "string" && enrichedRestaurantName.trim()
            ? enrichedRestaurantName.trim().toLowerCase().replace(/\s+/g, "-")
            : null)
        return {
          id,
          name: name.trim(),
          image: getFoodImage(item),
          slug: item?.slug || null,
          itemType: "food",
          restaurantName: typeof enrichedRestaurantName === "string" ? enrichedRestaurantName.trim() : null,
          restaurantId,
          restaurantSlug,
        }
      })
      .filter(Boolean)

    const uniqueByName = new Map()
    normalized.forEach((food) => {
      const key = food.name.toLowerCase()
      if (!uniqueByName.has(key)) uniqueByName.set(key, food)
    })

    return Array.from(uniqueByName.values()).slice(0, 24)
  }

  const extractFoodsFromMenu = (menu, restaurantMeta = {}) => {
    if (!menu || !Array.isArray(menu.sections)) return []
    const { restaurantName = null, restaurantId = null, restaurantSlug = null } = restaurantMeta

    const foods = []
    menu.sections.forEach((section) => {
      const sectionItems = Array.isArray(section?.items) ? section.items : []
      sectionItems.forEach((item) => {
        const name = item?.name || item?.dishName || item?.itemName
        if (!name || typeof name !== "string") return

        foods.push({
          id: item?.id || item?._id || item?.menuItemId || `${name}-${foods.length}`,
          name: name.trim(),
          image: getFoodImage(item),
          slug: item?.slug || null,
          itemType: "food",
          restaurantName,
          restaurantId,
          restaurantSlug,
        })
      })

      const subsections = Array.isArray(section?.subsections) ? section.subsections : []
      subsections.forEach((subsection) => {
        const subsectionItems = Array.isArray(subsection?.items) ? subsection.items : []
        subsectionItems.forEach((item) => {
          const name = item?.name || item?.dishName || item?.itemName
          if (!name || typeof name !== "string") return

          foods.push({
            id: item?.id || item?._id || item?.menuItemId || `${name}-${foods.length}`,
            name: name.trim(),
            image: getFoodImage(item),
            slug: item?.slug || null,
            itemType: "food",
            restaurantName,
            restaurantId,
            restaurantSlug,
          })
        })
      })
    })

    const uniqueByName = new Map()
    foods.forEach((food) => {
      const key = food.name.toLowerCase()
      const existing = uniqueByName.get(key)
      if (!existing || (!existing.image && food.image)) {
        uniqueByName.set(key, food)
      }
    })

    return Array.from(uniqueByName.values())
  }

  const loadFoodsFromRestaurantMenus = async () => {
    if (!zoneId) return []
    const restaurantsResponse = await restaurantAPI.getRestaurants({ zoneId, limit: 100 })
    const restaurants = Array.isArray(restaurantsResponse?.data?.data?.restaurants)
      ? restaurantsResponse.data.data.restaurants
      : []

    // Only include restaurants that are currently accepting orders.
    // This keeps search suggestions consistent with ordering availability.
    const openRestaurants = restaurants.filter((r) => {
      if (!r) return false
      if (r.isActive === false) return false
      if (r.isAcceptingOrders === false || r.isAcceptingOrders === 0) return false
      return true
    })

    const restaurantIds = openRestaurants
      .map((restaurant) => restaurant?.restaurantId || restaurant?._id || restaurant?.id)
      .filter(Boolean)
    const restaurantNamesById = new Map(
      openRestaurants.map((restaurant) => [
        restaurant?.restaurantId || restaurant?._id || restaurant?.id,
        restaurant?.onboarding?.step1?.restaurantName || restaurant?.name || null,
      ])
    )
    const restaurantSlugsById = new Map(
      openRestaurants.map((restaurant) => [
        restaurant?.restaurantId || restaurant?._id || restaurant?.id,
        restaurant?.slug ||
          (restaurant?.onboarding?.step1?.restaurantName || restaurant?.name || "")
            .toLowerCase()
            .replace(/\s+/g, "-") ||
          null,
      ])
    )

    if (restaurantIds.length === 0) return []
    
    // Deep Fix: Use bulk menus API to avoid N+1 parallel requests and 429 errors
    let menuData = []
    try {
      const bulkMenusResponse = await restaurantAPI.getBulkMenus(restaurantIds)
      if (bulkMenusResponse.data?.success && bulkMenusResponse.data?.data?.menus) {
        menuData = bulkMenusResponse.data.data.menus
      }
    } catch (err) {
      console.warn("SearchOverlay: Bulk menus fetch failed:", err)
    }

    // Fallback: if bulk endpoint returns nothing (or is blocked), fetch a limited
    // set of menus by restaurant id in small batches. This is slower but makes
    // search reliable for menu items like "Rolls".
    if (!Array.isArray(menuData) || menuData.length === 0) {
      const idsToFetch = restaurantIds.slice(0, 40) // safety limit
      const batchSize = 5
      const fetchedMenus = []

      for (let i = 0; i < idsToFetch.length; i += batchSize) {
        const batch = idsToFetch.slice(i, i + batchSize)
        const results = await Promise.allSettled(
          batch.map((id) => restaurantAPI.getMenuByRestaurantId(id))
        )
        results.forEach((res, idx) => {
          if (res.status !== "fulfilled") return
          const data = res.value?.data
          const menu =
            data?.data?.menu ||
            data?.data ||
            data?.menu ||
            null
          const rId = batch[idx]
          if (menu) {
            fetchedMenus.push({
              ...menu,
              restaurantId: menu.restaurantId || menu.restaurant || rId,
              restaurant: menu.restaurant || menu.restaurantId || rId,
            })
          }
        })

        // Early stop if we already have a decent amount of menus
        if (fetchedMenus.length >= 20) break
      }

      menuData = fetchedMenus
    }

    const allFoods = []
    menuData.forEach((menu) => {
      const rId = menu.restaurantId || menu.restaurant
      const restaurantName = restaurantNamesById.get(rId) || restaurantNamesById.get(String(rId)) || null
      const restaurantSlug = restaurantSlugsById.get(rId) || restaurantSlugsById.get(String(rId)) || null
      
      const foods = extractFoodsFromMenu(menu, {
        restaurantName,
        restaurantId: rId,
        restaurantSlug,
      })
      allFoods.push(...foods)
    })

    const uniqueByName = new Map()
    allFoods.forEach((food) => {
      const key = food.name.toLowerCase()
      const existing = uniqueByName.get(key)
      if (!existing || (!existing.image && food.image)) {
        uniqueByName.set(key, food)
      }
    })

    return Array.from(uniqueByName.values())
  }

  // Create a deterministic, unique React key for grid items
  const makeItemKey = (item, idx) => {
    const type = String(item?.itemType || 'food');
    const rest = String(item?.restaurantSlug || item?.restaurantId || 'na');
    const ident = String(item?.slug || item?.id || item?.name || idx)
      .toLowerCase()
      .replace(/\s+/g, '-');
    return `${type}::${rest}::${ident}#${idx}`;
  };

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true)
        const response = await adminAPI.getPublicCategories()
        
        if (response.data && response.data.success && response.data.data && response.data.data.categories) {
          const categoriesArray = response.data.data.categories.map((cat) => ({
            id: cat.id || cat._id,
            name: cat.name,
            image: cat.image || null,
            slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, '-'),
            itemType: "category",
            offerPercentage: typeof cat.offerPercentage === "number" ? cat.offerPercentage : 0,
          }))
          setCategories(categoriesArray)
          setFilteredFoods(categoriesArray)
        } else {
          setCategories([])
          setFilteredFoods([])
        }
      } catch (error) {
        console.error('Error fetching categories:', error)
        setCategories([])
        setFilteredFoods([])
      } finally {
        setLoadingCategories(false)
      }
    }

    if (isOpen) {
      fetchCategories()
    }
  }, [isOpen])

  // Fetch restaurants for live suggestions (cached while overlay is open)
  useEffect(() => {
    const fetchRestaurants = async () => {
      if (!zoneId) {
        setRestaurants([])
        return
      }
      try {
        setLoadingRestaurants(true)
        const response = await restaurantAPI.getRestaurants({ zoneId, limit: 200 })
        const restaurantsArray = Array.isArray(response?.data?.data?.restaurants)
          ? response.data.data.restaurants
          : []

        const normalized = restaurantsArray
          .map((r) => {
            const id = r?.restaurantId || r?._id || r?.id
            const name = r?.onboarding?.step1?.restaurantName || r?.name || ""
            const slug =
              r?.slug ||
              (name ? String(name).trim().toLowerCase().replace(/\s+/g, "-") : null)

            const profileImageUrl =
              r?.onboarding?.step2?.profileImageUrl?.url ||
              r?.profileImage?.url ||
              (typeof r?.profileImage === "string" ? r.profileImage : null)

            const coverImage = Array.isArray(r?.coverImages) && r.coverImages.length > 0
              ? (r.coverImages[0]?.url || r.coverImages[0])
              : null

            return {
              id,
              name: String(name || "").trim(),
              slug,
              cuisine: Array.isArray(r?.cuisines) ? r.cuisines.join(", ") : (r?.cuisine || ""),
              image: coverImage || profileImageUrl || null,
              itemType: "restaurant",
              isActive: r?.isActive,
              isAcceptingOrders: r?.isAcceptingOrders,
            }
          })
          .filter((r) => r.id && r.name && r.slug)
          // Hide closed/offline restaurants from search suggestions
          .filter((r) => {
            if (r.isActive === false) return false
            if (r.isAcceptingOrders === false || r.isAcceptingOrders === 0) return false
            return true
          })

        setRestaurants(normalized)
      } catch (err) {
        console.error("SearchOverlay: Failed to fetch restaurants:", err)
        setRestaurants([])
      } finally {
        setLoadingRestaurants(false)
      }
    }

    if (isOpen) fetchRestaurants()
  }, [isOpen, zoneId])

  const filteredRestaurants = useMemo(() => {
    const q = searchValue.trim().toLowerCase()
    if (!q) return []

    const matches = restaurants.filter((r) => {
      const name = String(r?.name || "").toLowerCase()
      const cuisine = String(r?.cuisine || "").toLowerCase()
      return name.includes(q) || cuisine.includes(q)
    })

    return matches.slice(0, 8)
  }, [restaurants, searchValue])

  // Load recent searches from localStorage
  useEffect(() => {
    if (isOpen) {
      try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
        if (stored) {
          const searches = JSON.parse(stored)
          setRecentSearches(searches.slice(0, MAX_RECENT_SEARCHES))
        } else {
          setRecentSearches([])
        }
      } catch (error) {
        console.error('Error loading recent searches:', error)
        setRecentSearches([])
      }
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (searchValue.trim() === "") {
      setFilteredFoods(categories)
    } else {
      const filtered = categories.filter((food) =>
        food.name.toLowerCase().includes(searchValue.toLowerCase())
      )
      setFilteredFoods(filtered)
    }
  }, [searchValue, categories])

  useEffect(() => {
    if (!isOpen) return

    const trimmedQuery = searchValue.trim()
    if (!zoneId) {
      setLiveFoodSuggestions([])
      setLoadingLiveSuggestions(false)
      return
    }
    if (!trimmedQuery) {
      setLiveFoodSuggestions([])
      setLoadingLiveSuggestions(false)
      return
    }

    let isCancelled = false
    const timer = setTimeout(async () => {
      try {
        setLoadingLiveSuggestions(true)
        let normalized = []

        const ensureMenuFoodsLoaded = async () => {
          const loadedFoods = menuFoodsLoaded
            ? cachedMenuFoods
            : await loadFoodsFromRestaurantMenus()

          if (!menuFoodsLoaded) {
            setCachedMenuFoods(loadedFoods)
            setMenuFoodsLoaded(true)
          }

          return loadedFoods
        }

        try {
          // New unified suggest endpoint (fast top-N)
          let fromSuggestFoods = []
          try {
            const suggestResp = await searchAPI.suggest(trimmedQuery, 6, zoneId)
            const foods = Array.isArray(suggestResp?.data?.data?.foods)
              ? suggestResp.data.data.foods
              : []
            fromSuggestFoods = foods.map((f, i) => ({
              id: f?.id || `${f?.label || 'food'}-${i}`,
              name: f?.label || '',
              image: f?.imageUrl || null,
              itemType: "food",
              restaurantName: (() => {
                const candidateName = f?.restaurantName || null
                const restId = f?.restaurantId || null
                const byId = restId ? (restaurantNameById.get(String(restId)) || null) : null
                if (!candidateName) return byId
                if (isLikelyGenericRestaurantName(candidateName) && byId) return byId
                return candidateName
              })(),
              restaurantId: f?.restaurantId || null,
              restaurantSlug: f?.restaurantSlug || null,
            })).filter(x => x.name)
          } catch (e) {
            // non-fatal
          }

          const response = await api.get(API_ENDPOINTS.MENU.SEARCH, {
            params: {
              q: trimmedQuery,
              query: trimmedQuery,
              limit: 24,
              zoneId,
            },
          })
          normalized = [...fromSuggestFoods, ...normalizeFoodSuggestions(response?.data || {})]

          // Always enrich with menu-cache matches so "all menu foods" are searchable,
          // even when API returns partial/empty results.
          const menuFoods = await ensureMenuFoodsLoaded()
          const menuMatches = menuFoods
            .filter((food) => food.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
            .slice(0, 80)

          // Merge & dedupe by restaurant + name (keeps broad coverage but avoids spam)
          const merged = [...normalized, ...menuMatches]
          const unique = new Map()
          merged.forEach((item) => {
            const key = `${String(item?.restaurantSlug || "")}::${String(item?.name || "").toLowerCase()}`
            if (!unique.has(key)) unique.set(key, item)
          })
          normalized = Array.from(unique.values()).slice(0, 80)
        } catch (searchError) {
          const menuFoods = await ensureMenuFoodsLoaded()
          normalized = menuFoods
            .filter((food) => food.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
            .slice(0, 80)

          if (searchError?.response?.status !== 404) {
            console.error("Primary search endpoint failed, used menu fallback:", searchError)
          }
        }

        if (isCancelled) return
        setLiveFoodSuggestions(normalized)
      } catch (error) {
        if (!isCancelled) {
          console.error("Error fetching live food suggestions:", error)
          setLiveFoodSuggestions([])
        }
      } finally {
        if (!isCancelled) {
          setLoadingLiveSuggestions(false)
        }
      }
    }, 250)

    return () => {
      isCancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, searchValue, menuFoodsLoaded, cachedMenuFoods, zoneId])

  const filteredCategories = useMemo(() => {
    const q = searchValue.trim().toLowerCase()
    if (!q) return []
    return categories
      .filter((c) => String(c?.name || "").toLowerCase().includes(q))
      .slice(0, 12)
  }, [categories, searchValue])

  // Save search to recent searches
  const saveRecentSearch = (searchTerm) => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
      let searches = stored ? JSON.parse(stored) : []
      
      // Remove if already exists
      searches = searches.filter(s => s.toLowerCase() !== searchTerm.toLowerCase())
      
      // Add to beginning
      searches.unshift(searchTerm)
      
      // Keep only max items
      searches = searches.slice(0, MAX_RECENT_SEARCHES)
      
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches))
      setRecentSearches(searches)
    } catch (error) {
      console.error('Error saving recent search:', error)
    }
  }

  const handleSuggestionClick = (suggestion) => {
    onSearchChange(suggestion)
    inputRef.current?.focus()
    saveRecentSearch(suggestion)
    navigate(`/search?q=${encodeURIComponent(suggestion)}`)
    onClose()
    onSearchChange("")
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchValue.trim()) {
      saveRecentSearch(searchValue.trim())
      navigate(`/search?q=${encodeURIComponent(searchValue.trim())}`)
      onClose()
      onSearchChange("")
    }
  }

  const handleFoodClick = (food) => {
    saveRecentSearch(food.name)
    const restaurantSlug = food?.restaurantSlug
      || (typeof food?.restaurantName === "string" && food.restaurantName.trim()
        ? food.restaurantName.trim().toLowerCase().replace(/\s+/g, "-")
        : null)

    if (restaurantSlug) {
      // Pass restaurant metadata via state for instant load in RestaurantDetails
      navigate(`/user/restaurants/${restaurantSlug}`, {
        state: {
          restaurant: {
            name: food.restaurantName || food.name,
            slug: restaurantSlug,
            // (Note: we don't always have restaurant image here, but name is enough for a fast header)
          }
        }
      })
    } else {
      // Generic dish suggestion (not tied to a specific restaurant).
      // Route to category page (e.g. /category/paneer) instead of global search.
      const slug = String(food?.name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
      if (slug) {
        navigate(`/category/${encodeURIComponent(slug)}`)
      } else {
        navigate(`/search?q=${encodeURIComponent(food.name)}`)
      }
    }
    onClose()
    onSearchChange("")
  }

  const handleCategoryClick = (category) => {
    const categoryId = category?.slug || category?.id
    if (!categoryId) return

    navigate(`/category/${encodeURIComponent(categoryId)}`)
    onClose()
    onSearchChange("")
  }

  if (!isOpen) return null

  const shouldShowLiveSuggestions = searchValue.trim() !== ""
  const displayFoods = shouldShowLiveSuggestions && liveFoodSuggestions.length > 0
    ? liveFoodSuggestions
    : filteredFoods

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#0a0a0a]"
      style={{
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      {/* Header with Search Bar */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-1">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-[58%] transform -translate-y-1/2 h-5 w-5 text-muted-foreground dark:text-gray-400 z-10" />
              <Input
                ref={inputRef}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search for foods...."
                className="pl-12 pr-4 pt-2 h-12 w-full bg-white dark:bg-[#1a1a1a] border-gray-100 dark:border-gray-800 focus:border-primary-orange dark:focus:border-primary-orange rounded-full text-lg dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 translate-y-2"
            >
              <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </Button>
          </form>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 scrollbar-hide bg-white dark:bg-[#0a0a0a]">
        {/* Restaurant Suggestions */}
        {searchValue.trim() !== "" && (loadingRestaurants || filteredRestaurants.length > 0) && (
          <div className="mb-8">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4">
              Restaurants
            </h3>
            {loadingRestaurants ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-7 w-7 animate-spin text-primary-orange" />
              </div>
            ) : (
              <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                {filteredRestaurants.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      navigate(`/user/restaurants/${r.slug}`)
                      onClose()
                      onSearchChange("")
                    }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-[#141414] border-b border-gray-100 dark:border-gray-800 last:border-none"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white line-clamp-1">
                        {r.name}
                      </p>
                      {r.cuisine && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                          {r.cuisine}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Category Suggestions */}
        {searchValue.trim() !== "" && filteredCategories.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4">
              Categories
            </h3>
            <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              {filteredCategories.map((cat, idx) => (
                <button
                  key={`${String(cat.id || cat.slug || 'cat')}-${idx}`}
                  type="button"
                  onClick={() => handleCategoryClick(cat)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-[#141414] border-b border-gray-100 dark:border-gray-800 last:border-none"
                >
                  <p className="font-semibold text-gray-900 dark:text-white line-clamp-1">
                    {cat.name}
                  </p>
                  <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Food Grid */}
        <div
          style={{
            animation: 'fadeIn 0.3s ease-out 0.2s both'
          }}
        >
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
            {searchValue.trim() === "" ? "All Dishes" : `Food Suggestions (${displayFoods.length})`}
          </h3>
          {loadingCategories || loadingLiveSuggestions ? (
            <div className="flex items-center justify-center py-12 sm:py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary-orange" />
            </div>
          ) : displayFoods.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
              {displayFoods.map((food, index) => (
                <div
                  key={makeItemKey(food, index)}
                  className="flex flex-col items-center gap-2 sm:gap-3 cursor-pointer group"
                  style={{
                    animation: `slideUp 0.3s ease-out ${0.25 + 0.05 * (index % 12)}s both`
                  }}
                  onClick={() => (
                    food?.itemType === "category"
                      ? handleCategoryClick(food)
                      : handleFoodClick(food)
                  )}
                >
                  <div className="relative w-full aspect-square rounded-full overflow-hidden transition-all duration-200 shadow-md group-hover:shadow-lg bg-white dark:bg-[#1a1a1a] p-1 sm:p-1.5">
                    {food.image && !imageErrors.has(food.id || food.slug) ? (
                      <img
                        src={food.image}
                        alt={food.name}
                        className="w-full h-full object-cover rounded-full"
                        loading="lazy"
                        onError={() => {
                          setImageErrors(prev => new Set([...prev, food.id || food.slug]))
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full">
                        <span className="text-2xl">🍽️</span>
                      </div>
                    )}
                  </div>
                  <div className="px-1 sm:px-2 text-center">
                    <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-primary-orange dark:group-hover:text-orange-400 transition-colors line-clamp-2">
                      {highlightMatch(food.name)}
                    </span>
                    {food.restaurantName && (
                      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                        ({highlightMatch(food.restaurantName)})
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 sm:py-16">
              <Search className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg font-semibold">
                {searchValue.trim() ? `No results found for "${searchValue}"` : "No dishes available"}
              </p>
              <p className="text-sm sm:text-base text-gray-500 dark:text-gray-500 mt-2">
                {searchValue.trim() ? "Try a different search term" : "Categories will appear here"}
              </p>
            </div>
          )}

          {/* View all results CTA */}
          {searchValue.trim() !== "" && (
            <div className="mt-8 flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const q = searchValue.trim()
                  if (!q) return
                  saveRecentSearch(q)
                  navigate(`/search?q=${encodeURIComponent(q)}`)
                  onClose()
                  onSearchChange("")
                }}
                className="rounded-full px-6 border-gray-200 dark:border-gray-800"
              >
                View all results
              </Button>
            </div>
          )}
        </div>
      </div>
      <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes scaleIn {
            from {
              opacity: 0;
              transform: scale(0.9);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
    </div>
  )
}

