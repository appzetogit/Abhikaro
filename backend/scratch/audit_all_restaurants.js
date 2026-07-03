import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Hotel from '../modules/hotel/models/Hotel.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';
import RestaurantCommission from '../modules/admin/models/RestaurantCommission.js';
import CommissionSettings from '../modules/admin/models/CommissionSettings.js';

dotenv.config();

// Date when the bug in QR commissions for specific restaurants was fixed: June 11, 2026.
// Also, Kirpa Restaurant had a specific commission change date on June 20th.
// Other restaurants might also have specific commission dates, but the calculation logic should match
// what is currently defined in RestaurantCommission.
// Wait, to be safe, if a restaurant has a RestaurantCommission document, that setup defines their rate.
// Let's check when the RestaurantCommission was created.
// But wait, does the system support historical commission rates, or does it dynamically calculate
// DIRECT order commissions using the current configuration on settlement?
// As we saw in orderSettlementService.js, for DIRECT orders it looks up the current RestaurantCommission rules.
// But for QR orders, the historical rates are saved in Order.commissionBreakdown.
// If it's missing, it falls back to the current setup.
// Let's audit all orders and check their settlements.

async function runGlobalAudit() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const restaurants = await Restaurant.find({}).lean();
    console.log(`Found ${restaurants.length} restaurants. Starting audit...\n`);

    // Pre-fetch all hotels
    const hotelsList = await Hotel.find({}).lean();
    const hotelMap = new Map();
    hotelsList.forEach(h => {
      hotelMap.set(h._id.toString(), h);
      if (h.hotelId) hotelMap.set(h.hotelId, h);
    });

    // Fetch global QR commission settings
    let qrGlobalCommission = { hotel: 10, admin: 20 };
    try {
      const latest = await CommissionSettings.findOne().sort({ createdAt: -1 }).lean();
      if (latest?.qrCommission) {
        qrGlobalCommission = {
          hotel: Number(latest.qrCommission.hotel || 10),
          admin: Number(latest.qrCommission.admin || 20)
        };
      }
    } catch (_) {}

    const auditResults = [];
    let grandTotalOrders = 0;
    let grandTotalMismatches = 0;

    for (const rest of restaurants) {
      const restaurantIdStr = rest._id.toString();
      const restaurantPublicId = rest.restaurantId?.toString();
      const restaurantSlug = rest.slug?.toString();

      const variations = [
        restaurantIdStr,
        restaurantPublicId,
        restaurantSlug
      ].filter(Boolean);

      // Find all delivered orders for this restaurant
      const orders = await Order.find({
        restaurantId: { $in: variations },
        status: 'delivered'
      }).sort({ createdAt: 1 }).lean();

      if (orders.length === 0) continue;

      // Find all settlements for these orders
      const orderIds = orders.map(o => o._id);
      const settlements = await OrderSettlement.find({ orderId: { $in: orderIds } }).lean();
      const settlementMap = new Map();
      settlements.forEach(s => settlementMap.set(s.orderId.toString(), s));

      // Fetch restaurant commission setup
      const restCommDoc = await RestaurantCommission.findOne({ restaurant: rest._id, status: true }).lean();
      
      const mismatches = [];
      let matchedCount = 0;
      let totalUnderpaid = 0;
      let totalOverpaid = 0;

      for (const order of orders) {
        const isQR = order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId;
        const orderDate = new Date(order.createdAt);

        const subtotal = order.pricing?.subtotal || 0;
        const discount = order.pricing?.discount || 0;
        const foodPrice = Math.max(0, subtotal - discount);

        // Determine Hotel details if QR
        let hotelPct = 0;
        let adminPct = 0;
        if (isQR) {
          const hotelRef = order.hotelId || order.hotelReference;
          const hotelDoc = hotelMap.get(hotelRef?.toString());
          if (hotelDoc) {
            hotelPct = Number(hotelDoc.commission) || 10;
            adminPct = Number(hotelDoc.adminCommission) || 20;
          } else {
            hotelPct = qrGlobalCommission.hotel;
            adminPct = qrGlobalCommission.admin;
          }
        }

        // Expected Commission calculations
        let expectedCommissionRate = 0;
        let expectedRestaurantCommission = 0;
        let expectedRestaurantEarning = 0;
        let expectedHotelEarning = 0;
        let expectedAdminCommission = 0;

        // Determine expected commission percentage based on rules or defaults
        // For Kirpa Restaurant, we have the June 20th rule.
        // For other restaurants, let's look at restCommDoc.
        if (restCommDoc) {
          // Determine rate
          // Calculate using restCommDoc's calculateCommission logic:
          // Since we are lean, let's write the rule selector:
          const sortedRules = [...(restCommDoc.commissionRules || [])]
            .filter(r => r.isActive)
            .sort((a, b) => b.priority - a.priority || a.minOrderAmount - b.minOrderAmount);

          let matchingRule = null;
          for (const rule of sortedRules) {
            if (foodPrice >= rule.minOrderAmount) {
              if (rule.maxOrderAmount === null || foodPrice <= rule.maxOrderAmount) {
                matchingRule = rule;
                break;
              }
            }
          }

          let rate = 30; // fallback default
          if (matchingRule) {
            rate = matchingRule.value;
          } else if (restCommDoc.defaultCommission) {
            rate = restCommDoc.defaultCommission.value;
          }

          // Special hardcoded historical adjustment for Kirpa Restaurant
          if (restaurantIdStr === '69ae9d787592fd06e444100c') {
            const COMMISSION_CHANGE_DATE = new Date('2026-06-20T05:19:27.575Z');
            rate = orderDate < COMMISSION_CHANGE_DATE ? 15 : 20;
          }

          expectedCommissionRate = rate;

          if (isQR) {
            expectedRestaurantCommission = Math.round(foodPrice * (rate / 100) * 100) / 100;
            expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
            expectedHotelEarning = Math.round(foodPrice * (hotelPct / 100) * 100) / 100;
            expectedAdminCommission = Math.round(Math.max(0, expectedRestaurantCommission - expectedHotelEarning) * 100) / 100;
          } else {
            expectedRestaurantCommission = Math.round(foodPrice * (rate / 100) * 100) / 100;
            expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
            expectedHotelEarning = 0;
            expectedAdminCommission = expectedRestaurantCommission;
          }
        } else {
          // No custom commission config setup
          if (isQR) {
            expectedHotelEarning = Math.round(foodPrice * (hotelPct / 100) * 100) / 100;
            expectedAdminCommission = Math.round(foodPrice * (adminPct / 100) * 100) / 100;
            expectedRestaurantCommission = expectedHotelEarning + expectedAdminCommission;
            expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
            expectedCommissionRate = hotelPct + adminPct;
          } else {
            // Default 30%
            expectedCommissionRate = 30;
            expectedRestaurantCommission = Math.round(foodPrice * 0.3 * 100) / 100;
            expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
            expectedAdminCommission = expectedRestaurantCommission;
          }
        }

        // Compare with Stored
        const settlement = settlementMap.get(order._id.toString());
        let storedRestaurantEarning = 0;
        if (settlement) {
          storedRestaurantEarning = settlement.restaurantEarning?.netEarning || 0;
        } else {
          storedRestaurantEarning = order.restaurantShare || order.commissionBreakdown?.restaurant || 0;
        }

        const diff = Math.round((storedRestaurantEarning - expectedRestaurantEarning) * 100) / 100;
        const isMatch = Math.abs(diff) < 0.05;

        if (isMatch) {
          matchedCount++;
        } else {
          mismatches.push({
            orderId: order.orderId,
            orderDate: orderDate.toISOString().split('T')[0],
            orderType: order.orderType || (isQR ? 'QR' : 'DIRECT'),
            foodPrice,
            expectedRate: expectedCommissionRate,
            storedEarning: storedRestaurantEarning,
            expectedEarning: expectedRestaurantEarning,
            diff
          });

          if (diff < 0) {
            totalUnderpaid += Math.abs(diff);
          } else {
            totalOverpaid += diff;
          }
        }
      }

      grandTotalOrders += orders.length;
      grandTotalMismatches += mismatches.length;

      if (mismatches.length > 0) {
        auditResults.push({
          restaurantName: rest.name,
          restaurantId: restaurantIdStr,
          publicId: restaurantPublicId || 'N/A',
          totalOrders: orders.length,
          mismatchCount: mismatches.length,
          totalUnderpaid: Math.round(totalUnderpaid * 100) / 100,
          totalOverpaid: Math.round(totalOverpaid * 100) / 100,
          mismatches
        });
      }
    }

    console.log(`\nGlobal Audit Finished!`);
    console.log(`Total Orders Checked: ${grandTotalOrders}`);
    console.log(`Total Mismatched Orders: ${grandTotalMismatches}`);
    console.log(`Restaurants with Discrepancies: ${auditResults.length}\n`);

    // Write JSON report
    fs.writeFileSync('scratch/all_restaurants_audit_report.json', JSON.stringify({
      grandTotalOrders,
      grandTotalMismatches,
      restaurantsWithMismatchesCount: auditResults.length,
      restaurantsWithMismatches: auditResults
    }, null, 2));

    // Write MD report
    let mdContent = `# Global Audit Report: All Restaurant Calculations\n\n`;
    mdContent += `Generated: ${new Date().toLocaleString()}\n\n`;
    mdContent += `### Summary\n`;
    mdContent += `- **Total Orders Audited**: ${grandTotalOrders}\n`;
    mdContent += `- **Total Mismatched Orders**: ${grandTotalMismatches}\n`;
    mdContent += `- **Restaurants with Mismatches**: ${auditResults.length}\n\n`;

    if (auditResults.length > 0) {
      mdContent += `## Restaurants with Discrepancies\n\n`;
      auditResults.forEach(r => {
        mdContent += `### ${r.restaurantName} (ID: ${r.publicId} / ${r.restaurantId})\n`;
        mdContent += `- **Total Orders**: ${r.totalOrders}\n`;
        mdContent += `- **Mismatched Orders**: ${r.mismatchCount}\n`;
        mdContent += `- **Total Underpaid to Restaurant**: ₹${r.totalUnderpaid.toFixed(2)}\n`;
        mdContent += `- **Total Overpaid to Restaurant**: ₹${r.totalOverpaid.toFixed(2)}\n\n`;

        mdContent += `| Order ID | Date | Type | Food Price | Rate | Stored Earning | Expected Earning | Difference |\n`;
        mdContent += `|---|---|---|---|---|---|---|---|\n`;
        r.mismatches.forEach(m => {
          mdContent += `| ${m.orderId} | ${m.orderDate} | ${m.orderType} | ₹${m.foodPrice.toFixed(2)} | ${m.expectedRate}% | ₹${m.storedEarning.toFixed(2)} | ₹${m.expectedEarning.toFixed(2)} | ₹${m.diff.toFixed(2)} |\n`;
        });
        mdContent += `\n---\n\n`;
      });
    } else {
      mdContent += `## 🎉 All restaurant calculations are 100% correct! No mismatches found.\n`;
    }

    fs.writeFileSync('scratch/all_restaurants_audit_report.md', mdContent);
    console.log('Saved reports to scratch/all_restaurants_audit_report.json and .md');

    await mongoose.disconnect();
  } catch (err) {
    console.error('Global Audit Error:', err);
    try { await mongoose.disconnect(); } catch (_) {}
  }
}

runGlobalAudit();
