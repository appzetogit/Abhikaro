/**
 * Bearing Calculation Utility (Backend)
 * Calculates the direction/heading angle (0-360 degrees) between two coordinates
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
 * @param {Object} prevLocation - Previous location {lat, lng} or {latitude, longitude}
 * @param {Object} currentLocation - Current location {lat, lng} or {latitude, longitude}
 * @returns {number} Bearing in degrees (0-360)
 */
export function calculateBearingFromLocations(prevLocation, currentLocation) {
  if (!prevLocation || !currentLocation) {
    return null; // Return null if no previous location
  }

  const lat1 = prevLocation.lat || prevLocation.latitude;
  const lng1 = prevLocation.lng || prevLocation.longitude;
  const lat2 = currentLocation.lat || currentLocation.latitude;
  const lng2 = currentLocation.lng || currentLocation.longitude;

  if (
    lat1 === undefined ||
    lng1 === undefined ||
    lat2 === undefined ||
    lng2 === undefined
  ) {
    return null;
  }

  return calculateBearing(lat1, lng1, lat2, lng2);
}
