import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const dbsToInspect = ["abhikaro", "abhikaro_backup", "abhikaro_testing", "abhikaro_testing_abhi"];

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  const baseUri = process.env.MONGODB_URI;
  
  for (const dbName of dbsToInspect) {
    // Replace the database name in the URI connection string
    // The URI format is like: mongodb://...mongodb.net:27017/abhikaro_backup?ssl=true...
    // Let's replace "/abhikaro_backup?" with `/${dbName}?` or similar.
    let connectionUri = baseUri;
    if (connectionUri.includes("/abhikaro_backup?")) {
      connectionUri = connectionUri.replace("/abhikaro_backup?", `/${dbName}?`);
    } else if (connectionUri.includes("/abhikaro?")) {
      connectionUri = connectionUri.replace("/abhikaro?", `/${dbName}?`);
    } else {
      // If we can't do simple replacement, we can parse and edit, but let's try this first
      console.log(`Warning: Cannot easily replace dbName in URI, trying regex replacement`);
      connectionUri = connectionUri.replace(/\/[a-zA-Z0-9_-]+\?/, `/${dbName}?`);
    }

    console.log(`\n======================================================`);
    console.log(`🔌 Connecting to Database: [${dbName}]`);
    console.log(`======================================================`);
    
    try {
      const conn = await mongoose.createConnection(connectionUri).asPromise();
      console.log(`✅ Connected to [${dbName}]`);

      // Define temp models or direct collection queries
      const Restaurant = conn.model("Restaurant", new mongoose.Schema({}, { strict: false, collection: "restaurants" }));
      const Menu = conn.model("Menu", new mongoose.Schema({}, { strict: false, collection: "menus" }));
      const Order = conn.model("Order", new mongoose.Schema({}, { strict: false, collection: "orders" }));
      const AuditLog = conn.model("AuditLog", new mongoose.Schema({}, { strict: false, collection: "auditlogs" }));

      // Find restaurants matching Kirpa or Hanuman
      const restaurants = await Restaurant.find({
        name: { $regex: /kirpa|hanuman/i }
      });

      console.log(`Found ${restaurants.length} matching restaurants in [${dbName}]:`);
      for (const r of restaurants) {
        console.log(`- ID: ${r._id} | Name: "${r.name}" | phone: ${r.phone} | email: ${r.email} | isActive: ${r.isActive} | isDeleted: ${r.isDeleted}`);
        
        // Find menu for this restaurant
        const m = await Menu.findOne({ restaurant: r._id });
        if (m) {
          console.log(`  Menu: Found (ID: ${m._id}), Sections: ${m.sections?.length || 0}, UpdatedAt: ${m.updatedAt || m.updated_at}`);
          if (m.sections && m.sections.length > 0) {
            console.log(`    Sections list: ${m.sections.map(s => `${s.name} (${s.items?.length || 0} items)`).join(", ")}`);
            // Check if Hanuman menu is present in Kirpa (by looking for Hanuman Special Thali or similar)
            const hasHanumanItems = m.sections.some(s => s.items?.some(it => it.name?.toLowerCase().includes("hanuman")));
            console.log(`    Contains 'Hanuman' items: ${hasHanumanItems ? 'YES' : 'NO'}`);
          }
        } else {
          console.log(`  Menu: NOT FOUND`);
        }

        // Find orders count for this restaurant
        const orderCount = await Order.countDocuments({ restaurant: r._id });
        console.log(`  Orders count: ${orderCount}`);
        if (orderCount > 0) {
          const sampleOrders = await Order.find({ restaurant: r._id }).sort({ createdAt: -1 }).limit(3);
          console.log(`  Recent orders sample items:`);
          sampleOrders.forEach(o => {
            console.log(`    Order ${o.orderId || o._id} (Date: ${o.createdAt}): ${o.items?.map(i => `${i.name} (x${i.quantity})`).join(", ")}`);
          });
        }
      }

      // Check if there are audit logs for menu updates
      const logsCount = await AuditLog.countDocuments({ action: { $regex: /menu/i } });
      console.log(`Audit logs with 'menu' action: ${logsCount}`);
      if (logsCount > 0) {
        const sampleLogs = await AuditLog.find({ action: { $regex: /menu/i } }).sort({ timestamp: -1 }).limit(5);
        sampleLogs.forEach(l => {
          console.log(`  Log (Date: ${l.timestamp || l.createdAt}): ${l.action} | User: ${l.userId || l.user} | Detail: ${JSON.stringify(l.details || l.metadata || {})}`);
        });
      }

      await conn.close();
      console.log(`🔌 Closed connection to [${dbName}]`);
    } catch (err) {
      console.error(`❌ Error with database [${dbName}]:`, err.message);
    }
  }
}

run();
