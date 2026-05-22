import Restaurant from '../models/Restaurant.js';
import { invalidateCachePattern } from '../../../shared/utils/cache.js';

/**
 * Automatically open or close restaurants based on their scheduled timings.
 * Runs every minute via cron job.
 */
/**
 * Parse standard time formats (e.g. "09:00 AM", "10:30 PM", "13:45", "4 AM")
 * to the number of minutes from midnight (0 to 1439).
 * Returns null if the format is invalid.
 */
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  
  const cleanStr = timeStr.trim().toUpperCase();
  // Match HH:MM with optional AM/PM
  const match = cleanStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) {
    // Try matching just hour (e.g. "4 AM" or "16")
    const hourOnlyMatch = cleanStr.match(/^(\d{1,2})\s*(AM|PM)?$/);
    if (hourOnlyMatch) {
      let hour = parseInt(hourOnlyMatch[1], 10);
      const ampm = hourOnlyMatch[2];
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      return hour * 60;
    }
    return null;
  }
  
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ampm = match[3];
  
  if (ampm === 'PM' && hour < 12) {
    hour += 12;
  } else if (ampm === 'AM' && hour === 12) {
    hour = 0;
  }
  
  if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
    return hour * 60 + minute;
  }
  return null;
};

/**
 * Automatically open or close restaurants based on their scheduled timings.
 * Runs every minute via cron job.
 */
export const processAutoOnOffRestaurants = async () => {
  try {
    const now = new Date();
    
    // Calculate current time in Asia/Kolkata (UTC + 5.5 hours) mathematically
    // to avoid locale/timezone parsing bugs on different server OS/environments.
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = days[istTime.getUTCDay()]; // "Mon", "Tue", etc.
    const currentHour = istTime.getUTCHours();
    const currentMinute = istTime.getUTCMinutes();

    const currentTimeInMinutes = currentHour * 60 + currentMinute;

    // Find all active restaurants with auto on/off enabled and timings configured
    const restaurants = await Restaurant.find({
      isActive: true,
      'deliveryTimings.isAutoOnOffEnabled': true,
      'deliveryTimings.openingTime': { $ne: null, $exists: true },
      'deliveryTimings.closingTime': { $ne: null, $exists: true }
    });

    let openedCount = 0;
    let closedCount = 0;

    // Helper to check if current time is within a 2-minute transition window from a target time.
    // We use a 2-minute window (e.g., targetTime and targetTime + 1 minute) to ensure the cron trigger 
    // is robust against minor scheduling delays, while respecting the owner's manual override 
    // outside of these transition points. Handles midnight wrapping correctly.
    const checkWindow = (targetTime) => {
      const diff = (currentTimeInMinutes - targetTime + 1440) % 1440;
      return diff >= 0 && diff < 2;
    };

    for (const restaurant of restaurants) {
      const { openingTime, closingTime } = restaurant.deliveryTimings;
      
      if (!openingTime || !closingTime) continue;

      // ──────────────────────────────────────────────────────────────────────────
      // Manual-Override Grace Window
      // If the owner manually changed the delivery status within the last 5 minutes,
      // skip auto-transitioning this restaurant entirely.
      // This prevents the auto-cron from immediately fighting the owner's intent
      // (e.g., owner sets offline at 1:44 PM which is exactly the opening time,
      //  cron runs within 2-min window and forces it back online).
      // ──────────────────────────────────────────────────────────────────────────
      const MANUAL_OVERRIDE_GRACE_MS = 5 * 60 * 1000; // 5 minutes
      if (restaurant.lastManualStatusChangeAt) {
        const msSinceManualChange = now.getTime() - new Date(restaurant.lastManualStatusChangeAt).getTime();
        if (msSinceManualChange < MANUAL_OVERRIDE_GRACE_MS) {
          console.log(`[Auto On/Off] Skipping "${restaurant.name}" — manual override ${Math.round(msSinceManualChange / 1000)}s ago (grace window: ${MANUAL_OVERRIDE_GRACE_MS / 1000}s)`);
          continue;
        }
      }

      // 1. Check if current day is in openDays
      let isDayOpen = true;
      if (restaurant.openDays && Array.isArray(restaurant.openDays) && restaurant.openDays.length > 0) {
        isDayOpen = restaurant.openDays.some(day => {
          const dayAbbr = String(day).substring(0, 3);
          return dayAbbr.toLowerCase() === currentDay.toLowerCase();
        });
      }

      // 2. Parse timings robustly (handles "09:00 AM", "10:00 PM", "13:45", etc.)
      const openingTimeInMinutes = parseTimeToMinutes(openingTime);
      const closingTimeInMinutes = parseTimeToMinutes(closingTime);

      if (openingTimeInMinutes !== null && closingTimeInMinutes !== null) {

        // 3. Smart Transition Logic
        // Transition to ON if: today is an open day, current time is in the opening window, and restaurant is OFF.
        const shouldOpen = isDayOpen && checkWindow(openingTimeInMinutes) && !restaurant.isAcceptingOrders;

        // Transition to OFF if: current time is in the closing window, and restaurant is ON.
        const shouldClose = checkWindow(closingTimeInMinutes) && restaurant.isAcceptingOrders;

        if (shouldOpen) {
          restaurant.isAcceptingOrders = true;
          await restaurant.save();
          openedCount++;
          console.log(`[Auto On/Off] Opened restaurant "${restaurant.name}" (${restaurant.restaurantId}) at ${openingTime} (IST)`);
          await emitRestaurantStatusChange(restaurant);
        } else if (shouldClose) {
          restaurant.isAcceptingOrders = false;
          await restaurant.save();
          closedCount++;
          console.log(`[Auto On/Off] Closed restaurant "${restaurant.name}" (${restaurant.restaurantId}) at ${closingTime} (IST)`);
          await emitRestaurantStatusChange(restaurant);
        }
      }
    }

    return {
      success: true,
      processed: restaurants.length,
      opened: openedCount,
      closed: closedCount,
      message: `Processed ${restaurants.length} restaurants. Opened: ${openedCount}, Closed: ${closedCount}`
    };
  } catch (error) {
    console.error('Error in processAutoOnOffRestaurants:', error);
    throw error;
  }
};

/**
 * Emit restaurant status change to all connected clients via Socket.IO
 * @param {Object} restaurant - Restaurant document
 */
const emitRestaurantStatusChange = async (restaurant) => {
  try {
    const serverModule = await import('../../../server.js');
    const io = serverModule.getIO ? serverModule.getIO() : null;
    if (io) {
      const restaurantNamespace = io.of('/restaurant');
      const rooms = [
        `restaurant:${restaurant._id.toString()}`,
        `restaurant:${restaurant.restaurantId}`
      ];
      
      const payload = {
        restaurantId: restaurant.restaurantId,
        restaurantMongoId: restaurant._id.toString(),
        isAcceptingOrders: restaurant.isAcceptingOrders
      };
      
      rooms.forEach(room => {
        restaurantNamespace.to(room).emit('restaurant_status_update', payload);
      });
      console.log(`[Auto On/Off Socket] Broadcasted status update to ${rooms.join(', ')}: isAcceptingOrders=${restaurant.isAcceptingOrders}`);
    }

    // Invalidate caches to ensure user discovery reflects the new status instantly
    try {
      await invalidateCachePattern('restaurants:*');
      await invalidateCachePattern(`restaurant:${restaurant._id.toString()}*`);
      await invalidateCachePattern(`restaurant:${restaurant.restaurantId}*`);
      if (restaurant.slug) {
        await invalidateCachePattern(`restaurant:${restaurant.slug}*`);
      }
      console.log(`[Cache Invalidation] Caches cleared for auto status update: ${restaurant.name}`);
    } catch (cacheErr) {
      console.error('Error invalidating caches for auto status update:', cacheErr);
    }
  } catch (error) {
    console.error('[Auto On/Off Socket] Error emitting status change:', error);
  }
};
