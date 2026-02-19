# User Location Debug Guide

## 🔍 Debugging Steps

### 1. Check Frontend Logs
Open browser console and look for:
- `💾 Updating live location in database:` - Should show coordinates
- `✅ Live location successfully stored in database` - Success message
- `⚠️ Skipping DB update` - If location has placeholder values
- `ℹ️ User not authenticated` - If user is not logged in

### 2. Check Backend Logs
Look for:
- `✅ User location saved to Firebase successfully: {userId}` - Firebase save success
- `⚠️ Failed to save user location to Firebase` - Firebase save failure
- `✅ User {userId} location updated in Firebase:` - Firebase update confirmation

### 3. Check Firebase Console
1. Go to Firebase Console → Realtime Database
2. Navigate to `users/{userId}`
3. Check if location data exists:
   ```json
   {
     "lat": 22.7196,
     "lng": 75.8577,
     "address": "...",
     "city": "...",
     "last_updated": 1708329000000
   }
   ```

### 4. Common Issues

#### Issue 1: Location has placeholder values
**Symptom:** `⚠️ Skipping DB update - location contains placeholder values`
**Fix:** Ensure location has real address, not "Select location" or "Current Location"

#### Issue 2: User not authenticated
**Symptom:** `ℹ️ User not authenticated, skipping DB update`
**Fix:** User must be logged in. Check `localStorage.getItem('user_accessToken')`

#### Issue 3: Firebase not initialized
**Symptom:** `⚠️ Firebase Realtime Database not available`
**Fix:** Check backend logs for Firebase initialization errors

#### Issue 4: Location not found in Firebase
**Symptom:** `⚠️ User location not found in Firebase for user: {userId}`
**Fix:** 
- Check if location was saved to Firebase
- Verify userId is correct
- Check Firebase rules allow read/write

### 5. Test Location Update

#### Frontend Test:
```javascript
// In browser console
const testLocation = {
  latitude: 22.7196,
  longitude: 75.8577,
  address: "Test Address",
  city: "Indore",
  state: "Madhya Pradesh",
  area: "Vijay Nagar",
  formattedAddress: "Test Address, Vijay Nagar, Indore"
};

// Call API
fetch('https://api.foods.abhikaro.in/api/user/location', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('user_accessToken')}`
  },
  body: JSON.stringify(testLocation)
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

#### Backend Test:
```bash
# Check if Firebase is initialized
# Look for: "✅ Firebase Realtime Database initialized successfully"

# Check user location endpoint
curl -X PUT http://localhost:5000/api/user/location \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "latitude": 22.7196,
    "longitude": 75.8577,
    "address": "Test",
    "city": "Indore"
  }'
```

### 6. Verify Firebase Save

Check backend logs for:
```
✅ User {userId} location updated in Firebase: {
  lat: 22.7196,
  lng: 75.8577,
  city: 'Indore',
  timestamp: '2024-02-20T10:30:00.000Z'
}
```

If this log is missing, Firebase save is failing.

### 7. Check Order Calculation

When calculating order, check logs for:
```
🔍 Attempting to fetch user location from Firebase for user: {userId}
🔍 Fetching user location from Firebase for user: {userId}
📦 User location data from Firebase: {hasLat: true, hasLng: true, ...}
✅ Using user location from Firebase for user {userId}
📍 Using Firebase location for order calculation
```

If these logs are missing, Firebase fetch is failing.
