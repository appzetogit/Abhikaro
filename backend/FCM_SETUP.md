# FCM Push Notifications Setup

## Backend Configuration

Add these variables to your `backend/.env` file:

```env
# Firebase Admin SDK (for FCM)
FIREBASE_PROJECT_ID=abhikaro-d2df6
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@abhikaro-d2df6.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...your key...\n-----END PRIVATE KEY-----\n"
```

**Important:**
- The `FIREBASE_PRIVATE_KEY` must keep `\n` as literal backslash-n in the .env file (dotenv will parse it)
- Never commit .env or expose these credentials in frontend code

## Web Push (VAPID Key)

For web push notifications, add the VAPID key:

1. Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
2. Generate a key pair if you haven't already
3. Add to Admin Panel → 3rd Party Configurations → Firebase → **Firebase VAPID Key (Web Push)**
4. Or set `FIREBASE_VAPID_KEY` in Admin env variables

## API Endpoints

- `POST /api/fcm/register-token` – Register FCM token (requires auth)
- `POST /api/fcm/remove-token` – Remove token on logout

## Notification Triggers

- **Signup**: Welcome notification
- **Login**: Login alert
- **Restaurant/Hotel**: New order received, Commission updated
- **Delivery**: Order assigned
