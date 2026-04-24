import Restaurant from '../models/Restaurant.js';
import Menu from '../models/Menu.js';
import Order from '../../order/models/Order.js';
import Zone from '../../admin/models/Zone.js';
import DiningCategory from '../../dining/models/DiningCategory.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../../../shared/utils/cloudinaryService.js';
import { initializeCloudinary } from '../../../config/cloudinary.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import mongoose from 'mongoose';
import { getCache, setCache, generateCacheKey, CACHE_TTL, invalidateCachePattern } from '../../../shared/utils/cache.js';

/**
 * Check if a point is within a zone polygon using ray casting algorithm
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Array} zoneCoordinates - Zone coordinates array
 * @returns {boolean}
 */
function isPointInZone(lat, lng, zoneCoordinates) {
  if (!zoneCoordinates || zoneCoordinates.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = zoneCoordinates.length - 1; i < zoneCoordinates.length; j = i++) {
    const coordI = zoneCoordinates[i];
    const coordJ = zoneCoordinates[j];
    
    const xi = typeof coordI === 'object' ? (coordI.latitude || coordI.lat) : null;
    const yi = typeof coordI === 'object' ? (coordI.longitude || coordI.lng) : null;
    const xj = typeof coordJ === 'object' ? (coordJ.latitude || coordJ.lat) : null;
    const yj = typeof coordJ === 'object' ? (coordJ.longitude || coordJ.lng) : null;
    
    if (xi === null || yi === null || xj === null || yj === null) continue;
    
    const intersect = ((yi > lng) !== (yj > lng)) && 
                     (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a restaurant's location (pin) is within any active zone
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {Array} activeZones - Array of active zones (cached)
 * @returns {boolean}
 */
function isRestaurantInAnyZone(restaurantLat, restaurantLng, activeZones) {
  if (!restaurantLat || !restaurantLng) return false;
  
  for (const zone of activeZones) {
    if (!zone.coordinates || zone.coordinates.length < 3) continue;
    
    let isInZone = false;
    if (typeof zone.containsPoint === 'function') {
      isInZone = zone.containsPoint(restaurantLat, restaurantLng);
    } else {
      isInZone = isPointInZone(restaurantLat, restaurantLng, zone.coordinates);
    }
    
    if (isInZone) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get restaurant's zoneId based on location
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {Array} activeZones - Array of active zones
 * @returns {string|null} Zone ID or null
 */
function getRestaurantZoneId(restaurantLat, restaurantLng, activeZones) {
  if (!restaurantLat || !restaurantLng) return null;
  
  for (const zone of activeZones) {
    if (!zone.coordinates || zone.coordinates.length < 3) continue;
    
    let isInZone = false;
    if (typeof zone.containsPoint === 'function') {
      isInZone = zone.containsPoint(restaurantLat, restaurantLng);
    } else {
      isInZone = isPointInZone(restaurantLat, restaurantLng, zone.coordinates);
    }
    
    if (isInZone) {
      return zone._id.toString();
    }
  }
  
  return null;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Get all restaurants (for user module) - REFACTORED to use MongoDB geospatial queries
// This replaces Google Places API Nearby Search, cutting API costs by 99%
export const getRestaurants = async (req, res) => {
  try {
    const isLikelyQrImageUrl = (value) => {
      if (typeof value !== 'string') return false;
      // Heuristic guard: avoid QR/payment scanner assets being used as menu photos.
      return /(qr|qrcode|upi|scanner|payment-qr|pay-qr)/i.test(value);
    };
    const { 
      limit = 50, 
      offset = 0,
      sortBy,
      cuisine,
      minRating,
      maxDeliveryTime,
      maxDistance = 5, // Default 5km radius (replaces Google Places API radius)
      maxPrice,
      hasOffers,
      zoneId, // User's zone ID (optional)
      latitude, // User's latitude - CRITICAL for geospatial queries
      longitude, // User's longitude - CRITICAL for geospatial queries
      diningCategory // Dining category name/slug to filter restaurants
    } = req.query;

    // Strict zone mode: user discovery endpoints must be scoped to a valid zone.
    if (!zoneId && !diningCategory) {
      return successResponse(res, 200, 'Zone required for restaurant discovery', {
        restaurants: [],
        total: 0,
        filters: {
          sortBy,
          cuisine,
          minRating,
          maxDeliveryTime,
          maxDistance,
          maxPrice,
          hasOffers,
          diningCategory
        },
        queryType: 'regular',
        userCoordinates: null
      });
    }

    // Generate cache key based on query parameters
    const cacheKey = generateCacheKey(
      'restaurants',
      limit,
      offset,
      sortBy,
      cuisine,
      minRating,
      maxDeliveryTime,
      maxDistance,
      maxPrice,
      hasOffers,
      zoneId,
      latitude,
      longitude,
      diningCategory
    );

    // Try to get from cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      return successResponse(res, 200, 'Restaurants retrieved successfully (cached)', cached);
    }
    
    // Optional: Zone-based filtering - if zoneId is provided, validate and (later) filter by zone
    let userZone = null;
    if (zoneId) {
      // Validate zone exists and is active
      userZone = await Zone.findById(zoneId).lean();
      if (!userZone || !userZone.isActive) {
        return successResponse(res, 200, 'Invalid or inactive zone for restaurant discovery', {
          restaurants: [],
          total: 0,
          filters: {
            sortBy,
            cuisine,
            minRating,
            maxDeliveryTime,
            maxDistance,
            maxPrice,
            hasOffers,
            diningCategory
          },
          queryType: 'regular',
          userCoordinates: null
        });
      }
    }
    
    // Dining category filter - if diningCategory is provided, filter restaurants by linked restaurants
    let categoryLinkedRestaurantIds = null;
    if (diningCategory) {
      try {
        // Find category by name (case-insensitive) or slug
        // The diningCategory param comes as a slug (e.g., "aaaa", "bbbb")
        // We need to match against category names converted to slugs
        const categorySlug = diningCategory.toLowerCase().replace(/\s+/g, '-');
        
        // Fetch all active categories and match by slug
        // Populate linkedRestaurants to get the actual ObjectIds
        const allCategories = await DiningCategory.find({ isActive: true })
          .populate('linkedRestaurants', '_id')
          .lean();
        
        const category = allCategories.find(cat => {
          const catSlug = cat.name.toLowerCase().replace(/\s+/g, '-');
          const matchesSlug = catSlug === categorySlug;
          const matchesName = cat.name.toLowerCase() === diningCategory.toLowerCase();
          return matchesSlug || matchesName;
        });
        
        console.log(`🔍 Searching for category with slug: "${categorySlug}"`);
        console.log(`📋 Available categories: ${allCategories.map(c => c.name.toLowerCase().replace(/\s+/g, '-')).join(', ')}`);
        
        if (!category) {
          console.log(`⚠️ Category not found for slug: ${categorySlug}`);
          return successResponse(res, 200, 'Category not found', {
            restaurants: [],
            total: 0,
            filters: {
              sortBy,
              cuisine,
              minRating,
              maxDeliveryTime,
              maxDistance,
              maxPrice,
              hasOffers,
              diningCategory
            },
            queryType: 'regular',
            userCoordinates: null
          });
        }
        
        console.log(`✅ Found category: ${category.name} with ${category.linkedRestaurants?.length || 0} linked restaurants`);
        
        const categoryId = category._id;
        const restaurantIdsFromLinked = [];
        
        // Method 1: Get restaurants from linkedRestaurants array
        if (category.linkedRestaurants && category.linkedRestaurants.length > 0) {
          const linkedIds = category.linkedRestaurants
            .map(id => {
              // Handle populated objects
              if (typeof id === 'object' && id._id) {
                return id._id.toString();
              }
              // Handle ObjectId objects
              if (typeof id === 'object' && id.toString) {
                return id.toString();
              }
              // Handle string IDs
              return String(id);
            })
            .filter(id => mongoose.Types.ObjectId.isValid(id));
          
          restaurantIdsFromLinked.push(...linkedIds);
          console.log(`📋 Linked restaurant IDs from linkedRestaurants (${linkedIds.length}): ${linkedIds.join(', ')}`);
        }
        
        // Method 2: Get restaurants that have this category in their diningConfig.categories array
        const restaurantsWithCategory = await Restaurant.find({
          isActive: true,
          'diningConfig.categories': categoryId
        }).select('_id').lean();
        
        const restaurantIdsFromConfig = restaurantsWithCategory.map(r => r._id.toString());
        console.log(`📋 Restaurant IDs from diningConfig.categories (${restaurantIdsFromConfig.length}): ${restaurantIdsFromConfig.join(', ')}`);

        // Method 3: Get restaurants assigned via admin diningSettings.diningType
        // (DiningList category assignment updates this field)
        const restaurantsWithDiningType = await Restaurant.find({
          isActive: true,
          'diningSettings.diningType': { $exists: true, $ne: null }
        }).select('_id diningSettings.diningType').lean();

        const normalizeSlug = (value) =>
          String(value || '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-');

        const restaurantIdsFromDiningType = restaurantsWithDiningType
          .filter(r => normalizeSlug(r?.diningSettings?.diningType) === categorySlug)
          .map(r => r._id.toString());

        console.log(`📋 Restaurant IDs from diningSettings.diningType (${restaurantIdsFromDiningType.length}): ${restaurantIdsFromDiningType.join(', ')}`);
        
        // Combine all methods and remove duplicates
        const allRestaurantIds = [
          ...new Set([
            ...restaurantIdsFromLinked,
            ...restaurantIdsFromConfig,
            ...restaurantIdsFromDiningType,
          ])
        ];
        
        if (allRestaurantIds.length > 0) {
          categoryLinkedRestaurantIds = allRestaurantIds
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));
          
          console.log(`📋 Total unique restaurant IDs (${categoryLinkedRestaurantIds.length}): ${categoryLinkedRestaurantIds.map(id => id.toString()).join(', ')}`);
        } else {
          console.log(`⚠️ Category "${category.name}" has no linked restaurants (checked linkedRestaurants, diningConfig.categories, and diningSettings.diningType)`);
          return successResponse(res, 200, 'No restaurants linked to this category', {
            restaurants: [],
            total: 0,
            filters: {
              sortBy,
              cuisine,
              minRating,
              maxDeliveryTime,
              maxDistance,
              maxPrice,
              hasOffers,
              diningCategory
            },
            queryType: 'regular',
            userCoordinates: null
          });
        }
      } catch (err) {
        console.error('Error fetching dining category:', err);
        return errorResponse(res, 500, 'Failed to fetch dining category');
      }
    }
    
    // Build base query - Show all active restaurants (including offline ones)
    // Offline restaurants will be displayed with "CURRENTLY CLOSED" tag on frontend
    const query = { isActive: true };
    
    // Add dining category filter - only show restaurants linked to this category
    if (categoryLinkedRestaurantIds && categoryLinkedRestaurantIds.length > 0) {
      query._id = { $in: categoryLinkedRestaurantIds };
      console.log(`🔍 Filtering restaurants by IDs: ${categoryLinkedRestaurantIds.length} restaurants`);
    }
    
    // Ensure restaurants have dining enabled (for table booking)
    // Note: We'll filter this after fetching to allow restaurants without diningConfig
    // query['diningConfig.enabled'] = true;
    
    // CRITICAL: Use MongoDB geospatial query if user coordinates provided
    // This replaces Google Places API Nearby Search
    let useGeospatialQuery = false;
    let userLat = null;
    let userLng = null;
    
    if (latitude && longitude) {
      userLat = parseFloat(latitude);
      userLng = parseFloat(longitude);
      
      // Validate coordinates
      if (!isNaN(userLat) && !isNaN(userLng) && 
          userLat >= -90 && userLat <= 90 && 
          userLng >= -180 && userLng <= 180) {
        useGeospatialQuery = true;
        
        // Add geospatial query using $near
        // maxDistance is in meters, so convert km to meters
        const maxDistanceMeters = parseFloat(maxDistance) * 1000;
        query['location.geoLocation'] = {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [userLng, userLat] // GeoJSON format: [longitude, latitude]
            },
            $maxDistance: maxDistanceMeters // Maximum distance in meters
          }
        };
      }
    }
    
    // Cuisine filter
    if (cuisine) {
      query.cuisines = { $in: [new RegExp(cuisine, 'i')] };
    }
    
    // Rating filter
    if (minRating) {
      query.rating = { $gte: parseFloat(minRating) };
    }
    
    // Trust filters (top-rated = 4.5+, trusted = 4.0+ with high totalRatings)
    if (req.query.topRated === 'true') {
      query.rating = { $gte: 4.5 };
    } else if (req.query.trusted === 'true') {
      query.rating = { $gte: 4.0 };
      query.totalRatings = { $gte: 100 }; // At least 100 ratings to be "trusted"
    }
    
    // Delivery time filter (estimatedDeliveryTime contains time in format "25-30 mins")
    if (maxDeliveryTime) {
      const maxTime = parseInt(maxDeliveryTime);
      // Note: This will be filtered in application logic since it's a string field
    }
    
    // Price range filter
    if (maxPrice) {
      const priceMap = { 200: ['$'], 500: ['$', '$$'] };
      if (priceMap[maxPrice]) {
        query.priceRange = { $in: priceMap[maxPrice] };
      }
    }
    
    // Offers filter
    if (hasOffers === 'true') {
      query.$or = [
        { offer: { $exists: true, $ne: null, $ne: '' } },
        { featuredPrice: { $exists: true } }
      ];
    }
    
    // Build sort object
    // If geospatial query is used, MongoDB automatically sorts by distance
    // Otherwise, use the specified sortBy or default
    let sortObj = {};
    
    if (useGeospatialQuery) {
      // When using $near, results are automatically sorted by distance (nearest first)
      // We can add secondary sorting by rating
      sortObj = { rating: -1, totalRatings: -1 };
    } else {
      // Default sorting when no coordinates provided
      sortObj = { createdAt: -1 }; // Latest first
      
      if (sortBy) {
        switch (sortBy) {
          case 'price-low':
            sortObj = { priceRange: 1, rating: -1 };
            break;
          case 'price-high':
            sortObj = { priceRange: -1, rating: -1 };
            break;
          case 'rating-high':
            sortObj = { rating: -1, totalRatings: -1 };
            break;
          case 'rating-low':
            sortObj = { rating: 1, totalRatings: -1 };
            break;
          case 'relevance':
          default:
            sortObj = { rating: -1, totalRatings: -1, createdAt: -1 };
            break;
        }
      }
    }
    
    // Fetch restaurants using geospatial query or regular query - enforce max limit
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items per page
    const offsetNum = Math.max(0, parseInt(offset));
    
    let restaurants = await Restaurant.find(query)
      .select('-owner -createdAt -updatedAt -password')
      .sort(sortObj)
      .limit(limitNum)
      .skip(offsetNum)
      .lean();
    
    // Filter restaurants for dining category - ensure dining is enabled either by
    // admin setting or restaurant-side dining config.
    if (diningCategory && restaurants.length > 0) {
      const beforeCount = restaurants.length;
      restaurants = restaurants.filter(r => {
        const adminEnabled = r?.diningSettings?.isEnabled === true;
        const configEnabled = r?.diningConfig?.enabled === true;
        const hasDiningEnabled = adminEnabled || configEnabled;
        if (!hasDiningEnabled) {
          console.log(`⚠️ Restaurant ${r.name || r._id} excluded: dining is not enabled`);
        }
        return hasDiningEnabled;
      });
      console.log(`✅ After dining filter: ${restaurants.length} restaurants remaining (from ${beforeCount})`);
    }
    
    // Fix restaurant names & normalize image fields for frontend
    // - Prefer onboarding.step1.restaurantName for display name
    // - Normalize menuImages to a simple array of URL strings (if already present)
    // - Ensure a backward-compatible coverImage field is available
    restaurants = restaurants.map(restaurant => {
      // Update name from onboarding if available
      if (restaurant.onboarding?.step1?.restaurantName) {
        restaurant.name = restaurant.onboarding.step1.restaurantName;
      }

      // Normalize menuImages: support both string URLs and { url, publicId } objects
      const rawMenuImages = restaurant.menuImages || [];
      const normalizedMenuImages = Array.isArray(rawMenuImages)
        ? rawMenuImages
            .map((img) => {
              if (!img) return null;
              if (typeof img === 'string') return img;
              if (typeof img === 'object' && img.url) return img.url;
              return null;
            })
            .filter((url) => typeof url === 'string' && url.trim() !== '' && !isLikelyQrImageUrl(url))
        : [];

      restaurant.menuImages = normalizedMenuImages;

      // Backward-compatible cover image:
      // 1) explicit coverImage (if already present)
      // 2) profileImage.url
      // 3) first menuImages URL
      if (!restaurant.coverImage) {
        const profileImageUrl =
          typeof restaurant.profileImage === 'string'
            ? restaurant.profileImage
            : restaurant.profileImage?.url;

        restaurant.coverImage =
          profileImageUrl ||
          (normalizedMenuImages.length > 0 ? normalizedMenuImages[0] : undefined);
      }

      return restaurant;
    });

    // Derive menu images from active Menu items for all restaurants and prefer those.
    // This ensures listing cards show real dish photos even if onboarding images are stale.
    if (restaurants.length > 0) {
      const maxImagesPerRestaurant = 6;

      await Promise.all(
        restaurants.map(async (restaurant) => {
          try {
            const menu = await Menu.findOne({
              restaurant: restaurant._id,
              isActive: true,
            })
              .select('sections.items.image sections.items.images sections.subsections.items.image sections.subsections.items.images')
              .lean();

            if (!menu || !Array.isArray(menu.sections)) return;

            const collected = [];

            for (const section of menu.sections) {
              const items = Array.isArray(section.items) ? section.items : [];
              for (const item of items) {
                if (item.images && Array.isArray(item.images) && item.images.length > 0) {
                  collected.push(item.images[0]);
                } else if (typeof item.image === 'string') {
                  collected.push(item.image);
                }
                if (collected.length >= maxImagesPerRestaurant) break;
              }
              if (collected.length >= maxImagesPerRestaurant) break;

              const subsections = Array.isArray(section.subsections) ? section.subsections : [];
              for (const subsection of subsections) {
                const subItems = Array.isArray(subsection.items) ? subsection.items : [];
                for (const item of subItems) {
                  if (item.images && Array.isArray(item.images) && item.images.length > 0) {
                    collected.push(item.images[0]);
                  } else if (typeof item.image === 'string') {
                    collected.push(item.image);
                  }
                  if (collected.length >= maxImagesPerRestaurant) break;
                }
                if (collected.length >= maxImagesPerRestaurant) break;
              }

              if (collected.length >= maxImagesPerRestaurant) break;
            }

            const uniqueUrls = Array.from(
              new Set(
                collected
                  .filter((url) => typeof url === 'string' && url.trim() !== '')
                  .filter((url) => !isLikelyQrImageUrl(url))
                  .map((url) => url.trim())
              )
            );

            // Strict for discovery: expose only menu-item images from Menu collection.
            restaurant.menuImages = uniqueUrls.slice(0, maxImagesPerRestaurant);
          } catch (err) {
            console.error('Error deriving menuImages from Menu for restaurant', restaurant._id, err);
          }
        })
      );
    }

    // Sync live rating snapshot for listing cards as well, so list and details stay consistent.
    if (restaurants.length > 0) {
      const restaurantKeyMap = new Map(); // key -> restaurant indexes[]
      const allRatingKeys = new Set();

      restaurants.forEach((restaurant, index) => {
        const keys = [
          restaurant.restaurantId,
          restaurant._id?.toString?.(),
          restaurant.id,
        ].filter(Boolean);

        keys.forEach((key) => {
          const normalized = String(key);
          allRatingKeys.add(normalized);
          if (!restaurantKeyMap.has(normalized)) {
            restaurantKeyMap.set(normalized, []);
          }
          restaurantKeyMap.get(normalized).push(index);
        });
      });

      if (allRatingKeys.size > 0) {
        const ratingRows = await Order.aggregate([
          {
            $match: {
              restaurantId: { $in: Array.from(allRatingKeys) },
              "review.rating": { $exists: true, $ne: null, $gt: 0 },
            },
          },
          {
            $group: {
              _id: "$restaurantId",
              totalRatings: { $sum: 1 },
              ratingSum: { $sum: "$review.rating" },
            },
          },
        ]);

        const mergedStatsByRestaurantIndex = new Map(); // idx -> {sum,count}
        for (const row of ratingRows) {
          const key = String(row?._id || "");
          const indexes = restaurantKeyMap.get(key) || [];
          indexes.forEach((idx) => {
            const prev = mergedStatsByRestaurantIndex.get(idx) || {
              totalRatings: 0,
              ratingSum: 0,
            };
            mergedStatsByRestaurantIndex.set(idx, {
              totalRatings: prev.totalRatings + Number(row.totalRatings || 0),
              ratingSum: prev.ratingSum + Number(row.ratingSum || 0),
            });
          });
        }

        mergedStatsByRestaurantIndex.forEach((stats, idx) => {
          if (!restaurants[idx]) return;
          if (stats.totalRatings <= 0) return;
          const avg = stats.ratingSum / stats.totalRatings;
          restaurants[idx].rating = Number(avg.toFixed(1));
          restaurants[idx].averageRating = restaurants[idx].rating;
          restaurants[idx].totalRatings = stats.totalRatings;
          restaurants[idx].reviewCount = stats.totalRatings;
        });
      }
    }
    
    // Calculate and add distance to each restaurant if user coordinates provided
    if (useGeospatialQuery && userLat && userLng) {
      restaurants = restaurants.map(restaurant => {
        if (restaurant.location && 
            restaurant.location.latitude && 
            restaurant.location.longitude) {
          const distance = calculateDistance(
            userLat,
            userLng,
            restaurant.location.latitude,
            restaurant.location.longitude
          );
          restaurant.distanceInKm = parseFloat(distance.toFixed(2));
          restaurant.distance = `${distance.toFixed(1)} km`;
        } else {
          restaurant.distanceInKm = null;
          restaurant.distance = null;
        }
        return restaurant;
      });
      
      // Sort by distance if not already sorted by MongoDB $near
      restaurants.sort((a, b) => {
        const aDist = a.distanceInKm !== null ? a.distanceInKm : Infinity;
        const bDist = b.distanceInKm !== null ? b.distanceInKm : Infinity;
        return aDist - bDist;
      });
    }

    // If a valid userZone is provided, STRICTLY filter restaurants to only those
    // whose pin lies inside that zone polygon. This ensures users only see
    // restaurants that actually serve their current delivery zone.
    if (userZone && Array.isArray(userZone.coordinates) && userZone.coordinates.length >= 3) {
      restaurants = restaurants.filter(restaurant => {
        const loc = restaurant.location || {};
        const lat = loc.latitude;
        const lng = loc.longitude;
        if (!lat || !lng) return false;
        return isPointInZone(lat, lng, userZone.coordinates);
      });
    }
    
    // Apply string-based filters that can't be done in MongoDB query
    if (maxDeliveryTime) {
      const maxTime = parseInt(maxDeliveryTime);
      restaurants = restaurants.filter(r => {
        if (!r.estimatedDeliveryTime) return false;
        const timeMatch = r.estimatedDeliveryTime.match(/(\d+)/);
        return timeMatch && parseInt(timeMatch[1]) <= maxTime;
      });
    }
    
    // Get total count
    const totalQuery = { ...query };
    // Remove $near from count query as it affects counting
    if (totalQuery['location.geoLocation'] && totalQuery['location.geoLocation'].$near) {
      // For count, we'll use a simpler query
      delete totalQuery['location.geoLocation'];
      // Add manual distance check if coordinates provided
    }
    delete totalQuery.$or; // Remove $or for count
    const total = await Restaurant.countDocuments(totalQuery);
    
    console.log(`✅ Fetched ${restaurants.length} restaurants using ${useGeospatialQuery ? 'MongoDB geospatial query' : 'regular query'} (NO Google Places API):`, {
      sortBy,
      cuisine,
      minRating,
      maxDeliveryTime,
      maxDistance,
      maxPrice,
      hasOffers,
      userCoordinates: useGeospatialQuery ? `(${userLat}, ${userLng})` : 'not provided'
    });

    const responseData = {
      restaurants,
      total: restaurants.length,
      filters: {
        sortBy,
        cuisine,
        minRating,
        maxDeliveryTime,
        maxDistance,
        maxPrice,
        hasOffers,
        diningCategory
      },
      // Include metadata about query type
      queryType: useGeospatialQuery ? 'geospatial' : 'regular',
      userCoordinates: useGeospatialQuery ? { latitude: userLat, longitude: userLng } : null
    };

    // Cache the response
    await setCache(cacheKey, responseData, CACHE_TTL.RESTAURANT_LIST);

    return successResponse(res, 200, 'Restaurants retrieved successfully', responseData);
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    return errorResponse(res, 500, 'Failed to fetch restaurants');
  }
};

// Get restaurant by ID or slug
export const getRestaurantById = async (req, res) => {
  try {
    const { id } = req.params;

    // Generate cache key
    const cacheKey = generateCacheKey('restaurant', id);

    // Try to get from cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      return successResponse(res, 200, 'Restaurant retrieved successfully (cached)', cached);
    }
    
    // Build query conditions - only include _id if it's a valid ObjectId
    const queryConditions = {
      isActive: true,
    };
    
    const orConditions = [
      { restaurantId: id },
      { slug: id },
    ];
    
    // Only add _id condition if the id is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      orConditions.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    
    queryConditions.$or = orConditions;
    
    const restaurant = await Restaurant.findOne(queryConditions)
      .select('-owner -createdAt -updatedAt')
      .lean();

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Fix restaurant name: Prefer onboarding.step1.restaurantName if available
    if (restaurant.onboarding?.step1?.restaurantName) {
      restaurant.name = restaurant.onboarding.step1.restaurantName;
    }

    // Compute live rating snapshot from user-submitted order reviews.
    // This keeps details page rating accurate even if stored aggregates are stale.
    const ratingKeys = [
      restaurant.restaurantId,
      restaurant._id?.toString?.(),
      restaurant.id,
    ].filter(Boolean);

    const ratingStats = await Order.aggregate([
      {
        $match: {
          restaurantId: { $in: ratingKeys },
          "review.rating": { $exists: true, $ne: null, $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$review.rating" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    const liveAverageRating = Number(ratingStats?.[0]?.averageRating || 0);
    const liveTotalRatings = Number(ratingStats?.[0]?.totalRatings || 0);
    const storedRating = Number(restaurant.rating || 0);
    const storedTotalRatings = Number(restaurant.totalRatings || 0);

    const resolvedRating = liveTotalRatings > 0 ? Number(liveAverageRating.toFixed(1)) : storedRating;
    const resolvedTotalRatings = liveTotalRatings > 0 ? liveTotalRatings : storedTotalRatings;

    restaurant.rating = Number.isFinite(resolvedRating) ? resolvedRating : 0;
    restaurant.totalRatings = Number.isFinite(resolvedTotalRatings) ? resolvedTotalRatings : 0;
    // Include compatible aliases used by different frontend screens.
    restaurant.averageRating = restaurant.rating;
    restaurant.reviewCount = restaurant.totalRatings;

    const responseData = {
      restaurant,
    };

    // Cache the response
    await setCache(cacheKey, responseData, CACHE_TTL.RESTAURANT_DETAILS);

    return successResponse(res, 200, 'Restaurant retrieved successfully', responseData);
  } catch (error) {
    console.error('Error fetching restaurant:', error);
    return errorResponse(res, 500, 'Failed to fetch restaurant');
  }
};

// Get restaurant by owner (for restaurant module)
export const getRestaurantByOwner = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    
    const restaurant = await Restaurant.findById(restaurantId)
      .lean();

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Fix restaurant name: Prefer onboarding.step1.restaurantName if available
    if (restaurant.onboarding?.step1?.restaurantName) {
      restaurant.name = restaurant.onboarding.step1.restaurantName;
    }

    return successResponse(res, 200, 'Restaurant retrieved successfully', {
      restaurant,
    });
  } catch (error) {
    console.error('Error fetching restaurant:', error);
    return errorResponse(res, 500, 'Failed to fetch restaurant');
  }
};

// Create/Update restaurant from onboarding data
export const createRestaurantFromOnboarding = async (onboardingData, restaurantId) => {
  try {
    const { step1, step2, step4 } = onboardingData;
    
    if (!step1 || !step2) {
      throw new Error('Incomplete onboarding data: Missing step1 or step2');
    }

    // Validate required fields
    if (!step1.restaurantName) {
      throw new Error('Restaurant name is required');
    }

    // Find existing restaurant
    const existing = await Restaurant.findById(restaurantId);
    
    if (!existing) {
      throw new Error('Restaurant not found');
    }

    // Generate slug from restaurant name
    let baseSlug = step1.restaurantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if slug needs to be unique (if it's different from existing)
    let slug = baseSlug;
    if (existing.slug !== baseSlug) {
      // Check if the new slug already exists for another restaurant
      const existingBySlug = await Restaurant.findOne({ slug: baseSlug, _id: { $ne: existing._id } });
      if (existingBySlug) {
        // Make slug unique by appending a number
        let counter = 1;
        let uniqueSlug = `${baseSlug}-${counter}`;
        while (await Restaurant.findOne({ slug: uniqueSlug, _id: { $ne: existing._id } })) {
          counter++;
          uniqueSlug = `${baseSlug}-${counter}`;
        }
        slug = uniqueSlug;
        console.log(`Slug already exists, using unique slug: ${slug}`);
      }
    } else {
      slug = existing.slug; // Keep existing slug
    }
    
    // Update existing restaurant with latest onboarding data
    existing.name = step1.restaurantName || existing.name;
    existing.slug = slug;
    existing.ownerName = step1.ownerName || existing.ownerName;
    existing.ownerEmail = step1.ownerEmail || existing.ownerEmail;
    existing.ownerPhone = step1.ownerPhone || existing.ownerPhone;
    existing.primaryContactNumber = step1.primaryContactNumber || existing.primaryContactNumber;
    if (step1.location) existing.location = step1.location;
    
    // Update step2 data - always update even if empty arrays
    if (step2) {
      if (step2.profileImageUrl) {
        // Handle both object {url, publicId} and string URL
        existing.profileImage = typeof step2.profileImageUrl === 'string' 
          ? step2.profileImageUrl 
          : (step2.profileImageUrl.url || step2.profileImageUrl);
      }
      if (step2.menuImageUrls) {
        // Ensure menuImageUrls is an array and extract URLs if objects
        const menuImages = Array.isArray(step2.menuImageUrls) 
          ? step2.menuImageUrls.map(img => 
              typeof img === 'string' ? img : (img.url || img)
            )
          : [];
        existing.menuImages = menuImages;
      }
      if (step2.cuisines) {
        existing.cuisines = step2.cuisines; // Update even if empty array
      }
      if (step2.deliveryTimings) {
        existing.deliveryTimings = step2.deliveryTimings;
      }
      if (step2.openDays) {
        existing.openDays = step2.openDays; // Update even if empty array
      }
    }
    
    // Update step4 data if available
    if (step4) {
      if (step4.estimatedDeliveryTime) existing.estimatedDeliveryTime = step4.estimatedDeliveryTime;
      if (step4.distance) existing.distance = step4.distance;
      if (step4.priceRange) existing.priceRange = step4.priceRange;
      if (step4.featuredDish) existing.featuredDish = step4.featuredDish;
      if (step4.featuredPrice !== undefined) existing.featuredPrice = step4.featuredPrice;
      if (step4.offer) existing.offer = step4.offer;
    }
    
    // Do NOT auto-activate on onboarding completion.
    // Restaurant should remain pending admin approval until approvedAt is set by admin.
    if (!existing.approvedAt) {
      existing.isActive = false;
      existing.isAcceptingOrders = false;
    }
    
    try {
      await existing.save();
    } catch (saveError) {
      if (saveError.code === 11000 && saveError.keyPattern && saveError.keyPattern.slug) {
        // Slug conflict - try to make it unique
        let counter = 1;
        let uniqueSlug = `${slug}-${counter}`;
        while (await Restaurant.findOne({ slug: uniqueSlug, _id: { $ne: existing._id } })) {
          counter++;
          uniqueSlug = `${slug}-${counter}`;
        }
        existing.slug = uniqueSlug;
        await existing.save();
        console.log(`Updated slug to unique value: ${uniqueSlug}`);
      } else {
        throw saveError;
      }
    }
    console.log('✅ Restaurant updated successfully:', {
      restaurantId: existing.restaurantId,
      _id: existing._id,
      name: existing.name,
      isActive: existing.isActive,
    });
    return existing;

  } catch (error) {
    console.error('Error creating restaurant from onboarding:', error);
    console.error('Error stack:', error.stack);
    console.error('Onboarding data received:', {
      hasStep1: !!onboardingData?.step1,
      hasStep2: !!onboardingData?.step2,
      step1Keys: onboardingData?.step1 ? Object.keys(onboardingData.step1) : [],
      step2Keys: onboardingData?.step2 ? Object.keys(onboardingData.step2) : [],
    });
    throw error;
  }
};

/**
 * Update restaurant profile
 * PUT /api/restaurant/profile
 */
export const updateRestaurantProfile = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const {
      profileImage,
      menuImages,
      name,
      cuisines,
      location,
      ownerName,
      ownerEmail,
      ownerPhone,
      deliveryTimings,
    } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    const updateData = {};

    // Update profile image if provided
    if (profileImage) {
      updateData.profileImage = profileImage;
    }

    // Update menu images if provided
    if (menuImages !== undefined) {
      updateData.menuImages = menuImages;
    }

    // Update name if provided
    if (name) {
      updateData.name = name;
      // Regenerate slug if name changed
      if (name !== restaurant.name) {
        let baseSlug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        
        // Check if slug already exists for another restaurant
        let slug = baseSlug;
        const existingBySlug = await Restaurant.findOne({ slug: baseSlug, _id: { $ne: restaurantId } });
        if (existingBySlug) {
          let counter = 1;
          let uniqueSlug = `${baseSlug}-${counter}`;
          while (await Restaurant.findOne({ slug: uniqueSlug, _id: { $ne: restaurantId } })) {
            counter++;
            uniqueSlug = `${baseSlug}-${counter}`;
          }
          slug = uniqueSlug;
        }
        updateData.slug = slug;
      }
    }

    // Update cuisines if provided
    if (cuisines !== undefined) {
      updateData.cuisines = cuisines;
    }

    // Update location if provided
    if (location) {
      // Ensure coordinates array is set if latitude/longitude exist
      if (location.latitude && location.longitude && !location.coordinates) {
        location.coordinates = [location.longitude, location.latitude]; // GeoJSON format: [lng, lat]
      }
      
      // If coordinates array exists but no lat/lng, extract them
      if (location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
        if (!location.longitude) location.longitude = location.coordinates[0];
        if (!location.latitude) location.latitude = location.coordinates[1];
      }
      
      updateData.location = location;
    }

    // Update owner details if provided
    if (ownerName !== undefined) {
      updateData.ownerName = ownerName;
    }
    if (ownerEmail !== undefined) {
      updateData.ownerEmail = ownerEmail;
    }
    if (ownerPhone !== undefined) {
      updateData.ownerPhone = ownerPhone;
    }

    // Update delivery timings if provided
    if (deliveryTimings !== undefined) {
      const openingTime =
        deliveryTimings?.openingTime != null ? String(deliveryTimings.openingTime).trim() : '';
      const closingTime =
        deliveryTimings?.closingTime != null ? String(deliveryTimings.closingTime).trim() : '';

      updateData.deliveryTimings = {
        openingTime,
        closingTime,
      };

      // Keep onboarding.step2 in sync if it exists
      if (restaurant.onboarding?.step2) {
        restaurant.onboarding.step2.deliveryTimings = {
          openingTime,
          closingTime,
        };
      }
    }

    // Update restaurant
    Object.assign(restaurant, updateData);
    await restaurant.save();

    return successResponse(res, 200, 'Restaurant profile updated successfully', {
      restaurant: {
        id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        name: restaurant.name,
        slug: restaurant.slug,
        profileImage: restaurant.profileImage,
        menuImages: restaurant.menuImages,
        cuisines: restaurant.cuisines,
        location: restaurant.location,
        ownerName: restaurant.ownerName,
        ownerEmail: restaurant.ownerEmail,
        ownerPhone: restaurant.ownerPhone,
        deliveryTimings: restaurant.deliveryTimings,
      }
    });
  } catch (error) {
    console.error('Error updating restaurant profile:', error);
    return errorResponse(res, 500, 'Failed to update restaurant profile');
  }
});

/**
 * Upload restaurant profile image
 * POST /api/restaurant/profile/image
 */
export const uploadProfileImage = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No image file provided');
    }

    // Initialize Cloudinary if not already initialized
    await initializeCloudinary();

    const restaurantId = req.restaurant._id;
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Upload to Cloudinary
    const folder = 'restaurant/profile';
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'image',
      transformation: [
        { width: 800, height: 800, crop: 'fill', gravity: 'auto' },
        { quality: 'auto' }
      ]
    });

    // Update restaurant profile image
    restaurant.profileImage = {
      url: result.secure_url,
      publicId: result.public_id
    };
    await restaurant.save();

    return successResponse(res, 200, 'Profile image uploaded successfully', {
      profileImage: restaurant.profileImage
    });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    return errorResponse(res, 500, 'Failed to upload profile image');
  }
});

/**
 * Upload restaurant menu image
 * POST /api/restaurant/profile/menu-image
 */
export const uploadMenuImage = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No image file provided');
    }

    // Validate file buffer
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return errorResponse(res, 400, 'File buffer is empty or invalid');
    }

    // Validate file size (max 20MB)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (req.file.size > maxSize) {
      return errorResponse(res, 400, `File size exceeds ${maxSize / (1024 * 1024)}MB limit`);
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return errorResponse(res, 400, `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`);
    }

    // Initialize Cloudinary if not already initialized
    await initializeCloudinary();

    const restaurantId = req.restaurant._id;
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    console.log('📤 Uploading menu image to Cloudinary:', {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      bufferSize: req.file.buffer.length,
      restaurantId: restaurantId.toString()
    });

    // Upload to Cloudinary
    const folder = 'restaurant/menu';
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 800, crop: 'fill', gravity: 'auto' },
        { quality: 'auto' }
      ]
    });

    // Replace first menu image (main banner) or add if none exists
    if (!restaurant.menuImages) {
      restaurant.menuImages = [];
    }
    
    // Replace the first menu image (main banner) instead of adding a new one
    const newMenuImage = {
      url: result.secure_url,
      publicId: result.public_id
    };
    
    if (restaurant.menuImages.length > 0) {
      // Replace the first image (main banner)
      restaurant.menuImages[0] = newMenuImage;
    } else {
      // Add as first image if array is empty
      restaurant.menuImages.push(newMenuImage);
    }
    
    await restaurant.save();

    return successResponse(res, 200, 'Menu image uploaded successfully', {
      menuImage: {
        url: result.secure_url,
        publicId: result.public_id
      },
      menuImages: restaurant.menuImages
    });
  } catch (error) {
    console.error('❌ Error uploading menu image:', {
      message: error.message,
      stack: error.stack,
      errorType: error.constructor.name,
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      bufferSize: req.file?.buffer?.length,
      restaurantId: req.restaurant?._id,
      cloudinaryError: error.http_code || error.name === 'Error' ? error.message : null
    });
    
    // Provide more specific error message
    let errorMessage = 'Failed to upload menu image';
    if (error.message) {
      errorMessage += `: ${error.message}`;
    } else if (error.http_code) {
      errorMessage += `: Cloudinary error (${error.http_code})`;
    }
    
    return errorResponse(res, 500, errorMessage);
  }
});

/**
 * Update restaurant delivery status (isAcceptingOrders)
 * PUT /api/restaurant/delivery-status
 */
export const updateDeliveryStatus = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { isAcceptingOrders } = req.body;

    if (typeof isAcceptingOrders !== 'boolean') {
      return errorResponse(res, 400, 'isAcceptingOrders must be a boolean value');
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { isAcceptingOrders },
      { new: true }
    ).select('-password');

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    return successResponse(res, 200, 'Delivery status updated successfully', {
      restaurant: {
        id: restaurant._id,
        isAcceptingOrders: restaurant.isAcceptingOrders
      }
    });
  } catch (error) {
    console.error('Error updating delivery status:', error);
    return errorResponse(res, 500, 'Failed to update delivery status');
  }
});

/**
 * Delete restaurant account
 * DELETE /api/restaurant/profile
 */
export const deleteRestaurantAccount = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Delete Cloudinary images if they exist
    try {
      // Delete profile image
      if (restaurant.profileImage?.publicId) {
        try {
          await deleteFromCloudinary(restaurant.profileImage.publicId);
        } catch (error) {
          console.error('Error deleting profile image from Cloudinary:', error);
          // Continue with account deletion even if image deletion fails
        }
      }

      // Delete menu images
      if (restaurant.menuImages && Array.isArray(restaurant.menuImages)) {
        for (const menuImage of restaurant.menuImages) {
          if (menuImage?.publicId) {
            try {
              await deleteFromCloudinary(menuImage.publicId);
            } catch (error) {
              console.error('Error deleting menu image from Cloudinary:', error);
              // Continue with account deletion even if image deletion fails
            }
          }
        }
      }
    } catch (error) {
      console.error('Error deleting images from Cloudinary:', error);
      // Continue with account deletion even if image deletion fails
    }

    // Delete the restaurant from database
    await Restaurant.findByIdAndDelete(restaurantId);

    console.log(`Restaurant account deleted: ${restaurantId}`, { 
      restaurantId: restaurant.restaurantId,
      name: restaurant.name 
    });

    return successResponse(res, 200, 'Restaurant account deleted successfully');
  } catch (error) {
    console.error('Error deleting restaurant account:', error);
    return errorResponse(res, 500, 'Failed to delete restaurant account');
  }
});

// Get restaurants with dishes under ₹250
export const getRestaurantsWithDishesUnder250 = async (req, res) => {
  try {
    const { zoneId, diningCategory } = req.query; // zoneId is required for discovery; diningCategory reserved for future use

    // Strict zone mode: under-250 list also requires valid zone.
    if (!zoneId && !diningCategory) {
      return successResponse(res, 200, 'Zone required for under-250 discovery', {
        restaurants: [],
        total: 0,
      });
    }
    
    // Optional: Zone-based filtering - if zoneId is provided, validate and filter by zone
    let userZone = null;
    if (zoneId) {
      // Validate zone exists and is active
      userZone = await Zone.findById(zoneId).lean();
      if (!userZone || !userZone.isActive) {
        return successResponse(res, 200, 'Invalid or inactive zone for under-250 discovery', {
          restaurants: [],
          total: 0,
        });
      }
    }

    const MAX_PRICE = 250;
    
    // Helper function to calculate final price after discount
    const getFinalPrice = (item) => {
      // price is typically the current/discounted price
      // If discount exists, calculate from originalPrice, otherwise use price directly
      if (item.originalPrice && item.discountAmount && item.discountAmount > 0) {
        // Calculate discounted price from originalPrice
        let discountedPrice = item.originalPrice;
        if (item.discountType === 'Percent') {
          discountedPrice = item.originalPrice - (item.originalPrice * item.discountAmount / 100);
        } else if (item.discountType === 'Fixed') {
          discountedPrice = item.originalPrice - item.discountAmount;
        }
        return Math.max(0, discountedPrice);
      }
      // Otherwise, use price as the final price
      return Math.max(0, item.price || 0);
    };

    // Helper function to filter items under ₹250
    const filterItemsUnder250 = (items) => {
      return items.filter(item => {
        if (item.isAvailable === false) return false;
        // Only show approved dishes on user-facing surfaces.
        // If approvalStatus is missing (legacy items), treat as approved.
        const approvalStatus = String(item.approvalStatus || 'approved').toLowerCase();
        if (approvalStatus !== 'approved') return false;
        const finalPrice = getFinalPrice(item);
        return finalPrice <= MAX_PRICE;
      });
    };

    // Helper function to process a single restaurant
    const processRestaurant = async (restaurant) => {
      try {
        // Get menu for this restaurant
        const menu = await Menu.findOne({ 
          restaurant: restaurant._id,
          isActive: true 
        }).lean();

        if (!menu || !menu.sections || menu.sections.length === 0) {
          return null; // Skip restaurants without menus
        }

        // Collect all dishes under ₹250 from all sections
        const dishesUnder250 = [];

        menu.sections.forEach(section => {
          if (section.isEnabled === false) return;

          // Filter direct items in section
          const sectionItems = filterItemsUnder250(section.items || []);
          dishesUnder250.push(...sectionItems.map(item => ({
            ...item,
            sectionName: section.name
          })));

          // Filter items in subsections
          (section.subsections || []).forEach(subsection => {
            const subsectionItems = filterItemsUnder250(subsection.items || []);
            dishesUnder250.push(...subsectionItems.map(item => ({
              ...item,
              sectionName: section.name,
              subsectionName: subsection.name
            })));
          });
        });

        // Only include restaurant if it has at least one dish under ₹250
        if (dishesUnder250.length > 0) {
          return {
            id: restaurant._id.toString(),
            restaurantId: restaurant.restaurantId,
            name: restaurant.name,
            slug: restaurant.slug,
            isActive: restaurant.isActive,
            isAcceptingOrders: restaurant.isAcceptingOrders,
            rating: restaurant.rating || 0,
            totalRatings: restaurant.totalRatings || 0,
            deliveryTime: restaurant.estimatedDeliveryTime || "25-30 mins",
            distance: restaurant.distance || "1.2 km",
            cuisine: restaurant.cuisines && restaurant.cuisines.length > 0 
              ? restaurant.cuisines.join(' • ') 
              : "Multi-cuisine",
            price: restaurant.priceRange || "$$",
            image: restaurant.profileImage?.url || restaurant.menuImages?.[0]?.url || "",
            menuItems: dishesUnder250.map(item => ({
              id: item.id,
              name: item.name,
              price: getFinalPrice(item),
              originalPrice: item.originalPrice || item.price,
              image: item.image || (item.images && item.images.length > 0 ? item.images[0] : ""),
              isVeg: item.foodType === 'Veg',
              bestPrice: item.discountAmount > 0 || (item.originalPrice && item.originalPrice > getFinalPrice(item)),
              description: item.description || "",
              category: item.category || item.sectionName || "",
            }))
          };
        }
        return null;
      } catch (error) {
        console.error(`Error processing restaurant ${restaurant._id}:`, error);
        return null;
      }
    };

    // Under-250 is an "order now" surface: exclude closed/offline restaurants.
    let restaurants = await Restaurant.find({ isActive: true, isAcceptingOrders: true })
      .select('-owner -createdAt -updatedAt')
      .lean()
      .limit(100); // Limit to first 100 restaurants for performance

    // Fix restaurant names: Prefer onboarding.step1.restaurantName if available
    restaurants = restaurants.map(restaurant => {
      if (restaurant.onboarding?.step1?.restaurantName) {
        restaurant.name = restaurant.onboarding.step1.restaurantName;
      }
      return restaurant;
    });

    // If a valid userZone is provided, STRICTLY filter restaurants to only those
    // whose pin lies inside that zone polygon. This keeps the list limited to
    // restaurants that actually belong to the user's current delivery zone.
    if (userZone && Array.isArray(userZone.coordinates) && userZone.coordinates.length >= 3) {
      restaurants = restaurants.filter(restaurant => {
        const loc = restaurant.location || {};
        const lat = loc.latitude;
        const lng = loc.longitude;
        if (!lat || !lng) return false;
        return isPointInZone(lat, lng, userZone.coordinates);
      });
    }

    // Sync live rating snapshot from delivered order reviews so under-250 cards
    // always show current DB rating instead of stale defaults.
    if (restaurants.length > 0) {
      const restaurantKeyMap = new Map(); // key -> restaurant indexes[]
      const allRatingKeys = new Set();

      restaurants.forEach((restaurant, index) => {
        const keys = [
          restaurant.restaurantId,
          restaurant._id?.toString?.(),
          restaurant.id,
        ].filter(Boolean);

        keys.forEach((key) => {
          const normalized = String(key);
          allRatingKeys.add(normalized);
          if (!restaurantKeyMap.has(normalized)) {
            restaurantKeyMap.set(normalized, []);
          }
          restaurantKeyMap.get(normalized).push(index);
        });
      });

      if (allRatingKeys.size > 0) {
        const ratingRows = await Order.aggregate([
          {
            $match: {
              restaurantId: { $in: Array.from(allRatingKeys) },
              "review.rating": { $exists: true, $ne: null, $gt: 0 },
            },
          },
          {
            $group: {
              _id: "$restaurantId",
              totalRatings: { $sum: 1 },
              ratingSum: { $sum: "$review.rating" },
            },
          },
        ]);

        const mergedStatsByRestaurantIndex = new Map(); // idx -> {sum,count}
        for (const row of ratingRows) {
          const key = String(row?._id || "");
          const indexes = restaurantKeyMap.get(key) || [];
          indexes.forEach((idx) => {
            const prev = mergedStatsByRestaurantIndex.get(idx) || {
              totalRatings: 0,
              ratingSum: 0,
            };
            mergedStatsByRestaurantIndex.set(idx, {
              totalRatings: prev.totalRatings + Number(row.totalRatings || 0),
              ratingSum: prev.ratingSum + Number(row.ratingSum || 0),
            });
          });
        }

        mergedStatsByRestaurantIndex.forEach((stats, idx) => {
          if (!restaurants[idx]) return;
          if (stats.totalRatings <= 0) return;
          const avg = stats.ratingSum / stats.totalRatings;
          restaurants[idx].rating = Number(avg.toFixed(1));
          restaurants[idx].averageRating = restaurants[idx].rating;
          restaurants[idx].totalRatings = stats.totalRatings;
          restaurants[idx].reviewCount = stats.totalRatings;
        });
      }
    }

    // Process restaurants in parallel (batch processing for better performance)
    const batchSize = 10; // Process 10 restaurants at a time
    const restaurantsWithDishes = [];

    for (let i = 0; i < restaurants.length; i += batchSize) {
      const batch = restaurants.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(processRestaurant));
      restaurantsWithDishes.push(...results.filter(r => r !== null));
    }

    // Sort by rating (highest first) or by number of dishes
    restaurantsWithDishes.sort((a, b) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return b.menuItems.length - a.menuItems.length;
    });

    return successResponse(res, 200, 'Restaurants with dishes under ₹250 retrieved successfully', {
      restaurants: restaurantsWithDishes,
      total: restaurantsWithDishes.length,
    });
  } catch (error) {
    console.error('Error fetching restaurants with dishes under ₹250:', error);
    return errorResponse(res, 500, 'Failed to fetch restaurants with dishes under ₹250');
  }
};



