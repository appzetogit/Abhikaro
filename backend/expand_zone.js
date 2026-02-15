import mongoose from "mongoose";
import dotenv from "dotenv";
import Zone from "./modules/admin/models/Zone.js";

dotenv.config();

async function expandZone() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to DB");

    const zone = await Zone.findOne({ name: "ZoneA" });
    if (zone) {
      // Large bounding box covering India/Indore
      zone.coordinates = [
        { latitude: 5, longitude: 65 },
        { latitude: 40, longitude: 65 },
        { latitude: 40, longitude: 95 },
        { latitude: 5, longitude: 95 },
      ];
      await zone.save();
      console.log("✅ Expanded India zone successfully");
    } else {
      console.log('❌ Zone "India" not found');
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

expandZone();
