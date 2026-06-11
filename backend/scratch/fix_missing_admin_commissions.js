import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const ordersToFix = [
      { orderId: 'ORD-1781156016888-690', adminComm: 56.25, adminPct: 15, restEarn: 281.25, subtotal: 375 },
      { orderId: 'ORD-1781162523268-886', adminComm: 75.60, adminPct: 15, restEarn: 378.00, subtotal: 504 }
    ];

    for (const item of ordersToFix) {
      const order = await Order.findOne({ orderId: item.orderId }).lean();
      if (!order) {
        console.log(`Order ${item.orderId} not found!`);
        continue;
      }

      // Check if AdminCommission record exists, delete if any old one exists
      await AdminCommission.deleteMany({ orderId: order._id });

      let finalRestaurantId = order.restaurantId;
      if (finalRestaurantId && !mongoose.Types.ObjectId.isValid(finalRestaurantId)) {
        const restDoc = await Restaurant.findOne({
          $or: [
            { restaurantId: finalRestaurantId },
            { slug: finalRestaurantId },
          ],
        }).lean();
        if (restDoc) {
          finalRestaurantId = restDoc._id;
        }
      }

      const newRecord = await AdminCommission.create({
        orderId: order._id,
        orderAmount: item.subtotal,
        commissionAmount: item.adminComm,
        commissionPercentage: item.adminPct,
        restaurantId: finalRestaurantId,
        restaurantName: order.restaurantName,
        restaurantEarning: item.restEarn,
        status: "completed",
        orderDate: order.createdAt || new Date(),
      });

      console.log(`✅ Created AdminCommission record for order ${item.orderId}:`);
      console.log(`   - Commission: ₹${newRecord.commissionAmount}`);
      console.log(`   - Percentage: ${newRecord.commissionPercentage}%`);
      console.log(`   - Restaurant Earning: ₹${newRecord.restaurantEarning}`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error running fix:', err);
  }
}

run();
