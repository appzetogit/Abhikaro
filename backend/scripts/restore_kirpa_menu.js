import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  const activeUri = process.env.MONGODB_URI;
  const originalUri = activeUri.replace("/abhikaro_backup?", "/abhikaro?");

  console.log("🔌 Connecting to abhikaro_backup (Active DB)...");
  const connBackup = await mongoose.createConnection(activeUri).asPromise();
  console.log("✅ Connected to abhikaro_backup");

  console.log("🔌 Connecting to abhikaro (Source DB)...");
  const connOriginal = await mongoose.createConnection(originalUri).asPromise();
  console.log("✅ Connected to abhikaro");

  try {
    const RestaurantBackup = connBackup.model("Restaurant", new mongoose.Schema({}, { strict: false, collection: "restaurants" }));
    const RestaurantOriginal = connOriginal.model("Restaurant", new mongoose.Schema({}, { strict: false, collection: "restaurants" }));
    const MenuBackup = connBackup.model("Menu", new mongoose.Schema({}, { strict: false, collection: "menus" }));
    const MenuOriginal = connOriginal.model("Menu", new mongoose.Schema({}, { strict: false, collection: "menus" }));

    const kirpaObjId = new mongoose.Types.ObjectId("69ae9d787592fd06e444100c");

    console.log("\n🔍 Fetching Kirpa Restaurant details...");
    const rBackup = await RestaurantBackup.findOne({ _id: kirpaObjId });
    const rOriginal = await RestaurantOriginal.findOne({ _id: kirpaObjId });

    if (!rBackup || !rOriginal) {
      throw new Error("Could not find Kirpa Restaurant in one of the databases!");
    }

    console.log(`- Active DB status: Name="${rBackup.name}", isActive=${rBackup.isActive}`);
    console.log(`- Source DB status: Name="${rOriginal.name}", isActive=${rOriginal.isActive}`);

    console.log("\n🔍 Fetching Kirpa Menu details...");
    const mBackup = await MenuBackup.findOne({ restaurant: kirpaObjId });
    const mOriginal = await MenuOriginal.findOne({ restaurant: kirpaObjId });

    if (!mBackup) {
      throw new Error("Could not find Menu for Kirpa in Active DB (abhikaro_backup)!");
    }
    if (!mOriginal) {
      throw new Error("Could not find Menu for Kirpa in Source DB (abhikaro)!");
    }

    console.log(`- Active DB menu sections count: ${mBackup.sections?.length || 0}`);
    console.log(`- Source DB menu sections count: ${mOriginal.sections?.length || 0}`);

    if (mOriginal.sections?.length !== 12) {
      console.warn(`⚠️ WARNING: Source menu sections count is ${mOriginal.sections?.length}, expected 12!`);
    }

    // 1. Dry Run / Validation Check
    console.log("\n📋 Source Menu Sections (to restore):");
    mOriginal.sections.forEach((s, idx) => {
      console.log(`  ${idx + 1}. ${s.name} (${s.items?.length || 0} items)`);
    });

    console.log("\n📋 Active DB Menu Sections (current, duplicated):");
    mBackup.sections.forEach((s, idx) => {
      console.log(`  ${idx + 1}. ${s.name} (${s.items?.length || 0} items)`);
    });

    // 2. Perform the update
    console.log("\n🚀 Restoring Menu sections and addons in Active DB...");
    const updateMenuResult = await MenuBackup.updateOne(
      { restaurant: kirpaObjId },
      { 
        $set: { 
          sections: mOriginal.sections,
          addons: mOriginal.addons || [],
          updatedAt: new Date()
        } 
      }
    );

    console.log(`✅ Menu update result: modifiedCount=${updateMenuResult.modifiedCount}`);

    // 3. Update restaurant active status in Active DB to true
    if (!rBackup.isActive) {
      console.log("\n🚀 Activating Kirpa Restaurant in Active DB (setting isActive = true)...");
      const updateRestResult = await RestaurantBackup.updateOne(
        { _id: kirpaObjId },
        { $set: { isActive: true } }
      );
      console.log(`✅ Restaurant update result: modifiedCount=${updateRestResult.modifiedCount}`);
    } else {
      console.log("\nℹ️ Restaurant is already active in Active DB.");
    }

    // 4. Verify what was saved in Active DB
    console.log("\n🔍 Verifying restored menu in Active DB...");
    const mVerified = await MenuBackup.findOne({ restaurant: kirpaObjId });
    console.log(`- Restored Menu sections count: ${mVerified.sections?.length || 0}`);
    mVerified.sections.forEach((s, idx) => {
      console.log(`  ${idx + 1}. ${s.name} (${s.items?.length || 0} items)`);
    });

    const rVerified = await RestaurantBackup.findOne({ _id: kirpaObjId });
    console.log(`- Restored Restaurant isActive: ${rVerified.isActive}`);

    console.log("\n🎉 Restoration completed successfully!");

  } catch (error) {
    console.error("\n❌ Error during restoration process:", error);
  } finally {
    await connBackup.close();
    await connOriginal.close();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

run();
