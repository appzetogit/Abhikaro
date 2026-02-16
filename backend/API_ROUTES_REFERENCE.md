# API Routes Reference

## Base URL
**`https://api.foods.abhikaro.in/api`**

---

## 🔐 Authentication Routes

### POST `/auth/login`
Login with email and password

**Request**:
```json
{
  "email": "customer@gmail.com",
  "password": "password123",
  "role": "user" | "restaurant" | "delivery" | "hotel"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "...",
    "user": { ... }
  }
}
```

**Full URL**: `https://api.foods.abhikaro.in/api/auth/login`

---

### POST `/auth/register`
Register new user account

**Request**:
```json
{
  "name": "John Doe",
  "email": "customer@gmail.com",
  "password": "password123",
  "phone": "+911234567890",
  "role": "user" | "restaurant" | "delivery" | "hotel"
}
```

**Full URL**: `https://api.foods.abhikaro.in/api/auth/register`

---

### POST `/auth/send-otp`
Send OTP to phone or email

**Request**:
```json
{
  "phone": "+911234567890",
  "email": "customer@gmail.com",
  "purpose": "login" | "register" | "reset-password"
}
```

**Full URL**: `https://api.foods.abhikaro.in/api/auth/send-otp`

---

### POST `/auth/verify-otp`
Verify OTP code

**Request**:
```json
{
  "phone": "+911234567890",
  "email": "customer@gmail.com",
  "otp": "123456",
  "purpose": "login" | "register" | "reset-password",
  "role": "user" | "restaurant" | "delivery" | "hotel"
}
```

**Full URL**: `https://api.foods.abhikaro.in/api/auth/verify-otp`

---

### POST `/auth/refresh-token`
Refresh access token using refresh token

**Full URL**: `https://api.foods.abhikaro.in/api/auth/refresh-token`

---

### POST `/auth/logout`
Logout user (invalidates refresh token)

**Full URL**: `https://api.foods.abhikaro.in/api/auth/logout`

---

### POST `/auth/reset-password`
Reset password with OTP verification

**Request**:
```json
{
  "email": "customer@gmail.com",
  "otp": "123456",
  "newPassword": "newpassword123",
  "role": "user" | "restaurant" | "delivery" | "hotel"
}
```

**Full URL**: `https://api.foods.abhikaro.in/api/auth/reset-password`

---

### GET `/auth/me`
Get current authenticated user info

**Auth**: Required (JWT Bearer token)

**Full URL**: `https://api.foods.abhikaro.in/api/auth/me`

---

## 📱 FCM Token Routes

### POST `/auth/fcm-token`
**Register FCM token** (Recommended for mobile apps)

**Auth**: Required (JWT Bearer token)

**Request**:
```json
{
  "token": "fcm_token_value_here",
  "platform": "web" | "android" | "ios"
}
```

**Response**:
```json
{
  "success": true,
  "message": "FCM token registered successfully"
}
```

**Full URL**: `https://api.foods.abhikaro.in/api/auth/fcm-token`

**Example**:
```bash
curl -X POST https://api.foods.abhikaro.in/api/auth/fcm-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "token": "fjDl4V7M9TLedsC9jw0Tjq:APA91bFVJLnGJY85QnwMzzK0j22rYqp3gFPC4VL7U9d3DXX...",
    "platform": "android"
  }'
```

**Works for**: `user`, `restaurant`, `delivery`, `hotel` (role detected from JWT token)

---

### POST `/fcm/register-token`
**Alternative FCM token registration route**

**Auth**: Required (JWT Bearer token)

**Request**:
```json
{
  "fcmToken": "fcm_token_value_here",
  "platform": "web" | "android" | "ios",
  "deviceId": "optional_device_id",
  "sendWelcome": false,
  "sendLoginAlert": false
}
```

**Full URL**: `https://api.foods.abhikaro.in/api/fcm/register-token`

---

### POST `/fcm/remove-token`
**Remove FCM token** (e.g., on logout)

**Auth**: Optional

**Request**:
```json
{
  "fcmToken": "fcm_token_value_here"
}
```

**Full URL**: `https://api.foods.abhikaro.in/api/fcm/remove-token`

---

## 👤 User Routes

### GET `/user/profile`
Get user profile

**Auth**: Required

**Full URL**: `https://api.foods.abhikaro.in/api/user/profile`

---

### PUT `/user/profile`
Update user profile

**Auth**: Required

**Full URL**: `https://api.foods.abhikaro.in/api/user/profile`

---

## 🍽️ Restaurant Routes

### GET `/restaurant/profile`
Get restaurant profile

**Auth**: Required (Restaurant JWT)

**Full URL**: `https://api.foods.abhikaro.in/api/restaurant/profile`

---

### PUT `/restaurant/profile`
Update restaurant profile

**Auth**: Required (Restaurant JWT)

**Full URL**: `https://api.foods.abhikaro.in/api/restaurant/profile`

---

## 🏨 Hotel Routes

### GET `/hotel/profile`
Get hotel profile

**Auth**: Required (Hotel JWT)

**Full URL**: `https://api.foods.abhikaro.in/api/hotel/profile`

---

### PUT `/hotel/profile`
Update hotel profile

**Auth**: Required (Hotel JWT)

**Full URL**: `https://api.foods.abhikaro.in/api/hotel/profile`

---

## 🚚 Delivery Routes

### GET `/delivery/profile`
Get delivery profile

**Auth**: Required (Delivery JWT)

**Full URL**: `https://api.foods.abhikaro.in/api/delivery/profile`

---

### PUT `/delivery/profile`
Update delivery profile

**Auth**: Required (Delivery JWT)

**Full URL**: `https://api.foods.abhikaro.in/api/delivery/profile`

---

## 📦 Order Routes

### GET `/order`
Get orders list

**Auth**: Required

**Full URL**: `https://api.foods.abhikaro.in/api/order`

---

### POST `/order`
Create new order

**Auth**: Required

**Full URL**: `https://api.foods.abhikaro.in/api/order`

---

### GET `/order/:orderId`
Get order details

**Auth**: Required

**Full URL**: `https://api.foods.abhikaro.in/api/order/:orderId`

---

## 💳 Payment Routes

### POST `/payment/create`
Create payment

**Auth**: Required

**Full URL**: `https://api.foods.abhikaro.in/api/payment/create`

---

### POST `/payment/verify`
Verify payment

**Auth**: Required

**Full URL**: `https://api.foods.abhikaro.in/api/payment/verify`

---

## 📋 Menu Routes

### GET `/menu`
Get menu items

**Full URL**: `https://api.foods.abhikaro.in/api/menu`

---

### GET `/menu/:restaurantId`
Get menu for specific restaurant

**Full URL**: `https://api.foods.abhikaro.in/api/menu/:restaurantId`

---

## 🔔 Notification Routes

### GET `/notification`
Get notifications

**Auth**: Required

**Full URL**: `https://api.foods.abhikaro.in/api/notification`

---

### PUT `/notification/:notificationId/read`
Mark notification as read

**Auth**: Required

**Full URL**: `https://api.foods.abhikaro.in/api/notification/:notificationId/read`

---

## 📊 Complete FCM Token Registration Flow

### Step 1: Login
```bash
POST https://api.foods.abhikaro.in/api/auth/login
Content-Type: application/json

{
  "email": "customer@gmail.com",
  "password": "password123",
  "role": "user"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

### Step 2: Register FCM Token
```bash
POST https://api.foods.abhikaro.in/api/auth/fcm-token
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "token": "fcm_token_from_firebase",
  "platform": "android"  // or "ios" or "web"
}
```

**Response**:
```json
{
  "success": true,
  "message": "FCM token registered successfully"
}
```

---

## 🔄 Role-Specific Login Examples

### User Login
```bash
POST https://api.foods.abhikaro.in/api/auth/login
{
  "email": "customer@gmail.com",
  "password": "password123",
  "role": "user"
}
```

### Restaurant Login
```bash
POST https://api.foods.abhikaro.in/api/auth/login
{
  "email": "restaurant@gmail.com",
  "password": "password123",
  "role": "restaurant"
}
```

### Delivery Login
```bash
POST https://api.foods.abhikaro.in/api/auth/login
{
  "email": "delivery@gmail.com",
  "password": "password123",
  "role": "delivery"
}
```

### Hotel Login
```bash
POST https://api.foods.abhikaro.in/api/auth/login
{
  "email": "hotel@gmail.com",
  "password": "password123",
  "role": "hotel"
}
```

---

## 📱 Mobile App Integration Examples

### Android (Kotlin)
```kotlin
val baseUrl = "https://api.foods.abhikaro.in/api"

// Register FCM token
fun registerFcmToken(accessToken: String, fcmToken: String) {
    val url = "$baseUrl/auth/fcm-token"
    
    val json = JSONObject().apply {
        put("token", fcmToken)
        put("platform", "android")
    }
    
    val request = Request.Builder()
        .url(url)
        .post(json.toString().toRequestBody("application/json".toMediaType()))
        .addHeader("Authorization", "Bearer $accessToken")
        .build()
    
    client.newCall(request).enqueue(...)
}
```

### iOS (Swift)
```swift
let baseUrl = "https://api.foods.abhikaro.in/api"

func registerFcmToken(accessToken: String, fcmToken: String) {
    let url = URL(string: "\(baseUrl)/auth/fcm-token")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: Any] = [
        "token": fcmToken,
        "platform": "ios"
    ]
    
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    URLSession.shared.dataTask(with: request).resume()
}
```

### React Native
```javascript
const BASE_URL = 'https://api.foods.abhikaro.in/api';

async function registerFcmToken(accessToken, fcmToken) {
  const response = await fetch(`${BASE_URL}/auth/fcm-token`, {
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
  
  return await response.json();
}
```

### Web (JavaScript)
```javascript
const BASE_URL = 'https://api.foods.abhikaro.in/api';

async function registerFcmToken(accessToken, fcmToken) {
  const response = await fetch(`${BASE_URL}/auth/fcm-token`, {
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
  
  return await response.json();
}
```

---

## 🧪 Testing with cURL

### Test Login
```bash
curl -X POST https://api.foods.abhikaro.in/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@gmail.com",
    "password": "password123",
    "role": "user"
  }'
```

### Test FCM Token Registration
```bash
curl -X POST https://api.foods.abhikaro.in/api/auth/fcm-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "token": "your_fcm_token_here",
    "platform": "web"
  }'
```

---

## 📝 Notes

- **Base URL**: All routes start with `https://api.foods.abhikaro.in/api`
- **Authentication**: Most routes require JWT Bearer token in `Authorization` header
- **FCM Token Route**: Use `/auth/fcm-token` for mobile apps (matches your API structure)
- **Role Detection**: FCM token route automatically detects role from JWT token
- **Platform Support**: FCM supports `web`, `android`, and `ios` platforms
