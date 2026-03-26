import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { MapPin, ChevronDown, SlidersHorizontal, Star, X, ArrowDownUp, Timer, IndianRupee, UtensilsCrossed, BadgePercent, Clock, Bookmark, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import AnimatedPage from "../components/AnimatedPage"
import { useLocationSelector } from "../components/UserLayout"
import { useSharedLocation } from "@/lib/context/LocationContext"
import { useProfile } from "../context/ProfileContext"
import { FaLocationDot } from "react-icons/fa6"
import { restaurantAPI } from "@/lib/api"

export default function DiningCategory() {
  const { category } = useParams()
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeFilters, setActiveFilters] = useState(new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const [sortBy, setSortBy] = useState(null)
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const filterSectionRefs = useRef({})
  const rightContentRef = useRef(null)
  const { openLocationSelector } = useLocationSelector()
  const { location } = useSharedLocation()
  const { addFavorite, removeFavorite, isFavorite } = useProfile()
  const cityName = location?.city || "Select"

  // Fetch restaurants
  useEffect(() => {
    if (!category) return;
    
    const fetchRestaurants = async () => {
      try {
        setIsLoading(true)
        setError(null)
        console.log("Fetching restaurants for category:", category)
        const response = await restaurantAPI.getRestaurants({
          diningCategory: category,
          limit: 100
        })
        console.log("Restaurants API response:", response.data)
        if (response.data && response.data.success) {
          // Map backend data to UI format
          const restaurantsData = response.data.data?.restaurants || response.data.data || [];
          console.log("Raw restaurants data:", restaurantsData.length, restaurantsData);
          
          const mappedData = restaurantsData
            .filter(r => r && (r._id || r.id)) // Filter out invalid entries
            .map(r => {
              // Use onboarding name if available
              const restaurantName = r.onboarding?.step1?.restaurantName || r.name || 'Restaurant';
              return {
                id: r._id || r.id,
                slug: r.slug || r._id || r.id,
                name: restaurantName,
                rating: r.rating || r.avgRating || 0,
                location: r.location?.addressLine1 || r.location?.address || r.address || "Indore",
                distance: r.distance || "2.5 km",
                cuisine: Array.isArray(r.cuisines) && r.cuisines.length > 0 
                  ? r.cuisines[0] 
                  : (r.cuisine || "Multi-cuisine"),
                price: r.diningConfig?.basicDetails?.costForTwo
                  ? `₹${r.diningConfig.basicDetails.costForTwo} for two`
                  : r.price || "Price not available",
                image: r.diningConfig?.coverImage?.url || r.profileImage?.url || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop",
                offer: r.offer || "Great Offers",
                deliveryTime: r.estimatedDeliveryTime || "30-40 mins",
                featuredDish: r.featuredDish || "Special",
                featuredPrice: r.featuredPrice || 250,
                diningEnabled: r.diningConfig?.enabled,
                onboarding: r.onboarding, // Keep for reference
              };
            });
          console.log("Mapped restaurants:", mappedData.length, mappedData);
          setRestaurants(mappedData);
        } else {
          console.warn("API response not successful:", response.data);
          setRestaurants([]);
        }
      } catch (err) {
        console.error("Failed to fetch restaurants", err)
        setError("Failed to load restaurants")
        setRestaurants([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchRestaurants()
  }, [category])

  // Category headings mapping
  const categoryHeadings = {
    'pure-veg': 'ALL PURE VEG PLACES AROUND YOU',
    'drink-&-dine': 'ALL DRINK AND DINE PLACES AROUND YOU',
    'drink-and-dine': 'ALL DRINK AND DINE PLACES AROUND YOU',
    'family-dining': 'ALL FAMILY DINING PLACES AROUND YOU',
    'rooftops': 'ALL ROOFTOP PLACES AROUND YOU',
    'cozy-cafes': 'ALL COZY CAFES AROUND YOU',
    'premium-dining': 'ALL PREMIUM DINING PLACES AROUND YOU',
  }

  // Get heading based on category or default
  const categoryHeading = category
    ? (categoryHeadings[category] || `ALL ${category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} PLACES AROUND YOU`)
    : 'ALL RESTAURANTS AROUND YOU'

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
  }

  const filteredRestaurants = useMemo(() => {
    let filtered = [...restaurants]

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
    // Distance filtering is using static "2.5 km" placeholder currently
    if (activeFilters.has('distance-under-1km')) {
      filtered = filtered.filter(r => {
        const distMatch = r.distance.match(/(\d+\.?\d*)/)
        return distMatch && parseFloat(distMatch[1]) <= 1.0
      })
    }
    if (activeFilters.has('distance-under-2km')) {
      filtered = filtered.filter(r => {
        const distMatch = r.distance.match(/(\d+\.?\d*)/)
        return distMatch && parseFloat(distMatch[1]) <= 2.0
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

    // Apply cuisine filter
    if (selectedCuisine) {
      filtered = filtered.filter(r => r.cuisine.toLowerCase().includes(selectedCuisine.toLowerCase()))
    }

    // Apply sorting
    if (sortBy === 'rating-high') {
      filtered.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === 'rating-low') {
      filtered.sort((a, b) => a.rating - b.rating)
    }

    return filtered
  }, [restaurants, category, activeFilters, selectedCuisine, sortBy])

  const handleLocationClick = useCallback(() => {
    openLocationSelector()
  }, [openLocationSelector])

  return (
    <AnimatedPage className="min-h-screen bg-[#2B9C64]">
      {/* Header with Back Button and Location */}
      <div className="relative w-full z-20 px-3 sm:px-6 lg:px-8 pt-8 pb-3 sm:pt-9 sm:pb-4">
        <div className="flex items-center justify-start gap-3 sm:gap-4">
          {/* Back Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 sm:h-10 sm:w-10 bg-white/20 hover:bg-white/30 text-white border-none rounded-full transition-colors flex-shrink-0 backdrop-blur-sm"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
          </Button>

          {/* Location with Dotted Underline */}
          <Button
            variant="ghost"
            onClick={handleLocationClick}
            className="text-left text-white text-sm sm:text-base font-semibold rounded-full px-3 sm:px-4 py-2 hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FaLocationDot className="h-4 w-4 sm:h-5 sm:w-5 text-white/90 flex-shrink-0" />
              <span className="text-sm sm:text-base font-semibold text-white truncate border-b-2 border-dotted border-white/60">
                {cityName}
              </span>
            </div>
          </Button>
        </div>

        {/* Category Heading in Header - Move it here for better hierarchy */}
        <div className="mt-4 mb-6 px-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight">
            {categoryHeading.replace('ALL ', '').replace(' PLACES AROUND YOU', '')}
          </h1>
          <p className="text-white/80 text-sm font-medium mt-1">
            Best places near you
          </p>
        </div>
      </div>

      {/* Content Sheet */}
      <div className="bg-gray-50 rounded-t-3xl min-h-[calc(100vh-180px)] shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)]">
        <div className="px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-20">
          <div className="max-w-7xl mx-auto">
            {/* Filters */}
            <section className="py-1 mb-6 sticky top-0 z-10 bg-gray-50 pt-2 pb-2 -mx-4 px-4 sm:static sm:bg-transparent sm:p-0">
              <div
                className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide pb-1"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }}
              >
                {/* Filter Button - Opens Modal */}
                <Button
                  variant="outline"
                  onClick={() => setIsFilterOpen(true)}
                  className="h-8 sm:h-9 px-3 rounded-full flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 font-medium transition-all bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="text-xs sm:text-sm font-bold">Filters</span>
                </Button>

                {/* Filter Buttons */}
                {[
                  { id: 'delivery-under-30', label: 'Under 30 mins' },
                  { id: 'delivery-under-45', label: 'Under 45 mins' },
                  { id: 'distance-under-1km', label: 'Under 1km', icon: MapPin },
                  { id: 'distance-under-2km', label: 'Under 2km', icon: MapPin },
                  { id: 'rating-35-plus', label: '3.5+ Rating' },
                  { id: 'rating-4-plus', label: '4.0+ Rating' },
                  { id: 'rating-45-plus', label: '4.5+ Rating' },
                ].map((filter) => {
                  const Icon = filter.icon
                  const isActive = activeFilters.has(filter.id)
                  return (
                    <Button
                      key={filter.id}
                      variant="outline"
                      onClick={() => toggleFilter(filter.id)}
                      className={`h-8 sm:h-9 px-3 rounded-full flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition-all font-medium shadow-sm border-0 ${isActive
                        ? 'bg-[#2B9C64] text-white hover:bg-[#2B9C64]/90'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      {Icon && <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-gray-500'}`} />}
                      <span className="text-xs sm:text-sm font-bold">{filter.label}</span>
                    </Button>
                  )
                })}
              </div>
            </section>

            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2B9C64] mb-4"></div>
                <p className="text-gray-500 text-sm">Loading restaurants...</p>
              </div>
            )}

            {/* Error State */}
            {!isLoading && error && (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-red-500 text-lg font-semibold mb-2">Error loading restaurants</p>
                <p className="text-gray-500 text-sm">{error}</p>
                <Button 
                  onClick={() => window.location.reload()} 
                  className="mt-4 bg-[#2B9C64] hover:bg-[#2B9C64]/90"
                >
                  Retry
                </Button>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && filteredRestaurants.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20">
                <UtensilsCrossed className="h-16 w-16 text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg font-semibold mb-2">No restaurants found</p>
                <p className="text-gray-400 text-sm text-center max-w-md">
                  {category ? `No restaurants are linked to the "${category}" category yet.` : "No restaurants available."}
                </p>
                <Button 
                  onClick={() => navigate('/user/dining')} 
                  className="mt-4 bg-[#2B9C64] hover:bg-[#2B9C64]/90"
                >
                  Back to Dining
                </Button>
              </div>
            )}

            {/* Restaurants List */}
            {!isLoading && !error && filteredRestaurants.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                    FEATURED RESTAURANTS
                  </h3>
                  <span className="text-xs font-medium text-gray-400 bg-gray-200 px-2 py-1 rounded-full">{filteredRestaurants.length} places</span>
                </div>

                {/* Restaurant Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                  {filteredRestaurants.map((restaurant, index) => {
                // Prefer onboarding.step1.restaurantName if available (more accurate)
                const restaurantName = restaurant.onboarding?.step1?.restaurantName || restaurant.name || 'Restaurant'
                const restaurantSlug = restaurant.slug || restaurant._id || restaurantName.toLowerCase().replace(/\s+/g, "-")
                const favorite = isFavorite(restaurantSlug)

                const handleToggleFavorite = (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (favorite) {
                    removeFavorite(restaurantSlug)
                  } else {
                    addFavorite({
                      slug: restaurantSlug,
                      name: restaurant.name,
                      cuisine: restaurant.cuisine,
                      rating: restaurant.rating,
                      deliveryTime: restaurant.deliveryTime,
                      distance: restaurant.distance,
                      image: restaurant.image
                    })
                  }
                }

                return (
                  <Link key={restaurant.id} to={`/dining/${category}/${restaurant.slug || restaurantSlug}`}>
                    <Card className="overflow-hidden cursor-pointer border-0 group bg-white shadow-sm hover:shadow-xl transition-all duration-300 py-0 gap-0 rounded-2xl ring-1 ring-black/5">
                      {/* Image Section */}
                      <div className="relative h-48 sm:h-56 md:h-60 w-full overflow-hidden">
                        <img
                          src={restaurant.image}
                          alt={restaurant.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            e.target.src = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop"
                          }}
                        />

                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60"></div>

                        {/* Featured Dish Badge - Top Left */}
                        <div className="absolute top-3 left-3">
                          <div className="bg-white/90 backdrop-blur-md text-gray-900 px-2.5 py-1 rounded-md text-xs font-bold shadow-sm flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            {restaurant.featuredDish}
                          </div>
                        </div>

                        {/* Bookmark Icon - Top Right */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-3 right-3 h-8 w-8 bg-black/20 backdrop-blur-sm rounded-full hover:bg-black/40 transition-colors text-white border-0"
                          onClick={handleToggleFavorite}
                        >
                          <Bookmark className={`h-4 w-4 ${favorite ? "fill-white text-white" : "text-white"}`} strokeWidth={2} />
                        </Button>

                        {/* Blue Section - Bottom 40% - Replaced with Offer on Image */}
                        <div className="absolute bottom-3 left-3 right-3">
                          {restaurant.offer && (
                            <div className="bg-[#2563EB] text-white text-xs font-bold px-2 py-1 rounded w-fit shadow-lg mb-1">
                              {restaurant.offer}
                            </div>
                          )}
                          <div className="text-white text-xs font-medium bg-black/40 backdrop-blur-sm px-2 py-1 rounded w-fit">
                            Pre-book Table
                          </div>
                        </div>
                      </div>

                      {/* Content Section */}
                      <CardContent className="p-4">
                        {/* Restaurant Name & Rating */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-gray-900 line-clamp-1 group-hover:text-[#2B9C64] transition-colors">
                              {restaurant.name}
                            </h3>
                            <p className="text-sm text-gray-500 line-clamp-1 truncate">{restaurant.cuisine}</p>
                          </div>
                          <div className="flex-shrink-0 bg-[#2B9C64] text-white px-2 py-0.5 rounded-md flex items-center gap-0.5 shadow-sm">
                            <span className="text-sm font-bold">{restaurant.rating}</span>
                            <Star className="h-3 w-3 fill-white text-white" />
                          </div>
                        </div>

                        {/* Delivery Time & Distance & Price */}
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-2 font-medium">
                          <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full">
                            <Clock className="h-3 w-3" strokeWidth={2} />
                            <span>{restaurant.deliveryTime}</span>
                          </div>
                          <span>•</span>
                          <span>{restaurant.distance}</span>
                          <span>•</span>
                          <span>{restaurant.price.split(' ')[0]} for two</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filter Modal - Same as DiningRestaurants page */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-[100]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsFilterOpen(false)}
          />

          {/* Modal Content */}
          <div className="absolute bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 bg-white rounded-t-3xl md:rounded-3xl max-h-[85vh] md:max-h-[90vh] md:max-w-lg w-full md:w-auto flex flex-col animate-[slideUp_0.3s_ease-out] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">Filters & Sorting</h2>
              <button
                onClick={() => {
                  setActiveFilters(new Set())
                  setSortBy(null)
                  setSelectedCuisine(null)
                }}
                className="text-[#FD0134] font-bold text-sm hover:bg-[#FD0134]/10 px-3 py-1 rounded-lg transition-colors"
              >
                Clear all
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar - Tabs */}
              <div className="w-24 sm:w-28 bg-gray-50 border-r border-gray-100 flex flex-col py-2">
                {[
                  { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
                  { id: 'time', label: 'Time', icon: Timer },
                  { id: 'rating', label: 'Rating', icon: Star },
                  { id: 'distance', label: 'Distance', icon: MapPin },
                  { id: 'price', label: 'Dish Price', icon: IndianRupee },
                  { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
                ].map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeFilterTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveFilterTab(tab.id)}
                      className={`flex flex-col items-center gap-1.5 py-4 px-2 text-center relative transition-all ${isActive ? 'bg-white text-[#2B9C64] shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                        }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-3 bottom-3 w-1 bg-[#2B9C64] rounded-r-full" />
                      )}
                      <Icon className={`h-5 w-5 ${isActive ? 'stroke-current' : ''}`} strokeWidth={isActive ? 2 : 1.5} />
                      <span className={`text-xs font-semibold leading-tight ${isActive ? '' : 'font-medium'}`}>{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Right Content Area - Scrollable */}
              <div ref={rightContentRef} className="flex-1 overflow-y-auto p-5">
                {/* Sort By Tab */}
                {activeFilterTab === 'sort' && (
                  <div className="space-y-4 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Sort by</h3>
                    <div className="flex flex-col gap-3">
                      {[
                        { id: null, label: 'Relevance' },
                        { id: 'rating-high', label: 'Rating: High to Low' },
                        { id: 'rating-low', label: 'Rating: Low to High' },
                      ].map((option) => (
                        <button
                          key={option.id || 'relevance'}
                          onClick={() => setSortBy(option.id)}
                          className={`px-4 py-3.5 rounded-xl border text-left transition-all flex items-center justify-between group ${sortBy === option.id
                            ? 'border-[#2B9C64] bg-[#2B9C64]/5 shadow-sm'
                            : 'border-gray-200 hover:border-[#2B9C64] hover:bg-gray-50'
                            }`}
                        >
                          <span className={`text-sm font-bold ${sortBy === option.id ? 'text-[#2B9C64]' : 'text-gray-700'}`}>
                            {option.label}
                          </span>
                          {sortBy === option.id && <div className="h-2 w-2 rounded-full bg-[#2B9C64]" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time Tab */}
                {activeFilterTab === 'time' && (
                  <div className="space-y-4 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Delivery Time</h3>
                    <div className="grid grid-cols-1 gap-3">
                      <button
                        onClick={() => toggleFilter('delivery-under-30')}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${activeFilters.has('delivery-under-30')
                          ? 'border-[#2B9C64] bg-[#2B9C64]/5'
                          : 'border-gray-200 hover:border-[#2B9C64]'
                          }`}
                      >
                        <div className={`p-2 rounded-full ${activeFilters.has('delivery-under-30') ? 'bg-[#2B9C64]/10 text-[#2B9C64]' : 'bg-gray-100 text-gray-500'}`}>
                          <Timer className="h-5 w-5" strokeWidth={2} />
                        </div>
                        <span className={`text-sm font-bold ${activeFilters.has('delivery-under-30') ? 'text-[#2B9C64]' : 'text-gray-700'}`}>Under 30 mins</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('delivery-under-45')}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${activeFilters.has('delivery-under-45')
                          ? 'border-[#2B9C64] bg-[#2B9C64]/5'
                          : 'border-gray-200 hover:border-[#2B9C64]'
                          }`}
                      >
                        <div className={`p-2 rounded-full ${activeFilters.has('delivery-under-45') ? 'bg-[#2B9C64]/10 text-[#2B9C64]' : 'bg-gray-100 text-gray-500'}`}>
                          <Timer className="h-5 w-5" strokeWidth={2} />
                        </div>
                        <span className={`text-sm font-bold ${activeFilters.has('delivery-under-45') ? 'text-[#2B9C64]' : 'text-gray-700'}`}>Under 45 mins</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Rating Tab */}
                {activeFilterTab === 'rating' && (
                  <div className="space-y-4 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Restaurant Rating</h3>
                    <div className="grid grid-cols-1 gap-3">
                      <button
                        onClick={() => toggleFilter('rating-35-plus')}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${activeFilters.has('rating-35-plus')
                          ? 'border-[#2B9C64] bg-[#2B9C64]/5'
                          : 'border-gray-200 hover:border-[#2B9C64]'
                          }`}
                      >
                        <div className={`p-2 rounded-full ${activeFilters.has('rating-35-plus') ? 'bg-[#2B9C64]/10 text-[#2B9C64]' : 'bg-gray-100 text-gray-500'}`}>
                          <Star className={`h-5 w-5 ${activeFilters.has('rating-35-plus') ? 'fill-[#2B9C64]' : ''}`} />
                        </div>
                        <span className={`text-sm font-bold ${activeFilters.has('rating-35-plus') ? 'text-[#2B9C64]' : 'text-gray-700'}`}>Rated 3.5+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-4-plus')}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${activeFilters.has('rating-4-plus')
                          ? 'border-[#2B9C64] bg-[#2B9C64]/5'
                          : 'border-gray-200 hover:border-[#2B9C64]'
                          }`}
                      >
                        <div className={`p-2 rounded-full ${activeFilters.has('rating-4-plus') ? 'bg-[#2B9C64]/10 text-[#2B9C64]' : 'bg-gray-100 text-gray-500'}`}>
                          <Star className={`h-5 w-5 ${activeFilters.has('rating-4-plus') ? 'fill-[#2B9C64]' : ''}`} />
                        </div>
                        <span className={`text-sm font-bold ${activeFilters.has('rating-4-plus') ? 'text-[#2B9C64]' : 'text-gray-700'}`}>Rated 4.0+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-45-plus')}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${activeFilters.has('rating-45-plus')
                          ? 'border-[#2B9C64] bg-[#2B9C64]/5'
                          : 'border-gray-200 hover:border-[#2B9C64]'
                          }`}
                      >
                        <div className={`p-2 rounded-full ${activeFilters.has('rating-45-plus') ? 'bg-[#2B9C64]/10 text-[#2B9C64]' : 'bg-gray-100 text-gray-500'}`}>
                          <Star className={`h-5 w-5 ${activeFilters.has('rating-45-plus') ? 'fill-[#2B9C64]' : ''}`} />
                        </div>
                        <span className={`text-sm font-bold ${activeFilters.has('rating-45-plus') ? 'text-[#2B9C64]' : 'text-gray-700'}`}>Rated 4.5+</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Distance Tab */}
                {activeFilterTab === 'distance' && (
                  <div className="space-y-4 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Distance</h3>
                    <div className="grid grid-cols-1 gap-3">
                      <button
                        onClick={() => toggleFilter('distance-under-1km')}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${activeFilters.has('distance-under-1km')
                          ? 'border-[#2B9C64] bg-[#2B9C64]/5'
                          : 'border-gray-200 hover:border-[#2B9C64]'
                          }`}
                      >
                        <div className={`p-2 rounded-full ${activeFilters.has('distance-under-1km') ? 'bg-[#2B9C64]/10 text-[#2B9C64]' : 'bg-gray-100 text-gray-500'}`}>
                          <MapPin className="h-5 w-5" strokeWidth={2} />
                        </div>
                        <span className={`text-sm font-bold ${activeFilters.has('distance-under-1km') ? 'text-[#2B9C64]' : 'text-gray-700'}`}>Under 1 km</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('distance-under-2km')}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${activeFilters.has('distance-under-2km')
                          ? 'border-[#2B9C64] bg-[#2B9C64]/5'
                          : 'border-gray-200 hover:border-[#2B9C64]'
                          }`}
                      >
                        <div className={`p-2 rounded-full ${activeFilters.has('distance-under-2km') ? 'bg-[#2B9C64]/10 text-[#2B9C64]' : 'bg-gray-100 text-gray-500'}`}>
                          <MapPin className="h-5 w-5" strokeWidth={2} />
                        </div>
                        <span className={`text-sm font-bold ${activeFilters.has('distance-under-2km') ? 'text-[#2B9C64]' : 'text-gray-700'}`}>Under 2 km</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Price Tab */}
                {activeFilterTab === 'price' && (
                  <div className="space-y-4 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Dish Price</h3>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => toggleFilter('price-under-200')}
                        className={`px-4 py-3.5 rounded-xl border text-left transition-all ${activeFilters.has('price-under-200')
                          ? 'border-[#2B9C64] bg-[#2B9C64]/5 shadow-sm'
                          : 'border-gray-200 hover:border-[#2B9C64] hover:bg-gray-50'
                          }`}
                      >
                        <span className={`text-sm font-bold ${activeFilters.has('price-under-200') ? 'text-[#2B9C64]' : 'text-gray-700'}`}>Under ₹200</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('price-under-500')}
                        className={`px-4 py-3.5 rounded-xl border text-left transition-all ${activeFilters.has('price-under-500')
                          ? 'border-[#2B9C64] bg-[#2B9C64]/5 shadow-sm'
                          : 'border-gray-200 hover:border-[#2B9C64] hover:bg-gray-50'
                          }`}
                      >
                        <span className={`text-sm font-bold ${activeFilters.has('price-under-500') ? 'text-[#2B9C64]' : 'text-gray-700'}`}>Under ₹500</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Cuisine Tab */}
                {activeFilterTab === 'cuisine' && (
                  <div className="space-y-4 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Cuisine</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {['Continental', 'Italian', 'Asian', 'Indian', 'Chinese', 'American', 'Seafood', 'Cafe'].map((cuisine) => (
                        <button
                          key={cuisine}
                          onClick={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                          className={`px-3 py-3 rounded-xl border text-center transition-all ${selectedCuisine === cuisine
                            ? 'border-[#2B9C64] bg-[#2B9C64]/5 shadow-sm'
                            : 'border-gray-200 hover:border-[#2B9C64] hover:bg-gray-50'
                            }`}
                        >
                          <span className={`text-sm font-bold ${selectedCuisine === cuisine ? 'text-[#2B9C64]' : 'text-gray-700'}`}>
                            {cuisine}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-6 py-5 border-t border-gray-100 bg-white rounded-b-3xl">
              <button
                onClick={() => setIsFilterOpen(false)}
                className="flex-1 py-3.5 text-center font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => setIsFilterOpen(false)}
                className={`flex-1 py-3.5 font-bold rounded-xl transition-all shadow-lg shadow-[#2B9C64]/20 ${activeFilters.size > 0 || sortBy || selectedCuisine
                  ? 'bg-[#2B9C64] text-white hover:bg-[#218a56] active:scale-[0.98]'
                  : 'bg-gray-900 text-white hover:bg-black active:scale-[0.98]'
                  }`}
              >
                {activeFilters.size > 0 || sortBy || selectedCuisine
                  ? `Show ${filteredRestaurants.length} places`
                  : 'Apply Filters'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatedPage>
  )
}

