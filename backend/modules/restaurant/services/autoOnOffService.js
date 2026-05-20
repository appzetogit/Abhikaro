import Restaurant from '../models/Restaurant.js';

/**
 * Automatically open or close restaurants based on their scheduled timings.
 * Runs every minute via cron job.
 */
export const processAutoOnOffRestaurants = async () => {
  try {
    const now = new Date();
    
    // Get current day of week in Asia/Kolkata timezone
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' }); // "Mon", "Tue", etc.

    // Extract hours and minutes in Asia/Kolkata timezone
    let currentHour;
    let currentMinute;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23'
      });
      const parts = formatter.formatToParts(now);
      const partValues = {};
      for (const part of parts) {
        partValues[part.type] = part.value;
      }
      currentHour = parseInt(partValues.hour, 10);
      currentMinute = parseInt(partValues.minute, 10);
    } catch (e) {
      // Fallback in case of environment-specific Intl exceptions
      const tzNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      currentHour = tzNow.getHours();
      currentMinute = tzNow.getMinutes();
    }

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

      // 1. Check if current day is in openDays
      let isDayOpen = true;
      if (restaurant.openDays && Array.isArray(restaurant.openDays) && restaurant.openDays.length > 0) {
        isDayOpen = restaurant.openDays.some(day => {
          const dayAbbr = String(day).substring(0, 3);
          return dayAbbr.toLowerCase() === currentDay.toLowerCase();
        });
      }

      // 2. Parse timings (format: "HH:mm")
      const [openHour, openMinute] = openingTime.split(':').map(Number);
      const [closeHour, closeMinute] = closingTime.split(':').map(Number);

      if (Number.isFinite(openHour) && Number.isFinite(openMinute) && 
          Number.isFinite(closeHour) && Number.isFinite(closeMinute)) {
        
        const openingTimeInMinutes = openHour * 60 + openMinute;
        const closingTimeInMinutes = closeHour * 60 + closeMinute;

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
        } else if (shouldClose) {
          restaurant.isAcceptingOrders = false;
          await restaurant.save();
          closedCount++;
          console.log(`[Auto On/Off] Closed restaurant "${restaurant.name}" (${restaurant.restaurantId}) at ${closingTime} (IST)`);
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
