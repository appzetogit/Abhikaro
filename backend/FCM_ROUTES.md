# FCM Token Routes

## Base URL
All routes are prefixed with your API base URL: `https://api.foods.abhikaro.in/api`

---

## 🔐 Authentication Routes (FCM Token Registration)

### POST `/api/auth/fcm-token`
**Recommended route for mobile apps** - Matches your API structure

**Authentication**: Required (JWT Bearer token)

**Request Body**:
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

**Example**:
```bash
POST /api/auth/fcm-token
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "token": "fjDl4V7M9TLedsC9jw0Tjq:APA91bFVJLnGJY85QnwMzzK0j22rYqp3gFPC4VL7U9d3DXX...",
  "platform": "android"
}
```

**Works for**: `user`, `restaurant`, `delivery`, `hotel` (role detected from JWT token)

---

## 📱 FCM Module Routes

### POST `/api/fcm/register-token`
**Alternative route** - Uses `fcmToken` field name

**Authentication**: Required (JWT Bearer token)

**Request Body**:
```json
{
  "fcmToken": "fcm_token_value_here",
  "platform": "web" | "android" | "ios",
  "deviceId": "optional_device_id",
  "sendWelcome": false,
  "sendLoginAlert": false
}
```

**Response**:
```json
{
  "success": true,
  "message": "FCM token registered successfully"
}
```

**Example**:
```bash
POST /api/fcm/register-token
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "fcmToken": "fjDl4V7M9TLedsC9jw0Tjq:APA91bFVJLnGJY85QnwMzzK0j22rYqp3gFPC4VL7U9d3DXX...",
  "platform": "ios",
  "deviceId": "device-uuid-here"
}
```

**Works for**: `user`, `restaurant`, `delivery`, `hotel` (role detected from JWT token)

---

### POST `/api/fcm/remove-token`
**Remove FCM token** (e.g., on logout)

**Authentication**: Optional (can be called without auth for logout scenarios)

**Request Body**:
```json
{
  "fcmToken": "fcm_token_value_here"
}
```

**Response**:
```json
{
  "success": true,
  "message": "FCM token removed"
}
```

**Example**:
```bash
POST /api/fcm/remove-token
Content-Type: application/json

{
  "fcmToken": "fjDl4V7M9TLedsC9jw0Tjq:APA91bFVJLnGJY85QnwMzzK0j22rYqp3gFPC4VL7U9d3DXX..."
}
```

---

## 🔑 Login Routes (Get JWT Token First)

### POST `/api/auth/login`
**Login to get JWT token** (required before registering FCM token)

**Request Body**:
```json
{
  "email": "user@example.com",
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

**Examples**:

**User Login**:
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "customer@gmail.com",
  "password": "password123",
  "role": "user"
}
```

**Restaurant Login**:
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "restaurant@gmail.com",
  "password": "password123",
  "role": "restaurant"
}
```

**Delivery Login**:
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "delivery@gmail.com",
  "password": "password123",
  "role": "delivery"
}
```

**Hotel Login**:
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "hotel@gmail.com",
  "password": "password123",
  "role": "hotel"
}
```

---

## 📋 Complete Flow Example

### For Mobile Apps (Android/iOS)

```bash
# Step 1: Login
POST /api/auth/login
{
  "email": "customer@gmail.com",
  "password": "password123",
  "role": "user"
}

# Response: { "success": true, "data": { "accessToken": "..." } }

# Step 2: Register FCM Token
POST /api/auth/fcm-token
Authorization: Bearer <access_token_from_step_1>
{
  "token": "fcm_token_from_firebase",
  "platform": "android"  // or "ios"
}
```

### For Web Apps

```bash
# Step 1: Login
POST /api/auth/login
{
  "email": "customer@gmail.com",
  "password": "password123",
  "role": "user"
}

# Step 2: Register FCM Token
POST /api/auth/fcm-token
Authorization: Bearer <access_token>
{
  "token": "fcm_token_from_firebase",
  "platform": "web"
}
```

---

## 🔄 Route Comparison

| Route | Field Name | Auth Required | Use Case |
|-------|-----------|---------------|----------|
| `/api/auth/fcm-token` | `token` | ✅ Yes | **Recommended** - Matches your API structure |
| `/api/fcm/register-token` | `fcmToken` | ✅ Yes | Alternative - More options (sendWelcome, sendLoginAlert) |
| `/api/fcm/remove-token` | `fcmToken` | ❌ Optional | Remove token on logout |

---

## 📝 Notes

1. **Both routes work**: `/api/auth/fcm-token` and `/api/fcm/register-token` both register tokens
2. **Field name difference**: 
   - `/api/auth/fcm-token` uses `token`
   - `/api/fcm/register-token` uses `fcmToken`
3. **Role detection**: Both routes automatically detect user role from JWT token
4. **Platform support**: Both support `web`, `android`, and `ios`
5. **Multiple devices**: Users can register multiple tokens (one per device/platform)

---

## 🧪 Testing Routes

### Test Token Registration
```bash
# Login first
curl -X POST https://api.foods.abhikaro.in/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "customer@gmail.com", "password": "password123", "role": "user"}'

# Register FCM token
curl -X POST https://api.foods.abhikaro.in/api/auth/fcm-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"token": "your_fcm_token", "platform": "web"}'
```

### Verify Tokens in Database
```bash
cd backend
node scripts/test-fcm-tokens.js
```

---

## 🎯 Recommended Route for Mobile

**Use**: `POST /api/auth/fcm-token`

**Why**: 
- Matches your existing API structure (`/api/auth/*`)
- Simple field name (`token` instead of `fcmToken`)
- Consistent with login endpoint pattern
