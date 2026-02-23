/**
 * Strict Polyline Tracking - Marker Always on Polyline Center
 * 
 * This ensures the delivery boy marker ALWAYS stays on the polyline center,
 * never deviates into buildings. GPS is only used to calculate progress,
 * not position.
 */

import { calculateDistance } from './liveTrackingPolyline';

/**
 * Calculate progress along polyline based on GPS position
 * GPS is used ONLY to determine how far along the route, not position
 * 
 * @param {Array<{lat: number, lng: number}>} polyline - Route polyline points
 * @param {Object} rawGPS - {lat, lng} Raw GPS coordinate
 * @param {number} lastProgress - Last known progress (0-1) for forward-only constraint
 * @returns {Object} {progress: number (0-1), segmentIndex: number, pointOnPolyline: {lat, lng}}
 */
export function calculateProgressOnPolyline(polyline, rawGPS, lastProgress = 0) {
  if (!polyline || polyline.length < 2) {
    return {
      progress: 0,
      segmentIndex: 0,
      pointOnPolyline: rawGPS
    };
  }

  // Find nearest point on polyline to GPS
  let minDistance = Infinity;
  let bestSegmentIndex = 0;
  let bestT = 0;

  // Search forward from last known position (forward-only)
  const lastSegmentIndex = Math.floor(lastProgress * (polyline.length - 1));
  const searchStart = Math.max(0, lastSegmentIndex - 1);
  const searchEnd = Math.min(polyline.length - 1, lastSegmentIndex + 15);

  for (let i = searchStart; i < searchEnd; i++) {
    if (i >= polyline.length - 1) break;

    const segmentStart = polyline[i];
    const segmentEnd = polyline[i + 1];

    // Project GPS onto this segment
    const A = rawGPS.lat - segmentStart.lat;
    const B = rawGPS.lng - segmentStart.lng;
    const C = segmentEnd.lat - segmentStart.lat;
    const D = segmentEnd.lng - segmentStart.lng;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let t = 0;

    if (lenSq !== 0) {
      t = Math.max(0, Math.min(1, dot / lenSq));
    }

    const projectedPoint = {
      lat: segmentStart.lat + t * C,
      lng: segmentStart.lng + t * D
    };

    const distance = calculateDistance(
      rawGPS.lat,
      rawGPS.lng,
      projectedPoint.lat,
      projectedPoint.lng
    );

    // Prefer forward segments
    const isForward = i >= lastSegmentIndex;
    const distancePenalty = isForward ? 0 : 20; // Heavy penalty for backward
    const adjustedDistance = distance + distancePenalty;

    if (adjustedDistance < minDistance) {
      minDistance = adjustedDistance;
      bestSegmentIndex = i;
      bestT = t;
    }
  }

  // Calculate cumulative distance to this point
  let distanceToPoint = 0;
  for (let i = 0; i < bestSegmentIndex; i++) {
    distanceToPoint += calculateDistance(
      polyline[i].lat,
      polyline[i].lng,
      polyline[i + 1].lat,
      polyline[i + 1].lng
    );
  }

  // Add distance within current segment
  const segmentStart = polyline[bestSegmentIndex];
  const segmentEnd = polyline[bestSegmentIndex + 1];
  const segmentDistance = calculateDistance(
    segmentStart.lat,
    segmentStart.lng,
    segmentEnd.lat,
    segmentEnd.lng
  );
  distanceToPoint += segmentDistance * bestT;

  // Calculate total route distance
  let totalDistance = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    totalDistance += calculateDistance(
      polyline[i].lat,
      polyline[i].lng,
      polyline[i + 1].lat,
      polyline[i + 1].lng
    );
  }

  // Calculate progress (0 to 1)
  let progress = totalDistance > 0 ? Math.min(1, Math.max(0, distanceToPoint / totalDistance)) : 0;

  // CRITICAL: Forward-only constraint - never go backward
  if (progress < lastProgress) {
    progress = lastProgress; // Keep last progress, don't go backward
  }

  // Get exact point on polyline at this progress (ALWAYS on polyline center)
  const pointOnPolyline = getPointOnPolylineByProgress(polyline, progress);

  return {
    progress,
    segmentIndex: bestSegmentIndex,
    pointOnPolyline,
    distance: minDistance
  };
}

/**
 * Get exact point on polyline at given progress
 * This ensures marker is ALWAYS on polyline center, never deviates
 * 
 * @param {Array<{lat: number, lng: number}>} polyline - Route polyline
 * @param {number} progress - Progress from 0 to 1
 * @returns {Object} {lat, lng} Exact point on polyline
 */
export function getPointOnPolylineByProgress(polyline, progress) {
  if (!polyline || polyline.length < 2) {
    return polyline[0] || { lat: 0, lng: 0 };
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const totalSegments = polyline.length - 1;
  const targetSegment = clampedProgress * totalSegments;
  const segmentIndex = Math.floor(targetSegment);
  const segmentProgress = targetSegment - segmentIndex;

  const clampedSegmentIndex = Math.min(segmentIndex, polyline.length - 2);
  const startPoint = polyline[clampedSegmentIndex];
  const endPoint = polyline[clampedSegmentIndex + 1];

  // Interpolate on this segment (exact center of polyline)
  return {
    lat: startPoint.lat + segmentProgress * (endPoint.lat - startPoint.lat),
    lng: startPoint.lng + segmentProgress * (endPoint.lng - startPoint.lng)
  };
}

/**
 * Calculate bearing for a point on polyline
 * 
 * @param {Array<{lat: number, lng: number}>} polyline - Route polyline
 * @param {number} progress - Progress from 0 to 1
 * @returns {number} Bearing in degrees (0-360)
 */
export function calculateBearingAtProgress(polyline, progress) {
  if (!polyline || polyline.length < 2) return 0;

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const totalSegments = polyline.length - 1;
  const targetSegment = clampedProgress * totalSegments;
  const segmentIndex = Math.floor(targetSegment);

  const clampedSegmentIndex = Math.min(segmentIndex, polyline.length - 2);
  const startPoint = polyline[clampedSegmentIndex];
  const endPoint = polyline[clampedSegmentIndex + 1];

  const dLng = (endPoint.lng - startPoint.lng) * Math.PI / 180;
  const lat1Rad = startPoint.lat * Math.PI / 180;
  const lat2Rad = endPoint.lat * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Strict Polyline Animation Controller
 * Marker ALWAYS stays on polyline center, never deviates
 */
export class StrictPolylineController {
  constructor(marker, polyline, onBearingUpdate = null) {
    this.marker = marker;
    this.polyline = polyline;
    this.onBearingUpdate = onBearingUpdate;
    this.animationFrameId = null;
    this.isAnimating = false;
    this.lastProgress = 0;
  }

  /**
   * Update marker position based on GPS
   * GPS is used only to calculate progress, position comes from polyline
   * 
   * @param {Object} rawGPS - {lat, lng} Raw GPS coordinate
   * @param {number} duration - Animation duration in ms
   */
  updateFromGPS(rawGPS, duration = 2000) {
    if (!this.marker || !this.polyline) return;

    // Calculate progress based on GPS (but don't use GPS position!)
    const progressData = calculateProgressOnPolyline(
      this.polyline,
      rawGPS,
      this.lastProgress
    );

    // Get exact point on polyline at this progress (ALWAYS on polyline center)
    const targetPoint = progressData.pointOnPolyline;
    const targetProgress = progressData.progress;

    // Get current point on polyline
    const currentPoint = getPointOnPolylineByProgress(this.polyline, this.lastProgress);

    // Animate from current polyline point to target polyline point
    this.animateAlongPolyline(currentPoint, targetPoint, this.lastProgress, targetProgress, duration);

    // Update last progress
    this.lastProgress = targetProgress;
  }

  /**
   * Animate marker along polyline from one progress to another
   * Marker stays EXACTLY on polyline center throughout animation
   */
  animateAlongPolyline(startPoint, endPoint, startProgress, endProgress, duration = 2000) {
    if (!this.marker) return;

    this.cancel();

    const startTime = performance.now();
    this.isAnimating = true;

    const animate = (currentTime) => {
      if (!this.isAnimating) return;

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      // Interpolate progress
      const currentProgress = startProgress + (endProgress - startProgress) * easedProgress;

      // Get exact point on polyline at this progress (ALWAYS on polyline center)
      const pointOnPolyline = getPointOnPolylineByProgress(this.polyline, currentProgress);

      // Update marker position (always on polyline)
      this.marker.setPosition(pointOnPolyline);

      // Calculate and update bearing
      const bearing = calculateBearingAtProgress(this.polyline, currentProgress);
      if (this.onBearingUpdate) {
        this.onBearingUpdate(bearing);
      }

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        // Animation complete
        this.marker.setPosition(endPoint);
        const finalBearing = calculateBearingAtProgress(this.polyline, endProgress);
        if (this.onBearingUpdate) {
          this.onBearingUpdate(finalBearing);
        }
        this.isAnimating = false;
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
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
    this.lastProgress = 0;
  }
}
