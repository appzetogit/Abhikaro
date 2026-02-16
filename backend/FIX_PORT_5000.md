# Fix Port 5000 Already in Use Error

## Quick Fix

Run this command in PowerShell (from the `backend` folder):

```powershell
Get-NetTCPConnection -LocalPort 5000 | Select-Object OwningProcess | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Or use the helper script:
```bash
node scripts/kill-port.js 5000
```

## Alternative Methods

### Method 1: Using Task Manager
1. Open Task Manager (Ctrl + Shift + Esc)
2. Go to "Details" tab
3. Find `node.exe` processes
4. Right-click → End Task

### Method 2: Find and Kill via PowerShell
```powershell
# Find the process
netstat -ano | findstr :5000

# Kill using the PID (replace <PID> with the number from above)
taskkill /PID <PID> /F
```

### Method 3: Change Port (if you can't kill the process)
Edit `backend/.env`:
```env
PORT=5001
```

Then update `frontend/vite.config.js` proxy target:
```js
proxy: {
  "/firebase-messaging-sw.js": {
    target: "http://localhost:5001",  // Change this
    changeOrigin: true,
  },
}
```

## After Fixing

1. ✅ Port 5000 is free
2. ✅ Firebase credentials are properly formatted in `.env`
3. ✅ Restart your backend: `npm run dev`

You should see:
```
✅ Firebase Admin SDK initialized for FCM
Server running in development mode on port 5000
```
