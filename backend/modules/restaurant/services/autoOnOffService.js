import Restaurant from '../models/Restaurant.js';

/**
 * Automatically open or close restaurants based on their scheduled timings.
 * Runs every minute via cron job.
 */
export const processAutoOnOffRestaurants = async () => {
  try {
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'short' }); // "Mon", "Tue", etc.
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
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

      let shouldBeOpen = false;

      if (isDayOpen) {
        // 2. Parse timings (format: "HH:mm")
        const [openHour, openMinute] = openingTime.split(':').map(Number);
        const [closeHour, closeMinute] = closingTime.split(':').map(Number);

        if (Number.isFinite(openHour) && Number.isFinite(openMinute) && 
            Number.isFinite(closeHour) && Number.isFinite(closeMinute)) {
          
          const openingTimeInMinutes = openHour * 60 + openMinute;
          const closingTimeInMinutes = closeHour * 60 + closeMinute;

          if (closingTimeInMinutes > openingTimeInMinutes) {
            // Normal case: same day (e.g. 09:00 to 22:00)
            shouldBeOpen = currentTimeInMinutes >= openingTimeInMinutes && currentTimeInMinutes <= closingTimeInMinutes;
          } else {
            // Overnight case: closing time is next day (e.g. 22:00 to 02:00)
            shouldBeOpen = currentTimeInMinutes >= openingTimeInMinutes || currentTimeInMinutes <= closingTimeInMinutes;
          }
        }
      }

      // 3. Update restaurant status if it doesn't match the schedule
      if (shouldBeOpen && !restaurant.isAcceptingOrders) {
        restaurant.isAcceptingOrders = true;
        await restaurant.save();
        openedCount++;
        console.log(`[Auto On/Off] Opened restaurant "${restaurant.name}" (${restaurant.restaurantId})`);
      } else if (!shouldBeOpen && restaurant.isAcceptingOrders) {
        restaurant.isAcceptingOrders = false;
        await restaurant.save();
        closedCount++;
        console.log(`[Auto On/Off] Closed restaurant "${restaurant.name}" (${restaurant.restaurantId})`);
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
