# Flutter `flutter_inappwebview` → Hotel push notifications (Native FCM)

Hotel QR scan orders par Android notification (background/killed) **Web Push se reliable nahi hota**, isliye Flutter wrapper me **native FCM** use karo, aur token backend me `role=hotel` ke saath register karo.

## Backend contract
- **Register native token**: `POST /api/fcm/register-token`
  - Header: `Authorization: Bearer <hotel_access_token>`
  - Body:

```json
{ "fcmToken": "<native_fcm_token>", "platform": "android" }
```

- **Notification payload** (QR order):
  - `notification.title`: `QR is scanned`
  - `notification.body`: `Room: <room> • Order #<id>`
  - `data.type`: `hotel_qr_scanned`
  - `data.channelId`: `hotel_qr_scanned`

## Web → Flutter token handoff
Hotel web app login ke baad, web side (InAppWebView) native wrapper ko token pass karta hai:

```js
// WebView page context (already wired)
window.flutter_inappwebview?.callHandler('setAuthToken', {
  role: 'hotel',
  accessToken: '<JWT>',
  hotelId: '<id>'
})
```

Flutter side me `setAuthToken` handler capture karke access token store karo.

## Flutter (Android) essentials (reference)
- Packages:
  - `firebase_messaging`
  - `flutter_local_notifications`
- Ensure Android notification channel id matches `hotel_qr_scanned` (or map it).

Pseudo-flow:
1. Firebase initialize
2. Get native FCM token: `FirebaseMessaging.instance.getToken()`
3. After WebView login token received → call backend `/api/fcm/register-token` with `platform=android`
4. Handle notifications:
   - background/killed: use `FirebaseMessaging.onBackgroundMessage`
   - foreground: show local notification via `flutter_local_notifications`

## Troubleshooting checklist
- Hotel record me `fcmtokenMobile` null hai → push deliver nahi hoga (token register missing).
- Token invalid/expired → backend logs `messaging/registration-token-not-registered` and clears token.
- Android 13+: notification permission required.

