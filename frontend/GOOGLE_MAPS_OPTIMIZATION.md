# Google Maps API Optimization - बिलिंग कम करने के लिए

## समस्या (Problem)
Google Maps API का बिल ज्यादा आ रहा था क्योंकि:
1. Directions API बार-बार call हो रहा था (हर location update पर)
2. Geocoding API calls cache नहीं हो रहे थे
3. Places API calls बिना cache के हो रहे थे
4. Rate limiting नहीं थी
5. Duplicate API calls हो रहे थे

## समाधान (Solution)

### 1. Global API Cache Utility (`googleMapsApiCache.js`)
- **In-memory caching**: Fast access के लिए
- **localStorage caching**: Geocoding और Places API के लिए persistent cache (24 hours)
- **Rate limiting**: 
  - Geocoding: Max 10 calls/minute
  - Directions: Max 5 calls/minute
  - Places: Max 5 calls/minute
- **Cache TTL**:
  - Geocoding: 24 hours (addresses don't change often)
  - Directions: 10 minutes (routes can change)
  - Places: 24 hours (places don't change often)

### 2. Directions API Optimization
**Files Modified:**
- `GoogleMapsTracking.jsx`
- `DeliveryTrackingMap.jsx`

**Changes:**
- ✅ Cache check before API call
- ✅ Rate limit check
- ✅ Throttling increased: 5 seconds → 10 seconds
- ✅ Movement threshold increased: 50m → 100m (significant movement only)
- ✅ Results cached for 10 minutes

### 3. Geocoding API Optimization
**File Modified:**
- `useLocation.jsx`

**Changes:**
- ✅ Cache check before API call
- ✅ Rate limit check (max 10 calls/minute)
- ✅ Results cached for 24 hours
- ✅ localStorage persistence for offline access

### 4. Places API Optimization
**File Modified:**
- `useLocation.jsx`

**Changes:**
- ✅ Cache check before API call
- ✅ Rate limit check (max 5 calls/minute)
- ✅ Results cached for 24 hours
- ✅ localStorage persistence

## Expected Savings (अनुमानित बचत)

### Before Optimization:
- **Directions API**: ~100-200 calls/hour (live tracking में)
- **Geocoding API**: ~50-100 calls/hour (location changes पर)
- **Places API**: ~20-50 calls/hour

### After Optimization:
- **Directions API**: ~5-10 calls/hour (90% reduction)
  - Cache hit rate: ~90%
  - Only called on significant movement (>100m)
- **Geocoding API**: ~2-5 calls/hour (95% reduction)
  - Cache hit rate: ~95%
  - 24-hour cache means same location = 0 API calls
- **Places API**: ~1-3 calls/hour (95% reduction)
  - Cache hit rate: ~95%

### Total Estimated Savings:
- **Before**: ~170-350 API calls/hour
- **After**: ~8-18 API calls/hour
- **Reduction**: **~95% API calls कम हो गए**

## Usage (कैसे Use करें)

### Cache Statistics देखने के लिए:
```javascript
import { getCacheStats } from '@/lib/utils/googleMapsApiCache.js';

const stats = getCacheStats();
console.log('Cache stats:', stats);
// Output: { geocoding: 50, directions: 20, places: 30, total: 100 }
```

### Cache Clear करने के लिए:
```javascript
import { clearCache } from '@/lib/utils/googleMapsApiCache.js';

// Clear specific cache
clearCache('geocoding');

// Clear all caches
clearCache();
```

## Best Practices (सर्वोत्तम प्रथाएं)

1. **Don't clear cache unnecessarily** - Cache automatically expires
2. **Monitor rate limits** - Check console warnings for rate limit messages
3. **Cache is automatic** - No code changes needed in components
4. **localStorage cleanup** - Automatically keeps last 200 entries

## Technical Details

### Cache Key Generation:
- **Geocoding**: `geocoding_{lat_rounded}_{lng_rounded}` (4 decimal places = ~11m precision)
- **Directions**: `directions_{origin_lat}_{origin_lng}_{dest_lat}_{dest_lng}` (4 decimal places)
- **Places**: `places_{lat}_{lng}_{radius}` (4 decimal places)

### Cache Storage:
- **In-memory**: Fast access, cleared on page refresh
- **localStorage**: Persistent, survives page refresh (only for geocoding & places)

## Monitoring (निगरानी)

Console में देखें:
- `✅ Using cached [type] result` - Cache hit
- `⚠️ [type] API rate limit reached` - Rate limit exceeded
- `✅ Loaded Google Maps API cache from localStorage` - Cache loaded on page load

## Notes (नोट्स)

1. Cache automatically expires based on TTL
2. Rate limits reset every minute
3. localStorage cache is cleaned automatically (keeps last 200 entries)
4. All optimizations are backward compatible - no breaking changes
