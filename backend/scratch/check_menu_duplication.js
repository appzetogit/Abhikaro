import dotenv from "dotenv";
import mongoose from "mongoose";

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
    const db = mongoose.connection.db;
    
    // 1. Fetch all restaurants
    console.log("Fetching restaurants...");
    const restaurants = await db.collection("restaurants").find({}).toArray();
    console.log(`Fetched ${restaurants.length} restaurants.`);
    
    const restaurantMap = new Map();
    restaurants.forEach(r => {
      restaurantMap.set(r._id.toString(), r);
    });

    // 2. Fetch all menus
    console.log("Fetching menus...");
    const menus = await db.collection("menus").find({}).toArray();
    console.log(`Fetched ${menus.length} menus.`);

    // 3. Analyze menus and create fingerprints
    const fingerprints = new Map();

    for (const m of menus) {
      if (!m.sections || m.sections.length === 0) {
        continue; // Skip empty menus
      }

      // Generate a fingerprint based on item names, prices, and categories
      const itemKeys = [];
      m.sections.forEach(s => {
        if (s.items && Array.isArray(s.items)) {
          s.items.forEach(it => {
            itemKeys.push(`${it.name}::${it.price}`);
          });
        }
        if (s.subsections && Array.isArray(s.subsections)) {
          s.subsections.forEach(ss => {
            if (ss.items && Array.isArray(ss.items)) {
              ss.items.forEach(it => {
                itemKeys.push(`${it.name}::${it.price}`);
              });
            }
          });
        }
      });

      if (itemKeys.length === 0) continue;

      // Sort keys to ensure ordering doesn't affect fingerprint
      itemKeys.sort();
      const fingerprint = itemKeys.join("|");

      if (!fingerprints.has(fingerprint)) {
        fingerprints.set(fingerprint, []);
      }
      fingerprints.get(fingerprint).push(m);
    }

    // 4. Identify duplicates (groups with size > 1)
    console.log("\n🔍 Analyzing Duplicate Menus:");
    let duplicateGroupsFound = 0;

    for (const [fingerprint, menuList] of fingerprints.entries()) {
      if (menuList.length > 1) {
        duplicateGroupsFound++;
        console.log(`\n======================================================`);
        console.log(`⚠️ DUPLICATE GROUP #${duplicateGroupsFound}:`);
        console.log(`Unique items count: ${fingerprint.split("|").length}`);
        console.log(`Restaurants sharing this menu:`);
        
        menuList.forEach(m => {
          const rest = restaurantMap.get(m.restaurant.toString());
          if (rest) {
            console.log(`  - Name: "${rest.name}"`);
            console.log(`    ID: ${rest._id}`);
            console.log(`    phone: ${rest.phone} | email: ${rest.email}`);
            console.log(`    isActive: ${rest.isActive} | isDeleted: ${rest.isDeleted}`);
            console.log(`    Menu ID: ${m._id} | Updated At: ${m.updatedAt || m.updated_at}`);
          } else {
            console.log(`  - Unknown Restaurant ID: ${m.restaurant} | Menu ID: ${m._id}`);
          }
        });
        
        // Print a small sample of items in this menu
        const sampleItems = fingerprint.split("|").slice(0, 5);
        console.log(`  Sample Items: ${sampleItems.join(", ")}...`);
      }
    }

    if (duplicateGroupsFound === 0) {
      console.log("✅ No other duplicate/mixed menus found across the database!");
    } else {
      console.log(`\nFound ${duplicateGroupsFound} groups of restaurants with identical menus.`);
    }

  } catch (error) {
    console.error("❌ Error analyzing menus:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

run();
