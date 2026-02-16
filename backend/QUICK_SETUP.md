# Quick Firebase Credentials Setup

## ✅ Your Credentials (from JSON)

Based on your service account JSON, here are the values:

- **Project ID**: `abhikaro-d2df6`
- **Client Email**: `firebase-adminsdk-fbsvc@abhikaro-d2df6.iam.gserviceaccount.com`
- **Private Key**: (see formatting instructions below)

## 📝 Step-by-Step Setup

### Option 1: Use the Helper Script (Recommended)

1. **Save your JSON file temporarily** (e.g., as `temp-firebase-key.json` in backend folder)

2. **Run the helper script**:
   ```bash
   cd backend
   node scripts/setup-firebase-env.js temp-firebase-key.json
   ```

3. **Copy the output** to your `backend/.env` file

4. **DELETE the temporary JSON file immediately**:
   ```bash
   rm temp-firebase-key.json
   # or on Windows:
   del temp-firebase-key.json
   ```

### Option 2: Manual Setup

1. **Open or create** `backend/.env` file

2. **Add these lines** (replace `YOUR_PRIVATE_KEY` with the actual key from your JSON):

```env
# Firebase Admin SDK (for FCM push notifications)
FIREBASE_PROJECT_ID=abhikaro-d2df6
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@abhikaro-d2df6.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
```

3. **Format the Private Key**:
   - Take the `private_key` value from your JSON
   - Replace ALL actual newlines with `\n` (backslash-n)
   - Keep it wrapped in double quotes `"`
   - Include the BEGIN and END markers

   **Example format:**
   ```
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n...more lines...\n-----END PRIVATE KEY-----\n"
   ```

## ✅ Verify Setup

1. **Restart your backend server**:
   ```bash
   npm run dev
   # or
   npm start
   ```

2. **Check console output** - you should see:
   ```
   ✅ Firebase Admin SDK initialized for FCM
   ```

3. **Test the service worker**:
   - Open your frontend app
   - Check browser console - FCM errors should be gone
   - The service worker should register successfully

## 🔒 Security Checklist

- ✅ `.env` is already in `.gitignore` (won't be committed)
- ✅ Never commit the JSON file
- ✅ Delete any temporary JSON files after setup
- ✅ Credentials are only used in backend (never exposed to frontend)

## 🐛 Troubleshooting

**If you see `⚠️ FCM not initialized`:**
- Check that all 3 variables are in `.env`
- Verify private key has `\n` (not actual newlines)
- Ensure private key is wrapped in double quotes
- Restart backend server

**If service worker still fails:**
- Ensure backend is running on port 5000
- Check that `/firebase-messaging-sw.js` is accessible
- Verify Firebase config is set in Admin Panel → Environment Variables

## 📚 Next Steps

After setup, FCM will:
- ✅ Register tokens when users log in
- ✅ Send push notifications
- ✅ Handle background messages
- ✅ Work with the service worker we configured
