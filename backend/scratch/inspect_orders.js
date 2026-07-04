import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/database.js";
import Order from "../modules/order/models/Order.js";

async function main() {
  await connectDB();
  console.log("Connected to Database.");

  // Get total order count
  const totalOrders = await Order.countDocuments({});
  console.log("Total orders in database:", totalOrders);

  // Group orders by month/year of createdAt
  const ordersByMonth = await Order.aggregate([
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" }
        },
        count: { $sum: 1 },
        qrCount: {
          $sum: {
            $cond: [
              { $eq: ["$orderType", "QR"] },
              1,
              0
            ]
          }
        }
      }
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } }
  ]);
  
  console.log("Orders grouped by month:");
  console.log(JSON.stringify(ordersByMonth, null, 2));

  // Get the most recent 10 orders and display details
  const recentOrders = await Order.find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  console.log("\nMost recent 10 orders:");
  recentOrders.forEach(o => {
    console.log(`ID: ${o._id}, Created: ${o.createdAt}, Type: ${o.orderType}, Status: ${o.status}, PayMethod: ${o.payment?.method}, PayStatus: ${o.payment?.status}, HotelId: ${o.hotelId}`);
  });

  await mongoose.connection.close();
}

main().catch(err => {
  console.error("Error:", err);
  mongoose.connection.close();
});
