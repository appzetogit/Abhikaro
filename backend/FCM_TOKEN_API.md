# FCM Token Registration API

## Overview

This API endpoint allows authenticated users to register their FCM (Firebase Cloud Messaging) tokens for push notifications. The endpoint works for all user roles: **user**, **restaurant**, **delivery**, and **hotel**.

## Endpoint

**POST** `/api/auth/fcm-token`

## Authentication

**Required**: JWT Bearer token in `Authorization` header

The endpoint extracts `userId` and `role` from the JWT token, so you must be logged in first.

## Request Body

```json
{
  "token": "fcm_token_value_here",
  "platform": "web" | "android" | "ios"
}
```

### Parameters

- **`token`** (required): The FCM registration token from Firebase
- **`platform`** (optional): Platform type - `"web"`, `"android"`, or `"ios"`. Defaults to `"web"`

## Response

### Success (200)

```json
{
  "success": true,
  "message": "FCM token registered successfully"
}
```

### Error (400/401)

```json
{
  "success": false,
  "message": "Error message"
}
```

## Usage Examples

### 1. User Login Flow

```bash
# Step 1: Login to get JWT token
POST https://api.bakalaa.com/api/auth/login
Content-Type: application/json

{
  "email": "customer@gmail.com",
  "password": "password123",
  "role": "user"
}

# Response includes accessToken
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}

# Step 2: Register FCM token
POST https://api.bakalaa.com/api/auth/fcm-token
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "token": "fjDl4V7M9TLedsC9jw0Tjq:APA91bFVJLnGJY85QnwMzzK0j22rYqp3gFPC4VL7U9d3DXX...",
  "platform": "web"
}
```

### 2. Restaurant Login Flow

```bash
# Step 1: Login
POST https://api.bakalaa.com/api/auth/login
Content-Type: application/json

{
  "email": "restaurant@gmail.com",
  "password": "password123",
  "role": "restaurant"
}

# Step 2: Register FCM token
POST https://api.bakalaa.com/api/auth/fcm-token
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "token": "fcm_token_value_here",
  "platform": "android"
}
```

### 3. Delivery Login Flow

```bash
# Step 1: Login
POST https://api.bakalaa.com/api/auth/login
Content-Type: application/json

{
  "email": "delivery@gmail.com",
  "password": "password123",
  "role": "delivery"
}

# Step 2: Register FCM token
POST https://api.bakalaa.com/api/auth/fcm-token
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "token": "fcm_token_value_here",
  "platform": "ios"
}
```

### 4. Hotel Login Flow

```bash
# Step 1: Login
POST https://api.bakalaa.com/api/auth/login
Content-Type: application/json

{
  "email": "hotel@gmail.com",
  "password": "password123",
  "role": "hotel"
}

# Step 2: Register FCM token
POST https://api.bakalaa.com/api/auth/fcm-token
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "token": "fcm_token_value_here",
  "platform": "android"
}
```

## Mobile App Integration

### Android (Kotlin)

```kotlin
// After successful login
fun registerFcmToken(accessToken: String, fcmToken: String) {
    val url = "https://api.bakalaa.com/api/auth/fcm-token"
    
    val json = JSONObject().apply {
        put("token", fcmToken)
        put("platform", "android")
    }
    
    val request = Request.Builder()
        .url(url)
        .post(json.toString().toRequestBody("application/json".toMediaType()))
        .addHeader("Authorization", "Bearer $accessToken")
        .build()
    
    client.newCall(request).enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
            if (response.isSuccessful) {
                Log.d(TAG, "FCM token registered")
            }
        }
        override fun onFailure(call: Call, e: IOException) {
            Log.e(TAG, "Failed to register FCM token", e)
        }
    })
}
```

### iOS (Swift)

```swift
// After successful login
func registerFcmToken(accessToken: String, fcmToken: String) {
    let url = URL(string: "https://api.bakalaa.com/api/auth/fcm-token")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: Any] = [
        "token": fcmToken,
        "platform": "ios"
    ]
    
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    
    URLSession.shared.dataTask(with: request) { data, response, error in
        if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
            print("FCM token registered")
        }
    }.resume()
}
```

### React Native

```javascript
// After successful login
async function registerFcmToken(accessToken, fcmToken) {
  const response = await fetch('https://api.bakalaa.com/api/auth/fcm-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      token: fcmToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  });
  
  const data = await response.json();
  if (data.success) {
    console.log('FCM token registered');
  }
}
```

## Web Integration

### JavaScript/TypeScript

```javascript
// After successful login
async function registerFcmToken(accessToken, fcmToken) {
  const response = await fetch('https://api.bakalaa.com/api/auth/fcm-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      token: fcmToken,
      platform: 'web',
    }),
  });
  
  const data = await response.json();
  if (data.success) {
    console.log('FCM token registered');
  }
}
```

## When to Register Token

Register the FCM token in these scenarios:

1. **After login** - When user successfully authenticates
2. **On app launch** - If user is already logged in (check stored auth state)
3. **On token refresh** - Firebase automatically refreshes tokens periodically
4. **After app update** - Tokens may change after app updates

## Error Handling

### 400 Bad Request
- Missing `token` field
- Invalid `platform` value (must be `web`, `android`, or `ios`)

### 401 Unauthorized
- Missing or invalid JWT token
- Token expired

## Notes

- **Multiple devices**: Users can have multiple tokens (one per device/platform)
- **Token refresh**: Tokens automatically refresh; backend handles updates via upsert
- **Invalid tokens**: Backend automatically removes invalid tokens when sending notifications fails
- **Role detection**: The endpoint automatically detects the user's role from the JWT token

## Testing

### Using cURL

```bash
# Login first
curl -X POST https://api.bakalaa.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@gmail.com",
    "password": "password123",
    "role": "user"
  }'

# Register FCM token
curl -X POST https://api.bakalaa.com/api/auth/fcm-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "token": "your_fcm_token_here",
    "platform": "web"
  }'
```

### Verify Token Storage

```bash
cd backend
node scripts/test-fcm-tokens.js
```

This will show all registered FCM tokens with their platform and role information.
