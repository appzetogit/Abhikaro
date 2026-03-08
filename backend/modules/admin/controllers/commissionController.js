import CommissionSettings from "../models/CommissionSettings.js";
import winston from "winston";
import { getCache, setCache, generateCacheKey, CACHE_TTL, invalidateCachePattern } from "../../../shared/utils/cache.js";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

// Get current commission settings (or create default if none exists)
export const getCommissionSettings = async (req, res) => {
  try {
    // Generate cache key
    const cacheKey = generateCacheKey('commissionSettings', 'latest');

    // Try to get from cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.status(200).json({ success: true, data: cached, cached: true });
    }

    let settings = await CommissionSettings.findOne().sort({ createdAt: -1 }).lean();

    if (!settings) {
      // Create default settings if none exist
      const newSettings = await CommissionSettings.create({
        qrCommission: { hotel: 10, user: 20, admin: 70 },
        directCommission: { admin: 30, restaurant: 70 },
      });
      settings = newSettings.toObject();
    }

    // Cache the settings
    await setCache(cacheKey, settings, CACHE_TTL.COMMISSION_SETTINGS);

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    logger.error("Error fetching commission settings:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update commission settings
export const updateCommissionSettings = async (req, res) => {
  try {
    const { qrCommission, directCommission } = req.body;

    // Validate totals
    if (qrCommission) {
      const qrTotal =
        (qrCommission.hotel || 0) +
        (qrCommission.user || 0) +
        (qrCommission.admin || 0);
      if (qrTotal !== 100) {
        return res.status(400).json({
          success: false,
          message: "QR Commission percentages must sum to 100%",
        });
      }
    }

    if (directCommission) {
      const directTotal =
        (directCommission.admin || 0) + (directCommission.restaurant || 0);
      if (directTotal !== 100) {
        return res.status(400).json({
          success: false,
          message: "Direct Commission percentages must sum to 100%",
        });
      }
    }

    // Create new settings version (immutability for history tracking)
    const newSettings = new CommissionSettings({
      qrCommission,
      directCommission,
      updatedBy: req.user.id,
    });

    await newSettings.save();

    // Invalidate commission settings cache
    await invalidateCachePattern('commissionSettings:*');

    res.status(200).json({
      success: true,
      message: "Commission settings updated successfully",
      data: newSettings,
    });
  } catch (error) {
    logger.error("Error updating commission settings:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
