# Restaurant Onboarding Flow - End-to-End Test Checklist

## Overview
This document outlines the complete test checklist for restaurant signup/onboarding flow including image uploads.

## Prerequisites
- ✅ Backend server running
- ✅ Frontend server running
- ✅ Cloudinary credentials configured
- ✅ Database connection active
- ✅ Restaurant authentication working

---

## Test Flow: Complete Restaurant Onboarding

### Step 1: Restaurant Registration & Authentication

#### 1.1 Send OTP
- [ ] **Endpoint**: `POST /api/restaurant/auth/send-otp`
- [ ] **Test**: Send OTP to phone number
- [ ] **Expected**: OTP sent successfully, response contains success message
- [ ] **Verify**: Check logs for OTP generation

#### 1.2 Verify OTP & Register
- [ ] **Endpoint**: `POST /api/restaurant/auth/verify-otp`
- [ ] **Test**: Verify OTP with purpose='register'
- [ ] **Expected**: Restaurant account created, JWT token returned
- [ ] **Verify**: 
  - Restaurant document created in database
  - Token is valid and contains restaurant role
  - Restaurant is initially inactive (isActive: false)

#### 1.3 Login (Alternative)
- [ ] **Endpoint**: `POST /api/restaurant/auth/verify-otp` (purpose='login')
- [ ] **Test**: Login with existing phone + OTP
- [ ] **Expected**: JWT token returned
- [ ] **Verify**: Token works for authenticated requests

---

### Step 2: Onboarding - Step 1 (Basic Information)

#### 2.1 Get Onboarding Data
- [ ] **Endpoint**: `GET /api/restaurant/onboarding`
- [ ] **Headers**: `Authorization: Bearer <token>`
- [ ] **Expected**: Returns existing onboarding data (or null if first time)
- [ ] **Verify**: Response structure matches expected format

#### 2.2 Save Step 1 Data
- [ ] **Endpoint**: `PUT /api/restaurant/onboarding`
- [ ] **Headers**: `Authorization: Bearer <token>`
- [ ] **Payload**:
  ```json
  {
    "step1": {
      "restaurantName": "Test Restaurant",
      "ownerName": "John Doe",
      "ownerEmail": "john@example.com",
      "ownerPhone": "9876543210",
      "primaryContactNumber": "9876543210",
      "location": {
        "addressLine1": "123 Main St",
        "addressLine2": "Floor 2",
        "area": "Downtown",
        "city": "Mumbai",
        "landmark": "Near Metro"
      }
    },
    "completedSteps": 1
  }
  ```
- [ ] **Expected**: 
  - Step 1 data saved in `restaurant.onboarding.step1`
  - Restaurant schema updated with step1 data (name, ownerName, etc.)
  - `completedSteps` set to 1
- [ ] **Verify**:
  - Database: Check `restaurant.onboarding.step1` exists
  - Database: Check `restaurant.name` = "Test Restaurant"
  - Database: Check `restaurant.ownerName` = "John Doe"
  - Response: Success message returned

---

### Step 3: Onboarding - Step 2 (Menu & Photos) - **CRITICAL IMAGE UPLOAD TEST**

#### 3.1 Upload Menu Images (Multiple)
- [ ] **Endpoint**: `POST /api/upload/media`
- [ ] **Headers**: `Authorization: Bearer <token>`
- [ ] **Method**: FormData with `file` field
- [ ] **Test Cases**:
  - [ ] Upload single menu image (JPG)
  - [ ] Upload multiple menu images (2-3 images)
  - [ ] Upload PNG image
  - [ ] Upload WebP image
  - [ ] Test file size limit (should reject >20MB)
  - [ ] Test invalid file type (should reject)
- [ ] **Expected**: 
  - Each upload returns `{ url, publicId, resourceType, bytes, format }`
  - Images uploaded to Cloudinary folder: `appzeto/restaurant/menu`
  - URLs are accessible
- [ ] **Verify**:
  - Cloudinary: Images visible in dashboard
  - Response: Valid secure_url returned
  - Response: publicId is correct format

#### 3.2 Upload Profile Image
- [ ] **Endpoint**: `POST /api/upload/media`
- [ ] **Headers**: `Authorization: Bearer <token>`
- [ ] **Method**: FormData with `file` field and `folder: "appzeto/restaurant/profile"`
- [ ] **Test Cases**:
  - [ ] Upload profile image (JPG)
  - [ ] Upload profile image (PNG)
  - [ ] Test file size limit
- [ ] **Expected**: 
  - Image uploaded to Cloudinary folder: `appzeto/restaurant/profile`
  - Returns `{ url, publicId }`
- [ ] **Verify**:
  - Cloudinary: Image visible in dashboard
  - URL is accessible

#### 3.3 Save Step 2 Data (With Images)
- [ ] **Endpoint**: `PUT /api/restaurant/onboarding`
- [ ] **Headers**: `Authorization: Bearer <token>`
- [ ] **Payload**:
  ```json
  {
    "step2": {
      "menuImageUrls": [
        { "url": "https://res.cloudinary.com/...", "publicId": "..." },
        { "url": "https://res.cloudinary.com/...", "publicId": "..." }
      ],
      "profileImageUrl": { "url": "https://res.cloudinary.com/...", "publicId": "..." },
      "cuisines": ["North Indian", "Chinese"],
      "deliveryTimings": {
        "openingTime": "10:00",
        "closingTime": "22:00"
      },
      "openDays": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    "completedSteps": 2
  }
  ```
- [ ] **Expected**: 
  - Step 2 data saved in `restaurant.onboarding.step2`
  - Restaurant schema updated:
    - `restaurant.profileImage` = profileImageUrl.url (string)
    - `restaurant.menuImages` = array of URLs (strings)
    - `restaurant.cuisines` = ["North Indian", "Chinese"]
    - `restaurant.deliveryTimings` = { openingTime, closingTime }
    - `restaurant.openDays` = ["Mon", "Tue", ...]
  - `completedSteps` set to 2
- [ ] **Verify**:
  - Database: `restaurant.onboarding.step2.menuImageUrls` is array of objects
  - Database: `restaurant.onboarding.step2.profileImageUrl` is object with url
  - Database: `restaurant.profileImage` is string URL (extracted from object)
  - Database: `restaurant.menuImages` is array of string URLs
  - Database: `restaurant.cuisines` matches payload
  - Database: `restaurant.openDays` matches payload
  - Response: Success message returned

#### 3.4 Test Flutter Base64 Upload (If Testing Mobile App)
- [ ] **Endpoint**: `POST /api/upload/base64`
- [ ] **Headers**: `Authorization: Bearer <token>`
- [ ] **Payload**:
  ```json
  {
    "base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "mimeType": "image/jpeg",
    "fileName": "camera_image.jpg",
    "folder": "appzeto/restaurant/menu"
  }
  ```
- [ ] **Expected**: 
  - Base64 converted to buffer
  - Image uploaded to Cloudinary
  - Returns `{ url, publicId }`
- [ ] **Verify**:
  - Cloudinary: Image visible in dashboard
  - URL is accessible
  - Response format matches regular upload

---

### Step 4: Onboarding - Step 3 (Legal & Bank Details) - **IMAGE UPLOAD TEST**

#### 4.1 Upload PAN Image
- [ ] **Endpoint**: `POST /api/upload/media`
- [ ] **Folder**: `appzeto/restaurant/pan`
- [ ] **Expected**: Image uploaded, URL returned
- [ ] **Verify**: Image accessible in Cloudinary

#### 4.2 Upload GST Image (If GST Registered)
- [ ] **Endpoint**: `POST /api/upload/media`
- [ ] **Folder**: `appzeto/restaurant/gst`
- [ ] **Expected**: Image uploaded, URL returned
- [ ] **Verify**: Image accessible in Cloudinary

#### 4.3 Upload FSSAI Image
- [ ] **Endpoint**: `POST /api/upload/media`
- [ ] **Folder**: `appzeto/restaurant/fssai`
- [ ] **Expected**: Image uploaded, URL returned
- [ ] **Verify**: Image accessible in Cloudinary

#### 4.4 Save Step 3 Data (With Images)
- [ ] **Endpoint**: `PUT /api/restaurant/onboarding`
- [ ] **Payload**:
  ```json
  {
    "step3": {
      "pan": {
        "panNumber": "ABCDE1234F",
        "nameOnPan": "John Doe",
        "image": { "url": "https://res.cloudinary.com/...", "publicId": "..." }
      },
      "gst": {
        "isRegistered": true,
        "gstNumber": "07ABCDE1234F1Z5",
        "legalName": "Test Restaurant Pvt Ltd",
        "address": "123 Main St, Mumbai",
        "image": { "url": "https://res.cloudinary.com/...", "publicId": "..." }
      },
      "fssai": {
        "registrationNumber": "12345678901234",
        "expiryDate": "2025-12-31",
        "image": { "url": "https://res.cloudinary.com/...", "publicId": "..." }
      },
      "bank": {
        "accountNumber": "1234567890",
        "ifscCode": "HDFC0001234",
        "accountHolderName": "John Doe",
        "accountType": "Current"
      }
    },
    "completedSteps": 3
  }
  ```
- [ ] **Expected**: 
  - Step 3 data saved in `restaurant.onboarding.step3`
  - All images stored as objects with url and publicId
  - `completedSteps` set to 3
- [ ] **Verify**:
  - Database: `restaurant.onboarding.step3.pan.image.url` exists
  - Database: `restaurant.onboarding.step3.gst.image.url` exists (if GST registered)
  - Database: `restaurant.onboarding.step3.fssai.image.url` exists
  - Database: `restaurant.onboarding.step3.bank.accountNumber` matches
  - Response: Success message returned

---

### Step 5: Onboarding - Step 4 (Display Information)

#### 5.1 Save Step 4 Data
- [ ] **Endpoint**: `PUT /api/restaurant/onboarding`
- [ ] **Payload**:
  ```json
  {
    "step4": {
      "estimatedDeliveryTime": "25-30 mins",
      "featuredDish": "Butter Chicken",
      "featuredPrice": 249,
      "offer": "Flat ₹50 OFF above ₹199"
    },
    "completedSteps": 4
  }
  ```
- [ ] **Expected**: 
  - Step 4 data saved in `restaurant.onboarding.step4`
  - Restaurant schema updated:
    - `restaurant.estimatedDeliveryTime` = "25-30 mins"
    - `restaurant.featuredDish` = "Butter Chicken"
    - `restaurant.featuredPrice` = 249
    - `restaurant.offer` = "Flat ₹50 OFF above ₹199"
  - `completedSteps` set to 4
  - Welcome email sent to restaurant owner
  - Admin alert email sent
- [ ] **Verify**:
  - Database: All step4 fields saved correctly
  - Database: `restaurant.onboarding.completedSteps` = 4
  - Email: Check inbox for welcome email
  - Email: Check admin inbox for alert
  - Response: Success with restaurant info

---

## Edge Cases & Error Handling Tests

### Image Upload Edge Cases
- [ ] **Test**: Upload without authentication token
  - **Expected**: 401 Unauthorized
- [ ] **Test**: Upload file > 20MB
  - **Expected**: 400 Bad Request with size limit error
- [ ] **Test**: Upload invalid file type (e.g., .exe)
  - **Expected**: 400 Bad Request with file type error
- [ ] **Test**: Upload with invalid base64 string
  - **Expected**: 400 Bad Request
- [ ] **Test**: Upload base64 without mimeType
  - **Expected**: Should default to image/jpeg

### Onboarding Edge Cases
- [ ] **Test**: Save step2 without images
  - **Expected**: Validation error (images required)
- [ ] **Test**: Save step2 with invalid image URLs
  - **Expected**: Should handle gracefully
- [ ] **Test**: Save step3 without PAN image
  - **Expected**: Validation error
- [ ] **Test**: Save step3 with GST registered but no GST image
  - **Expected**: Validation error
- [ ] **Test**: Save incomplete step data
  - **Expected**: Partial save allowed (only provided fields updated)

### Data Consistency Tests
- [ ] **Test**: Save step1, then step2, verify both saved
- [ ] **Test**: Update step1 after step2 saved, verify step2 not lost
- [ ] **Test**: Save step2 with existing menu images, add new ones
  - **Expected**: All images preserved (existing + new)
- [ ] **Test**: Reload page after saving step2, verify images load correctly

---

## Frontend Integration Tests

### Web Browser Tests
- [ ] **Test**: Click "Camera" button for menu images
  - **Expected**: Native camera/file picker opens
  - **Verify**: Image selected and preview shown
- [ ] **Test**: Click "Gallery" button for menu images
  - **Expected**: File picker opens
  - **Verify**: Multiple images can be selected
- [ ] **Test**: Upload images and proceed to next step
  - **Expected**: Images uploaded to Cloudinary before step2 save
  - **Verify**: URLs in payload are valid Cloudinary URLs

### Flutter App Tests (If Available)
- [ ] **Test**: Click "Camera" button in Flutter app
  - **Expected**: Flutter camera opens
  - **Verify**: JavaScript handler called, base64 returned
  - **Verify**: Image converted to File object
  - **Verify**: Image preview shown
- [ ] **Test**: Click "Gallery" button in Flutter app
  - **Expected**: Flutter gallery opens
  - **Verify**: JavaScript handler called, base64 returned
  - **Verify**: Image converted to File object
- [ ] **Test**: Upload via Flutter and save step2
  - **Expected**: Image uploaded via base64 endpoint
  - **Verify**: Image stored in Cloudinary
  - **Verify**: URL saved in database

---

## Database Verification Checklist

After completing all steps, verify in MongoDB:

```javascript
// Find restaurant
db.restaurants.findOne({ phone: "9876543210" })

// Verify structure:
{
  // Main schema
  name: "Test Restaurant",
  ownerName: "John Doe",
  profileImage: "https://res.cloudinary.com/...", // String URL
  menuImages: ["https://...", "https://..."], // Array of string URLs
  cuisines: ["North Indian", "Chinese"],
  deliveryTimings: { openingTime: "10:00", closingTime: "22:00" },
  openDays: ["Mon", "Tue", ...],
  estimatedDeliveryTime: "25-30 mins",
  featuredDish: "Butter Chicken",
  featuredPrice: 249,
  offer: "Flat ₹50 OFF above ₹199",
  
  // Onboarding subdocument
  onboarding: {
    completedSteps: 4,
    step1: { restaurantName, ownerName, ... },
    step2: {
      menuImageUrls: [{ url: "...", publicId: "..." }, ...], // Array of objects
      profileImageUrl: { url: "...", publicId: "..." }, // Object
      cuisines: [...],
      deliveryTimings: {...},
      openDays: [...]
    },
    step3: {
      pan: { panNumber, nameOnPan, image: { url, publicId } },
      gst: { isRegistered, gstNumber, image: { url, publicId } },
      fssai: { registrationNumber, expiryDate, image: { url, publicId } },
      bank: { accountNumber, ifscCode, ... }
    },
    step4: { estimatedDeliveryTime, featuredDish, ... }
  }
}
```

---

## Performance Tests

- [ ] **Test**: Upload 5 menu images simultaneously
  - **Expected**: All uploads complete successfully
  - **Verify**: No timeout errors
- [ ] **Test**: Upload large image (15MB)
  - **Expected**: Uploads successfully within reasonable time
- [ ] **Test**: Save step2 with 10 menu images
  - **Expected**: All images saved correctly
  - **Verify**: Database query performance acceptable

---

## Security Tests

- [ ] **Test**: Upload image with malicious filename
  - **Expected**: Filename sanitized or rejected
- [ ] **Test**: Upload image with script in metadata
  - **Expected**: Metadata cleaned by Cloudinary
- [ ] **Test**: Access other restaurant's onboarding data
  - **Expected**: 403 Forbidden (can only access own data)

---

## Notes

- All image uploads should go through Cloudinary
- Image URLs should be stored in database (not base64)
- Both object format `{url, publicId}` and string URLs should be handled
- Backend should extract URL from object when updating restaurant schema
- Flutter app should use base64 endpoint for mobile uploads
- Web browser should use multipart/form-data endpoint

---

## Test Results Template

```
Test Date: ___________
Tester: ___________
Environment: [ ] Development [ ] Staging [ ] Production

Step 1: [ ] Pass [ ] Fail - Notes: ___________
Step 2: [ ] Pass [ ] Fail - Notes: ___________
Step 3: [ ] Pass [ ] Fail - Notes: ___________
Step 4: [ ] Pass [ ] Fail - Notes: ___________
Step 5: [ ] Pass [ ] Fail - Notes: ___________

Image Uploads: [ ] Pass [ ] Fail - Notes: ___________
Flutter Integration: [ ] Pass [ ] Fail - Notes: ___________
Database Verification: [ ] Pass [ ] Fail - Notes: ___________

Overall Status: [ ] Ready for Production [ ] Needs Fixes

Issues Found:
1. ___________
2. ___________
3. ___________
```
