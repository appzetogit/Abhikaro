# Dining Module Replacement – Tastizo → Abhikaro

This document summarizes the replacement of the Abhikaro Dining module with the Tastizo dining implementation.

---

## 1. Backend Changes

### Removed
- **Entire** `backend/modules/dining/` folder (previous Abhikaro dining: routes, controllers, models).

### Added / Replaced
- **`backend/modules/dining/`** – Full Tastizo dining module:
  - **Routes:** `diningRoutes.js`, `diningAdminRoutes.js`
  - **Controllers:** `diningController.js`, `diningAdminController.js`
  - **Models:** `TableBooking.js`, `DiningCoupon.js`, `DiningReview.js`, `DiningCategory.js`, `DiningRestaurant.js`, `DiningOfferBanner.js`, `DiningStory.js`, `DiningLimelight.js`, `DiningBankOffer.js`, `DiningMustTry.js`
  - **Index:** `index.js` (exports main dining router)

- **Restaurant module**
  - **Model:** `backend/modules/restaurant/models/RestaurantDiningOffer.js`
  - **Controller:** `backend/modules/restaurant/controllers/diningManagementController.js`
  - **Routes in** `backend/modules/restaurant/index.js`:
    - `GET/PATCH /dining-config`, `POST /dining-config/request-enable`
    - `GET /dining-offers`, `POST /dining-offers`, `PATCH /dining-offers/:offerId`, `DELETE /dining-offers/:offerId`
    - `GET /dining-menu`, `PATCH /dining-menu/items`

- **Admin module**
  - **Controllers:** `diningCouponController.js`, `diningEarningsController.js`
  - **Routes in** `backend/modules/admin/routes/adminRoutes.js`:
    - `GET/POST /dining-coupons`, `GET/PUT/DELETE /dining-coupons/:id`, `PATCH /dining-coupons/:id/status`
    - `GET /dining-earnings`
    - `PATCH /restaurants/:id/dining-seating` (from diningManagementController)

### Server
- **`server.js`** – Unchanged: still mounts:
  - `app.use('/api/dining', diningRoutes)`
  - `app.use('/api/admin/dining', diningAdminRoutes)`

### Restaurant model
- **`backend/modules/restaurant/models/Restaurant.js`** – Extended for Tastizo:
  - `diningConfig` (Mixed) added.
  - `diningSettings`: added `requestStatus`, `lastRequestAt`, `lastDecisionAt` (existing: `isEnabled`, `maxGuests`, `diningType`).

---

## 2. Frontend Changes

### API config (`frontend/src/lib/api/config.js`)
- **DINING** endpoints added/updated:
  - `RESTAURANT_OFFERS_BY_SLUG`, `BOOKING_SEND_BILL`, `BOOKING_APPLY_COUPON`, `BOOKING_CREATE_PAYMENT`, `BOOKING_VERIFY_PAYMENT`

### API client (`frontend/src/lib/api/index.js`)
- **diningAPI:**  
  `getRestaurantOffersBySlug`, `sendBill`, `applyCoupon`, `createDiningPaymentOrder`, `verifyDiningPayment`
- **adminAPI:**  
  `getDiningCoupons`, `getDiningCouponById`, `createDiningCoupon`, `updateDiningCoupon`, `deleteDiningCoupon`, `toggleDiningCouponStatus`, `getDiningEarnings`

### User dining pages (replaced with Tastizo)
- `frontend/src/module/user/pages/`:  
  `Dining.jsx`, `DiningCategory.jsx`, `DiningRestaurants.jsx`, `DiningExplore50.jsx`, `DiningExploreNear.jsx`
- `frontend/src/module/user/pages/dining/`:  
  `DiningRestaurantDetails.jsx`, `TableBooking.jsx`, `TableBookingConfirmation.jsx`, `TableBookingSuccess.jsx`, `MyBookings.jsx`

### Restaurant dining pages (replaced with Tastizo)
- `frontend/src/module/restaurant/pages/DiningReservations.jsx`
- `frontend/src/module/restaurant/pages/DiningManagement.jsx`

### Admin dining pages
- **New:**  
  `frontend/src/module/admin/pages/dining/DiningCoupons.jsx`, `DiningEarnings.jsx`
- **Replaced:**  
  `frontend/src/module/admin/pages/system/DiningList.jsx`, `DiningManagement.jsx`

### Routing and nav
- **User:** Existing routes in `UserRouter.jsx` kept (e.g. `/dining`, `/dining/book/:slug`, `/bookings`).
- **Restaurant:** `App.jsx` still has `/restaurant/reservations` → `DiningReservations`.
- **Admin:** In `AdminRouter.jsx`:  
  `dining/coupons` → `DiningCoupons`, `dining/earnings` → `DiningEarnings`  
  (plus existing `dining-management`, `dining-list`).
- **Sidebar:** In `sidebarMenu.js`, under DINING MANAGEMENT:  
  “Dining Coupons” → `/admin/dining/coupons`, “Dining Earnings” → `/admin/dining/earnings`.

---

## 3. Compatibility Notes

- **Orders, delivery, campaigns, notifications, admin (non-dining):** Not changed; only the dining module was replaced.
- **Auth:** Dining uses existing `authenticate` (user), `authenticate` (restaurant), `authenticateAdmin` (admin). Paths in the Tastizo code match Abhikaro (`../../auth/middleware/auth.js`, etc.).
- **Payment:** Dining bill payment uses existing `modules/payment/services/razorpayService.js` and `shared/utils/envService.js` (`getRazorpayCredentials`).
- **Restaurant model:** `diningConfig` and extended `diningSettings` are backward compatible; existing `diningSettings` fields kept.

---

## 4. Flow Checklist (manual verification)

- [ ] User: browse dining restaurants (categories, list, details).
- [ ] User: book table (slot, guests) and see confirmation/success.
- [ ] User: “My bookings” list and status.
- [ ] Restaurant: dining config, offers, dining menu (if used).
- [ ] Restaurant: reservations list; update status (e.g. checked-in, dining_completed); send bill (amount + note).
- [ ] User: receive bill; apply coupon (if any); pay via Razorpay; see paid state.
- [ ] Admin: dining coupons CRUD and toggle status.
- [ ] Admin: dining earnings (summary + list, filters).
- [ ] Admin: dining list / management (categories, banners, stories) and restaurant dining settings as before.

---

## 5. Environment

- **Razorpay:** `RAZORPAY_KEY_ID` / `RAZORPAY_API_KEY`, `RAZORPAY_SECRET` (or whatever your `envService` / razorpay service uses).
- **Cloudinary:** Used by admin dining (e.g. categories, banners, stories); ensure `config/cloudinary.js` and upload middleware are configured.
- **MongoDB:** All dining models are registered when the app loads (dining, restaurant, admin modules).

No other env vars were added for this replacement.
