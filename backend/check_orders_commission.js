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

    const orders = await Order.find(query);

    console.log("RESULT_START");
    const summary = orders.map((o) => ({
      orderId: o.orderId,
      status: o.status,
      total: o.pricing?.total,
      hotelCommission: o.hotelCommission,
      commissionDistributed: !!o.commissionDistributed,
      paymentMethod: o.payment?.method,
      paymentStatus: o.payment?.status,
    }));
    console.log(JSON.stringify(summary, null, 2));
    console.log("RESULT_END");

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkOrders();
