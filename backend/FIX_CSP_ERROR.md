# Fix Content Security Policy (CSP) Error

## Problem
CSP is blocking Firebase scripts from `gstatic.com`, causing service worker registration to fail.

## ✅ Fixed

I've updated:

1. **Backend Helmet Configuration** (`backend/server.js`):
   - Configured CSP to allow Firebase scripts from `gstatic.com`
   - Added necessary domains for Firebase services

2. **Frontend HTML Meta Tag** (`frontend/index.html`):
   - Added CSP meta tag to allow Firebase scripts

3. **Vite Dev Server Headers** (`frontend/vite.config.js`):
   - Added CSP headers for service worker files

## 🔄 Next Steps

1. **Restart both servers**:
   ```bash
   # Backend
   cd backend
   npm run dev
   
   # Frontend (in another terminal)
   cd frontend
   npm run dev
   ```

2. **Clear browser cache**:
   - Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
   - Or clear cache in DevTools → Application → Clear storage

3. **Unregister old service worker** (if needed):
   - Open DevTools → Application → Service Workers
   - Click "Unregister" for any existing service workers
   - Refresh the page

4. **Verify**:
   - Check console - CSP errors should be gone
   - Service worker should register successfully
   - FCM should work

## 📝 Note

If errors persist after restarting:
- Make sure backend is running on port 5000
- Check that `/firebase-messaging-sw.js` is accessible
- Verify Firebase config is in backend `.env`
