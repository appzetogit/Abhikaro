import RestaurantCategory from '../models/RestaurantCategory.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Get all categories for a restaurant
 * GET /api/restaurant/categories
 */
export const getCategories = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant?._id || req.restaurant?.id;
    
    if (!restaurantId) {
      return errorResponse(res, 401, 'Restaurant not authenticated');
    }

    const categories = await RestaurantCategory.find({ 
      restaurant: restaurantId,
      isActive: true 
    })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return successResponse(res, 200, 'Categories retrieved successfully', {
      categories
    });
  } catch (error) {
    logger.error(`Error fetching categories: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch categories');
  }
});

/**
 * Get all categories including inactive (for admin)
 * GET /api/restaurant/categories/all
 */
export const getAllCategories = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant?._id || req.restaurant?.id;
    
    if (!restaurantId) {
      return errorResponse(res, 401, 'Restaurant not authenticated');
    }

    const categories = await RestaurantCategory.find({ 
      restaurant: restaurantId 
    })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return successResponse(res, 200, 'Categories retrieved successfully', {
      categories
    });
  } catch (error) {
    logger.error(`Error fetching all categories: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch categories');
  }
});

/**
 * Create a new category
 * POST /api/restaurant/categories
 */
export const createCategory = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant?._id || req.restaurant?.id;
    
    if (!restaurantId) {
      return errorResponse(res, 401, 'Restaurant not authenticated');
    }

    const { name, description, order, icon, color } = req.body;

    if (!name || !name.trim()) {
      return errorResponse(res, 400, 'Category name is required');
    }

    // Check if category with same name already exists
    const existingCategory = await RestaurantCategory.findOne({
      restaurant: restaurantId,
      name: name.trim(),
    });

    if (existingCategory) {
      return errorResponse(res, 400, 'Category with this name already exists');
    }

    // Get the highest order number
    const maxOrder = await RestaurantCategory.findOne({ restaurant: restaurantId })
      .sort({ order: -1 })
      .select('order')
      .lean();

    const newCategory = await RestaurantCategory.create({
      restaurant: restaurantId,
      name: name.trim(),
      description: description?.trim() || '',
      order: order !== undefined ? order : (maxOrder?.order || 0) + 1,
      icon: icon || '',
      color: color || '#000000',
      isActive: true,
    });

    return successResponse(res, 201, 'Category created successfully', {
      category: newCategory
    });
  } catch (error) {
    logger.error(`Error creating category: ${error.message}`);
    
    if (error.name === 'ValidationError') {
      return errorResponse(res, 400, error.message);
    }
    
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Category with this name already exists');
    }
    
    return errorResponse(res, 500, 'Failed to create category');
  }
});

/**
 * Update a category
 * PUT /api/restaurant/categories/:id
 */
export const updateCategory = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant?._id || req.restaurant?.id;
    const { id } = req.params;
    const { name, description, order, icon, color, isActive } = req.body;

    if (!restaurantId) {
      return errorResponse(res, 401, 'Restaurant not authenticated');
    }

    const category = await RestaurantCategory.findOne({
      _id: id,
      restaurant: restaurantId,
    });

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    // Check if new name conflicts with existing category
    if (name && name.trim() !== category.name) {
      const existingCategory = await RestaurantCategory.findOne({
        restaurant: restaurantId,
        name: name.trim(),
        _id: { $ne: id },
      });

      if (existingCategory) {
        return errorResponse(res, 400, 'Category with this name already exists');
      }
    }

    // Update fields
    if (name !== undefined) category.name = name.trim();
    if (description !== undefined) category.description = description?.trim() || '';
    if (order !== undefined) category.order = order;
    if (icon !== undefined) category.icon = icon;
    if (color !== undefined) category.color = color;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();

    return successResponse(res, 200, 'Category updated successfully', {
      category
    });
  } catch (error) {
    logger.error(`Error updating category: ${error.message}`);
    
    if (error.name === 'ValidationError') {
      return errorResponse(res, 400, error.message);
    }
    
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Category with this name already exists');
    }
    
    return errorResponse(res, 500, 'Failed to update category');
  }
});

/**
 * Delete a category
 * DELETE /api/restaurant/categories/:id
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant?._id || req.restaurant?.id;
    const { id } = req.params;

    if (!restaurantId) {
      return errorResponse(res, 401, 'Restaurant not authenticated');
    }

    const category = await RestaurantCategory.findOne({
      _id: id,
      restaurant: restaurantId,
    });

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    // Check if category has items
    if (category.itemCount > 0) {
      return errorResponse(res, 400, 'Cannot delete category with items. Please remove all items first or deactivate the category.');
    }

    await RestaurantCategory.deleteOne({ _id: id });

    return successResponse(res, 200, 'Category deleted successfully');
  } catch (error) {
    logger.error(`Error deleting category: ${error.message}`);
    return errorResponse(res, 500, 'Failed to delete category');
  }
});

/**
 * Reorder categories
 * PUT /api/restaurant/categories/reorder
 */
export const reorderCategories = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant?._id || req.restaurant?.id;
    const { categories } = req.body; // Array of { id, order }

    if (!restaurantId) {
      return errorResponse(res, 401, 'Restaurant not authenticated');
    }

    if (!Array.isArray(categories)) {
      return errorResponse(res, 400, 'Categories array is required');
    }

    // Update all categories in a transaction
    const updatePromises = categories.map(({ id, order }) =>
      RestaurantCategory.updateOne(
        { _id: id, restaurant: restaurantId },
        { order }
      )
    );

    await Promise.all(updatePromises);

    return successResponse(res, 200, 'Categories reordered successfully');
  } catch (error) {
    logger.error(`Error reordering categories: ${error.message}`);
    return errorResponse(res, 500, 'Failed to reorder categories');
  }
});

