import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Hotel from '../modules/hotel/models/Hotel.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Date when the commission rate was updated from 15% to 20%
const COMMISSION_CHANGE_DATE = new Date('2026-06-20T05:19:27.575Z');

async function audit() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('Error: MONGODB_URI is not defined');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully.\n');

    const restaurantId = '69ae9d787592fd06e444100c'; // Kirpa Restaurant _id
    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) {
      console.error('Restaurant not found!');
      await mongoose.disconnect();
      return;
    }

    console.log(`Auditing orders for: ${restaurant.name} (${restaurant.restaurantId})`);

    // Fetch all orders for this restaurant
    const orders = await Order.find({
      $or: [
        { restaurantId: restaurantId },
        { restaurantId: restaurant.restaurantId }
      ]
    }).sort({ createdAt: 1 }).lean();

    console.log(`Found ${orders.length} total orders in history.`);

    // Pre-fetch all hotels to avoid repeating database queries
    const hotelsList = await Hotel.find({}).lean();
    const hotelMap = new Map();
    hotelsList.forEach(h => {
      hotelMap.set(h._id.toString(), h);
      if (h.hotelId) hotelMap.set(h.hotelId, h);
    });

    const reportRows = [];
    let totalDiscrepancies = 0;
    let totalUnderpaidAmount = 0;
    let totalOverpaidAmount = 0;

    for (const order of orders) {
      const isQR = order.orderType === 'QR' || !!order.hotelReference || !!order.hotelId;
      const orderDate = new Date(order.createdAt);
      
      // 1. Determine Correct Restaurant Commission Rate
      const expectedCommissionRate = orderDate < COMMISSION_CHANGE_DATE ? 15 : 20;

      // 2. Fetch stored settlement
      const settlement = await OrderSettlement.findOne({ orderId: order._id }).lean();
      
      const subtotal = order.pricing?.subtotal || 0;
      const discount = order.pricing?.discount || 0;
      const foodPrice = Math.max(0, subtotal - discount);

      // 3. Determine Hotel details if QR
      let hotelPct = 0;
      let hotelName = 'N/A';
      if (isQR) {
        const hotelRef = order.hotelId || order.hotelReference;
        const hotelDoc = hotelMap.get(hotelRef?.toString());
        if (hotelDoc) {
          hotelPct = Number(hotelDoc.commission) || 10;
          hotelName = hotelDoc.hotelName || hotelDoc.name;
        } else {
          hotelPct = 10; // Global fallback
          hotelName = order.hotelName || 'Fallback Hotel';
        }
      }

      // 4. Calculate Expected Splits (Should-Be)
      let expectedRestaurantCommission = 0;
      let expectedRestaurantEarning = 0;
      let expectedHotelEarning = 0;
      let expectedAdminCommission = 0;

      if (isQR) {
        // Under a proper system (hotel share is part of the total commission)
        expectedRestaurantCommission = Math.round(foodPrice * (expectedCommissionRate / 100) * 100) / 100;
        expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
        
        expectedHotelEarning = Math.round(foodPrice * (hotelPct / 100) * 100) / 100;
        expectedAdminCommission = Math.round(Math.max(0, expectedRestaurantCommission - expectedHotelEarning) * 100) / 100;
      } else {
        // Direct Order
        expectedRestaurantCommission = Math.round(foodPrice * (expectedCommissionRate / 100) * 100) / 100;
        expectedRestaurantEarning = Math.round((foodPrice - expectedRestaurantCommission) * 100) / 100;
        expectedHotelEarning = 0;
        expectedAdminCommission = expectedRestaurantCommission;
      }

      // 5. Retrieve Stored Splits
      // We check the OrderSettlement first (actual payout reference), then fallback to Order if settlement not found
      let storedRestaurantEarning = 0;
      let storedRestaurantCommission = 0;
      let storedHotelEarning = 0;
      let storedAdminCommission = 0;
      let settlementStatus = 'No Settlement';

      if (settlement) {
        storedRestaurantEarning = settlement.restaurantEarning?.netEarning || 0;
        storedRestaurantCommission = settlement.restaurantEarning?.commission || 0;
        storedHotelEarning = settlement.hotelEarning?.commission || 0;
        storedAdminCommission = settlement.adminEarning?.commission || 0;
        settlementStatus = settlement.restaurantEarning?.status || settlement.settlementStatus || 'Pending';
      } else {
        storedRestaurantEarning = order.restaurantShare || order.commissionBreakdown?.restaurant || 0;
        storedRestaurantCommission = (order.commissionBreakdown?.admin || 0) + (order.commissionBreakdown?.hotel || 0);
        storedHotelEarning = order.hotelCommission || order.commissionBreakdown?.hotel || 0;
        storedAdminCommission = order.adminCommission || order.commissionBreakdown?.admin || 0;
        settlementStatus = 'Pending (Order Only)';
      }

      // 6. Compare & Flag Discrepancies
      const diff = Math.round((storedRestaurantEarning - expectedRestaurantEarning) * 100) / 100;
      const isMatch = Math.abs(diff) < 0.05;
      
      let statusFlag = 'Match';
      if (!isMatch) {
        totalDiscrepancies++;
        if (diff < 0) {
          statusFlag = 'Underpaid';
          totalUnderpaidAmount += Math.abs(diff);
        } else {
          statusFlag = 'Overpaid';
          totalOverpaidAmount += diff;
        }
      }

      reportRows.push({
        orderId: order.orderId,
        date: orderDate.toISOString().split('T')[0],
        status: order.status,
        type: order.orderType || (isQR ? 'QR' : 'DIRECT'),
        foodPrice: foodPrice.toFixed(2),
        rate: `${expectedCommissionRate}%`,
        storedRestaurantEarning: storedRestaurantEarning.toFixed(2),
        expectedRestaurantEarning: expectedRestaurantEarning.toFixed(2),
        diff: diff.toFixed(2),
        statusFlag,
        settlementStatus
      });
    }

    // Write Report to markdown file
    let md = `# Audit Report: Kirpa Restaurant & Cafe\n\n`;
    md += `Generated: ${new Date().toLocaleString()}\n\n`;
    md += `### Summary\n`;
    md += `- **Total Orders Checked**: ${orders.length}\n`;
    md += `- **Correct Calculations (Match)**: ${orders.length - totalDiscrepancies}\n`;
    md += `- **Discrepancy Orders**: ${totalDiscrepancies}\n`;
    md += `- **Total Underpaid to Restaurant**: ₹${totalUnderpaidAmount.toFixed(2)}\n`;
    md += `- **Total Overpaid to Restaurant**: ₹${totalOverpaidAmount.toFixed(2)}\n\n`;
    
    md += `### Order Details Table\n\n`;
    md += `| Order ID | Date | Status | Type | Food Price | Rate | Stored Earning | Expected Earning | Difference | Audit Status | Settlement |\n`;
    md += `|---|---|---|---|---|---|---|---|---|---|---|\n`;

    reportRows.forEach(row => {
      const diffStr = row.diff > 0 ? `+${row.diff}` : row.diff;
      const flagEmoji = row.statusFlag === 'Match' ? '🟢' : row.statusFlag === 'Underpaid' ? '🔴 Underpaid' : '🟡 Overpaid';
      md += `| ${row.orderId} | ${row.date} | ${row.status} | ${row.type} | ₹${row.foodPrice} | ${row.rate} | ₹${row.storedRestaurantEarning} | ₹${row.expectedRestaurantEarning} | ₹${diffStr} | ${flagEmoji} | ${row.settlementStatus} |\n`;
    });

    const reportPath = path.resolve('scratch/kirpa_audit_report.md');
    fs.writeFileSync(reportPath, md);
    console.log(`\nAudit finished! Report saved to: ${reportPath}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Audit Error:', error);
    try { await mongoose.disconnect(); } catch (e) {}
  }
}

audit();
