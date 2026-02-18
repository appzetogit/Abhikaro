# 🔧 Troubleshooting Guide - Network Error

## Quick Checks

### 1. Backend Server Running?
```bash
# Check if backend is running on port 5000
# You should see logs like:
# "Server running in development mode on port 5000"
# "MongoDB Connected"
```

### 2. Check Backend Logs
Look for any errors in the terminal where you ran `npm run dev`

### 3. Test Backend Health Endpoint
Open browser and go to: `http://localhost:5000/health`

Should return:
```json
{
  "status": "OK",
  "timestamp": "...",
  "uptime": ...
}
```

### 4. Check Frontend Console
Open browser DevTools (F12) → Console tab
Look for:
- `🌐 API Base URL: http://localhost:5000/api`
- Any CORS errors
- Network tab → Check failed requests

---

## Common Issues & Fixes

### Issue 1: Backend Not Starting
**Symptoms**: No logs, port 5000 not accessible

**Fix**:
1. Check if port 5000 is already in use:
   ```bash
   # Windows
   netstat -ano | findstr :5000
   
   # Kill process if needed
   taskkill /PID <PID> /F
   ```

2. Check MongoDB connection:
   - Is MongoDB running?
   - Is `MONGODB_URI` correct in `.env`?

3. Check for syntax errors:
   ```bash
   cd Backend
   node server.js
   # Look for any error messages
   ```

### Issue 2: CORS Error
**Symptoms**: Browser console shows CORS error

**Fix**:
1. Check `CORS_ORIGIN` in `.env`:
   ```env
   CORS_ORIGIN=http://localhost:5173
   ```

2. Backend CORS is configured to allow localhost in development
   - Check `server.js` line 405 - should allow localhost

### Issue 3: Redis Connection Error (Non-Critical)
**Symptoms**: Warning about Redis, but server still runs

**Fix**:
- Redis is optional - server works without it
- If you want Redis:
  ```env
  REDIS_ENABLED=true
  REDIS_HOST=localhost
  REDIS_PORT=6379
  ```

### Issue 4: Frontend Can't Connect
**Symptoms**: Network Error in frontend console

**Fix**:
1. Check frontend `.env` file:
   ```env
   VITE_API_BASE_URL=http://localhost:5000/api
   ```

2. Restart frontend after changing `.env`:
   ```bash
   # Stop frontend (Ctrl+C)
   # Start again
   npm run dev
   ```

3. Check browser console for actual API URL:
   - Should see: `🌐 API Base URL: http://localhost:5000/api`

---

## Step-by-Step Debugging

### Step 1: Verify Backend
```bash
cd Backend
npm run dev
```

**Expected Output**:
```
[nodemon] starting `node server.js`
Server running in development mode on port 5000
MongoDB Connected: ...
⚠️ Redis not available - Socket.IO will work in single-server mode
Rate limiting disabled (development mode)
```

### Step 2: Test Backend Directly
Open browser: `http://localhost:5000/health`

**Expected**: JSON response with status OK

### Step 3: Test API Endpoint
Open browser: `http://localhost:5000/api/restaurant/list`

**Expected**: JSON response with restaurants (or empty array)

### Step 4: Check Frontend
1. Open frontend in browser
2. Open DevTools (F12)
3. Go to Console tab
4. Look for:
   - `🌐 API Base URL: http://localhost:5000/api`
   - Any error messages

5. Go to Network tab
6. Try to load a page
7. Check failed requests:
   - Click on failed request
   - Check "Headers" tab
   - Check "Response" tab

---

## Quick Fixes

### Fix 1: Restart Everything
```bash
# Terminal 1 - Backend
cd Backend
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

### Fix 2: Clear Browser Cache
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Or clear browser cache

### Fix 3: Check Firewall
- Windows Firewall might be blocking port 5000
- Temporarily disable to test

### Fix 4: Check .env Files
**Backend `.env`**:
```env
PORT=5000
MONGODB_URI=your_mongodb_uri
CORS_ORIGIN=http://localhost:5173
```

**Frontend `.env`**:
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

---

## Still Not Working?

1. **Check Backend Logs**: Look for any error messages
2. **Check Browser Console**: Look for specific error messages
3. **Check Network Tab**: See which request is failing
4. **Try Direct API Call**: Use Postman or curl to test backend

---

## Test Commands

### Test Backend Health
```bash
curl http://localhost:5000/health
```

### Test Restaurant API
```bash
curl http://localhost:5000/api/restaurant/list
```

### Test with Authentication
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/user/profile
```

---

**If you see specific error messages, share them and I can help debug further!**
