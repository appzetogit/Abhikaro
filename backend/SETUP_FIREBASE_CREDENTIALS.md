# Firebase Credentials Setup Guide

## ⚠️ SECURITY WARNING
**NEVER commit these credentials to git. They are already in `.gitignore`.**

## Step 1: Add Credentials to `backend/.env`

Add these lines to your `backend/.env` file (create it if it doesn't exist):

```env
# Firebase Admin SDK (for FCM push notifications)
FIREBASE_PROJECT_ID=abhikaro-d2df6
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@abhikaro-d2df6.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_ACTUAL_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

## Step 2: Format the Private Key Correctly

**IMPORTANT:** The `FIREBASE_PRIVATE_KEY` must:
1. Be wrapped in double quotes `"`
2. Have `\n` (literal backslash-n) for each newline in the key
3. Include the BEGIN and END markers

### Example Format:
```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n...more key content...\n-----END PRIVATE KEY-----\n"
```

### How to Convert Your JSON Private Key:

If you have the private key from the JSON file, replace all actual newlines with `\n`:

**From JSON:**
```
"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

**To .env format:**
```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

## Step 3: Verify Setup

After adding the credentials:

1. Restart your backend server
2. Check the console logs - you should see:
   ```
   ✅ Firebase Admin SDK initialized for FCM
   ```

## Step 4: Test FCM

The FCM service worker should now work properly. The backend will:
- Serve `/firebase-messaging-sw.js` with proper Firebase config
- Send push notifications via FCM
- Register/remove FCM tokens

## Troubleshooting

If you see `⚠️ FCM not initialized`:
- Check that all three variables are set in `.env`
- Verify the private key has `\n` (not actual newlines)
- Ensure the private key is wrapped in double quotes
- Restart the backend server after making changes
