/**
 * Script to add/update "Diamond restaurant" in the database.
 * Run: node scripts/addDiamondRestaurant.js
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
    // Find existing restaurant by phone or restaurantId
    const existing = await Restaurant.findOne({
      $or: [
        { phone: "918000871460" },
        { restaurantId: "REST-1782981163710-4822" },
        { slug: "restaurant-1460" },
      ],
    });

    if (existing) {
      console.log(`📋 Found existing restaurant: "${existing.name}" (${existing._id})`);
      console.log("   Updating with correct data...");

      existing.name = "Diamond restaurant";
      existing.ownerName = "Harphool Singh Prajapati";
      existing.ownerEmail = "harphoolsingh012@gmail.com";
      existing.cuisines = ["North Indian", "Chinese", "Pizza"];
      existing.openDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      existing.isActive = false;
      existing.isAcceptingOrders = false;
      existing.estimatedDeliveryTime = "30";
      existing.distance = "1.2 km";
      existing.priceRange = "$$";
      existing.featuredDish = "Diamond panner special";
      existing.featuredPrice = 470;
      existing.offer = "50";
      existing.isDeleted = false;
      existing.businessModel = "Commission Base";

      existing.profileImage = {
        url: "https://api.foods.abhikaro.in/uploads/restaurant/profile/1782981541253_8lrw69457.jpg",
        publicId: "restaurant/profile/1782981541253_8lrw69457",
      };

      existing.location = {
        latitude: 27.36674868693614,
        longitude: 75.39961667498238,
        coordinates: [75.39961667498238, 27.36674868693614],
        geoLocation: {
          type: "Point",
          coordinates: [75.39961667498238, 27.36674868693614],
        },
        formattedAddress: "998X+MRW, Khatoo, Rajasthan 332602, India",
        area: "Au small Bank",
        city: "Khatu",
        addressLine1: "Diamond hotel & restaurant",
        addressLine2: "",
        landmark: "Thana mode",
      };

      existing.deliveryTimings = {
        openingTime: "09:00",
        closingTime: "23:30",
        isAutoOnOffEnabled: false,
      };

      existing.approvedAt = new Date("2026-07-02T09:02:55.804Z");
      existing.approvedBy = new mongoose.Types.ObjectId("6986f08fe6b2a8873e7e61e6");
      existing.rejectedAt = null;
      existing.rejectedBy = null;
      existing.diningCommissionPercentage = 0;
      existing.diningSettings = {
        isEnabled: false,
        requestStatus: "none",
        lastRequestAt: null,
        lastDecisionAt: null,
        maxGuests: 6,
        diningType: "family-dining",
      };

      existing.onboarding = {
        completedSteps: 4,
        step1: {
          restaurantName: "Diamond restaurant",
          ownerName: "Harphool Singh Prajapati",
          ownerEmail: "harphoolsingh012@gmail.com",
          ownerPhone: "8000871460",
          primaryContactNumber: "8000871460",
          location: {
            geoLocation: { type: "Point" },
            addressLine1: "Diamond hotel & restaurant",
            addressLine2: "",
            area: "Au small Bank",
            city: "Khatu",
            landmark: "Thana mode",
          },
        },
        step2: {
          profileImageUrl: {
            url: "https://api.foods.abhikaro.in/uploads/restaurant/profile/1782981541253_8lrw69457.jpg",
            publicId: "restaurant/profile/1782981541253_8lrw69457",
          },
          cuisines: ["North Indian", "Chinese", "Pizza"],
          deliveryTimings: { openingTime: "09:00", closingTime: "23:30" },
          openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          menuImageUrls: [],
        },
        step3: {
          pan: {
            panNumber: "BYRPK1209H",
            nameOnPan: "Harphool Singh kumawat",
            image: {
              url: "https://api.foods.abhikaro.in/uploads/restaurant/pan/1782982630433_0lcaqmsak.jpg",
              publicId: "restaurant/pan/1782982630433_0lcaqmsak",
            },
          },
          gst: { isRegistered: false },
          fssai: {
            registrationNumber: "22226018001375",
            expiryDate: new Date("2028-01-23T00:00:00.000Z"),
            image: {
              url: "https://api.foods.abhikaro.in/uploads/restaurant/fssai/1782982631682_fdyiwhytx.jpg",
              publicId: "restaurant/fssai/1782982631682_fdyiwhytx",
            },
          },
          bank: {
            accountNumber: "010591900009600",
            ifscCode: "YESB0105",
            accountHolderName: "Harphool Singh kumawat",
            accountType: "Saving",
          },
        },
        step4: {
          estimatedDeliveryTime: "30",
          featuredDish: "Diamond panner special",
          featuredPrice: 470,
          offer: "50",
        },
      };

      await existing.save();

      console.log("\n✅ Restaurant updated successfully!");
      console.log(`   Name      : ${existing.name}`);
      console.log(`   _id       : ${existing._id}`);
      console.log(`   RestID    : ${existing.restaurantId}`);
      console.log(`   OwnerName : ${existing.ownerName}`);
      console.log(`   isActive  : ${existing.isActive}`);
      console.log(`   Location  : ${existing.location?.formattedAddress}`);
      return;
    }

    // Not found — insert new
    console.log("📋 Restaurant not found — inserting new...");

    const restaurantData = {
      phone: "918000871460",
      phoneVerified: true,
      signupMethod: "phone",
      ownerName: "Harphool Singh Prajapati",
      ownerEmail: "harphoolsingh012@gmail.com",
      ownerPhone: "918000871460",
      name: "Diamond restaurant",
      cuisines: ["North Indian", "Chinese", "Pizza"],
      openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      rating: 0,
      totalRatings: 0,
      isActive: false,
      isAcceptingOrders: false,
      lastManualStatusChangeAt: null,
      estimatedDeliveryTime: "30",
      distance: "1.2 km",
      priceRange: "$$",
      featuredDish: "Diamond panner special",
      featuredPrice: 470,
      offer: "50",
      restaurantId: "REST-1782981163710-4822",
      primaryContactNumber: "918000871460",
      email: "918000871460@restaurant.local",
      slug: "restaurant-1460",
      isDeleted: false,
      businessModel: "Commission Base",
      fcmtokenWeb: null,
      fcmtokenMobile:
        "cOnK--0dRyeXzvnkitE5KH:APA91bGPIbrkU_AdMs-U5baFQbHfxfO0XVqBgT0P7w6xArn2STHgGw0jCqySLmvtlOsPzkUbEVj_U_TJsiAAG4_dTGxEtTg9dXyT5ouqZ6NiBmAO05tszpY",
      activeSessionId: "bf0a247e-0c50-442e-87c8-dc744975b291",
      menuImages: [],
      profileImage: {
        url: "https://api.foods.abhikaro.in/uploads/restaurant/profile/1782981541253_8lrw69457.jpg",
        publicId: "restaurant/profile/1782981541253_8lrw69457",
      },
      location: {
        latitude: 27.36674868693614,
        longitude: 75.39961667498238,
        coordinates: [75.39961667498238, 27.36674868693614],
        geoLocation: {
          type: "Point",
          coordinates: [75.39961667498238, 27.36674868693614],
        },
        formattedAddress: "998X+MRW, Khatoo, Rajasthan 332602, India",
        area: "Au small Bank",
        city: "Khatu",
        addressLine1: "Diamond hotel & restaurant",
        addressLine2: "",
        landmark: "Thana mode",
      },
      deliveryTimings: {
        openingTime: "09:00",
        closingTime: "23:30",
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
      approvedAt: new Date("2026-07-02T09:02:55.804Z"),
      approvedBy: new mongoose.Types.ObjectId("6986f08fe6b2a8873e7e61e6"),
      rejectedAt: null,
      rejectedBy: null,
      onboarding: {
        completedSteps: 4,
        step1: {
          restaurantName: "Diamond restaurant",
          ownerName: "Harphool Singh Prajapati",
          ownerEmail: "harphoolsingh012@gmail.com",
          ownerPhone: "8000871460",
          primaryContactNumber: "8000871460",
          location: {
            geoLocation: { type: "Point" },
            addressLine1: "Diamond hotel & restaurant",
            addressLine2: "",
            area: "Au small Bank",
            city: "Khatu",
            landmark: "Thana mode",
          },
        },
        step2: {
          profileImageUrl: {
            url: "https://api.foods.abhikaro.in/uploads/restaurant/profile/1782981541253_8lrw69457.jpg",
            publicId: "restaurant/profile/1782981541253_8lrw69457",
          },
          cuisines: ["North Indian", "Chinese", "Pizza"],
          deliveryTimings: { openingTime: "09:00", closingTime: "23:30" },
          openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          menuImageUrls: [],
        },
        step3: {
          pan: {
            panNumber: "BYRPK1209H",
            nameOnPan: "Harphool Singh kumawat",
            image: {
              url: "https://api.foods.abhikaro.in/uploads/restaurant/pan/1782982630433_0lcaqmsak.jpg",
              publicId: "restaurant/pan/1782982630433_0lcaqmsak",
            },
          },
          gst: { isRegistered: false },
          fssai: {
            registrationNumber: "22226018001375",
            expiryDate: new Date("2028-01-23T00:00:00.000Z"),
            image: {
              url: "https://api.foods.abhikaro.in/uploads/restaurant/fssai/1782982631682_fdyiwhytx.jpg",
              publicId: "restaurant/fssai/1782982631682_fdyiwhytx",
            },
          },
          bank: {
            accountNumber: "010591900009600",
            ifscCode: "YESB0105",
            accountHolderName: "Harphool Singh kumawat",
            accountType: "Saving",
          },
        },
        step4: {
          estimatedDeliveryTime: "30",
          featuredDish: "Diamond panner special",
          featuredPrice: 470,
          offer: "50",
        },
      },
    };

    const restaurant = new Restaurant(restaurantData);
    await restaurant.save();

    console.log("\n✅ Restaurant inserted successfully!");
    console.log(`   Name      : ${restaurant.name}`);
    console.log(`   _id       : ${restaurant._id}`);
    console.log(`   RestID    : ${restaurant.restaurantId}`);
    console.log(`   OwnerName : ${restaurant.ownerName}`);
    console.log(`   isActive  : ${restaurant.isActive}`);
    console.log(`   Location  : ${restaurant.location?.formattedAddress}`);
  } catch (err) {
    if (err.code === 11000) {
      console.error("❌ Duplicate key error — restaurant already exists:");
      console.error("   Duplicate fields:", err.keyValue);
    } else {
      console.error("❌ Error:", err.message);
    }
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

run();
