import mongoose from "mongoose";
import dotenv from "dotenv";
import Hotel from "./modules/hotel/models/Hotel.js";
import Order from "./modules/order/models/Order.js";
import CommissionSettings from "./modules/admin/models/CommissionSettings.js";
import { distributeCommissions } from "./modules/order/services/commissionDistributionService.js";

dotenv.config();

async function verify() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to database");

    // 1. Find or create a test hotel with specific commission
    let hotel = await Hotel.findOne({ hotelName: "Test Hotel Commission" });
    if (!hotel) {
      hotel = await Hotel.create({
        hotelName: "Test Hotel Commission",
        phone: "9999999999",
        address: "Test Address",
        commission: 15, // 15% Hotel
        adminCommission: 10, // 10% Admin
        isActive: true,
      });
    } else {
      hotel.commission = 15;
      hotel.adminCommission = 10;
      await hotel.save();
    }
    console.log(
      `Test Hotel: ${hotel.hotelName}, Hotel Comm: ${hotel.commission}%, Admin Comm: ${hotel.adminCommission}%`,
    );

    const restaurantId = new mongoose.Types.ObjectId().toString();
    const subtotal = 1000;
    const orderData = {
      orderId: `VERIFY-${Date.now()}`,
      userId: new mongoose.Types.ObjectId(), // Fake user
      restaurantId: restaurantId,
      restaurantName: "Test Restaurant",
      hotelReference: hotel.hotelId,
      hotelId: hotel._id,
      items: [
        { itemId: "item1", name: "Test Item", price: subtotal, quantity: 1 },
      ],
      pricing: {
        subtotal,
        total: subtotal,
        deliveryFee: 0,
        platformFee: 0,
        tax: 0,
      },
      payment: { method: "pay_at_hotel", status: "pending" },
      status: "confirmed",
      orderType: "QR",
      roomNumber: "101",
    };

    // Simulate the logic in orderController.js manually for now to verify the logic I wrote
    // (Actually, better to run the actual controller if possible, but a standalone test is fine for logic)

    const hotelPct = hotel.commission;
    const adminPct = hotel.adminCommission;
    const hotelAmount = (subtotal * hotelPct) / 100;
    const adminAmount = (subtotal * adminPct) / 100;
    const restaurantAmount = subtotal - hotelAmount - adminAmount;

    orderData.commissionBreakdown = {
      hotel: hotelAmount,
      admin: adminAmount,
      restaurant: restaurantAmount,
      user: 0,
    };
    orderData.commissionPercentages = {
      hotel: hotelPct,
      admin: adminPct,
      restaurant: 100 - hotelPct - adminPct,
      user: 0,
    };

    const order = new Order(orderData);
    await order.save();
    console.log(`Order created: ${order.orderId}`);
    console.log(
      `Expected Breakdown: Hotel=${hotelAmount}, Admin=${adminAmount}, Restaurant=${restaurantAmount}`,
    );

    // 3. Test distributeCommissions
    console.log("Testing distributeCommissions...");
    const result = await distributeCommissions(order._id);

    if (result.success) {
      console.log(`✅ Commission Distributed:`, result.shares);

      if (
        result.shares.hotelShare === hotelAmount &&
        result.shares.adminShare === adminAmount
      ) {
        console.log("✅ Share calculation matches expectations!");
      } else {
        console.log("❌ Share calculation mismatch!");
      }
    } else {
      console.log("❌ Commission distribution failed:", result.message);
    }

    // Cleanup
    await Order.deleteOne({ _id: order._id });
    console.log("Test order deleted");
  } catch (error) {
    console.error("Error during verification:", error);
  } finally {
    await mongoose.disconnect();
  }
}

verify();
