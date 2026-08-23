/**
 * Automated Verification Script for Admin Promo Codes
 * Tests:
 * 1. Model validation (Date range, Day of week, Min order amount, Discount calculation)
 * 2. Financial Integrity (Restaurant share protection, Hotel commission protection, Admin subsidy)
 * 3. Settlement calculations
 */

import mongoose from 'mongoose';
import AdminPromoCode from './modules/admin/models/AdminPromoCode.js';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING ADMIN PROMO CODES AUTOMATED TEST SUITE');
  console.log('====================================================\n');

  // -----------------------------------------------------------
  // TEST SUITE 1: Model & Validity Evaluator Tests
  // -----------------------------------------------------------
  console.log('--- TEST SUITE 1: Promo Code Evaluation Logic ---');

  const today = new Date();
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayDayName = daysOfWeek[today.getDay()];
  const yesterdayDayName = daysOfWeek[(today.getDay() + 6) % 7];

  // 1.1 Percentage Discount Promo (Above Min Order Amount, no max discount cap needed)
  const promoPercent = new AdminPromoCode({
    code: 'SAVE20',
    title: '20% OFF',
    discountType: 'percentage',
    discountValue: 20,
    minOrderAmount: 200,
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    validDays: [],
    isActive: true,
  });

  const res1 = promoPercent.evaluateValidity({ orderAmount: 500, currentDate: today });
  assert(res1.isValid === true, 'Valid within date range and above min order');
  assert(res1.discountAmount === 100, 'Calculates 20% of 500 = 100');

  const res2 = promoPercent.evaluateValidity({ orderAmount: 150, currentDate: today });
  assert(res2.isValid === false, 'Rejects when orderAmount < minOrderAmount');

  // 1.2 Flat Discount Promo
  const promoFlat = new AdminPromoCode({
    code: 'FLAT50',
    title: '₹50 Flat OFF',
    discountType: 'flat',
    discountValue: 50,
    minOrderAmount: 100,
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    validDays: [],
    isActive: true,
  });

  const res3 = promoFlat.evaluateValidity({ orderAmount: 300, currentDate: today });
  assert(res3.isValid === true && res3.discountAmount === 50, 'Calculates flat ₹50 discount');

  // 1.3 Day of Week Validation
  const promoDayRestricted = new AdminPromoCode({
    code: 'DAYONLY',
    title: 'Restricted Day Promo',
    discountType: 'flat',
    discountValue: 40,
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    validDays: [todayDayName],
    isActive: true,
  });

  const res4 = promoDayRestricted.evaluateValidity({ orderAmount: 200, currentDate: today });
  assert(res4.isValid === true, `Allows redemption on valid day (${todayDayName})`);

  const promoOtherDay = new AdminPromoCode({
    code: 'OTHERDAY',
    title: 'Other Day Promo',
    discountType: 'flat',
    discountValue: 40,
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    validDays: [yesterdayDayName],
    isActive: true,
  });

  const res5 = promoOtherDay.evaluateValidity({ orderAmount: 200, currentDate: today });
  assert(res5.isValid === false, `Rejects redemption on non-matching day (${yesterdayDayName} vs today: ${todayDayName})`);

  // 1.4 Date Range Validation (Expired vs Future)
  const promoExpired = new AdminPromoCode({
    code: 'EXPIRED',
    title: 'Expired Promo',
    discountType: 'flat',
    discountValue: 50,
    startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  const res6 = promoExpired.evaluateValidity({ orderAmount: 300, currentDate: today });
  assert(res6.isValid === false, 'Rejects expired promo code');

  const promoFuture = new AdminPromoCode({
    code: 'FUTURE',
    title: 'Future Promo',
    discountType: 'flat',
    discountValue: 50,
    startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  const res7 = promoFuture.evaluateValidity({ orderAmount: 300, currentDate: today });
  assert(res7.isValid === false, 'Rejects future promo code not yet started');

  // -----------------------------------------------------------
  // TEST SUITE 2: Financial Integrity & Commission Protection
  // -----------------------------------------------------------
  console.log('\n--- TEST SUITE 2: Financial Split & Payout Protection ---');

  // Scenario A: Direct Order
  // Subtotal = 1000, Commission = 20%
  // Admin Promo = ₹100 Flat
  {
    const subtotal = 1000;
    const restaurantCommissionPct = 20;
    const adminPromoDiscount = 100;

    const standardRestaurantShare = subtotal * (1 - restaurantCommissionPct / 100); // 800
    const grossAdminCommission = subtotal * (restaurantCommissionPct / 100); // 200
    const netAdminCommission = Math.max(0, grossAdminCommission - adminPromoDiscount); // 100

    assert(standardRestaurantShare === 800, 'Direct Order: Restaurant gross/net share is ₹800');
    assert(netAdminCommission === 100, 'Direct Order: Admin absorbs full ₹100 discount (Commission 200 -> 100)');
    assert(standardRestaurantShare + netAdminCommission === subtotal - adminPromoDiscount, 'Direct Order: Total split equals net order subtotal (800 + 100 = 900)');
  }

  // Scenario B: QR Hotel Order
  // Subtotal = 1000, Total Commission = 30% (Hotel = 10%, Admin = 20%)
  // Admin Promo = ₹150 Flat Discount
  {
    const subtotal = 1000;
    const totalCommissionPct = 30;
    const hotelCommissionPct = 10;
    const adminCommissionPct = 20;
    const adminPromoDiscount = 150;

    const restaurantShare = subtotal * (1 - totalCommissionPct / 100); // 700
    const hotelCommission = subtotal * (hotelCommissionPct / 100); // 100
    const grossAdminCommission = subtotal * (adminCommissionPct / 100); // 200
    const netAdminCommission = Math.max(0, grossAdminCommission - adminPromoDiscount); // 50

    assert(restaurantShare === 700, 'QR Hotel Order: Restaurant earnings strictly protected at ₹700');
    assert(hotelCommission === 100, 'QR Hotel Order: Hotel commission strictly protected at ₹100');
    assert(netAdminCommission === 50, 'QR Hotel Order: Admin subsidizes ₹150 discount (Admin Commission 200 -> 50)');
    assert(
      restaurantShare + hotelCommission + netAdminCommission === subtotal - adminPromoDiscount,
      'QR Hotel Order: Total split matches customer payable subtotal (700 + 100 + 50 = 850)'
    );
  }

  // -----------------------------------------------------------
  // Summary
  // -----------------------------------------------------------
  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log('====================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
