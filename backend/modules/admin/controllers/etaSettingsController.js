import ETASettings from '../models/ETASettings.js';
import etaCalculationService from '../../order/services/etaCalculationService.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';

/**
 * Get ETA Settings
 * GET /api/admin/eta-settings
 */
export const getETASettings = asyncHandler(async (req, res) => {
  try {
    const settings = await ETASettings.getSettings();
    return successResponse(res, 200, 'ETA settings retrieved successfully', settings);
  } catch (error) {
    console.error('Error fetching ETA settings:', error);
    return errorResponse(res, 500, 'Failed to fetch ETA settings');
  }
});

/**
 * Update ETA Settings
 * PUT /api/admin/eta-settings
 */
export const updateETASettings = asyncHandler(async (req, res) => {
  try {
    const {
      quantitySlabs,
      above100IncreasePercent,
      categoryOverheadPercent,
      additionalQuantityOverheadPercent,
      deliveryTimePerKm,
      minETALimit,
      maxETALimit,
      roundingMethod,
    } = req.body;

    let settings = await ETASettings.findOne();
    if (!settings) {
      settings = new ETASettings();
    }

    if (Array.isArray(quantitySlabs)) {
      settings.quantitySlabs = quantitySlabs.map((slab) => ({
        min: Number(slab.min),
        max: Number(slab.max),
        increasePercent: Number(slab.increasePercent),
      }));
    }

    if (above100IncreasePercent !== undefined) {
      settings.above100IncreasePercent = Number(above100IncreasePercent);
    }

    if (categoryOverheadPercent !== undefined) {
      settings.categoryOverheadPercent = Number(categoryOverheadPercent);
    }

    if (additionalQuantityOverheadPercent !== undefined) {
      settings.additionalQuantityOverheadPercent = Number(additionalQuantityOverheadPercent);
    }

    if (deliveryTimePerKm !== undefined) {
      settings.deliveryTimePerKm = Math.max(1, Number(deliveryTimePerKm));
    }

    if (minETALimit !== undefined) {
      settings.minETALimit = Math.max(1, Number(minETALimit));
    }

    if (maxETALimit !== undefined) {
      settings.maxETALimit = Math.max(10, Number(maxETALimit));
    }

    if (roundingMethod !== undefined && ['ceil', 'round', 'none'].includes(roundingMethod)) {
      settings.roundingMethod = roundingMethod;
    }

    settings.updatedBy = req.admin?._id || req.user?._id || null;
    await settings.save();

    return successResponse(res, 200, 'ETA settings updated successfully', settings);
  } catch (error) {
    console.error('Error updating ETA settings:', error);
    return errorResponse(res, 500, error.message || 'Failed to update ETA settings');
  }
});

/**
 * Simulate ETA Calculation (for Admin testing / verification)
 * POST /api/admin/eta-settings/simulate
 */
export const simulateETA = asyncHandler(async (req, res) => {
  try {
    const { items, distanceKm, customSettings } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return errorResponse(res, 400, 'At least one item is required for simulation');
    }

    const result = await etaCalculationService.calculateDynamicETA({
      items,
      distanceKm: distanceKm !== undefined ? Number(distanceKm) : 2.3,
      customSettings: customSettings || null,
    });

    return successResponse(res, 200, 'ETA simulation calculated successfully', result);
  } catch (error) {
    console.error('Error in simulateETA:', error);
    return errorResponse(res, 500, error.message || 'Simulation failed');
  }
});
