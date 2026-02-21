/**
 * Smooth Animation Utility
 * Provides linear interpolation (lerp) and smooth marker animation
 * Prevents marker "jumping" by smoothly transitioning between positions
 */

/**
 * Linear interpolation between two values
 * @param {number} start - Starting value
 * @param {number} end - Ending value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(start, end, t) {
  return start + (end - start) * t;
}

/**
 * Linear interpolation for coordinates
 * @param {Object} start - Starting coordinate {lat, lng}
 * @param {Object} end - Ending coordinate {lat, lng}
 * @param {number} t - Interpolation factor (0-1)
 * @returns {Object} Interpolated coordinate {lat, lng}
 */
export function lerpCoordinate(start, end, t) {
  return {
    lat: lerp(start.lat, end.lat, t),
    lng: lerp(start.lng, end.lng, t),
  };
}

/**
 * Easing function for smooth acceleration/deceleration
 * @param {number} t - Time factor (0-1)
 * @returns {number} Eased value
 */
export function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Smooth Animation Controller
 * Manages smooth marker animation using requestAnimationFrame
 */
export class SmoothAnimationController {
  constructor({
    onUpdate,
    duration = 1000, // Animation duration in ms
    easing = easeInOutCubic,
  }) {
    this.onUpdate = onUpdate;
    this.duration = duration;
    this.easing = easing;
    this.animationFrameId = null;
    this.startTime = null;
    this.startPosition = null;
    this.targetPosition = null;
    this.startBearing = null;
    this.targetBearing = null;
    this.isAnimating = false;
  }

  /**
   * Start smooth animation from current position to target position
   * @param {Object} startPosition - Starting position {lat, lng}
   * @param {Object} targetPosition - Target position {lat, lng}
   * @param {number} startBearing - Starting bearing (0-360)
   * @param {number} targetBearing - Target bearing (0-360)
   */
  animate(startPosition, targetPosition, startBearing = 0, targetBearing = 0) {
    // Cancel any existing animation
    this.cancel();

    this.startPosition = startPosition;
    this.targetPosition = targetPosition;
    this.startBearing = startBearing;
    this.targetBearing = targetBearing;
    this.startTime = performance.now();
    this.isAnimating = true;

    this.tick();
  }

  /**
   * Animation tick function
   */
  tick = () => {
    if (!this.isAnimating) return;

    const currentTime = performance.now();
    const elapsed = currentTime - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1); // Clamp to 0-1

    // Apply easing
    const easedProgress = this.easing(progress);

    // Interpolate position
    const currentPosition = lerpCoordinate(
      this.startPosition,
      this.targetPosition,
      easedProgress
    );

    // Interpolate bearing (handle wrap-around)
    const currentBearing = this.lerpBearing(
      this.startBearing,
      this.targetBearing,
      easedProgress
    );

    // Call update callback
    if (this.onUpdate) {
      this.onUpdate(currentPosition, currentBearing, progress);
    }

    // Continue animation if not complete
    if (progress < 1) {
      this.animationFrameId = requestAnimationFrame(this.tick);
    } else {
      this.isAnimating = false;
      // Ensure final position is set exactly
      if (this.onUpdate) {
        this.onUpdate(this.targetPosition, this.targetBearing, 1);
      }
    }
  };

  /**
   * Smooth bearing interpolation (handles 360/0 wrap-around)
   */
  lerpBearing(current, target, t) {
    let diff = target - current;

    // Normalize difference to shortest path (-180 to 180)
    if (diff > 180) {
      diff -= 360;
    } else if (diff < -180) {
      diff += 360;
    }

    // Interpolate
    let newBearing = current + diff * t;

    // Normalize to 0-360
    newBearing = (newBearing + 360) % 360;

    return newBearing;
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
   * Check if animation is currently running
   */
  getIsAnimating() {
    return this.isAnimating;
  }
}

/**
 * Create a smooth animation controller instance
 * @param {Object} options - Configuration options
 * @returns {SmoothAnimationController} Animation controller instance
 */
export function createSmoothAnimationController(options) {
  return new SmoothAnimationController(options);
}
