# Add Firebase Web Config to Backend

## Issue
The service worker needs Firebase **web config** (API key, auth domain, etc.) but your `.env` only has **Admin SDK** credentials.

## Required Firebase Web Config Variables

Add these to your `backend/.env` file OR set them in Admin Panel → Environment Variables:

```env
# Firebase Web Config (for frontend/service worker)
FIREBASE_API_KEY=your-api-key-here
FIREBASE_AUTH_DOMAIN=abhikaro-d2df6.firebaseapp.com
FIREBASE_STORAGE_BUCKET=abhikaro-d2df6.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-app-id
```

## How to Get These Values

### Option 1: From Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `abhikaro-d2df6`
3. Click the gear icon → Project Settings
4. Scroll down to "Your apps" section
5. If you have a web app, click on it to see config
6. If no web app exists, click "Add app" → Web (</>) → Register app
7. Copy the config values

### Option 2: From Existing Frontend Config
Check your `frontend/.env` or `frontend/src/lib/firebase.js` for existing values.

## Quick Setup

Add to `backend/.env`:
```env
# Firebase Web Config (get from Firebase Console)
FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=abhikaro-d2df6.firebaseapp.com
FIREBASE_PROJECT_ID=abhikaro-d2df6
FIREBASE_STORAGE_BUCKET=abhikaro-d2df6.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:abc123
```

## After Adding Config

1. **Restart backend server**
2. **Clear browser cache** (or hard refresh: Ctrl+Shift+R)
3. **Check service worker** - it should now register successfully

The backend route `/firebase-messaging-sw.js` will serve the properly configured service worker.
