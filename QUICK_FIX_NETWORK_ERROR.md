# 🚨 Quick Fix for Network Error

## Immediate Steps:

### 1. Check Backend is Running
```bash
# Open browser and go to:
http://localhost:5000/health
```
**Expected**: Should show JSON with `"status": "OK"`

### 2. Check Frontend .env File
**File**: `frontend/.env` or `frontend/.env.local`

Make sure it has:
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### 3. Restart Frontend
```bash
cd frontend
# Stop (Ctrl+C) if running
npm run dev
```

### 4. Check Browser Console
Open browser DevTools (F12) → Console

Look for:
- `🌐 API Base URL: http://localhost:5000/api`
- Any red error messages

### 5. Check Network Tab
DevTools → Network tab → Look for failed requests

---

## If Still Not Working:

### Check Backend Logs
Look at the terminal where you ran `npm run dev` for backend

**Common Errors**:
- MongoDB connection error
- Port already in use
- Syntax error

### Test Backend Directly
```bash
# In browser or Postman
GET http://localhost:5000/api/restaurant/list
```

---

## Most Common Causes:

1. **Frontend .env missing or wrong**
   - Fix: Add `VITE_API_BASE_URL=http://localhost:5000/api`

2. **Backend not running**
   - Fix: Start backend with `npm run dev`

3. **CORS issue**
   - Fix: Check `CORS_ORIGIN` in backend `.env`

4. **Port conflict**
   - Fix: Kill process on port 5000 or change PORT in `.env`

---

**Share the exact error message from browser console for more specific help!**
