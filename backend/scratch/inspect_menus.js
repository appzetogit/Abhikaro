import dotenv from "dotenv";
import mongoose from "mongoose";
import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Menu from "../modules/restaurant/models/Menu.js";

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
    console.log("\n🔍 Finding Restaurants with 'Kirpa' or 'Hanuman' in the name...");
    const restaurants = await Restaurant.find({
      name: { $regex: /kirpa|hanuman/i }
    });

    console.log(`Found ${restaurants.length} restaurants:`);
    for (const r of restaurants) {
      console.log(`- ID: ${r._id}`);
      console.log(`  restaurantId: ${r.restaurantId}`);
      console.log(`  Name: ${r.name}`);
      console.log(`  Phone: ${r.phone}`);
      console.log(`  Email: ${r.email}`);
      console.log(`  slug: ${r.slug}`);
      console.log(`  isActive: ${r.isActive}`);
      console.log(`  isDeleted: ${r.isDeleted}`);
      console.log(`  Owner: ${r.ownerName} (${r.ownerEmail})`);
    }

    console.log("\n🔍 Finding Menus for these restaurants...");
    const rIds = restaurants.map(r => r._id);
    const menus = await Menu.find({ restaurant: { $in: rIds } });

    console.log(`Found ${menus.length} menu documents:`);
    for (const m of menus) {
      const rest = restaurants.find(r => r._id.toString() === m.restaurant.toString());
      console.log(`- Menu ID: ${m._id}`);
      console.log(`  For Restaurant: ${rest ? rest.name : 'Unknown'} (${m.restaurant})`);
      console.log(`  Number of sections: ${m.sections.length}`);
      console.log(`  Active: ${m.isActive}`);
      console.log(`  Updated At: ${m.updatedAt}`);
      
      console.log("  Sections:");
      m.sections.forEach(s => {
        const itemNames = s.items.map(it => it.name).join(", ");
        console.log(`    * Section: ${s.name} (${s.items.length} items): ${itemNames.substring(0, 150)}...`);
      });
    }

  } catch (error) {
    console.error("❌ Error running inspection:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

run();
