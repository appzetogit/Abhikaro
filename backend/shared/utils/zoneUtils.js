/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

/**
 * Check if a point is within a zone polygon using ray casting algorithm
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Array} zoneCoordinates - Zone coordinates array of {latitude, longitude} or [longitude, latitude]
 * @returns {boolean}
 */
export function isPointInZone(lat, lng, zoneCoordinates) {
  if (!zoneCoordinates || !Array.isArray(zoneCoordinates) || zoneCoordinates.length < 3) return false;
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return false;

  const latNum = Number(lat);
  const lngNum = Number(lng);

  let inside = false;
  for (let i = 0, j = zoneCoordinates.length - 1; i < zoneCoordinates.length; j = i++) {
    const coordI = zoneCoordinates[i];
    const coordJ = zoneCoordinates[j];

    const xi = Array.isArray(coordI)
      ? Number(coordI[1])
      : (typeof coordI === 'object' && coordI !== null
          ? Number(coordI.latitude ?? coordI.lat)
          : null);
    const yi = Array.isArray(coordI)
      ? Number(coordI[0])
      : (typeof coordI === 'object' && coordI !== null
          ? Number(coordI.longitude ?? coordI.lng)
          : null);

    const xj = Array.isArray(coordJ)
      ? Number(coordJ[1])
      : (typeof coordJ === 'object' && coordJ !== null
          ? Number(coordJ.latitude ?? coordJ.lat)
          : null);
    const yj = Array.isArray(coordJ)
      ? Number(coordJ[0])
      : (typeof coordJ === 'object' && coordJ !== null
          ? Number(coordJ.longitude ?? coordJ.lng)
          : null);

    if (xi === null || yi === null || xj === null || yj === null ||
        isNaN(xi) || isNaN(yi) || isNaN(xj) || isNaN(yj)) continue;

    const intersect = ((yi > lngNum) !== (yj > lngNum)) &&
                     (latNum < ((xj - xi) * (lngNum - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

