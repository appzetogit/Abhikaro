import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  // Connect to abhikaro_backup (the active database in .env)
  console.log("🔌 Connecting to abhikaro_backup...");
  const connBackup = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  console.log("✅ Connected to abhikaro_backup");

  // Connect to abhikaro (the original database)
  const uriOriginal = process.env.MONGODB_URI.replace("/abhikaro_backup?", "/abhikaro?");
  console.log("🔌 Connecting to abhikaro...");
  const connOriginal = await mongoose.createConnection(uriOriginal).asPromise();
  console.log("✅ Connected to abhikaro");

  try {
    const OrderBackup = connBackup.model("Order", new mongoose.Schema({}, { strict: false, collection: "orders" }));
    const OrderOriginal = connOriginal.model("Order", new mongoose.Schema({}, { strict: false, collection: "orders" }));
    const MenuBackup = connBackup.model("Menu", new mongoose.Schema({}, { strict: false, collection: "menus" }));
    const MenuOriginal = connOriginal.model("Menu", new mongoose.Schema({}, { strict: false, collection: "menus" }));
    const RestaurantBackup = connBackup.model("Restaurant", new mongoose.Schema({}, { strict: false, collection: "restaurants" }));
    const RestaurantOriginal = connOriginal.model("Restaurant", new mongoose.Schema({}, { strict: false, collection: "restaurants" }));

    const kirpaRestId = "REST-1773051256895-8708";
    const kirpaObjId = new mongoose.Types.ObjectId("69ae9d787592fd06e444100c");

    // 1. Check orders in abhikaro_backup
    const ordersBackup = await OrderBackup.find({ restaurantId: kirpaRestId }).sort({ createdAt: -1 }).toArray ? 
                         await OrderBackup.find({ restaurantId: kirpaRestId }).sort({ createdAt: -1 }) :
                         await OrderBackup.find({ restaurantId: kirpaRestId }).sort({ createdAt: -1 });
                         
    console.log(`\n📦 [abhikaro_backup] Orders count for Kirpa (REST-1773051256895-8708): ${ordersBackup.length}`);
    const itemsBackup = new Set();
    ordersBackup.forEach(o => {
      o.items?.forEach(i => itemsBackup.add(`${i.name} (₹${i.price})`));
    });
    console.log("Items sold in backup orders:", Array.from(itemsBackup));

    // 2. Check orders in abhikaro
    const ordersOriginal = await OrderOriginal.find({ restaurantId: kirpaRestId }).sort({ createdAt: -1 });
    console.log(`\n📦 [abhikaro] Orders count for Kirpa (REST-1773051256895-8708): ${ordersOriginal.length}`);
    const itemsOriginal = new Set();
    ordersOriginal.forEach(o => {
      o.items?.forEach(i => itemsOriginal.add(`${i.name} (₹${i.price})`));
    });
    console.log("Items sold in original orders:", Array.from(itemsOriginal));

    // 3. Compare Kirpa Restaurant Status
    const rBackup = await RestaurantBackup.findOne({ _id: kirpaObjId });
    const rOriginal = await RestaurantOriginal.findOne({ _id: kirpaObjId });
    console.log(`\n🏢 Restaurant Details Comparison:`);
    console.log(`- [backup] Name: ${rBackup?.name} | isActive: ${rBackup?.isActive} | isDeleted: ${rBackup?.isDeleted}`);
    console.log(`- [original] Name: ${rOriginal?.name} | isActive: ${rOriginal?.isActive} | isDeleted: ${rOriginal?.isDeleted}`);

    // 4. Print Kirpa's menu in original DB in detail
    const mOrig = await MenuOriginal.findOne({ restaurant: kirpaObjId });
    if (mOrig) {
      console.log(`\n📖 Kirpa's original menu in [abhikaro] database:`);
      console.log(`- Menu ID: ${mOrig._id}`);
      console.log(`- Active: ${mOrig.isActive}`);
      console.log(`- Sections count: ${mOrig.sections?.length || 0}`);
      mOrig.sections?.forEach(s => {
        console.log(`  * Section: ${s.name} (${s.items?.length || 0} items)`);
        s.items?.forEach(it => {
          console.log(`    - [${it.foodType}] ${it.name} - ₹${it.price} (${it.description || 'No desc'})`);
        });
      });
    } else {
      console.log(`\n❌ Kirpa's menu NOT found in [abhikaro] database!`);
    }

  } catch (err) {
    console.error("❌ Error running script:", err);
  } finally {
    await connBackup.close();
    await connOriginal.close();
    console.log("\n🔌 Disconnected from both DBs");
  }
}

run();
