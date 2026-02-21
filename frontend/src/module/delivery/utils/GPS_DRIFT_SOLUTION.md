# GPS Drift Solution - Enhanced Map Matching

## Overview

This solution provides **hyper-smooth, Rapido/Uber-like tracking** by eliminating GPS drift issues. The marker **never cuts through buildings** and always stays on the road polyline.

## Key Features

1. **Map Matching (Snap to Polyline)**: GPS coordinates are automatically snapped to the nearest point on the route polyline
2. **Path Interpolation**: Marker animates along polyline segments (not straight lines), following road curves
3. **Dynamic Bearing**: Bike icon rotates smoothly as it follows curves
4. **Off-Route Detection**: Automatically detects when driver is >50m off route and triggers re-routing
5. **60fps Animation**: Uses `requestAnimationFrame` for buttery smooth movement

## Core Math Functions

### 1. `projectPointOntoLineSegment(point, lineStart, lineEnd)`

Projects a GPS point onto a line segment and returns:
- `projectedPoint`: The closest point on the line segment
- `t`: Parameter (0-1) indicating position along segment
- `distance`: Distance from point to line segment in meters

**Use Case**: Find where GPS coordinate should be snapped on a road segment

### 2. `snapToPolyline(polyline, rawGPS, lastSegmentIndex, maxSnapDistance)`

Enhanced map matching with forward-only constraint:
- Searches forward from last known position (prevents backward movement)
- Finds closest point on polyline within `maxSnapDistance` (default 50m)
- Returns snapped position, segment index, and distance

**Use Case**: Snap raw GPS to route, ensuring marker only moves forward

### 3. `interpolateAlongPolyline(path, progress)`

Interpolates position along polyline path (not straight line):
- Takes array of points along the route
- Interpolates between segments following the curve
- Calculates bearing dynamically as marker moves

**Use Case**: Smooth animation that follows road curves

### 4. `detectOffRoute(rawGPS, polyline, threshold)`

Detects if driver is too far from route:
- Checks distance to all polyline segments
- Returns `isOffRoute: true` if distance > threshold (default 50m)
- Provides nearest point as fallback

**Use Case**: Trigger re-routing when driver goes off-route

## Usage Example

```javascript
import {
  snapToPolyline,
  detectOffRoute,
  PolylineAnimationController
} from '@/module/delivery/utils/enhancedMapMatching';

// 1. When socket receives new GPS coordinate
socket.on('location-update', (data) => {
  const rawGPS = { lat: data.lat, lng: data.lng };
  
  // 2. Detect off-route
  const offRouteCheck = detectOffRoute(rawGPS, polyline, 50);
  if (offRouteCheck.isOffRoute && offRouteCheck.distance > 100) {
    // Trigger re-route
    recalculateRoute(rawGPS, destination);
    return;
  }
  
  // 3. Snap GPS to polyline
  const lastSnap = lastSnappedPosition || {
    segmentIndex: 0,
    t: 0,
    snappedPoint: polyline[0]
  };
  
  const endSnap = snapToPolyline(
    polyline,
    rawGPS,
    lastSnap.segmentIndex,
    50 // max snap distance
  );
  
  // 4. Animate smoothly along polyline
  animationController.animate(lastSnap, endSnap, 2000);
  
  // 5. Update last position
  lastSnappedPosition = endSnap;
});
```

## Integration with Existing Code

The enhanced map matching is already integrated into `DeliveryTrackingMap.jsx`. The component:

1. **Automatically snaps GPS** to polyline using `snapToPolyline()`
2. **Detects off-route** scenarios and triggers re-routing
3. **Animates smoothly** along polyline using `PolylineAnimationController`
4. **Updates bearing** dynamically as marker follows curves

## Configuration

### Snap Distance Threshold
```javascript
const maxSnapDistance = 50; // meters
// GPS within 50m of route will be snapped
// Beyond 50m, marker uses nearest point but flags as off-route
```

### Off-Route Threshold
```javascript
const offRouteThreshold = 50; // meters
// Distance > 50m triggers off-route detection
// Distance > 100m triggers automatic re-routing
```

### Animation Duration
```javascript
const animationDuration = 2000; // milliseconds
// 2 seconds for smooth interpolation between GPS updates
// Adjust based on socket update frequency
```

## Performance

- **60fps Animation**: Uses `requestAnimationFrame` for smooth updates
- **Efficient Snapping**: Only searches forward segments (not entire polyline)
- **Cached Calculations**: Bearing calculated once per segment
- **Minimal Re-renders**: Only updates marker position, not entire map

## Troubleshooting

### Marker Still Cutting Through Buildings
- Ensure `routePolylinePointsRef.current` is populated before location updates
- Check that `snapToPolyline()` is being called (not using raw GPS directly)
- Verify polyline has sufficient points (should have 50+ points for smooth curves)

### Marker Not Moving Smoothly
- Increase animation duration (2000ms → 3000ms)
- Check that `PolylineAnimationController` is initialized
- Verify `requestAnimationFrame` is not being blocked

### Off-Route Detection Too Sensitive
- Increase threshold: `detectOffRoute(rawGPS, polyline, 100)` // 100m instead of 50m
- Adjust re-route trigger: `if (offRouteCheck.distance > 150)` // 150m instead of 100m

## Best Practices

1. **Always use snapped coordinates** - Never use raw GPS directly for marker position
2. **Forward-only movement** - Use `lastSegmentIndex` to prevent backward jumps
3. **Re-route on large drift** - If distance > 100m, recalculate route
4. **Smooth interpolation** - Always animate along polyline, not straight line
5. **Dynamic bearing** - Update rotation as marker moves along curves

## Technical Details

### Map Matching Algorithm
1. Project GPS point onto each polyline segment
2. Find segment with minimum distance
3. Constrain search to forward segments (from last position)
4. Return snapped point with segment index and progress (t)

### Path Interpolation
1. Extract path between start and end segments
2. Calculate total distance along path
3. Interpolate position based on progress (0-1)
4. Calculate bearing for current segment
5. Update marker position and rotation at 60fps

### Off-Route Detection
1. Calculate distance to all polyline segments
2. Find minimum distance
3. If distance > threshold, flag as off-route
4. If distance > re-route threshold, trigger new route calculation
