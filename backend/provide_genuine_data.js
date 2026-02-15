import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "./modules/order/models/Order.js";
import Restaurant from "./modules/restaurant/models/Restaurant.js";
import User from "./modules/auth/models/User.js";
import RestaurantCommission from "./modules/admin/models/RestaurantCommission.js";
import {
  calculateOrderSettlement,
  updateSettlementOnStatusChange,
} from "./modules/order/services/orderSettlementService.js";

dotenv.config();

async function provideData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const restaurant = await Restaurant.findOne({ isActive: true });
    const user = await User.findOne();

    if (!restaurant || !user) throw new Error("Restaurant or User missing");

    const orderData = {
      orderId: `GENUINE-${Date.now()}`,
      userId: user._id,
      restaurantId: restaurant._id.toString(),
      restaurantName: restaurant.name,
      items: [
        {
          itemId: "test-item-id",
          name: "Golden Pizza",
          price: 1000,
          quantity: 5,
        },
      ],
      address: {
        formattedAddress: "123 Test Street",
        location: { type: "Point", coordinates: [77.1025, 28.7041] },
      },
      pricing: {
        subtotal: 5000,
        total: 5000,
        deliveryFee: 0,
        platformFee: 0,
        tax: 0,
      },
      payment: {
        method: "cash",
        status: "completed",
      },
      status: "confirmed",
      commissionBreakdown: {
        restaurant: 3750,
        admin: 1250,
        hotel: 0,
      },
      commissionPercentages: {
        restaurant: 75,
        admin: 25,
        hotel: 0,
      },
    };

    const order = new Order(orderData);
    await order.save();
    console.log("Order saved successfully");

    order.status = "delivered";
    await order.save();

    await calculateOrderSettlement(order._id);
    await updateSettlementOnStatusChange(order._id, "delivered", "confirmed");
    console.log("Settlement completed");
  } catch (err) {
    if (err.name === "ValidationError") {
      console.log("Validation Error Details:");
      for (let field in err.errors) {
        console.log(`- ${field}: ${err.errors[field].message}`);
      }
    } else {
      console.error("Error:", err);
    }
  } finally {
    await mongoose.disconnect();
  }
}

provideData();
