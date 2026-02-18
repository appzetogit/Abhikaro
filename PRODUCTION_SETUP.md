# 🚀 Production Setup Guide

## API Configuration

### Production API URL
```
https://api.foods.abhikaro.in/api
```

### Frontend Environment Files

#### 1. `.env.production` (For Production Build)
```env
VITE_API_BASE_URL=https://api.foods.abhikaro.in/api
```

#### 2. `.env.development` (For Development)
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

#### 3. `.env.local` (Local Overrides - Optional)
```env
# This file overrides other .env files
# Use for local testing with production API
VITE_API_BASE_URL=https://api.foods.abhikaro.in/api
```

---

## Build Commands

### Development
```bash
cd frontend
npm run dev
# Uses: .env.development → http://localhost:5000/api
```

### Production Build
```bash
cd frontend
npm run build
# Uses: .env.production → https://api.foods.abhikaro.in/api
```

---

## Environment File Priority

Vite loads environment files in this order (higher priority overrides lower):

1. `.env.[mode].local` (highest priority)
2. `.env.local`
3. `.env.[mode]` (production/development)
4. `.env` (lowest priority)

---

## Current Configuration

✅ **Created Files**:
- `frontend/.env.production` - Production API URL
- `frontend/.env.development` - Development API URL
- `frontend/.env.example` - Example template

✅ **Updated**:
- `frontend/src/lib/api/config.js` - Auto-detects production mode

---

## Verification

### Check Current API URL
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for: `🌐 API Base URL: https://api.foods.abhikaro.in/api`

### Test Production API
```bash
curl https://api.foods.abhikaro.in/api/restaurant/list
```

---

## Important Notes

1. **Vite Environment Variables**: 
   - Must start with `VITE_`
   - Are embedded at BUILD TIME, not runtime
   - Must rebuild frontend after changing

2. **Production Build**:
   ```bash
   npm run build
   # This will use .env.production
   ```

3. **Development Mode**:
   ```bash
   npm run dev
   # This will use .env.development
   ```

---

## Troubleshooting

### Issue: Still using localhost in production
**Fix**: 
1. Check `.env.production` file exists
2. Rebuild frontend: `npm run build`
3. Clear browser cache

### Issue: Network Error
**Fix**:
1. Verify API URL in browser console
2. Test API directly: `https://api.foods.abhikaro.in/api/health`
3. Check CORS settings on backend

---

**Status**: ✅ Production API URL configured
