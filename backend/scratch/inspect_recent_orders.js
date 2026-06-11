import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Fetch the 16 most recent orders
    const orders = await Order.find({})
      .sort({ createdAt: -1 })
      .limit(16)
      .lean();

    let output = `# Recent Orders Inspection Results (1 to 16)\n\n`;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const s = await OrderSettlement.findOne({ orderId: order._id }).lean();

      output += `## [#${i + 1}] Order ID: ${order.orderId}\n`;
      output += `- **Date**: ${order.createdAt}\n`;
      output += `- **Status**: ${order.status}\n`;
      output += `- **Restaurant**: ${order.restaurantName} (${order.restaurantId})\n`;
      output += `- **Hotel**: ${order.hotelName || 'N/A'} (Ref: ${order.hotelReference}, ID: ${order.hotelId})\n`;
      output += `- **Order Type**: ${order.orderType}\n`;
      output += `- **Payment**: Method: ${order.payment?.method}, Status: ${order.payment?.status}\n`;
      output += `- **Pricing**: Subtotal: ₹${order.pricing?.subtotal}, Discount: ₹${order.pricing?.discount}, Total: ₹${order.pricing?.total}\n`;
      output += `- **Stored Percentages**: ${JSON.stringify(order.commissionPercentages)}\n`;
      output += `- **Stored Breakdown**: ${JSON.stringify(order.commissionBreakdown)}\n`;
      output += `- **Flat Stored Values**: Hotel: ₹${order.hotelCommission}, Admin: ₹${order.adminCommission}, Restaurant: ₹${order.restaurantShare}\n`;
      output += `- **commissionDistributed**: ${order.commissionDistributed}\n`;
      
      if (s) {
        output += `### OrderSettlement\n`;
        output += `- **Status**: ${s.settlementStatus} | **Escrow**: ${s.escrowStatus}\n`;
        output += `- **User Payment**: ${JSON.stringify(s.userPayment)}\n`;
        output += `- **Restaurant Earning**: ${JSON.stringify(s.restaurantEarning)}\n`;
        output += `- **Admin Earning**: ${JSON.stringify(s.adminEarning)}\n`;
        output += `- **Hotel Earning**: ${JSON.stringify(s.hotelEarning)}\n`;
      } else {
        output += `### OrderSettlement: NOT FOUND\n`;
      }
      output += `\n---\n\n`;
    }

    fs.writeFileSync('inspect_results.md', output, 'utf8');
    console.log('Results written to inspect_results.md');

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
