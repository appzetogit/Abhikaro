import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';
import AdminCommission from '../modules/admin/models/AdminCommission.js';

dotenv.config();

async function verify() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const totalCount = await AdminCommission.countDocuments({});
    console.log('Total AdminCommission records:', totalCount);

    const recentRecords = await AdminCommission.find({}).sort({ createdAt: -1 }).limit(5).lean();
    console.log('\n=== Recent AdminCommission Records ===');
    for (const r of recentRecords) {
      console.log(`Record _id: ${r._id}, OrderId: ${r.orderId}, Commission: ${r.commissionAmount}, Pct: ${r.commissionPercentage}, Earning: ${r.restaurantEarning}`);
    }

    const orderIdStr = 'ORD-1781162523268-886';
    const order = await Order.findOne({ orderId: orderIdStr }).lean();
    if (order) {
      const commissionRecord = await AdminCommission.findOne({ orderId: order._id }).lean();
      if (commissionRecord) {
        console.log('\n=== AdminCommission Record for ORD-1781162523268-886 ===');
        console.log('Commission Amount:', commissionRecord.commissionAmount);
        console.log('Commission Percentage:', commissionRecord.commissionPercentage);
        console.log('Restaurant Earning:', commissionRecord.restaurantEarning);
      } else {
        console.log('\nAdminCommission record not found for ORD-1781162523268-886');
      }
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

verify();
