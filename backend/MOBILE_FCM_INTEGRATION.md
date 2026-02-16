# Mobile FCM Token Integration Guide

## Overview

The backend API already supports FCM tokens from **Android** and **iOS** mobile apps. The same endpoint used for web tokens (`/api/fcm/register-token`) handles mobile tokens with platform detection.

## Backend Endpoint

**POST** `/api/fcm/register-token`

### Authentication
- **Required**: JWT Bearer token in `Authorization` header
- Supports all user roles: `user`, `restaurant`, `hotel`, `delivery`

### Request Body

```json
{
  "fcmToken": "string (required)",
  "platform": "android" | "ios" | "web" (optional, defaults to "web"),
  "deviceId": "string (optional)",
  "sendWelcome": boolean (optional, default: false),
  "sendLoginAlert": boolean (optional, default: false)
}
```

### Response

**Success (200)**:
```json
{
  "success": true,
  "message": "FCM token registered successfully"
}
```

**Error (400/401)**:
```json
{
  "success": false,
  "message": "Error message"
}
```

---

## Android Integration (Kotlin/Java)

### 1. Add Firebase to Android Project

Add to `build.gradle` (app level):
```gradle
dependencies {
    implementation 'com.google.firebase:firebase-messaging:23.4.0'
    implementation 'com.google.firebase:firebase-installations:17.2.0'
}
```

### 2. Get FCM Token

```kotlin
import com.google.firebase.messaging.FirebaseMessaging

// Get FCM token
FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
    if (!task.isSuccessful) {
        Log.w(TAG, "Fetching FCM registration token failed", task.exception)
        return@addOnCompleteListener
    }

    // Get new FCM registration token
    val fcmToken = task.result
    Log.d(TAG, "FCM Registration Token: $fcmToken")
    
    // Register token with backend
    registerFcmTokenWithBackend(fcmToken)
}
```

### 3. Register Token with Backend

```kotlin
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

fun registerFcmTokenWithBackend(fcmToken: String) {
    val baseUrl = "https://your-backend-domain.com" // Replace with your backend URL
    val url = "$baseUrl/api/fcm/register-token"
    
    // Get JWT token from your auth storage (SharedPreferences, etc.)
    val jwtToken = getAuthToken() // Your method to get stored JWT
    
    val json = JSONObject().apply {
        put("fcmToken", fcmToken)
        put("platform", "android")
        put("deviceId", getDeviceId()) // Optional: Android ID or UUID
        put("sendWelcome", false)
        put("sendLoginAlert", true)
    }
    
    val requestBody = json.toString()
        .toRequestBody("application/json".toMediaType())
    
    val request = Request.Builder()
        .url(url)
        .post(requestBody)
        .addHeader("Authorization", "Bearer $jwtToken")
        .addHeader("Content-Type", "application/json")
        .build()
    
    val client = OkHttpClient()
    client.newCall(request).enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            Log.e(TAG, "Failed to register FCM token", e)
        }
        
        override fun onResponse(call: Call, response: Response) {
            if (response.isSuccessful) {
                Log.d(TAG, "FCM token registered successfully")
            } else {
                Log.e(TAG, "Failed to register FCM token: ${response.code}")
            }
            response.close()
        }
    })
}

// Helper to get device ID
fun getDeviceId(): String {
    return Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ANDROID_ID
    )
}
```

### 4. Handle Token Refresh

```kotlin
// In your FirebaseMessagingService
class MyFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Log.d(TAG, "Refreshed token: $token")
        // Re-register with backend when token refreshes
        registerFcmTokenWithBackend(token)
    }
}
```

---

## iOS Integration (Swift)

### 1. Add Firebase to iOS Project

Add to `Podfile`:
```ruby
pod 'Firebase/Messaging'
```

Then run:
```bash
pod install
```

### 2. Configure APNs

1. Enable Push Notifications capability in Xcode
2. Upload APNs certificate/key to Firebase Console
3. Configure `GoogleService-Info.plist` in your project

### 3. Get FCM Token

```swift
import Firebase
import FirebaseMessaging

// In AppDelegate or SceneDelegate
func application(_ application: UIApplication, 
                 didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    FirebaseApp.configure()
    
    // Request notification permission
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
        if granted {
            DispatchQueue.main.async {
                application.registerForRemoteNotifications()
            }
        }
    }
    
    Messaging.messaging().delegate = self
    
    return true
}

// Get FCM token
Messaging.messaging().token { token, error in
    if let error = error {
        print("Error fetching FCM registration token: \(error)")
    } else if let token = token {
        print("FCM registration token: \(token)")
        registerFcmTokenWithBackend(token: token)
    }
}
```

### 4. Register Token with Backend

```swift
import Foundation

func registerFcmTokenWithBackend(token: String) {
    let baseUrl = "https://your-backend-domain.com" // Replace with your backend URL
    let url = URL(string: "\(baseUrl)/api/fcm/register-token")!
    
    // Get JWT token from your auth storage (UserDefaults, Keychain, etc.)
    guard let jwtToken = getAuthToken() else {
        print("No auth token available")
        return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(jwtToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? ""
    
    let body: [String: Any] = [
        "fcmToken": token,
        "platform": "ios",
        "deviceId": deviceId,
        "sendWelcome": false,
        "sendLoginAlert": true
    ]
    
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    
    URLSession.shared.dataTask(with: request) { data, response, error in
        if let error = error {
            print("Error registering FCM token: \(error)")
            return
        }
        
        if let httpResponse = response as? HTTPURLResponse {
            if httpResponse.statusCode == 200 {
                print("FCM token registered successfully")
            } else {
                print("Failed to register FCM token: \(httpResponse.statusCode)")
            }
        }
    }.resume()
}
```

### 5. Handle Token Refresh

```swift
extension AppDelegate: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        print("Firebase registration token: \(String(describing: fcmToken))")
        
        if let token = fcmToken {
            // Re-register with backend when token refreshes
            registerFcmTokenWithBackend(token: token)
        }
    }
}
```

---

## React Native Integration

### 1. Install Dependencies

```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
# For iOS
cd ios && pod install
```

### 2. Get and Register FCM Token

```javascript
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

async function registerFcmToken() {
  try {
    // Request permission (iOS)
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().requestPermission();
      if (authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL) {
        console.log('Permission granted');
      } else {
        console.log('Permission denied');
        return;
      }
    }

    // Get FCM token
    const fcmToken = await messaging().getToken();
    console.log('FCM Token:', fcmToken);

    // Register with backend
    await registerTokenWithBackend(fcmToken);
  } catch (error) {
    console.error('Error getting FCM token:', error);
  }
}

async function registerTokenWithBackend(fcmToken) {
  const baseUrl = 'https://your-backend-domain.com'; // Replace
  const jwtToken = await getAuthToken(); // Your method to get stored JWT

  try {
    const response = await fetch(`${baseUrl}/api/fcm/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({
        fcmToken,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        deviceId: Platform.OS === 'ios' 
          ? (await getUniqueId()).id 
          : (await getUniqueId()).id,
        sendWelcome: false,
        sendLoginAlert: true,
      }),
    });

    const data = await response.json();
    if (data.success) {
      console.log('FCM token registered successfully');
    } else {
      console.error('Failed to register token:', data.message);
    }
  } catch (error) {
    console.error('Error registering token:', error);
  }
}

// Handle token refresh
messaging().onTokenRefresh(async (fcmToken) => {
  console.log('FCM token refreshed:', fcmToken);
  await registerTokenWithBackend(fcmToken);
});
```

---

## When to Register Token

Register the FCM token in these scenarios:

1. **After user login/signup** - When user successfully authenticates
2. **On app launch** - If user is already logged in (check stored auth state)
3. **On token refresh** - Firebase automatically refreshes tokens periodically
4. **After app update** - Tokens may change after app updates

---

## Testing

### Test Token Registration

Use the test script to verify tokens are stored:

```bash
cd backend
node scripts/test-fcm-tokens.js
```

This will show all FCM tokens in the database, including platform type.

### Send Test Notification

```bash
cd backend
node scripts/test-fcm-complete.js --send-test
```

This sends a test notification to all registered tokens (web, Android, iOS).

---

## Database Schema

Tokens are stored in MongoDB `FcmToken` collection:

```javascript
{
  userId: ObjectId,
  userModel: "User" | "Restaurant" | "Hotel" | "Delivery",
  role: "user" | "restaurant" | "hotel" | "delivery",
  fcmToken: String (unique),
  platform: "web" | "android" | "ios",
  deviceId: String (optional),
  createdAt: Date,
  updatedAt: Date
}
```

---

## Notes

- **Multiple devices**: Users can have multiple tokens (one per device/platform)
- **Token refresh**: Tokens automatically refresh; backend handles updates via upsert
- **Invalid tokens**: Backend automatically removes invalid tokens when sending notifications fails
- **Authentication**: Always include JWT token in Authorization header
- **Platform detection**: Backend validates platform enum (`web`, `android`, `ios`)

---

## Troubleshooting

### Token not registering
- Verify JWT token is valid and not expired
- Check backend logs for error messages
- Ensure `fcmToken` is a valid Firebase token string
- Verify network connectivity

### Notifications not received
- Verify token is stored in database: `node scripts/test-fcm-tokens.js`
- Check Firebase Console → Cloud Messaging → Send test message
- Verify APNs certificate (iOS) or Firebase Cloud Messaging API (Android) is configured
- Check device notification permissions

### Token refresh issues
- Implement `onNewToken` handler (Android) or `didReceiveRegistrationToken` (iOS)
- Re-register token with backend when refresh occurs
- Check backend logs for registration attempts
