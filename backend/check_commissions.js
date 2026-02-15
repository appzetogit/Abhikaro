import mongoose from "mongoose";
import dotenv from "dotenv";
import OrderSettlement from "./modules/order/models/OrderSettlement.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function check() {
  try {
    await mongoose.connect(MONGODB_URI);
    const settlements = await OrderSettlement.find();
    console.log(`Total Settlements: ${settlements.length}`);

    let totalComm = 0;
    settlements.forEach((s, i) => {
      const comm = s.adminEarning?.commission || 0;
      totalComm += comm;
      console.log(`${i + 1}. Order: ${s.orderNumber}, Commission: ${comm}`);
    });

    console.log(`\nAggregate Total Commission: ${totalComm}`);

    const stats = await OrderSettlement.aggregate([
      {
        $group: {
          _id: null,
          totalCommission: { $sum: "$adminEarning.commission" },
          totalEarnings: { $sum: "$adminEarning.totalEarning" },
        },
      },
    ]);
    console.log("Aggregate Stats result:", JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

check();
