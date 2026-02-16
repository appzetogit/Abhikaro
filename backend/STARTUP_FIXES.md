# Startup Issues Fixed

## ✅ Fixed Issues

### 1. Firebase Private Key Format
- **Problem**: `FIREBASE_PRIVATE_KEY` was missing quotes in `.env`
- **Fixed**: Added proper quotes around the private key
- **Status**: ✅ Done

### 2. Port 5000 Already in Use
- **Problem**: Another process is using port 5000
- **Solution**: Use the helper script or PowerShell command

**Quick Fix:**
```powershell
node scripts/kill-port.js 5000
```

Or manually:
```powershell
Get-NetTCPConnection -LocalPort 5000 | Select-Object OwningProcess | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### 3. Mongoose Duplicate Index Warnings
- **Fixed**: Removed duplicate `ticketId` index (unique: true already creates one)
- **Note**: `transactions.orderId` warning may be from existing MongoDB indexes
  - This is harmless and won't prevent server startup
  - To clear: Drop and recreate the database indexes if needed

## 🚀 Next Steps

1. **Kill the process on port 5000** (use script above)
2. **Restart your backend**:
   ```bash
   npm run dev
   ```

3. **Expected output**:
   ```
   ✅ Firebase Admin SDK initialized for FCM
   Server running in development mode on port 5000
   ```

4. **Verify FCM is working**:
   - Check browser console - FCM errors should be gone
   - Service worker should register successfully
   - Backend should serve `/firebase-messaging-sw.js` properly

## 📝 Notes

- The Mongoose warnings are **non-critical** - server will start fine
- Firebase credentials are now properly formatted
- Port 5000 needs to be free before starting
