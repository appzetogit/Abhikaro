import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getOrders } from '../modules/admin/controllers/orderController.js';

dotenv.config();

// Create mock Express request and response to run getOrders controller
async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const req = {
      query: {
        page: '1',
        limit: '500',
        restaurant: '69ae9d787592fd06e444100c'
      }
    };

    let responseData = null;
    const res = {
      status: function(code) {
        return this;
      },
      json: function(data) {
        responseData = data;
        return this;
      }
    };

    await getOrders(req, res);

    if (responseData && responseData.success) {
      const orders = responseData.data.orders;
      console.log(`API returned ${orders.length} orders.`);
      
      let totalOrders = orders.length;
      let orderTotal = 0;
      let restaurantTotal = 0;
      let adminTotal = 0;
      let counted = 0;

      for (const o of orders) {
        const isDelivered = String(o.orderStatus || o.status || "").toLowerCase() === "delivered";
        const isPaid = String(o.paymentStatus || "").toLowerCase() === "paid";
        
        if (!isDelivered || !isPaid) continue;
        
        counted++;
        const e = o.earnings || {};
        orderTotal += Number(o.totalAmount ?? e.orderTotal ?? 0);
        restaurantTotal += Number(e.restaurantEarning ?? 0);
        adminTotal += Number(e.adminEarning ?? 0);
      }

      console.log(`Delivered & Paid orders count: ${counted}`);
      console.log(`Total Revenue (orderTotal): ₹${orderTotal.toFixed(2)}`);
      console.log(`Restaurant Total: ₹${restaurantTotal.toFixed(2)}`);
      console.log(`Admin Total: ₹${adminTotal.toFixed(2)}`);
    } else {
      console.log('API call failed:', responseData);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
