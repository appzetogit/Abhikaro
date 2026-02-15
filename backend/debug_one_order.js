import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "./modules/order/models/Order.js";

dotenv.config();

async function debugOrder() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const hotelId = "HOTEL-1771058758254-3489";
    const order = await Order.findOne({ hotelReference: hotelId }).lean();

    console.log("SPECIFIC_DATA_START");
    if (order) {
      console.log(`orderId: ${order.orderId}`);
      console.log(`status: ${order.status}`);
      console.log(`total: ${order.pricing?.total}`);
      console.log(`hotelCommission: ${order.hotelCommission}`);
      console.log(`commissionDistributed: ${order.commissionDistributed}`);
      console.log(
        `commissionPercentages: ${JSON.stringify(order.commissionPercentages)}`,
      );
      console.log(
        `commissionBreakdown: ${JSON.stringify(order.commissionBreakdown)}`,
      );
    } else {
      console.log("No order found");
    }
    console.log("SPECIFIC_DATA_END");

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debugOrder();
