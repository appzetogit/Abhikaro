/**
 * Script to update the "Padharo Sa" restaurant name and details in the database.
 * Run: node scripts/updatePadharoSaRestaurant.js
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import Restaurant from "../modules/restaurant/models/Restaurant.js";

dotenv.config();

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  try {
    // Find by phone number or restaurantId
    const restaurant = await Restaurant.findOne({
      $or: [
        { phone: "918890282707" },
        { restaurantId: "REST-1782904010585-7365" },
      ],
    });

    if (!restaurant) {
      console.log("❌ Restaurant not found with phone 918890282707");
      return;
    }

    console.log(`📋 Found restaurant: "${restaurant.name}" (${restaurant._id})`);
    console.log(`   Current name: ${restaurant.name}`);
    console.log(`   Current ownerName: ${restaurant.ownerName}`);

    // Update fields to match provided data
    restaurant.name = "Padharo Sa";
    restaurant.ownerName = "Hemraj rangera";
    restaurant.ownerEmail = "hrrengera555@gmail.com";
    restaurant.isActive = false;
    restaurant.isAcceptingOrders = true;
    restaurant.estimatedDeliveryTime = "30 35 min";
    restaurant.distance = "1.2 km";
    restaurant.priceRange = "$$";
    restaurant.featuredDish = "Padharo Special thali";
    restaurant.featuredPrice = 220;
    restaurant.offer = "210";
    restaurant.cuisines = ["North Indian"];
    restaurant.openDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    restaurant.isDeleted = false;
    restaurant.businessModel = "Commission Base";

    // Update profile image
    restaurant.profileImage = {
      url: "https://api.foods.abhikaro.in/uploads/restaurant/profile/1782904294169_q8tt22zsm.jpg",
      publicId: "restaurant/profile/1782904294169_q8tt22zsm",
    };

    // Update location
    restaurant.location = {
      latitude: 27.364686238062415,
      longitude: 75.41009556502104,
      coordinates: [75.41009556502104, 27.364686238062415],
      geoLocation: {
        type: "Point",
        coordinates: [75.41009556502104, 27.364686238062415],
      },
      formattedAddress: "SH 113, Khatoo, Rajasthan 332602, India",
      area: "Khatu",
      city: "Khatushyam",
      addressLine1: "Padharo saa restaurant",
      addressLine2: "Grund",
      landmark: "Ramayan place",
    };

    // Update delivery timings
    restaurant.deliveryTimings = {
      openingTime: "10:00",
      closingTime: "23:58",
      isAutoOnOffEnabled: false,
    };

    // Update onboarding data
    restaurant.onboarding = {
      completedSteps: 4,
      step1: {
        restaurantName: "Padharo saa restaurant",
        ownerName: "Hemraj rangera",
        ownerEmail: "hrrengera555@gmail.com",
        ownerPhone: "8890282707",
        primaryContactNumber: "8890282707",
        location: {
          geoLocation: { type: "Point" },
          addressLine1: "Padharo saa restaurant",
          addressLine2: "Grund",
          area: "Khatu",
          city: "Khatushyam",
          landmark: "Ramayan place",
        },
      },
      step2: {
        profileImageUrl: {
          url: "https://api.foods.abhikaro.in/uploads/restaurant/profile/1782904294169_q8tt22zsm.jpg",
          publicId: "restaurant/profile/1782904294169_q8tt22zsm",
        },
        cuisines: ["North Indian"],
        deliveryTimings: {
          openingTime: "10:00",
          closingTime: "23:58",
        },
        openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        menuImageUrls: [],
      },
      step3: {
        pan: {
          panNumber: "DXDPR7149C",
          nameOnPan: "Hemraj rangera",
          image: {
            url: "https://api.foods.abhikaro.in/uploads/restaurant/pan/1782905748358_k45x6as63.jpg",
            publicId: "restaurant/pan/1782905748358_k45x6as63",
          },
        },
        gst: { isRegistered: false },
        fssai: {
          registrationNumber: "22226018003500",
          expiryDate: new Date("2029-02-24T00:00:00.000Z"),
          image: {
            url: "https://api.foods.abhikaro.in/uploads/restaurant/fssai/1782905759238_gnoxmiw4p.jpg",
            publicId: "restaurant/fssai/1782905759238_gnoxmiw4p",
          },
        },
        bank: {
          accountNumber: "0614088364",
          ifscCode: "KKBK0003542",
          accountHolderName: "Hemraj rangera",
          accountType: "Saving",
        },
      },
      step4: {
        estimatedDeliveryTime: "30 35 min",
        featuredDish: "Padharo Special thali",
        featuredPrice: 220,
        offer: "210",
      },
    };

    // Update dining settings
    restaurant.diningCommissionPercentage = 0;
    restaurant.diningSettings = {
      isEnabled: false,
      requestStatus: "none",
      lastRequestAt: null,
      lastDecisionAt: null,
      maxGuests: 6,
      diningType: "family-dining",
    };

    // Approval info
    restaurant.approvedAt = new Date("2026-07-04T05:43:06.410Z");
    restaurant.approvedBy = new mongoose.Types.ObjectId("6986f08fe6b2a8873e7e61e6");
    restaurant.rejectedAt = null;
    restaurant.rejectedBy = null;

    await restaurant.save();

    console.log("\n✅ Restaurant updated successfully!");
    console.log(`   Name      : ${restaurant.name}`);
    console.log(`   _id       : ${restaurant._id}`);
    console.log(`   RestID    : ${restaurant.restaurantId}`);
    console.log(`   OwnerName : ${restaurant.ownerName}`);
    console.log(`   isActive  : ${restaurant.isActive}`);
    console.log(`   Location  : ${restaurant.location?.formattedAddress}`);
  } catch (err) {
    console.error("❌ Error updating restaurant:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

run();
