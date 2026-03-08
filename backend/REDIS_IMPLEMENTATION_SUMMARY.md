# Redis Implementation Summary

## Overview
Redis caching has been implemented across all critical modules to reduce database load by 60-70% and improve API response times.

---

## Modules with Redis Caching

### 1. Restaurant Module
**File**: `modules/restaurant/controllers/restaurantController.js`
- ✅ `getRestaurants` - Restaurant list with filters (5 min TTL)
- ✅ `getRestaurantById` - Restaurant details (10 min TTL)
- **Cache Invalidation**: When restaurant is updated/deleted

**File**: `modules/restaurant/controllers/menuController.js`
- ✅ `getMenuByRestaurantId` - Menu items for a restaurant (30 min TTL)
- **Cache Invalidation**: When menu is updated

---

### 2. User Module
**File**: `modules/user/controllers/userController.js`
- ✅ `getUserAddresses` - User addresses (15 min TTL)
- **Cache Invalidation**: When address is added/updated/deleted

---

### 3. Admin Module

#### Categories
**File**: `modules/admin/controllers/categoryController.js`
- ✅ `getPublicCategories` - Public categories list (30 min TTL)
- ✅ `getCategories` - Admin categories with filters (30 min TTL)
- **Cache Invalidation**: When category is created/updated/deleted/status changed/priority changed

#### Zones
**File**: `modules/admin/controllers/zoneController.js`
- ✅ `getZones` - All zones with filters (30 min TTL)
- ✅ `detectUserZone` - Zone detection by coordinates (30 min TTL)
- **Cache Invalidation**: When zone is created/updated/deleted

#### Commission Settings
**File**: `modules/admin/controllers/commissionController.js`
- ✅ `getCommissionSettings` - Latest commission settings (1 hour TTL)
- **Cache Invalidation**: When commission settings are updated

---

### 4. Hotel Module
**File**: `modules/hotel/controllers/hotelPublicController.js`
- ✅ `getHotelByHotelId` - Hotel details (10 min TTL)
- ✅ `getAllHotels` - All active hotels (5 min TTL)
- **Cache Invalidation**: When hotel is updated/deleted

---

### 5. Order Module

#### Fee Settings
**File**: `modules/order/services/orderCalculationService.js`
- ✅ `getFeeSettings` - Active fee settings (1 hour TTL)
- Used in: `calculateDeliveryFee`, `calculateOrderPricing`

#### Order Settlement
**File**: `modules/order/services/orderSettlementService.js`
- ✅ Fee settings caching (1 hour TTL)
- Reduces database queries during settlement calculations

---

## Cache TTL Configuration

**File**: `shared/utils/cache.js`

```javascript
export const CACHE_TTL = {
  RESTAURANT_LIST: 300,        // 5 minutes
  RESTAURANT_DETAILS: 600,     // 10 minutes
  USER_PROFILE: 900,           // 15 minutes
  ORDER_STATUS: 60,            // 1 minute
  MENU_ITEMS: 1800,            // 30 minutes
  STATIC_DATA: 3600,           // 1 hour
  CATEGORIES: 1800,            // 30 minutes
  ZONE_DATA: 1800,             // 30 minutes
  FEE_SETTINGS: 3600,          // 1 hour
  COMMISSION_SETTINGS: 3600,   // 1 hour
  BUSINESS_SETTINGS: 3600,    // 1 hour
};
```

---

## Cache Invalidation Strategy

### Pattern-Based Invalidation
When data is updated, related cache keys are invalidated using patterns:

```javascript
// Example: Invalidate all menu caches for a restaurant
await invalidateCachePattern(`menu:${restaurantId}*`);

// Example: Invalidate all category caches
await invalidateCachePattern('categories:*');

// Example: Invalidate user addresses
await invalidateCachePattern(`userAddresses:${userId}*`);
```

### Automatic Invalidation Points
1. **Restaurant Updates**: Invalidates restaurant list and details cache
2. **Menu Updates**: Invalidates menu cache for that restaurant
3. **Category Changes**: Invalidates all category caches
4. **Zone Changes**: Invalidates zone detection and list caches
5. **Address Changes**: Invalidates user address cache
6. **Settings Updates**: Invalidates fee/commission settings cache

---

## Cache Key Naming Convention

```
{module}:{type}:{identifier}:{params...}
```

**Examples**:
- `restaurant:list:lat:28.6139:lng:77.2090:page:1`
- `restaurant:details:restaurantId123`
- `menu:restaurantId123`
- `categories:public`
- `categories:admin:limit:100:offset:0:search:null`
- `zones:all:page:1:limit:50`
- `zoneDetect:28.6139:77.2090`
- `userAddresses:userId123`
- `feeSettings:active`
- `commissionSettings:latest`
- `hotel:public:hotelId123`
- `hotels:all:active`
```

---

## Performance Impact

### Expected Improvements:
- **Database Load**: Reduced by 60-70%
- **API Response Time**: 50-80% faster for cached endpoints
- **Concurrent User Capacity**: 2-3x increase
- **Cache Hit Ratio Target**: > 80%

### Monitoring:
- Check cache hit rates via `/api/metrics/performance`
- Monitor Redis memory usage
- Track cache invalidation frequency

---

## Redis Usage Beyond Caching

### 1. Rate Limiting
**File**: `shared/middleware/redisRateLimit.js`
- IP-based rate limiting
- User-based rate limiting
- Role-based tiered limits (admin, restaurant, delivery, user)

### 2. Bull Queues
**File**: `shared/queues/index.js`
- Order processing queue
- Notification queue
- Email queue
- Payment processing queue

### 3. Socket.IO Adapter (Future)
- Enable horizontal scaling for real-time features
- Broadcast messages across multiple server instances

---

## Testing Redis Implementation

### 1. Test Cache Hit:
```bash
# First request (cache miss)
curl http://your-api/api/restaurant

# Second request (cache hit - should be faster)
curl http://your-api/api/restaurant
```

### 2. Check Cache Keys:
```bash
redis-cli -a YOUR_PASSWORD KEYS "*restaurant*"
redis-cli -a YOUR_PASSWORD GET "restaurant:list:..."
```

### 3. Test Cache Invalidation:
```bash
# Update a restaurant
curl -X PUT http://your-api/api/admin/restaurant/123

# Check if cache is cleared
redis-cli -a YOUR_PASSWORD KEYS "*restaurant*"
```

### 4. Monitor Performance:
```bash
# Check metrics
curl http://your-api/api/metrics/performance

# Check health
curl http://your-api/api/metrics/health
```

---

## Next Steps

1. ✅ Redis caching implemented
2. ✅ Cache invalidation implemented
3. ✅ TTL configuration optimized
4. ⏳ Monitor cache hit rates in production
5. ⏳ Adjust TTLs based on usage patterns
6. ⏳ Set up Redis monitoring dashboard
7. ⏳ Configure Redis Sentinel for HA (if needed)

---

## Troubleshooting

### Cache Not Working?
1. Check Redis connection: `/api/metrics/health`
2. Verify Redis is running: `sudo systemctl status redis-server`
3. Check environment variables: `REDIS_ENABLED=true`
4. Check backend logs for Redis errors

### High Memory Usage?
1. Check Redis memory: `redis-cli INFO memory`
2. Review cache TTLs (reduce if too long)
3. Check for memory leaks in cache keys
4. Adjust `maxmemory-policy` in redis.conf

### Cache Invalidation Not Working?
1. Check cache key patterns match
2. Verify `invalidateCachePattern` is called after updates
3. Check Redis connection is active
4. Review backend logs for invalidation errors
