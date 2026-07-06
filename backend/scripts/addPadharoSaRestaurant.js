/**
 * Script to add "Padharo Sa" restaurant to the database.
 * Run: node scripts/addPadharoSaRestaurant.js
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
    // Check if restaurant already exists (by phone or restaurantId)
    const existing = await Restaurant.findOne({
      $or: [
        { phone: "918890282707" },
        { restaurantId: "REST-1782904010585-7365" },
        { slug: "restaurant-2707" },
      ],
    });

    if (existing) {
      console.log(
        `⚠️  Restaurant already exists: ${existing.name} (${existing._id})`
      );
      console.log("ℹ️  Skipping insert. Delete it first if you want to re-add.");
      return;
    }

    const restaurantData = {
      phone: "918890282707",
      phoneVerified: true,
      signupMethod: "phone",
      ownerName: "Hemraj rangera",
      ownerEmail: "hrrengera555@gmail.com",
      ownerPhone: "918890282707",
      name: "Padharo Sa",
      cuisines: ["North Indian"],
      openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      rating: 0,
      totalRatings: 0,
      isActive: false,
      isAcceptingOrders: true,
      lastManualStatusChangeAt: null,
      estimatedDeliveryTime: "30 35 min",
      distance: "1.2 km",
      priceRange: "$$",
      featuredDish: "Padharo Special thali",
      featuredPrice: 220,
      offer: "210",
      restaurantId: "REST-1782904010585-7365",
      primaryContactNumber: "918890282707",
      email: "918890282707@restaurant.local",
      slug: "restaurant-2707",
      isDeleted: false,
      businessModel: "Commission Base",
      fcmtokenWeb: null,
      fcmtokenMobile:
        "dF5ql8LFRDGk9UonM_mS9q:APA91bHJuH2qli8pkFff2EibqfZJqKt6m4zUfrGufIcdA9IUZyquvAglLaG7p-CLKbSDMKUR3-JH3Z4UbAIHJaKrIS_AYCUh1qCf6KQXdNC0VWgoI8jnwBw",
      activeSessionId: "8cebd066-30b8-4699-a831-4df7cf8565ad",
      menuImages: [],
      profileImage: {
        url: "https://api.foods.abhikaro.in/uploads/restaurant/profile/1782904294169_q8tt22zsm.jpg",
        publicId: "restaurant/profile/1782904294169_q8tt22zsm",
      },
      location: {
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
      },
      deliveryTimings: {
        openingTime: "10:00",
        closingTime: "23:58",
        isAutoOnOffEnabled: false,
      },
      diningConfig: null,
      diningCommissionPercentage: 0,
      diningSettings: {
        isEnabled: false,
        requestStatus: "none",
        lastRequestAt: null,
        lastDecisionAt: null,
        maxGuests: 6,
        diningType: "family-dining",
      },
      approvedAt: new Date("2026-07-04T05:43:06.410Z"),
      approvedBy: new mongoose.Types.ObjectId("6986f08fe6b2a8873e7e61e6"),
      rejectedAt: null,
      rejectedBy: null,
      onboarding: {
        completedSteps: 4,
        step1: {
          restaurantName: "Padharo saa restaurant",
          ownerName: "Hemraj rangera",
          ownerEmail: "hrrengera555@gmail.com",
          ownerPhone: "8890282707",
          primaryContactNumber: "8890282707",
          location: {
            geoLocation: {
              type: "Point",
            },
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
          gst: {
            isRegistered: false,
          },
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
      },
    };

    const restaurant = new Restaurant(restaurantData);
    await restaurant.save();

    console.log("✅ Restaurant added successfully!");
    console.log(`   Name      : ${restaurant.name}`);
    console.log(`   _id       : ${restaurant._id}`);
    console.log(`   RestID    : ${restaurant.restaurantId}`);
    console.log(`   Phone     : ${restaurant.phone}`);
    console.log(`   isActive  : ${restaurant.isActive}`);
  } catch (err) {
    if (err.code === 11000) {
      console.error("❌ Duplicate key error — restaurant already exists:");
      console.error("   Duplicate fields:", err.keyValue);
    } else {
      console.error("❌ Error inserting restaurant:", err.message);
    }
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

run();
