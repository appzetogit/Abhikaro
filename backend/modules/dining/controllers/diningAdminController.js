import DiningCategory from '../models/DiningCategory.js';
import DiningOfferBanner from '../models/DiningOfferBanner.js';
import DiningStory from '../models/DiningStory.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';
import { cloudinary } from '../../../config/cloudinary.js';

// ==================== DINING CATEGORIES ====================

export const getAdminDiningCategories = async (req, res) => {
    try {
        const categories = await DiningCategory.find()
            .populate('linkedRestaurants', 'name onboarding')
            .sort({ createdAt: -1 })
            .lean();
        return successResponse(res, 200, 'Categories retrieved successfully', { categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        return errorResponse(res, 500, 'Failed to fetch categories');
    }
};

export const createDiningCategory = async (req, res) => {
    try {
        const { name, linkedRestaurants } = req.body;
        if (!name) return errorResponse(res, 400, 'Name is required');
        if (!req.file) return errorResponse(res, 400, 'Image is required');

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: 'appzeto/dining/categories',
            resource_type: 'image'
        });

        // Parse linkedRestaurants if provided as JSON string
        let linkedRestaurantsArray = [];
        if (linkedRestaurants) {
            try {
                linkedRestaurantsArray = typeof linkedRestaurants === 'string' 
                    ? JSON.parse(linkedRestaurants) 
                    : Array.isArray(linkedRestaurants) 
                        ? linkedRestaurants 
                        : [];
            } catch (err) {
                console.error('Error parsing linkedRestaurants:', err);
                linkedRestaurantsArray = [];
            }
        }

        const category = new DiningCategory({
            name,
            imageUrl: result.secure_url,
            cloudinaryPublicId: result.public_id,
            linkedRestaurants: linkedRestaurantsArray
        });

        await category.save();
        await category.populate('linkedRestaurants', 'name onboarding');

        return successResponse(res, 201, 'Category created successfully', { category });
    } catch (error) {
        console.error('Error creating category:', error);
        return errorResponse(res, 500, 'Failed to create category');
    }
};

export const updateDiningCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, linkedRestaurants } = req.body;

        const category = await DiningCategory.findById(id);
        if (!category) return errorResponse(res, 404, 'Category not found');

        if (name) category.name = name;

        // Parse and update linkedRestaurants if provided
        if (linkedRestaurants !== undefined) {
            try {
                const linkedRestaurantsArray = typeof linkedRestaurants === 'string' 
                    ? JSON.parse(linkedRestaurants) 
                    : Array.isArray(linkedRestaurants) 
                        ? linkedRestaurants 
                        : [];
                category.linkedRestaurants = linkedRestaurantsArray;
            } catch (err) {
                console.error('Error parsing linkedRestaurants:', err);
            }
        }

        // Update image if provided
        if (req.file) {
            try {
                await cloudinary.uploader.destroy(category.cloudinaryPublicId);
            } catch (err) {
                console.error('Error deleting old image from Cloudinary:', err);
            }

            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'appzeto/dining/categories',
                resource_type: 'image'
            });

            category.imageUrl = result.secure_url;
            category.cloudinaryPublicId = result.public_id;
        }

        await category.save();
        await category.populate('linkedRestaurants', 'name onboarding');

        return successResponse(res, 200, 'Category updated successfully', { category });
    } catch (error) {
        console.error('Error updating category:', error);
        return errorResponse(res, 500, 'Failed to update category');
    }
};

export const deleteDiningCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await DiningCategory.findById(id);
        if (!category) return errorResponse(res, 404, 'Category not found');

        try {
            await cloudinary.uploader.destroy(category.cloudinaryPublicId);
        } catch (err) {
            console.error('Error deleting from Cloudinary:', err);
        }

        await DiningCategory.findByIdAndDelete(id);
        return successResponse(res, 200, 'Category deleted successfully');
    } catch (error) {
        console.error('Error deleting category:', error);
        return errorResponse(res, 500, 'Failed to delete category');
    }
};

// ==================== DINING OFFER BANNERS ====================

export const getAdminDiningOfferBanners = async (req, res) => {
    try {
        const banners = await DiningOfferBanner.find()
            .populate('restaurant', 'name onboarding')
            .sort({ createdAt: -1 })
            .lean();
        
        // Map banners to include correct restaurant name
        const bannersWithCorrectName = banners.map(banner => {
            if (banner.restaurant) {
                const restaurantName = banner.restaurant?.onboarding?.step1?.restaurantName || banner.restaurant?.name || 'Restaurant';
                return {
                    ...banner,
                    restaurant: {
                        ...banner.restaurant,
                        name: restaurantName
                    }
                };
            }
            return banner;
        });
        
        return successResponse(res, 200, 'Banners retrieved successfully', { banners: bannersWithCorrectName });
    } catch (error) {
        console.error('Error fetching banners:', error);
        return errorResponse(res, 500, 'Failed to fetch banners');
    }
};

export const createDiningOfferBanner = async (req, res) => {
    try {
        const { percentageOff, tagline, restaurant } = req.body;
        if (!percentageOff || !tagline || !restaurant) {
            return errorResponse(res, 400, 'All fields are required');
        }
        if (!req.file) return errorResponse(res, 400, 'Image is required');

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: 'appzeto/dining/offers',
            resource_type: 'image'
        });

        const banner = new DiningOfferBanner({
            imageUrl: result.secure_url,
            cloudinaryPublicId: result.public_id,
            percentageOff,
            tagline,
            restaurant
        });

        await banner.save();

        await banner.populate('restaurant', 'name onboarding');
        
        // Ensure correct restaurant name is shown
        if (banner.restaurant) {
            banner.restaurant.name = banner.restaurant?.onboarding?.step1?.restaurantName || banner.restaurant?.name || 'Restaurant';
        }

        return successResponse(res, 201, 'Banner created successfully', { banner });
    } catch (error) {
        console.error('Error creating banner:', error);
        return errorResponse(res, 500, 'Failed to create banner');
    }
};

export const deleteDiningOfferBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await DiningOfferBanner.findById(id);
        if (!banner) return errorResponse(res, 404, 'Banner not found');

        try {
            await cloudinary.uploader.destroy(banner.cloudinaryPublicId);
        } catch (err) {
            console.error('Error deleting from Cloudinary:', err);
        }

        await DiningOfferBanner.findByIdAndDelete(id);
        return successResponse(res, 200, 'Banner deleted successfully');
    } catch (error) {
        console.error('Error deleting banner:', error);
        return errorResponse(res, 500, 'Failed to delete banner');
    }
};

export const updateDiningOfferBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { percentageOff, tagline, restaurant } = req.body;

        const banner = await DiningOfferBanner.findById(id);
        if (!banner) return errorResponse(res, 404, 'Banner not found');

        if (percentageOff) banner.percentageOff = percentageOff;
        if (tagline) banner.tagline = tagline;
        if (restaurant) banner.restaurant = restaurant;

        if (req.file) {
            try {
                await cloudinary.uploader.destroy(banner.cloudinaryPublicId);
            } catch (err) {
                console.error('Error deleting old image from Cloudinary:', err);
            }

            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'appzeto/dining/offers',
                resource_type: 'image'
            });

            banner.imageUrl = result.secure_url;
            banner.cloudinaryPublicId = result.public_id;
        }

        await banner.save();
        await banner.populate('restaurant', 'name onboarding');
        
        // Ensure correct restaurant name is shown
        if (banner.restaurant) {
            banner.restaurant.name = banner.restaurant?.onboarding?.step1?.restaurantName || banner.restaurant?.name || 'Restaurant';
        }

        return successResponse(res, 200, 'Banner updated successfully', { banner });
    } catch (error) {
        console.error('Error updating banner:', error);
        return errorResponse(res, 500, 'Failed to update banner');
    }
};

export const getActiveRestaurants = async (req, res) => {
    try {
        let restaurants = await Restaurant.find({
            isActive: true,
            approvedAt: { $exists: true, $ne: null },
            isDeleted: { $ne: true }
        })
            .select('name _id onboarding')
            .lean();
            
        // Filter out incomplete restaurants (those without an onboarding name)
        restaurants = restaurants.filter(restaurant => 
            restaurant.onboarding?.step1?.restaurantName && 
            restaurant.onboarding.step1.restaurantName.trim() !== ''
        );
        
        // Map restaurants to include the correct name (from onboarding.step1.restaurantName or name field)
        const restaurantsWithCorrectName = restaurants.map(restaurant => ({
            _id: restaurant._id,
            name: restaurant?.onboarding?.step1?.restaurantName || restaurant?.name || `Restaurant ${restaurant._id?.toString().slice(-4) || ''}`
        }));
        
        return successResponse(res, 200, 'Restaurants retrieved successfully', { restaurants: restaurantsWithCorrectName });
    } catch (error) {
        console.error('Error fetching restaurants:', error);
        return errorResponse(res, 500, 'Failed to fetch restaurants');
    }
}

// ==================== DINING STORIES ====================

export const getAdminDiningStories = async (req, res) => {
    try {
        const stories = await DiningStory.find().sort({ createdAt: -1 }).lean();
        return successResponse(res, 200, 'Stories retrieved successfully', { stories });
    } catch (error) {
        console.error('Error fetching stories:', error);
        return errorResponse(res, 500, 'Failed to fetch stories');
    }
};

export const createDiningStory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return errorResponse(res, 400, 'Name is required');
        if (!req.file) return errorResponse(res, 400, 'Image is required');

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: 'appzeto/dining/stories',
            resource_type: 'image'
        });

        const story = new DiningStory({
            name,
            imageUrl: result.secure_url,
            cloudinaryPublicId: result.public_id
        });

        await story.save();

        return successResponse(res, 201, 'Story created successfully', { story });
    } catch (error) {
        console.error('Error creating story:', error);
        return errorResponse(res, 500, 'Failed to create story');
    }
};

export const deleteDiningStory = async (req, res) => {
    try {
        const { id } = req.params;
        const story = await DiningStory.findById(id);
        if (!story) return errorResponse(res, 404, 'Story not found');

        try {
            await cloudinary.uploader.destroy(story.cloudinaryPublicId);
        } catch (err) {
            console.error('Error deleting from Cloudinary:', err);
        }

        await DiningStory.findByIdAndDelete(id);
        return successResponse(res, 200, 'Story deleted successfully');
    } catch (error) {
        console.error('Error deleting story:', error);
        return errorResponse(res, 500, 'Failed to delete story');
    }
};

export const updateDiningStory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const story = await DiningStory.findById(id);
        if (!story) return errorResponse(res, 404, 'Story not found');

        if (name) story.name = name;

        if (req.file) {
            try {
                await cloudinary.uploader.destroy(story.cloudinaryPublicId);
            } catch (err) {
                console.error('Error deleting old image from Cloudinary:', err);
            }

            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'appzeto/dining/stories',
                resource_type: 'image'
            });

            story.imageUrl = result.secure_url;
            story.cloudinaryPublicId = result.public_id;
        }

        await story.save();

        return successResponse(res, 200, 'Story updated successfully', { story });
    } catch (error) {
        console.error('Error updating story:', error);
        return errorResponse(res, 500, 'Failed to update story');
    }
};
