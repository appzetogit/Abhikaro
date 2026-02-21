/**
 * Bearing Calculation Utility
 * Calculates the direction/heading angle (0-360 degrees) between two coordinates
 * Used for rotating vehicle markers to face the direction of travel
 */

/**
 * Calculate bearing (heading angle) between two coordinates
 * @param {number} lat1 - Starting latitude
 * @param {number} lng1 - Starting longitude
 * @param {number} lat2 - Destination latitude
 * @param {number} lng2 - Destination longitude
 * @returns {number} Bearing in degrees (0-360), where 0 is North
 */
export function calculateBearing(lat1, lng1, lat2, lng2) {
  // Convert degrees to radians
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  // Calculate bearing using atan2
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  // Convert to degrees and normalize to 0-360
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  bearing = (bearing + 360) % 360; // Normalize to 0-360

  return bearing;
}

/**
 * Calculate bearing from previous location to current location
 * @param {Object} prevLocation - Previous location {lat, lng}
 * @param {Object} currentLocation - Current location {lat, lng}
 * @returns {number} Bearing in degrees (0-360)
 */
export function calculateBearingFromLocations(prevLocation, currentLocation) {
  if (!prevLocation || !currentLocation) {
    return 0; // Default to North if no previous location
  }

  return calculateBearing(
    prevLocation.lat,
    prevLocation.lng,
    currentLocation.lat,
    currentLocation.lng
  );
}

/**
 * Smooth bearing transition (handles 360/0 degree wrap-around)
 * @param {number} currentBearing - Current bearing (0-360)
 * @param {number} targetBearing - Target bearing (0-360)
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated bearing
 */
export function lerpBearing(currentBearing, targetBearing, t) {
  // Handle wrap-around (e.g., 350° to 10° should go through 0°, not backwards)
  let diff = targetBearing - currentBearing;

  // Normalize difference to shortest path (-180 to 180)
  if (diff > 180) {
    diff -= 360;
  } else if (diff < -180) {
    diff += 360;
  }

  // Interpolate
  let newBearing = currentBearing + diff * t;

  // Normalize to 0-360
  newBearing = (newBearing + 360) % 360;

  return newBearing;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @param {number} lat1 - Starting latitude
 * @param {number} lng1 - Starting longitude
 * @param {number} lat2 - Destination latitude
 * @param {number} lng2 - Destination longitude
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
