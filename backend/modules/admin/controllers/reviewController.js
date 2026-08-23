import Order from '../../order/models/Order.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import mongoose from 'mongoose';

/**
 * Get all customer reviews (Admin)
 * GET /api/admin/reviews
 */
export const getAllReviews = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 20, restaurantId, rating, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query
    const query = {
      status: 'delivered',
      'review.rating': { $exists: true, $ne: null }
    };
    
    if (restaurantId) {
      query.restaurantId = restaurantId;
    }
    
    if (rating) {
      const ratingNum = parseInt(rating);
      if (ratingNum >= 1 && ratingNum <= 5) {
        query['review.rating'] = ratingNum;
      }
    }
    
    // Sort options
    const sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions['review.rating'] = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'submittedAt') {
      sortOptions['review.submittedAt'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions['review.submittedAt'] = -1; // Default: newest first
    }
    
    // Fetch reviews with pagination
    const reviews = await Order.find(query)
      .populate('userId', 'name phone email')
      .populate('restaurantId', 'name')
      .populate('deliveryPartnerId', 'name phone')
      .select('orderId restaurantId restaurantName userId review deliveredAt createdAt items deliveryPartnerId')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    // Get total count
    const totalReviews = await Order.countDocuments(query);
    
    // Calculate average rating
    const avgRatingResult = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$review.rating' },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: '$review.rating'
          }
        }
      }
    ]);
    
    let avgRating = 0;
    let ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    
    if (avgRatingResult.length > 0) {
      avgRating = avgRatingResult[0].avgRating || 0;
      const distribution = avgRatingResult[0].ratingDistribution || [];
      distribution.forEach(rating => {
        if (rating >= 1 && rating <= 5) {
          ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
        }
      });
    }
    
    return successResponse(res, 200, 'Reviews fetched successfully', {
      reviews: reviews.map(review => ({
        orderId: review.orderId,
        orderMongoId: review._id,
        restaurantId: review.restaurantId?._id || review.restaurantId,
        restaurantName: review.restaurantName || review.restaurantId?.name,
        customer: {
          id: review.userId?._id || review.userId,
          name: review.userId?.name,
          phone: review.userId?.phone,
          email: review.userId?.email
        },
        deliveryPartner: review.deliveryPartnerId ? {
          id: review.deliveryPartnerId?._id ? review.deliveryPartnerId._id.toString() : (typeof review.deliveryPartnerId === 'object' && review.deliveryPartnerId.toString ? review.deliveryPartnerId.toString() : String(review.deliveryPartnerId || '')),
          name: review.deliveryPartnerId?.name || null,
          phone: review.deliveryPartnerId?.phone || null
        } : null,
        items: review.items || [],
        rating: review.review?.rating,
        comment: review.review?.comment,
        submittedAt: review.review?.submittedAt || review.deliveredAt,
        deliveredAt: review.deliveredAt,
        createdAt: review.createdAt
      })),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalReviews / limitNum),
        totalReviews,
        limit: limitNum
      },
      statistics: {
        averageRating: Math.round(avgRating * 10) / 10,
        totalReviews,
        ratingDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return errorResponse(res, 500, `Failed to fetch reviews: ${error.message}`);
  }
});

/**
 * Get review by order ID (Admin)
 * GET /api/admin/reviews/:orderId
 */
export const getReviewByOrderId = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findOne({
      $or: [
        { orderId: orderId },
        { _id: orderId }
      ],
      status: 'delivered',
      'review.rating': { $exists: true, $ne: null }
    })
      .populate('userId', 'name phone email')
      .populate('restaurantId', 'name')
      .select('orderId restaurantId restaurantName userId review deliveredAt createdAt')
      .lean();
    
    if (!order) {
      return errorResponse(res, 404, 'Review not found for this order');
    }
    
    return successResponse(res, 200, 'Review fetched successfully', {
      orderId: order.orderId,
      orderMongoId: order._id,
      restaurantId: order.restaurantId?._id || order.restaurantId,
      restaurantName: order.restaurantName || order.restaurantId?.name,
      customer: {
        id: order.userId?._id || order.userId,
        name: order.userId?.name,
        phone: order.userId?.phone,
        email: order.userId?.email
      },
      rating: order.review?.rating,
      comment: order.review?.comment,
      submittedAt: order.review?.submittedAt || order.deliveredAt,
      deliveredAt: order.deliveredAt,
      createdAt: order.createdAt
    });
  } catch (error) {
    console.error('Error fetching review:', error);
    return errorResponse(res, 500, `Failed to fetch review: ${error.message}`);
  }
});

/**
 * Get reviews by restaurant ID (Admin)
 * GET /api/admin/reviews/restaurant/:restaurantId
 */
export const getReviewsByRestaurant = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { page = 1, limit = 20, rating, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    
    // Resolve target restaurant to get all possible IDs
    let targetRestaurant = null;
    if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
      targetRestaurant = await Restaurant.findById(restaurantId).lean();
    }
    if (!targetRestaurant) {
      targetRestaurant = await Restaurant.findOne({
        $or: [
          { restaurantId: restaurantId },
          { "onboarding.step1.restaurantName": restaurantId }
        ]
      }).lean();
    }

    const possibleRestaurantIds = [
      restaurantId,
      targetRestaurant?._id?.toString(),
      targetRestaurant?._id,
      targetRestaurant?.restaurantId
    ].filter(Boolean);

    // Base query for all delivered orders of this restaurant
    const baseQuery = {
      restaurantId: { $in: possibleRestaurantIds },
      isDeleted: { $ne: true },
      status: 'delivered'
    };

    // Filtered query for current page results
    const query = { ...baseQuery };
    if (rating) {
      const ratingNum = parseInt(rating);
      if (ratingNum === 5) {
        query.$or = [
          { 'review.rating': 5 },
          { 'review.rating': { $exists: false } },
          { 'review.rating': null },
          { 'review.rating': 0 }
        ];
      } else if (ratingNum >= 1 && ratingNum <= 4) {
        query['review.rating'] = ratingNum;
      }
    }
    
    const sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions['review.rating'] = sortOrder === 'asc' ? 1 : -1;
      sortOptions['createdAt'] = -1;
    } else if (sortOrder === 'oldest' || (sortBy === 'submittedAt' && sortOrder === 'asc')) {
      sortOptions['createdAt'] = 1;
      sortOptions['deliveredAt'] = 1;
    } else {
      // Default: newest first by order creation / delivery date
      sortOptions['createdAt'] = -1;
      sortOptions['deliveredAt'] = -1;
    }
    
    const reviews = await Order.find(query)
      .populate('userId', 'name phone email profileImage avatar')
      .select('orderId userId review deliveredAt createdAt items')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const totalFilteredReviews = await Order.countDocuments(query);
    
    // Aggregate overall stats and rating distribution across all delivered orders
    const allDeliveredOrders = await Order.find(baseQuery)
      .select('review.rating')
      .lean();
    
    const totalAllReviews = allDeliveredOrders.length;
    let ratingSum = 0;
    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    allDeliveredOrders.forEach((ord) => {
      const r = ord.review?.rating ? Math.round(Number(ord.review.rating)) : 5;
      const validR = r >= 1 && r <= 5 ? r : 5;
      ratingDistribution[validR] = (ratingDistribution[validR] || 0) + 1;
      ratingSum += (ord.review?.rating ? Number(ord.review.rating) : 5);
    });

    const avgRating = totalAllReviews > 0 ? ratingSum / totalAllReviews : 0;
    
    return successResponse(res, 200, 'Restaurant reviews fetched successfully', {
      restaurant: targetRestaurant ? {
        id: targetRestaurant._id,
        restaurantId: targetRestaurant.restaurantId,
        name: targetRestaurant.onboarding?.step1?.restaurantName || targetRestaurant.name,
        logo: targetRestaurant.profileImage?.url || (typeof targetRestaurant.profileImage === 'string' ? targetRestaurant.profileImage : null) || targetRestaurant.logo,
        zone: targetRestaurant.location?.area || targetRestaurant.location?.city || targetRestaurant.zone,
        cuisine: Array.isArray(targetRestaurant.cuisines) && targetRestaurant.cuisines.length > 0 ? targetRestaurant.cuisines[0] : targetRestaurant.cuisine
      } : null,
      reviews: reviews.map(review => {
        const rating = review.review?.rating || 5;
        const comment = review.review?.comment || review.review?.text || '';
        return {
          orderId: review.orderId,
          orderMongoId: review._id,
          customer: {
            id: review.userId?._id || review.userId,
            name: review.userId?.name || 'Customer',
            phone: review.userId?.phone || null,
            email: review.userId?.email || null,
            avatar: review.userId?.avatar || review.userId?.profileImage || null
          },
          rating: Number(rating),
          comment: comment,
          submittedAt: review.review?.submittedAt || review.deliveredAt || review.createdAt,
          deliveredAt: review.deliveredAt,
          createdAt: review.createdAt,
          items: Array.isArray(review.items) ? review.items.map(item => ({
            name: item.name || item.title || 'Item',
            quantity: item.quantity || 1,
            price: item.price || 0
          })) : []
        };
      }),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalFilteredReviews / limitNum) || 1,
        totalReviews: totalFilteredReviews,
        limit: limitNum
      },
      statistics: {
        averageRating: Number(avgRating.toFixed(1)),
        totalReviews: totalAllReviews,
        ratingDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching restaurant reviews:', error);
    return errorResponse(res, 500, `Failed to fetch restaurant reviews: ${error.message}`);
  }
});

/**
 * Get all deliveryman reviews (Admin)
 * GET /api/admin/delivery-partners/reviews
 */
export const getDeliverymanReviews = asyncHandler(async (req, res) => {
  try {
    console.log('📋 [getDeliverymanReviews] Starting...', { query: req.query });
    
    // Verify Order model is available
    if (!Order) {
      console.error('❌ Order model is not available');
      return errorResponse(res, 500, 'Order model not available');
    }
    
    const { page = 1, limit = 100, deliveryPartnerId, rating, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query - orders with deliveryPartnerId and review.rating
    const query = {
      status: 'delivered',
      deliveryPartnerId: { $exists: true, $ne: null },
      'review.rating': { $exists: true, $ne: null }
    };
    
    console.log('🔍 Base query:', { status: query.status, hasDeliveryPartner: !!query.deliveryPartnerId, hasReviewRating: !!query['review.rating'] });
    
    if (deliveryPartnerId) {
      // Handle both string and ObjectId formats
      if (mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        query.deliveryPartnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
      } else {
        query.deliveryPartnerId = deliveryPartnerId;
      }
      console.log('🔍 Filtering by deliveryPartnerId:', deliveryPartnerId);
    }
    
    if (rating) {
      const ratingNum = parseInt(rating);
      if (ratingNum >= 1 && ratingNum <= 5) {
        query['review.rating'] = ratingNum;
        console.log('🔍 Filtering by rating:', ratingNum);
      }
    }
    
    // Sort options
    const sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions['review.rating'] = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'submittedAt') {
      sortOptions['review.submittedAt'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions['review.submittedAt'] = -1; // Default: newest first
    }
    
    console.log('🔍 Sort options:', sortOptions);
    
    // Fetch reviews with pagination
    console.log('🔍 Executing Order.find()...');
    const reviews = await Order.find(query)
      .populate('deliveryPartnerId', 'name phone')
      .populate('userId', 'name phone email')
      .select('orderId deliveryPartnerId userId review deliveredAt createdAt')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    console.log(`✅ Found ${reviews.length} reviews`);
    
    // Get total count
    const totalReviews = await Order.countDocuments(query);
    console.log(`✅ Total reviews count: ${totalReviews}`);
    
    // Transform data for frontend
    console.log('🔄 Transforming reviews data...');
    const transformedReviews = reviews.map((review, index) => {
      try {
        const deliveryPartner = review.deliveryPartnerId;
        const user = review.userId;
        const reviewData = review.review || {};
        
        // Extract deliveryman ID properly
        let deliverymanIdValue = null;
        if (deliveryPartner) {
          if (typeof deliveryPartner === 'object' && deliveryPartner._id) {
            deliverymanIdValue = deliveryPartner._id.toString();
          } else if (typeof deliveryPartner === 'string') {
            deliverymanIdValue = deliveryPartner;
          } else if (deliveryPartner) {
            deliverymanIdValue = String(deliveryPartner);
          }
        }
        
        return {
          sl: skip + index + 1,
          deliveryman: (deliveryPartner && typeof deliveryPartner === 'object' ? deliveryPartner.name : null) || 'Unknown Deliveryman',
          deliverymanId: deliverymanIdValue,
          deliverymanPhone: (deliveryPartner && typeof deliveryPartner === 'object' ? deliveryPartner.phone : null) || '',
          customer: (user && typeof user === 'object' ? user.name : null) || 'Unknown Customer',
          customerId: (user && typeof user === 'object' ? user._id : user) || null,
          customerPhone: (user && typeof user === 'object' ? user.phone : null) || '',
          review: reviewData.comment || '',
          rating: reviewData.rating || 0,
          orderId: review.orderId || null,
          submittedAt: reviewData.submittedAt || review.deliveredAt || review.createdAt || new Date(),
          deliveredAt: review.deliveredAt || null
        };
      } catch (transformError) {
        console.error(`❌ Error transforming review at index ${index}:`, transformError);
        // Return a safe default object
        return {
          sl: skip + index + 1,
          deliveryman: 'Unknown Deliveryman',
          deliverymanId: null,
          deliverymanPhone: '',
          customer: 'Unknown Customer',
          customerId: null,
          customerPhone: '',
          review: '',
          rating: 0,
          orderId: review.orderId || null,
          submittedAt: review.createdAt || new Date(),
          deliveredAt: review.deliveredAt || null
        };
      }
    });
    
    console.log(`✅ Returning ${transformedReviews.length} transformed reviews`);
    
    return successResponse(res, 200, 'Deliveryman reviews fetched successfully', {
      reviews: transformedReviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalReviews,
        pages: Math.ceil(totalReviews / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching deliveryman reviews:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return errorResponse(res, 500, `Failed to fetch deliveryman reviews: ${error.message}`);
  }
});
