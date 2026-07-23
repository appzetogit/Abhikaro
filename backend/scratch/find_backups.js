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
    
    // 1. List all collections in the current database
    console.log("\n📋 Listing collections in current DB:");
    const collections = await db.listCollections().toArray();
    collections.forEach(c => console.log(`- ${c.name}`));

    // 2. Check if there are other databases
    console.log("\n🌐 Listing databases:");
    const adminDb = mongoose.connection.db.admin();
    try {
      const dbsList = await adminDb.listDatabases();
      dbsList.databases.forEach(d => console.log(`- ${d.name} (size: ${d.sizeOnDisk})`));
    } catch (e) {
      console.log("Could not list databases (likely permission issue):", e.message);
    }

    // 3. Check for specific menu backups or previous versions
    console.log("\n🔍 Searching for any backup/temp menu collections:");
    const backupCols = collections.filter(c => c.name.toLowerCase().includes("menu") || c.name.toLowerCase().includes("backup") || c.name.toLowerCase().includes("history"));
    console.log("Relevant collections:", backupCols.map(c => c.name));

    // 4. Query Kirpa's orders to see historical items
    console.log("\n📦 Checking historical orders for Kirpa Restaurant (69ae9d787592fd06e444100c):");
    const orderCol = db.collection("orders");
    const kirpaOrders = await orderCol.find({ restaurant: new mongoose.Types.ObjectId("69ae9d787592fd06e444100c") }).toArray();
    console.log(`Found ${kirpaOrders.length} orders for Kirpa.`);
    
    // Extract unique item details from these orders
    const historicalItems = new Map();
    kirpaOrders.forEach(o => {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach(item => {
          const key = item.name || item.itemId;
          if (!historicalItems.has(key)) {
            historicalItems.set(key, {
              itemId: item.itemId,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              category: item.category,
              description: item.description,
              foodType: item.foodType,
              orderedAt: o.createdAt || o.updatedAt
            });
          }
        });
      }
    });

    console.log(`Extracted ${historicalItems.size} unique items from Kirpa's orders:`);
    for (const [name, info] of historicalItems) {
      console.log(`- ${name} | Price: ₹${info.price} | Category: ${info.category} | FoodType: ${info.foodType}`);
    }

  } catch (error) {
    console.error("❌ Error running inspection:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

run();
