import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "./modules/order/models/Order.js";

dotenv.config();

async function checkOrders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to DB");

    const hotelId = "HOTEL-1771058758254-3489";
    const hotelObjectId = new mongoose.Types.ObjectId(
      "67ae3726283fd2205f830dbb",
    );

    const query = {
      $or: [
        { hotelId: hotelObjectId },
        { hotelReference: hotelId },
        { hotelReference: hotelObjectId.toString() },
      ],
    };

    const orders = await Order.find(query).select(
      "orderId status pricing.total hotelCommission commissionDistributed",
    );

    console.log("ORDER_REPORT_START");
    orders.forEach((o) => {
      console.log(
        `Order: ${o.orderId}, Status: ${o.status}, Total: ${o.pricing?.total}, Commission: ${o.hotelCommission}, Distributed: ${o.commissionDistributed}`,
      );
    });
    console.log("ORDER_REPORT_END");

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkOrders();
