import Restaurant from '../../restaurant/models/Restaurant.js';
import Offer from '../../restaurant/models/Offer.js';
import FeeSettings from '../../admin/models/FeeSettings.js';
import mongoose from 'mongoose';

/**
 * Get active fee settings from database
 * Returns default values if no settings found
 */
const getFeeSettings = async () => {
  try {
    const feeSettings = await FeeSettings.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();
    
    if (feeSettings) {
      return feeSettings;
    }
    
    // Return default values if no active settings found
    return {
      deliveryFee: 25,
      freeDeliveryThreshold: 149,
      platformFee: 5,
      platformFeeRanges: [],
      gstRate: 5,
    };
  } catch (error) {
    console.error('Error fetching fee settings:', error);
    // Return default values on error
    return {
      deliveryFee: 25,
      freeDeliveryThreshold: 149,
      platformFee: 5,
      platformFeeRanges: [],
      gstRate: 5,
    };
  }
};

/**
 * Calculate delivery fee based on order value, distance, and restaurant settings
 */
export const calculateDeliveryFee = async (orderValue, restaurant, deliveryAddress = null) => {
  // Get fee settings from database
  const feeSettings = await getFeeSettings();
  
  // Check restaurant settings for free delivery threshold (takes priority)
  if (restaurant?.freeDeliveryAbove) {
    if (orderValue >= restaurant.freeDeliveryAbove) {
      return 0; // Free delivery
    }
  } else {
    // Use admin settings for free delivery threshold
    const freeDeliveryThreshold = feeSettings.freeDeliveryThreshold || 149;
    if (orderValue >= freeDeliveryThreshold) {
      return 0;
    }
  }
  
  // Check if delivery fee ranges are configured
  if (feeSettings.deliveryFeeRanges && Array.isArray(feeSettings.deliveryFeeRanges) && feeSettings.deliveryFeeRanges.length > 0) {
    // Sort ranges by min value to ensure proper checking
    const sortedRanges = [...feeSettings.deliveryFeeRanges].sort((a, b) => a.min - b.min);
    
    // Find matching range (orderValue >= min && orderValue < max)
    // For the last range, we check orderValue >= min && orderValue <= max
    for (let i = 0; i < sortedRanges.length; i++) {
      const range = sortedRanges[i];
      const isLastRange = i === sortedRanges.length - 1;
      
      if (isLastRange) {
        // Last range: include max value
        if (orderValue >= range.min && orderValue <= range.max) {
          return range.fee;
        }
      } else {
        // Other ranges: exclude max value (handled by next range)
        if (orderValue >= range.min && orderValue < range.max) {
          return range.fee;
        }
      }
    }
  }
  
  // Fallback to default delivery fee if no range matches
  const baseDeliveryFee = feeSettings.deliveryFee || 25;
  
  // TODO: Add distance-based calculation when address coordinates are available
  // if (deliveryAddress?.location?.coordinates && restaurant?.location?.coordinates) {
  //   const distance = calculateDistance(
  //     restaurant.location.coordinates,
  //     deliveryAddress.location.coordinates
  //   );
  //   deliveryFee = baseFee + (distance * perKmFee);
  // }
  
  return baseDeliveryFee;
};

/**
 * Calculate platform fee based on distance
 * @param {number} distanceInKm - Distance in kilometers (user to restaurant or restaurant to restaurant)
 * @returns {Promise<number>} Platform fee
 */
export const calculatePlatformFee = async (distanceInKm = null) => {
  const feeSettings = await getFeeSettings();
  
  // If distance is provided and platform fee ranges are configured, use distance-based calculation
  if (distanceInKm !== null && distanceInKm !== undefined && 
      feeSettings.platformFeeRanges && 
      Array.isArray(feeSettings.platformFeeRanges) && 
      feeSettings.platformFeeRanges.length > 0) {
    
    // Sort ranges by min value to ensure proper checking
    const sortedRanges = [...feeSettings.platformFeeRanges].sort((a, b) => a.min - b.min);
    
    // Find matching range (distance >= min && distance < max)
    // For the last range, we check distance >= min && distance <= max
    for (let i = 0; i < sortedRanges.length; i++) {
      const range = sortedRanges[i];
      const isLastRange = i === sortedRanges.length - 1;
      
      if (isLastRange) {
        // Last range: include max value
        if (distanceInKm >= range.min && distanceInKm <= range.max) {
          return range.fee;
        }
      } else {
        // Other ranges: exclude max value (handled by next range)
        if (distanceInKm >= range.min && distanceInKm < range.max) {
          return range.fee;
        }
      }
    }
  }
  
  // Fallback to default platform fee if no range matches or distance not provided
  return feeSettings.platformFee || 5;
};

/**
 * Calculate GST (Goods and Services Tax)
 * GST is calculated on subtotal after discounts
 */
export const calculateGST = async (subtotal, discount = 0) => {
  const taxableAmount = subtotal - discount;
  const feeSettings = await getFeeSettings();
  const gstRate = (feeSettings.gstRate || 5) / 100; // Convert percentage to decimal
  return Math.round(taxableAmount * gstRate);
};

/**
 * Calculate discount based on coupon code
 */
export const calculateDiscount = (coupon, subtotal) => {
  if (!coupon) return 0;
  
  if (coupon.minOrder && subtotal < coupon.minOrder) {
    return 0; // Minimum order not met
  }
  
  if (coupon.type === 'percentage') {
    const maxDiscount = coupon.maxDiscount || Infinity;
    const discount = Math.min(
      Math.round(subtotal * (coupon.discount / 100)),
      maxDiscount
    );
    return discount;
  } else if (coupon.type === 'flat') {
    return Math.min(coupon.discount, subtotal); // Can't discount more than subtotal
  }
  
  // Default: flat discount
  return Math.min(coupon.discount || 0, subtotal);
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
export const calculateDistance = (coord1, coord2) => {
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;
  
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

/**
 * Main function to calculate order pricing
 */
export const calculateOrderPricing = async ({
  items,
  restaurantId,
  deliveryAddress = null,
  couponCode = null,
  deliveryFleet = 'standard',
  userId = null // Add userId to fetch location from Firebase
}) => {
  try {
    // Calculate subtotal from items
    const subtotal = items.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);
    
    if (subtotal <= 0) {
      throw new Error('Order subtotal must be greater than 0');
    }
    
    // Try to get user location from Firebase first (to avoid Google Maps API calls)
    let userLocationFromFirebase = null;
    if (userId) {
      try {
        // Convert userId to string if needed
        const userIdStr = userId?.toString ? userId.toString() : String(userId);
        console.log(`🔍 Attempting to fetch user location from Firebase for user: ${userIdStr}`);
        
        const { getUserLocationFromFirebase } = await import('./firebaseTrackingService.js');
        userLocationFromFirebase = await getUserLocationFromFirebase(userIdStr);
        
        if (userLocationFromFirebase) {
          console.log('✅ User location fetched from Firebase successfully:', {
            lat: userLocationFromFirebase.lat,
            lng: userLocationFromFirebase.lng,
            city: userLocationFromFirebase.city
          });
        } else {
          console.log('ℹ️ User location not available in Firebase, will use deliveryAddress');
        }
      } catch (firebaseError) {
        // Continue with deliveryAddress if Firebase fails
        console.warn('⚠️ Failed to get user location from Firebase:', firebaseError.message);
        console.warn('Stack trace:', firebaseError.stack);
      }
    } else {
      console.log('ℹ️ No userId provided, skipping Firebase location fetch');
    }

    // Use Firebase location if available (priority), otherwise use deliveryAddress
    let effectiveDeliveryAddress = deliveryAddress;
    if (userLocationFromFirebase) {
      // Create effective delivery address from Firebase location (Firebase has priority)
      console.log('📍 Using Firebase location for order calculation');
      effectiveDeliveryAddress = {
        ...(deliveryAddress || {}), // Keep other deliveryAddress fields if present
        location: {
          type: 'Point',
          coordinates: [userLocationFromFirebase.lng, userLocationFromFirebase.lat]
        },
        latitude: userLocationFromFirebase.lat,
        longitude: userLocationFromFirebase.lng,
        address: userLocationFromFirebase.address || deliveryAddress?.address || null,
        city: userLocationFromFirebase.city || deliveryAddress?.city || null,
        state: userLocationFromFirebase.state || deliveryAddress?.state || null,
        area: userLocationFromFirebase.area || deliveryAddress?.area || null,
        formattedAddress: userLocationFromFirebase.formattedAddress || deliveryAddress?.formattedAddress || null,
        postalCode: userLocationFromFirebase.postalCode || deliveryAddress?.postalCode || null
      };
    } else if (deliveryAddress) {
      console.log('📍 Using deliveryAddress from request for order calculation');
    } else {
      console.warn('⚠️ No location available (neither Firebase nor deliveryAddress)');
    }
    
    // Get restaurant details
    let restaurant = null;
    if (restaurantId) {
      if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
        restaurant = await Restaurant.findById(restaurantId).lean();
      }
      if (!restaurant) {
        restaurant = await Restaurant.findOne({
          $or: [
            { restaurantId: restaurantId },
            { slug: restaurantId }
          ]
        }).lean();
      }
    }
    
    // Calculate coupon discount
    let discount = 0;
    let appliedCoupon = null;
    
    if (couponCode && restaurant) {
      try {
        // Get restaurant ObjectId
        let restaurantObjectId = restaurant._id;
        if (!restaurantObjectId && mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
          restaurantObjectId = new mongoose.Types.ObjectId(restaurantId);
        }

        if (restaurantObjectId) {
          const now = new Date();
          
          // Find active offer with this coupon code for this restaurant
          const offer = await Offer.findOne({
            restaurant: restaurantObjectId,
            status: 'active',
            'items.couponCode': couponCode,
            startDate: { $lte: now },
            $or: [
              { endDate: { $gte: now } },
              { endDate: null }
            ]
          }).lean();

          if (offer) {
            // Find the specific item coupon
            const couponItem = offer.items.find(item => item.couponCode === couponCode);
            
            if (couponItem) {
              // Check if coupon is valid for items in cart
              const cartItemIds = items.map(item => item.itemId);
              const isValidForCart = couponItem.itemId && cartItemIds.includes(couponItem.itemId);
              
              // Check minimum order value
              const minOrderMet = !offer.minOrderValue || subtotal >= offer.minOrderValue;
              
              if (isValidForCart && minOrderMet) {
                // Calculate discount based on offer type
                const itemInCart = items.find(item => item.itemId === couponItem.itemId);
                if (itemInCart) {
                  const itemQuantity = itemInCart.quantity || 1;
                  
                  // Calculate discount per item
                  const discountPerItem = couponItem.originalPrice - couponItem.discountedPrice;
                  
                  // Apply discount to all quantities of this item
                  discount = Math.round(discountPerItem * itemQuantity);
                  
                  // Ensure discount doesn't exceed item subtotal
                  const itemSubtotal = (itemInCart.price || 0) * itemQuantity;
                  discount = Math.min(discount, itemSubtotal);
                }
                
                appliedCoupon = {
                  code: couponCode,
                  discount: discount,
                  discountPercentage: couponItem.discountPercentage,
                  minOrder: offer.minOrderValue || 0,
                  type: offer.discountType === 'percentage' ? 'percentage' : 'flat',
                  itemId: couponItem.itemId,
                  itemName: couponItem.itemName,
                  originalPrice: couponItem.originalPrice,
                  discountedPrice: couponItem.discountedPrice,
                };
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching coupon from database: ${error.message}`);
        // Continue without coupon if there's an error
      }
    }
    
    // Calculate delivery fee (use effective delivery address)
    const deliveryFee = await calculateDeliveryFee(
      subtotal,
      restaurant,
      effectiveDeliveryAddress
    );
    
    // Apply free delivery from coupon
    const finalDeliveryFee = appliedCoupon?.freeDelivery ? 0 : deliveryFee;
    
    // Calculate distance for platform fee (use effective delivery address)
    let distanceInKm = null;
    if (effectiveDeliveryAddress?.location?.coordinates && restaurant?.location?.coordinates) {
      // Calculate distance from restaurant to delivery address (user location)
      distanceInKm = calculateDistance(
        restaurant.location.coordinates,
        effectiveDeliveryAddress.location.coordinates
      );
    } else if (effectiveDeliveryAddress?.latitude && effectiveDeliveryAddress?.longitude && 
               restaurant?.location?.latitude && restaurant?.location?.longitude) {
      // Alternative: if coordinates are in latitude/longitude format
      const restaurantCoords = [
        restaurant.location.longitude || restaurant.location.coordinates?.[0],
        restaurant.location.latitude || restaurant.location.coordinates?.[1]
      ];
      const deliveryCoords = [
        effectiveDeliveryAddress.longitude || effectiveDeliveryAddress.coordinates?.[0],
        effectiveDeliveryAddress.latitude || effectiveDeliveryAddress.coordinates?.[1]
      ];
      if (restaurantCoords[0] && restaurantCoords[1] && deliveryCoords[0] && deliveryCoords[1]) {
        distanceInKm = calculateDistance(restaurantCoords, deliveryCoords);
      }
    }
    
    // Calculate platform fee based on distance
    const platformFee = await calculatePlatformFee(distanceInKm);
    
    // Calculate GST on subtotal after discount
    const gst = await calculateGST(subtotal, discount);
    
    // Calculate total
    const total = subtotal - discount + finalDeliveryFee + platformFee + gst;
    
    // Calculate savings (discount + any delivery savings)
    const savings = discount + (deliveryFee > finalDeliveryFee ? deliveryFee - finalDeliveryFee : 0);
    
    return {
      subtotal: Math.round(subtotal),
      discount: Math.round(discount),
      deliveryFee: Math.round(finalDeliveryFee),
      platformFee: Math.round(platformFee),
      tax: gst, // Already rounded in calculateGST
      total: Math.round(total),
      savings: Math.round(savings),
      appliedCoupon: appliedCoupon ? {
        code: appliedCoupon.code,
        discount: discount,
        freeDelivery: appliedCoupon.freeDelivery || false
      } : null,
      breakdown: {
        itemTotal: Math.round(subtotal),
        discountAmount: Math.round(discount),
        deliveryFee: Math.round(finalDeliveryFee),
        platformFee: Math.round(platformFee),
        gst: gst,
        total: Math.round(total)
      }
    };
  } catch (error) {
    throw new Error(`Failed to calculate order pricing: ${error.message}`);
  }
};

