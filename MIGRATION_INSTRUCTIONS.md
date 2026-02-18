# Google Maps API Cost Reduction - Migration Instructions

## Overview
This migration eliminates 99% of Google Maps API costs by replacing Google Places API with MongoDB geospatial queries and removing reverse geocoding from live tracking.

## Pre-Migration Checklist

1. **Backup Database**: Create a backup of your MongoDB database before running migration
2. **Verify Schema**: Ensure you've deployed the updated Restaurant model with `geoLocation` field
3. **Test Environment**: Run migration on a test/staging environment first

## Step-by-Step Migration

### Step 1: Deploy Backend Changes
1. Deploy the updated `Restaurant.js` model (with `geoLocation` field and 2dsphere index)
2. Deploy the updated `restaurantController.js` (with geospatial queries)
3. Restart your backend server

### Step 2: Run Migration Script
```bash
cd Abhikaro/Backend
node scripts/migrateRestaurantGeoLocation.js
```

**Expected Output:**
```
🔄 Connecting to MongoDB...
✅ Connected to MongoDB
📊 Found X restaurants to migrate
📝 Migrated X restaurants...
✅ Migration completed!
   ✅ Migrated: X
   ⚠️  Skipped: 0
   ❌ Errors: 0
🔍 Verifying 2dsphere index...
✅ 2dsphere index exists and is ready for geospatial queries
✅ Disconnected from MongoDB
```

### Step 3: Verify Migration
Connect to MongoDB and verify:
```javascript
// Check if geoLocation field exists
db.restaurants.findOne({ "location.geoLocation": { $exists: true } })

// Check 2dsphere index
db.restaurants.getIndexes()
// Should see: { "location.geoLocation": "2dsphere" }

// Test geospatial query
db.restaurants.find({
  "location.geoLocation": {
    $near: {
      $geometry: { type: "Point", coordinates: [75.8842, 22.7282] },
      $maxDistance: 5000
    }
  }
}).limit(5)
```

### Step 4: Deploy Frontend Changes
1. Deploy updated `Home.jsx` (passes coordinates to backend)
2. Deploy updated `useLocation.jsx` (removed Places API, removed geocoding from live tracking)
3. Clear browser cache and test

### Step 5: Monitor API Usage
1. Check Google Cloud Console for API usage
2. Verify Places API calls are zero (or near zero)
3. Verify Geocoding API calls are minimal (only for manual address operations)

## Rollback Plan

If issues occur, you can rollback:

1. **Backend**: Revert `restaurantController.js` to previous version (remove geospatial query, use regular query)
2. **Frontend**: Revert `useLocation.jsx` and `Home.jsx` to previous versions
3. **Database**: The `geoLocation` field is backward compatible - old code will still work

## Post-Migration Verification

### Backend Verification
```bash
# Check backend logs for geospatial queries
# Should see: "Fetched X restaurants using MongoDB geospatial query (NO Google Places API)"
```

### Frontend Verification
1. Open browser DevTools → Network tab
2. Filter by "maps.googleapis.com"
3. Navigate to home page
4. **Verify**: No calls to `maps/api/place/nearbysearch` or `maps/api/place/details`
5. **Verify**: Only calls to `maps/api/js` (for map rendering - this is expected and minimal cost)

### Live Tracking Verification
1. Enable location tracking
2. Move around (simulate GPS updates)
3. **Verify**: No geocoding API calls in network tab
4. **Verify**: Coordinates update but address remains from stored location

## Cost Impact

### Before Migration
- **Places API (Nearby Search)**: ~1000+ calls/day = High cost
- **Geocoding API**: ~500+ calls/day = High cost
- **Total**: $$$ per month

### After Migration
- **Places API**: 0 calls = $0
- **Geocoding API**: ~10-50 calls/day (only manual operations) = Minimal cost
- **MongoDB Geospatial**: Free (uses database)
- **Total**: ~99% cost reduction

## Troubleshooting

### Issue: Migration script fails
**Solution**: Check MongoDB connection string in `.env` file

### Issue: No restaurants returned after migration
**Solution**: 
1. Verify `geoLocation` field is populated: `db.restaurants.findOne({ "location.geoLocation": { $exists: true } })`
2. Check if coordinates are valid: `db.restaurants.findOne({ "location.latitude": { $exists: true } })`
3. Verify 2dsphere index exists: `db.restaurants.getIndexes()`

### Issue: Restaurants not sorted by distance
**Solution**: Ensure frontend is passing `latitude` and `longitude` query parameters

### Issue: Still seeing Google Places API calls
**Solution**: 
1. Clear browser cache
2. Check if any other components are calling Places API
3. Search codebase for "nearbysearch" or "place/details"

## Support

If you encounter issues:
1. Check backend logs for errors
2. Check browser console for errors
3. Verify MongoDB connection and indexes
4. Review `REFACTORING_SUMMARY.md` for detailed changes
