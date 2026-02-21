/**
 * Enhanced Map Matching & GPS Drift Correction
 * 
 * Provides hyper-smooth, Rapido/Uber-like tracking experience:
 * - Snaps GPS coordinates to route polyline (map matching)
 * - Interpolates movement along polyline segments (not straight lines)
 * - Detects off-route scenarios and triggers re-routing
 * - Calculates dynamic bearing along curves
 */

import { calculateDistance, calculateBearing } from './liveTrackingPolyline';

/**
 * Find the closest point on a line segment (projection)
 * @param {Object} point - {lat, lng} Point to project
 * @param {Object} lineStart - {lat, lng} Start of line segment
 * @param {Object} lineEnd - {lat, lng} End of line segment
 * @returns {Object} {projectedPoint: {lat, lng}, t: number (0-1), distance: number}
 */
export function projectPointOntoLineSegment(point, lineStart, lineEnd) {
  const A = point.lat - lineStart.lat;
  const B = point.lng - lineStart.lng;
  const C = lineEnd.lat - lineStart.lat;
  const D = lineEnd.lng - lineStart.lng;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  let t = 0;
  if (lenSq !== 0) {
    t = Math.max(0, Math.min(1, dot / lenSq));
  }

  const projectedPoint = {
    lat: lineStart.lat + t * C,
    lng: lineStart.lng + t * D
  };

  const distance = calculateDistance(
    point.lat,
    point.lng,
    projectedPoint.lat,
    projectedPoint.lng
  );

  return {
    projectedPoint,
    t,
    distance
  };
}

/**
 * Enhanced Map Matching: Find closest point on polyline with forward-only constraint
 * This ensures the marker only moves forward, never backward
 * 
 * @param {Array<{lat: number, lng: number}>} polyline - Route polyline points
 * @param {Object} rawGPS - {lat, lng} Raw GPS coordinate from driver
 * @param {number} lastSegmentIndex - Last known segment index (for forward-only movement)
 * @param {number} maxSnapDistance - Maximum distance to snap (default 50m)
 * @returns {Object} {snappedPoint: {lat, lng}, segmentIndex: number, distance: number, isOffRoute: boolean}
 */
export function snapToPolyline(polyline, rawGPS, lastSegmentIndex = 0, maxSnapDistance = 50) {
  if (!polyline || polyline.length < 2) {
    return {
      snappedPoint: rawGPS,
      segmentIndex: 0,
      distance: Infinity,
      isOffRoute: true
    };
  }

  let minDistance = Infinity;
  let bestSegmentIndex = lastSegmentIndex;
  let bestProjection = null;

  // Search forward from last known position (forward-only constraint)
  // Also check a few segments behind in case GPS jumped slightly backward
  const searchStart = Math.max(0, lastSegmentIndex - 2);
  const searchEnd = Math.min(polyline.length - 1, lastSegmentIndex + 10);

  for (let i = searchStart; i < searchEnd; i++) {
    if (i >= polyline.length - 1) break;

    const segmentStart = polyline[i];
    const segmentEnd = polyline[i + 1];

    const projection = projectPointOntoLineSegment(rawGPS, segmentStart, segmentEnd);

    // Prefer forward segments (ahead of last position)
    const isForward = i >= lastSegmentIndex;
    const distancePenalty = isForward ? 0 : 10; // Penalize backward segments
    const adjustedDistance = projection.distance + distancePenalty;

    if (adjustedDistance < minDistance) {
      minDistance = adjustedDistance;
      bestSegmentIndex = i;
      bestProjection = projection;
    }
  }

  const isOffRoute = minDistance > maxSnapDistance;

  return {
    snappedPoint: bestProjection?.projectedPoint || rawGPS,
    segmentIndex: bestSegmentIndex,
    distance: minDistance,
    isOffRoute,
    t: bestProjection?.t || 0
  };
}

/**
 * Get points along polyline between two segment indices
 * Used for smooth interpolation along the route
 * 
 * @param {Array<{lat: number, lng: number}>} polyline - Route polyline
 * @param {number} startSegmentIndex - Starting segment index
 * @param {number} endSegmentIndex - Ending segment index
 * @param {number} startT - Progress along start segment (0-1)
 * @param {number} endT - Progress along end segment (0-1)
 * @returns {Array<{lat: number, lng: number}>} Points along the path
 */
export function getPathBetweenSegments(polyline, startSegmentIndex, endSegmentIndex, startT = 0, endT = 0) {
  if (!polyline || polyline.length < 2) return [];

  const path = [];

  // Add starting point (interpolated on start segment)
  if (startSegmentIndex < polyline.length - 1) {
    const startSeg = polyline[startSegmentIndex];
    const startSegEnd = polyline[startSegmentIndex + 1];
    const startPoint = {
      lat: startSeg.lat + startT * (startSegEnd.lat - startSeg.lat),
      lng: startSeg.lng + startT * (startSegEnd.lng - startSeg.lng)
    };
    path.push(startPoint);
  }

  // Add all intermediate points
  for (let i = startSegmentIndex + 1; i <= endSegmentIndex && i < polyline.length; i++) {
    path.push(polyline[i]);
  }

  // Add ending point (interpolated on end segment)
  if (endSegmentIndex < polyline.length - 1 && endT > 0) {
    const endSeg = polyline[endSegmentIndex];
    const endSegEnd = polyline[endSegmentIndex + 1];
    const endPoint = {
      lat: endSeg.lat + endT * (endSegEnd.lat - endSeg.lat),
      lng: endSeg.lng + endT * (endSegEnd.lng - endSeg.lng)
    };
    // Replace last point if it's the same segment
    if (endSegmentIndex === startSegmentIndex) {
      path[path.length - 1] = endPoint;
    } else {
      path.push(endPoint);
    }
  }

  return path;
}

/**
 * Interpolate position along polyline path (not straight line!)
 * This ensures the marker follows the road curves smoothly
 * 
 * @param {Array<{lat: number, lng: number}>} path - Points along the polyline path
 * @param {number} progress - Progress from 0 to 1
 * @returns {Object} {position: {lat, lng}, bearing: number, segmentIndex: number}
 */
export function interpolateAlongPolyline(path, progress) {
  if (!path || path.length === 0) {
    return { position: null, bearing: 0, segmentIndex: 0 };
  }

  if (path.length === 1) {
    return { position: path[0], bearing: 0, segmentIndex: 0 };
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const totalLength = path.length - 1;
  const targetPosition = clampedProgress * totalLength;
  const segmentIndex = Math.floor(targetPosition);
  const segmentProgress = targetPosition - segmentIndex;

  const clampedSegmentIndex = Math.min(segmentIndex, path.length - 2);
  const startPoint = path[clampedSegmentIndex];
  const endPoint = path[clampedSegmentIndex + 1];

  // Interpolate position along this segment
  const position = {
    lat: startPoint.lat + segmentProgress * (endPoint.lat - startPoint.lat),
    lng: startPoint.lng + segmentProgress * (endPoint.lng - startPoint.lng)
  };

  // Calculate bearing along this segment
  const bearing = calculateBearing(
    startPoint.lat,
    startPoint.lng,
    endPoint.lat,
    endPoint.lng
  );

  return {
    position,
    bearing,
    segmentIndex: clampedSegmentIndex
  };
}

/**
 * Calculate total distance along polyline path
 * @param {Array<{lat: number, lng: number}>} path - Path points
 * @returns {number} Total distance in meters
 */
export function calculatePathDistance(path) {
  if (!path || path.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 0; i < path.length - 1; i++) {
    totalDistance += calculateDistance(
      path[i].lat,
      path[i].lng,
      path[i + 1].lat,
      path[i + 1].lng
    );
  }
  return totalDistance;
}

/**
 * Off-Route Detection
 * Checks if driver is too far from the route and needs re-routing
 * 
 * @param {Object} rawGPS - {lat, lng} Raw GPS coordinate
 * @param {Array<{lat: number, lng: number}>} polyline - Route polyline
 * @param {number} threshold - Distance threshold in meters (default 50m)
 * @returns {Object} {isOffRoute: boolean, distance: number, nearestPoint: {lat, lng}}
 */
export function detectOffRoute(rawGPS, polyline, threshold = 50) {
  if (!polyline || polyline.length < 2) {
    return {
      isOffRoute: true,
      distance: Infinity,
      nearestPoint: rawGPS
    };
  }

  let minDistance = Infinity;
  let nearestPoint = polyline[0];

  // Check distance to all segments
  for (let i = 0; i < polyline.length - 1; i++) {
    const projection = projectPointOntoLineSegment(
      rawGPS,
      polyline[i],
      polyline[i + 1]
    );

    if (projection.distance < minDistance) {
      minDistance = projection.distance;
      nearestPoint = projection.projectedPoint;
    }
  }

  return {
    isOffRoute: minDistance > threshold,
    distance: minDistance,
    nearestPoint
  };
}

/**
 * Smooth Animation Controller for Polyline-Based Movement
 * Animates marker along polyline path (not straight line) with 60fps
 */
export class PolylineAnimationController {
  constructor(marker, polyline, onBearingUpdate = null) {
    this.marker = marker;
    this.polyline = polyline;
    this.onBearingUpdate = onBearingUpdate;
    this.animationFrameId = null;
    this.isAnimating = false;
    this.lastSegmentIndex = 0;
    this.lastT = 0;
  }

  /**
   * Animate marker from current position to target position along polyline
   * @param {Object} startSnap - Snapped start position {snappedPoint, segmentIndex, t}
   * @param {Object} endSnap - Snapped end position {snappedPoint, segmentIndex, t}
   * @param {number} duration - Animation duration in ms (default 2000ms)
   */
  animate(startSnap, endSnap, duration = 2000) {
    if (!this.marker || !this.polyline) return;

    // Cancel any ongoing animation
    this.cancel();

    // Get path between start and end along polyline
    const path = getPathBetweenSegments(
      this.polyline,
      startSnap.segmentIndex,
      endSnap.segmentIndex,
      startSnap.t,
      endSnap.t
    );

    if (path.length < 2) {
      // Direct update if path is too short
      this.marker.setPosition(endSnap.snappedPoint);
      const bearing = this.calculateBearingForSegment(endSnap.segmentIndex);
      this.updateBearing(bearing);
      return;
    }

    const startTime = performance.now();
    this.isAnimating = true;
    this.lastSegmentIndex = startSnap.segmentIndex;
    this.lastT = startSnap.t;

    const animate = (currentTime) => {
      if (!this.isAnimating) return;

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic for natural deceleration)
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      // Interpolate along polyline path (not straight line!)
      const interpolated = interpolateAlongPolyline(path, easedProgress);

      if (interpolated.position) {
        // Update marker position
        this.marker.setPosition(interpolated.position);

        // Update bearing dynamically as marker moves along curve
        this.updateBearing(interpolated.bearing);

        // Update last known position
        this.lastSegmentIndex = interpolated.segmentIndex;
      }

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        // Animation complete - ensure final position
        this.marker.setPosition(endSnap.snappedPoint);
        const finalBearing = this.calculateBearingForSegment(endSnap.segmentIndex);
        this.updateBearing(finalBearing);
        this.lastSegmentIndex = endSnap.segmentIndex;
        this.lastT = endSnap.t;
        this.isAnimating = false;
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Calculate bearing for a specific segment
   */
  calculateBearingForSegment(segmentIndex) {
    if (!this.polyline || segmentIndex >= this.polyline.length - 1) {
      return 0;
    }

    const start = this.polyline[segmentIndex];
    const end = this.polyline[segmentIndex + 1];

    return calculateBearing(start.lat, start.lng, end.lat, end.lng);
  }

  /**
   * Update marker bearing (rotation)
   */
  updateBearing(bearing) {
    if (this.onBearingUpdate) {
      this.onBearingUpdate(bearing);
    }
  }

  /**
   * Cancel ongoing animation
   */
  cancel() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.isAnimating = false;
  }

  /**
   * Update polyline (when route changes)
   */
  updatePolyline(newPolyline) {
    this.polyline = newPolyline;
    this.lastSegmentIndex = 0;
    this.lastT = 0;
  }
}
