// Normalize distance to kilometers from either numeric km or string like "850 m" / "1.4 km"
// Returns number (km) or null when unknown
export function extractDistanceKm(input) {
  if (!input) return null;

  // Prefer explicit numeric value (already in km)
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }

  // If object with possible fields
  if (typeof input === 'object') {
    const { distanceInKm, distance } = input;
    if (typeof distanceInKm === 'number' && Number.isFinite(distanceInKm)) {
      return distanceInKm;
    }
    if (distance != null) {
      return extractDistanceKm(distance);
    }
  }

  // If string like "1.2 km" or "850 m"
  if (typeof input === 'string') {
    const trimmed = input.trim().toLowerCase();
    // meters
    if (trimmed.endsWith('m')) {
      const num = parseFloat(trimmed.replace(/[^\d.]/g, ''));
      return Number.isFinite(num) ? num / 1000 : null;
    }
    // kilometers
    if (trimmed.endsWith('km') || /\d/.test(trimmed)) {
      const num = parseFloat(trimmed.replace(/[^\d.]/g, ''));
      return Number.isFinite(num) ? num : null;
    }
  }

  return null;
}

// Compute distance between two lat/lng points in kilometers (Haversine)
export function distanceBetweenKm(lat1, lng1, lat2, lng2) {
  const valid =
    [lat1, lng1, lat2, lng2].every(
      (v) => typeof v === 'number' && Number.isFinite(v)
    );
  if (!valid) return null;
  const R = 6371; // km
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
