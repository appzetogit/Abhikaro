# FCM Token Registration Logging Guide

## What to Expect During Signup/Login

### Browser Console Logs (Frontend)

When a user signs up or logs in, you'll see these logs in the browser console:

```
🔔 [FCM] Starting token retrieval...
🔔 [FCM] Requesting notification permission...
🔔 [FCM] Permission result: granted
🔔 [FCM] Getting VAPID key...
🔔 [FCM] VAPID key found
🔔 [FCM] Requesting FCM token from Firebase...
✅ [FCM] Token received: fjDl4V7M9TLedsC9jw0Tjq...
📤 [FCM] Starting token registration...
📤 [FCM] Options: { sendWelcome: true, sendLoginAlert: false }
📤 [FCM] Sending token to backend: fjDl4V7M9TLedsC9jw0Tjq...
✅ [FCM] Token registered successfully!
✅ [FCM] Backend response: { success: true, message: "FCM token registered successfully" }
```

### Backend Terminal Logs

In your backend terminal, you'll see:

```
📥 [FCM] ========================================
📥 [FCM] Received FCM token registration request
📥 [FCM] Platform: web
📥 [FCM] Token: fjDl4V7M9TLedsC9jw0Tjq...
📥 [FCM] Options: { sendWelcome: true, sendLoginAlert: false }
📥 [FCM] User ID: 699301fb89f28ab5b1d9555c
📥 [FCM] Role: user
📥 [FCM] Processing token registration...
💾 [FCM] Saving token to database...
💾 [FCM] UserId: 699301fb89f28ab5b1d9555c
💾 [FCM] Role: user
💾 [FCM] Platform: web
💾 [FCM] Token: fjDl4V7M9TLedsC9jw0Tjq...
💾 [FCM] Checking if token already exists...
✨ [FCM] New token, creating document...
✨ [FCM] New token created successfully in database
💾 [FCM] Document saved with ID: 67f1234567890abcdef12345
💾 [FCM] Timestamp: 2026-02-16T12:00:00.000Z
✅ [FCM] Token saved to database successfully
✅ [FCM] Token registration completed successfully
📥 [FCM] ========================================
```

## Verification

After signup/login, verify the token was stored:

```bash
cd backend
node scripts/test-fcm-tokens.js
```

You should see:
- `✅ FCM tokens in DB: 1` (or more)
- List of tokens with role, userId, platform

## Troubleshooting

### If browser shows "Permission denied":
- User needs to click "Allow" when browser asks for notification permission

### If browser shows "VAPID key not configured":
- Set `FIREBASE_VAPID_KEY` in Admin Panel → System Addons → Firebase
- Or set `VITE_FIREBASE_VAPID_KEY` in `frontend/.env`

### If backend shows "Authentication required":
- User is not logged in properly
- Check JWT token is valid

### If backend shows "Token save error":
- Check MongoDB connection
- Check database permissions
